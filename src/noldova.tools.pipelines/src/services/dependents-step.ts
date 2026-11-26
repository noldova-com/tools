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
import { setTimeout as delayAsync } from "node:timers/promises";

import "@noldova/context.core";
import { JsonReader } from "@noldova/context.json";

import type { IStep } from "../interfaces/i-step.js";
import type { IStepOutput } from "../interfaces/i-step-output.js";
import type { IUpdateHost } from "../interfaces/i-update-host.js";
import { DependentsUpdate } from "../models/dependents-update.js";
import { HandledFailure } from "../models/handled-failure.js";
import { PinTarget } from "../models/pin-target.js";
import { RelockedFiles } from "../models/relocked-files.js";
import { StartedUpdate } from "../models/started-update.js";
import { StepResult } from "../models/step-result.js";
import { Version } from "../models/version.js";
import { Resources } from "../resources.js";
import type { ArchiveStep } from "./archive-step.js";
import { DependentRelock } from "./dependent-relock.js";
import { Git } from "./git.js";
import type { Npm } from "./npm.js";
import type { ProcessRunner } from "./process-runner.js";

export class DependentsStep implements IStep {
  private readonly archiveStep: ArchiveStep;
  private readonly updateHost: IUpdateHost;
  private readonly processRunner: ProcessRunner;
  private readonly relock: DependentRelock;
  private readonly npm: Npm;
  private readonly viewAttempts: number;
  private readonly retryMilliseconds: number;
  private readonly temporaryRoot: string;
  private readonly output: IStepOutput | undefined;

  public readonly name: string = Resources.dependentsStepName;
  public readonly usage: string = Resources.dependentsStepUsage;

  public constructor(archiveStep: ArchiveStep, updateHost: IUpdateHost, processRunner: ProcessRunner, npm: Npm, temporaryRoot?: string, output?: IStepOutput,
    viewAttempts: number = Resources.publishedViewAttempts, retryMilliseconds: number = Resources.publishRetryMilliseconds) {
    this.archiveStep = archiveStep;
    this.npm = npm;
    this.viewAttempts = viewAttempts;
    this.retryMilliseconds = retryMilliseconds;
    this.updateHost = updateHost;
    this.processRunner = processRunner;
    this.relock = new DependentRelock(processRunner, npm, updateHost.credentialVariables);
    this.temporaryRoot = String.isNullOrEmpty(temporaryRoot) ? os.tmpdir() : temporaryRoot;
    this.output = output;
  }

  public async runAsync(values: readonly string[]): Promise<StepResult> {
    const [version, commit, ...rest] = values;
    if (Object.isUndefined(version) || Object.isUndefined(commit) || rest.length !== 0)
      return StepResult.failed(Resources.formatStepValuesInvalid(this.name, this.usage));

    const versionProblem = Version.validate(version);
    if (!Object.isNull(versionProblem))
      return StepResult.failed(versionProblem);
    if (!Object.isNull(Version.parse(version).nightlyDate))
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

    const moduleIds = await this.archiveStep.readModuleIdsAsync(commit);
    const repositories = await this.updateHost.listRepositoriesAsync();
    if (repositories instanceof StepResult)
      return repositories;

    const notes = await this.updateHost.readReleaseNotesAsync(version, commit);
    if (notes instanceof StepResult)
      return notes;

    const published = await this.readPublishedAsync(manifests, version);
    if (published instanceof StepResult)
      return published;

    const update = new DependentsUpdate(source, version, commit, packageNames, DependentsStep.readOutsidePins(published, packageNames, version), notes);
    const lines: string[] = [];
    const left: string[] = [];
    const root = fs.mkdtempSync(path.join(this.temporaryRoot, Resources.dependentsFolderPrefix));
    try {
      const started: (StepResult | StartedUpdate)[] = [];
      for (const [index, repository] of repositories.entries())
        started.push(await DependentsStep.tryAsync(repository, async () => await this.startAsync(update, repository, path.join(root, String(index)))));
      for (const start of started) {
        const result = start instanceof StepResult ? start : await DependentsStep.tryAsync(start.repository, async () => await this.finishAsync(update, moduleIds, start));
        if (!result.isSuccessful)
          left.push(result.message);
        if (Object.isUndefined(this.output))
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

    if (left.length > 0)
      return StepResult.failed([Resources.formatDependentsPublished(packageNames, version, left.length, repositories.length), ...Object.isUndefined(this.output) ? lines : left]
        .join(Resources.lineSeparator));

    return StepResult.succeeded(Object.isUndefined(this.output)
      ? [Resources.formatDependentsSummary(packageNames, version, repositories.length), ...lines].join(Resources.lineSeparator)
      : Resources.formatDependentsWritten(packageNames, version, repositories.length));
  }

  private static async tryAsync<T>(repository: string, action: () => Promise<T | StepResult>): Promise<T | StepResult> {
    try {
      return await action();
    }
    catch (error: unknown) {
      if (!HandledFailure.isHandled(error))
        throw error;

      return StepResult.failed(Resources.formatRepositoryFailed(repository, error.message));
    }
  }

  // Checks a repository out and, when the host has it relock itself, starts that relock, so every repository's relock
  // runs while the step waits for the first.
  private async startAsync(update: DependentsUpdate, repository: string, directory: string): Promise<StepResult | StartedUpdate> {
    const checkout = await this.updateHost.checkOutAsync(repository, directory);
    if (!Object.isNull(checkout))
      return StepResult.failed(Resources.formatRepositoryFailed(repository, checkout.message));

    const git = new Git(this.processRunner, directory);
    if (!await git.hasCommitAsync(Resources.gitCheckoutRevision))
      return StepResult.succeeded(Resources.formatRepositoryUnpinned(repository, update.version));

    const head = await git.readHeadAsync();
    const run = await this.updateHost.startRelockAsync(repository, head, update.formatRequest());
    if (run instanceof StepResult)
      return StepResult.failed(Resources.formatRepositoryFailed(repository, run.message));

    return new StartedUpdate(repository, directory, git, head, run);
  }

  private async finishAsync(update: DependentsUpdate, moduleIds: readonly string[], started: StartedUpdate): Promise<StepResult> {
    const { repository, directory, git } = started;
    const relocked = Object.isNull(started.run) ? await this.relock.relockAsync(update, repository, directory, new Map()) : await this.readRelockAsync(started, started.run);
    if (relocked instanceof StepResult)
      return relocked;

    const moves = [...relocked.moves, ...await DependentsStep.moveModulePinsAsync(git, directory, moduleIds, update)];

    const title = Resources.formatUpdateTitle(update.source, update.version);
    await git.commitAllAsync(title);
    const branch = Resources.formatUpdateBranch(update.source);
    const replaced = await this.updateHost.fetchBranchAsync(repository, directory, branch);
    if (replaced instanceof StepResult)
      return StepResult.failed(Resources.formatRepositoryFailed(repository, replaced.message));
    if (!Object.isNull(replaced) && !await DependentsStep.isOwnCommitAsync(git, replaced, update.source))
      return StepResult.failed(Resources.formatRepositoryFailed(repository, Resources.formatBranchNotOwn(branch, replaced)));

    const push = await this.updateHost.pushAsync(repository, directory, branch, replaced);
    if (!Object.isNull(push))
      return StepResult.failed(Resources.formatRepositoryFailed(repository, push.message));

    const body = Resources.formatUpdateBody(update.source, update.version, update.commit, moves, relocked.lockLines, update.notes);
    const proposal = await this.updateHost.proposeAsync(repository, branch, title, body, Resources.updateIssueSummary);
    if (proposal instanceof StepResult)
      return StepResult.failed(Resources.formatRepositoryFailed(repository, proposal.message));

    return StepResult.succeeded(Resources.formatRepositoryProposed(repository, proposal, moves.length));
  }

  // Reads what the repository's own relock wrote and, when it changed files, writes them into the checkout, each one a
  // tracked manifest or lock file, from a relock of the checkout's own commit.
  private async readRelockAsync(started: StartedUpdate, run: string): Promise<StepResult | RelockedFiles> {
    const { repository, directory, git, head } = started;
    const answer = await this.updateHost.readRelockAsync(repository, run);
    if (answer instanceof StepResult)
      return StepResult.failed(Resources.formatRepositoryFailed(repository, answer.message));

    const relocked = RelockedFiles.parse(answer);
    if (relocked instanceof StepResult)
      return relocked;
    if (relocked.commit !== head)
      return StepResult.failed(Resources.formatRepositoryFailed(repository, Resources.formatRelockedElsewhere(relocked.commit, head)));

    const tracked = new Set((await git.listTrackedFilesAsync()).map(t => t.filePath)
      .filter(t => Resources.installFileNames.includes(path.posix.basename(t))));
    const untracked = Object.keys(relocked.files).filter(t => !tracked.has(t));
    if (untracked.length > 0)
      return StepResult.failed(Resources.formatRepositoryFailed(repository, Resources.formatRelockedUntracked(untracked)));

    for (const [filePath, text] of Object.entries(relocked.files))
      fs.writeFileSync(path.join(directory, filePath), text);

    return relocked;
  }

  private static async moveModulePinsAsync(git: Git, directory: string, moduleIds: readonly string[], update: DependentsUpdate): Promise<readonly string[]> {
    const targets = moduleIds.map(t => new PinTarget(t, update.version, null, null, []));

    return (await git.listTrackedFilesAsync()).map(t => t.filePath).filter(t => path.posix.basename(t) === Resources.moduleFileName)
      .flatMap(t => [
        ...targets.length === 0 ? [] : DependentRelock.moveModulePins(path.join(directory, t), t, targets),
        ...DependentRelock.moveModuleRange(path.join(directory, t), t, update.packageNames, update.version)
      ]);
  }

  private async readPublishedAsync(manifests: readonly JsonReader[], version: string): Promise<readonly JsonReader[] | StepResult> {
    const published: JsonReader[] = [];
    for (const manifest of manifests) {
      const found = await this.viewPublishedAsync(Resources.formatSpecifier(manifest.readString(Resources.nameField), version), DependentsStep.readRegistry(manifest));
      if (found instanceof StepResult)
        return found;
      published.push(found);
    }

    return published;
  }

  private async viewPublishedAsync(specifier: string, registry: string | null): Promise<JsonReader | StepResult> {
    for (let attempt = 1; ; attempt++) {
      const result = await this.npm.viewManifestAsync(specifier, registry);
      if (result.isSuccessful && result.output.trim().length > 0)
        return JsonReader.parse(result.output, specifier);
      if (!result.isSuccessful && !result.output.includes(Resources.npmNotFoundCode) && !result.errorOutput.includes(Resources.npmNotFoundCode))
        return StepResult.failed(Resources.formatNpmFailed(specifier, Resources.npmViewValues, result.exitCode, result.errorOutput));
      if (attempt >= this.viewAttempts)
        return StepResult.failed(Resources.formatPublishedMissing(specifier, this.viewAttempts, this.retryMilliseconds));
      await delayAsync(this.retryMilliseconds);
    }
  }

  private static readRegistry(manifest: JsonReader): string | null {
    if (!manifest.hasField(Resources.publishConfigField))
      return null;
    const config = manifest.readObject(Resources.publishConfigField);

    return config.hasField(Resources.registryField) ? config.readString(Resources.registryField) : null;
  }

  // Reads the outside packages the released packages name: each exact peer, each exact dependency, which the
  // dependent's own exact pin must match so its lock holds one copy, and each peer range of the form >=<lowest> <refused>,
  // whose lowest version an older exact pin moves to; the first package to name one decides its target, and each
  // target keeps every released package that names it, so a dependent checks only the targets of what it installs.
  private static readOutsidePins(manifests: readonly JsonReader[], packageNames: readonly string[], releasedVersion: string): readonly PinTarget[] {
    const pins = new Map<string, PinTarget>();
    const read = (field: string, toTarget: (packageName: string, value: string, releasedName: string) => PinTarget | null): void => {
      for (const manifest of manifests.filter(t => t.hasField(field))) {
        const releasedName = manifest.readString(Resources.nameField);
        for (const [packageName, value] of Object.entries(manifest.readObject(field).toJson())) {
          const target = packageNames.includes(packageName) || pins.has(packageName) ? null : toTarget(packageName, String(value), releasedName);
          if (!Object.isNull(target))
            pins.set(packageName, target);
        }
      }
    };
    read(Resources.peerDependenciesField, (packageName, value, releasedName) => Resources.exactVersionPattern.test(value)
      ? new PinTarget(packageName, value, Resources.formatPeerReason(releasedName, releasedVersion), null, [])
      : null);
    read(Resources.dependenciesField, (packageName, value, releasedName) => Resources.exactVersionPattern.test(value)
      ? new PinTarget(packageName, value, Resources.formatDependencyReason(releasedName, releasedVersion), value, [])
      : null);
    read(Resources.peerDependenciesField, (packageName, value, releasedName) => {
      const lowest = Resources.exactRangePattern.exec(value)?.[1];

      return Object.isUndefined(lowest) ? null : new PinTarget(packageName, lowest, Resources.formatRangePeerReason(releasedName, releasedVersion), value, []);
    });

    return [...pins.values()].map(t => new PinTarget(t.packageName, t.version, t.reason, t.range, DependentsStep.readRequiredBy(manifests, t.packageName)));
  }

  // Names every released package that names the package as a dependency or a peer, then every one that reaches those
  // through its own dependencies or peers, so a dependent that installs any of them takes the target.
  private static readRequiredBy(manifests: readonly JsonReader[], packageName: string): readonly string[] {
    const required: string[] = [];
    let reached: readonly string[] = [packageName];
    while (reached.length > 0) {
      const previous = reached;
      reached = manifests.filter(t => !required.includes(t.readString(Resources.nameField)) && DependentsStep.readNamed(t).some(n => previous.includes(n)))
        .map(t => t.readString(Resources.nameField));
      required.push(...reached);
    }

    return required;
  }

  private static readNamed(manifest: JsonReader): readonly string[] {
    return [Resources.dependenciesField, Resources.peerDependenciesField].flatMap(t => manifest.hasField(t) ? Object.keys(manifest.readObject(t).toJson()) : []);
  }

  private static async isOwnCommitAsync(git: Git, commit: string, source: string): Promise<boolean> {
    return await git.readCommitterAsync(commit) === await git.readCommitterAsync(Resources.gitHeadRevision)
      && (await git.readSubjectAsync(commit)).startsWith(Resources.formatUpdateTitlePrefix(source));
  }
}
