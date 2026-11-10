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
import { RelockedFiles } from "../models/relocked-files.js";
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
  private readonly temporaryRoot: string;
  private readonly output: IStepOutput | undefined;

  public readonly name: string = Resources.dependentsStepName;
  public readonly usage: string = Resources.dependentsStepUsage;

  public constructor(archiveStep: ArchiveStep, updateHost: IUpdateHost, processRunner: ProcessRunner, npm: Npm, temporaryRoot?: string, output?: IStepOutput) {
    this.archiveStep = archiveStep;
    this.updateHost = updateHost;
    this.processRunner = processRunner;
    this.relock = new DependentRelock(processRunner, npm, updateHost.credentialVariables);
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
    const relocked = await this.relockAsync(update, repository, directory, git);
    if (relocked instanceof StepResult)
      return relocked;

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

    const body = Resources.formatUpdateBody(update.source, update.version, update.commit, relocked.moves, relocked.lockLines, update.notes);
    const proposal = await this.updateHost.proposeAsync(repository, branch, title, body, Resources.updateIssueSummary);
    if (proposal instanceof StepResult)
      return StepResult.failed(Resources.formatRepositoryFailed(repository, proposal.message));

    return StepResult.succeeded(Resources.formatRepositoryProposed(repository, proposal, relocked.moves.length));
  }

  // Relocks the checkout here, or, when the host has the repository relock itself, writes the files that relock changed
  // into the checkout, each one a tracked manifest or lock file.
  private async relockAsync(update: DependentsUpdate, repository: string, directory: string, git: Git): Promise<StepResult | RelockedFiles> {
    const answer = await this.updateHost.relockAsync(repository, await git.readHeadAsync(), update.formatRequest());
    if (answer === null)
      return await this.relock.relockAsync(update, repository, directory, new Map());
    if (answer instanceof StepResult)
      return StepResult.failed(Resources.formatRepositoryFailed(repository, answer.message));

    const relocked = RelockedFiles.parse(answer);
    if (relocked instanceof StepResult)
      return relocked;

    const tracked = new Set((await git.listTrackedFilesAsync()).map(t => t.filePath)
      .filter(t => [Resources.manifestFileName, Resources.lockFileName].includes(path.posix.basename(t))));
    const untracked = Object.keys(relocked.files).filter(t => !tracked.has(t));
    if (untracked.length > 0)
      return StepResult.failed(Resources.formatRepositoryFailed(repository, Resources.formatRelockedUntracked(untracked)));

    for (const [filePath, text] of Object.entries(relocked.files))
      fs.writeFileSync(path.join(directory, filePath), text);

    return relocked;
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
}
