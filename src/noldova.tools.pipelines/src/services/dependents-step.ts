/**
 * @license
 * Copyright (c) Noldova.
 *
 * This source code is licensed under the license found in the
 * LICENSE file in the root directory of this source tree.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import type { JsonReader } from "@noldova/context.json";

import type { IStep } from "../interfaces/i-step.js";
import type { IStepOutput } from "../interfaces/i-step-output.js";
import type { IUpdateHost } from "../interfaces/i-update-host.js";
import { DependentsUpdate, type PinTarget } from "../models/dependents-update.js";
import { StepResult } from "../models/step-result.js";
import { Version } from "../models/version.js";
import { Resources } from "../resources.js";
import type { ArchiveStep } from "./archive-step.js";
import { Git } from "./git.js";
import type { Npm } from "./npm.js";
import type { ProcessRunner } from "./process-runner.js";

interface LockFile {
  readonly packages?: Readonly<Record<string, LockedPackage>>;
}

interface LockedPackage {
  readonly version: string;
  readonly peerDependencies?: Readonly<Record<string, string>>;
}

interface PinMove {
  readonly packageName: string;
  readonly line: string;
}

export class DependentsStep implements IStep {
  private readonly archiveStep: ArchiveStep;
  private readonly updateHost: IUpdateHost;
  private readonly processRunner: ProcessRunner;
  private readonly npm: Npm;
  private readonly temporaryRoot: string;
  private readonly output: IStepOutput | undefined;

  public readonly name: string = Resources.dependentsStepName;
  public readonly usage: string = Resources.dependentsStepUsage;

  public constructor(archiveStep: ArchiveStep, updateHost: IUpdateHost, processRunner: ProcessRunner, npm: Npm, temporaryRoot?: string, output?: IStepOutput) {
    this.archiveStep = archiveStep;
    this.updateHost = updateHost;
    this.processRunner = processRunner;
    this.npm = npm;
    this.temporaryRoot = temporaryRoot === undefined || temporaryRoot.length === 0 ? os.tmpdir() : temporaryRoot;
    this.output = output;
  }

  public async runAsync(values: readonly string[]): Promise<StepResult> {
    const [version, commit, ...rest] = values;
    if (version === undefined || commit === undefined || rest.length !== 0)
      return StepResult.failed(Resources.formatStepValuesInvalid(this.name, this.usage));

    const versionProblem = Version.validate(version);
    if (versionProblem !== null)
      return StepResult.failed(versionProblem);
    if (Version.parse(version).nightlyDate !== null)
      return StepResult.failed(Resources.formatDependentsVersionNotRelease(version));
    if (!Resources.commitPattern.test(commit))
      return StepResult.failed(Resources.formatCommitInvalid(commit));

    const source = this.updateHost.readSourceName();
    if (source instanceof StepResult)
      return source;

    const manifests = await this.archiveStep.readPackageManifestsAsync(commit);
    const packageNames = manifests.map(t => t.readString(Resources.nameField)).sort();
    if (packageNames.length === 0)
      return StepResult.failed(Resources.formatPackagesMissing(commit, Resources.packagesFolderPath));

    const repositories = await this.updateHost.listRepositoriesAsync();
    if (repositories instanceof StepResult)
      return repositories;

    const notes = await this.updateHost.readReleaseNotesAsync(version, commit);
    if (notes instanceof StepResult)
      return notes;

    const update = new DependentsUpdate(source, version, commit, packageNames, DependentsStep.readPeerPins(manifests, packageNames, version), notes);
    const lines: string[] = [];
    let isSuccessful = true;
    const root = fs.mkdtempSync(path.join(this.temporaryRoot, Resources.dependentsFolderPrefix));
    try {
      for (const [index, repository] of repositories.entries()) {
        const result = await this.tryUpdateAsync(update, repository, path.join(root, String(index)));
        isSuccessful &&= result.isSuccessful;
        if (this.output === undefined)
          lines.push(result.message);
        else if (result.isSuccessful)
          this.output.writeSuccess(result.message);
        else
          this.output.writeFailure(result.message);
      }
    }
    finally {
      fs.rmSync(root, { recursive: true, force: true });
    }

    const message = this.output === undefined
      ? [Resources.formatDependentsSummary(packageNames, version, repositories.length), ...lines].join(Resources.lineSeparator)
      : Resources.formatDependentsWritten(packageNames, version, repositories.length);

    return isSuccessful ? StepResult.succeeded(message) : StepResult.failed(message);
  }

  private async tryUpdateAsync(update: DependentsUpdate, repository: string, directory: string): Promise<StepResult> {
    try {
      return await this.updateAsync(update, repository, directory);
    }
    catch (error: unknown) {
      if (!(error instanceof Error))
        throw error;

      return StepResult.failed(Resources.formatRepositoryFailed(repository, error.message));
    }
  }

  private async updateAsync(update: DependentsUpdate, repository: string, directory: string): Promise<StepResult> {
    const checkout = await this.updateHost.checkOutAsync(repository, directory);
    if (checkout !== null)
      return StepResult.failed(Resources.formatRepositoryFailed(repository, checkout.message));

    const git = new Git(this.processRunner, directory);
    const filePaths = (await git.listTrackedFilesAsync()).map(t => t.filePath);
    const manifestPaths = filePaths.filter(t => path.posix.basename(t) === Resources.manifestFileName);
    const released = update.packageNames.map(t => ({ packageName: t, version: update.version, reason: null }));
    const moves = manifestPaths.flatMap(t => DependentsStep.movePins(path.join(directory, t), t, released));
    if (moves.length === 0)
      return StepResult.succeeded(Resources.formatRepositoryUnpinned(repository, update.version));

    const peerMoves = manifestPaths.flatMap(t => DependentsStep.movePins(path.join(directory, t), t, update.peerPins));
    const expected = new Map([...released, ...update.peerPins.filter(t => peerMoves.some(m => m.packageName === t.packageName))].map(t => [t.packageName, t.version]));
    const lockFilePaths = filePaths.filter(t => path.posix.basename(t) === Resources.lockFileName);
    const blockers = lockFilePaths.flatMap(t => DependentsStep.findConflicts(path.join(directory, t), t, expected));
    if (blockers.length > 0)
      return StepResult.succeeded(Resources.formatRepositoryBlocked(repository, update.version, blockers));

    for (const lockFilePath of lockFilePaths) {
      const result = await this.npm.lockAsync(path.join(directory, path.dirname(lockFilePath)), this.updateHost.credentialVariables);
      if (!result.isSuccessful)
        return StepResult.failed(Resources.formatRepositoryFailed(repository, Resources.formatLockFailed(lockFilePath, result.exitCode, result.errorOutput)));
    }

    const conflicts = lockFilePaths.flatMap(t => DependentsStep.findConflicts(path.join(directory, t), t, null));
    if (conflicts.length > 0)
      return StepResult.succeeded(Resources.formatRepositoryConflicted(repository, update.version, conflicts));

    const title = Resources.formatUpdateTitle(update.source, update.version);
    await git.commitAllAsync(title);
    const branch = Resources.formatUpdateBranch(update.source);
    const replaced = await this.updateHost.fetchBranchAsync(repository, directory, branch);
    if (replaced instanceof StepResult)
      return StepResult.failed(Resources.formatRepositoryFailed(repository, replaced.message));
    if (replaced !== null && !await DependentsStep.isOwnCommitAsync(git, replaced, update.source))
      return StepResult.failed(Resources.formatRepositoryFailed(repository, Resources.formatBranchNotOwn(branch, replaced)));

    const push = await this.updateHost.pushAsync(repository, directory, branch, replaced);
    if (push !== null)
      return StepResult.failed(Resources.formatRepositoryFailed(repository, push.message));

    const body = Resources.formatUpdateBody(update.source, update.version, update.commit, [...moves, ...peerMoves].map(t => t.line), lockFilePaths, update.notes);
    const proposal = await this.updateHost.proposeAsync(repository, branch, title, body, Resources.updateIssueSummary);
    if (proposal instanceof StepResult)
      return StepResult.failed(Resources.formatRepositoryFailed(repository, proposal.message));

    return StepResult.succeeded(Resources.formatRepositoryProposed(repository, proposal, moves.length + peerMoves.length));
  }

  private static readPeerPins(manifests: readonly JsonReader[], packageNames: readonly string[], releasedVersion: string): readonly PinTarget[] {
    const pins = new Map<string, PinTarget>();
    for (const manifest of manifests.filter(t => t.hasField(Resources.peerDependenciesField))) {
      const reason = Resources.formatPeerReason(manifest.readString(Resources.nameField), releasedVersion);
      for (const [packageName, value] of Object.entries(manifest.readObject(Resources.peerDependenciesField).toJson())) {
        const version = String(value);
        if (Resources.exactVersionPattern.test(version) && !packageNames.includes(packageName) && !pins.has(packageName))
          pins.set(packageName, { packageName, version, reason });
      }
    }

    return [...pins.values()];
  }

  private static async isOwnCommitAsync(git: Git, commit: string, source: string): Promise<boolean> {
    return await git.readCommitterAsync(commit) === await git.readCommitterAsync(Resources.gitHeadRevision)
      && (await git.readSubjectAsync(commit)).startsWith(Resources.formatUpdateTitlePrefix(source));
  }

  private static findConflicts(fullPath: string, filePath: string, expected: ReadonlyMap<string, string> | null): readonly string[] {
    const lock: LockFile = JSON.parse(fs.readFileSync(fullPath, Resources.textEncoding));
    const packages = lock.packages ?? {};
    const conflicts = new Set<string>();
    for (const [key, entry] of Object.entries(packages)) {
      const index = key.lastIndexOf(Resources.nodeModulesSegment);
      const name = key.slice(index + Resources.nodeModulesSegment.length);
      if (index < 0 || expected?.has(name) === true)
        continue;

      for (const [peerName, range] of Object.entries(entry.peerDependencies ?? {})) {
        const found = expected === null ? DependentsStep.findLocked(packages, key, peerName)?.version : expected.get(peerName);
        if (found !== undefined && found !== range && Resources.exactVersionPattern.test(range))
          conflicts.add(Resources.formatPeerBlocker(filePath, name, entry.version, peerName, range));
      }
    }

    return [...conflicts];
  }

  private static findLocked(packages: Readonly<Record<string, LockedPackage>>, key: string, name: string): LockedPackage | undefined {
    let base = key;
    for (;;) {
      const found = packages[`${base}/${Resources.nodeModulesSegment}${name}`];
      const index = base.lastIndexOf(`/${Resources.nodeModulesSegment}`);
      if (found !== undefined || index < 0)
        return found ?? packages[`${Resources.nodeModulesSegment}${name}`];

      base = base.slice(0, index);
    }
  }

  private static movePins(fullPath: string, filePath: string, targets: readonly PinTarget[]): readonly PinMove[] {
    const moves: PinMove[] = [];
    let text = fs.readFileSync(fullPath, Resources.textEncoding);
    for (const { packageName, version, reason } of targets) {
      const target = Version.parse(version);
      text = text.replace(Resources.createPinPattern(packageName), (pin: string, prefix: string, found: string, suffix: string) => {
        if (!Resources.exactVersionPattern.test(found) || Version.parse(found).compareTo(target) >= 0)
          return pin;

        const line = Resources.formatPinMoved(filePath, packageName, found, version);
        moves.push({ packageName, line: reason === null ? line : `${line}${reason}` });

        return `${prefix}${version}${suffix}`;
      });
    }
    if (moves.length > 0)
      fs.writeFileSync(fullPath, text);

    return moves;
  }
}
