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

import type { IStep } from "../interfaces/i-step.js";
import type { IStepOutput } from "../interfaces/i-step-output.js";
import type { IUpdateHost } from "../interfaces/i-update-host.js";
import { StepResult } from "../models/step-result.js";
import { Version } from "../models/version.js";
import { Resources } from "../resources.js";
import { Git } from "./git.js";
import type { ProcessRunner } from "./process-runner.js";

interface ActionPin {
  readonly commit: string;
  readonly tag: string;
  readonly version: Version;
}

interface PinsUpdate {
  readonly source: string;
  readonly version: Version;
  readonly tag: string;
  readonly commit: string;
  readonly actions: ReadonlyMap<string, ActionPin>;
  readonly notes: string;
}

interface WorkflowChanges {
  readonly moves: readonly string[];
  readonly majors: readonly string[];
  readonly left: readonly string[];
}

export class PinsStep implements IStep {
  private readonly git: Git;
  private readonly updateHost: IUpdateHost;
  private readonly processRunner: ProcessRunner;
  private readonly temporaryRoot: string;
  private readonly output: IStepOutput | undefined;

  public readonly name: string = Resources.pinsStepName;
  public readonly usage: string = Resources.pinsStepUsage;

  public constructor(git: Git, updateHost: IUpdateHost, processRunner: ProcessRunner, temporaryRoot?: string, output?: IStepOutput) {
    this.git = git;
    this.updateHost = updateHost;
    this.processRunner = processRunner;
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
      return StepResult.failed(Resources.formatPinsVersionNotRelease(version));
    if (!Resources.commitPattern.test(commit))
      return StepResult.failed(Resources.formatCommitInvalid(commit));

    const source = this.updateHost.readSourceName();
    if (source instanceof StepResult)
      return source;

    const actions = await this.readActionsAsync(commit, source);
    const repositories = await this.updateHost.listRepositoriesAsync();
    if (repositories instanceof StepResult)
      return repositories;

    const notes = await this.updateHost.readReleaseNotesAsync(version, commit);
    if (notes instanceof StepResult)
      return notes;

    const update: PinsUpdate = { source, version: Version.parse(version), tag: Resources.formatTagName(version), commit, actions, notes };
    const lines: string[] = [];
    let isSuccessful = true;
    const root = fs.mkdtempSync(path.join(this.temporaryRoot, Resources.pinsFolderPrefix));
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
      ? [Resources.formatPinsSummary(source, update.tag, repositories.length), ...lines].join(Resources.lineSeparator)
      : Resources.formatPinsWritten(source, update.tag, repositories.length);

    return isSuccessful ? StepResult.succeeded(message) : StepResult.failed(message);
  }

  private async readActionsAsync(commit: string, source: string): Promise<ReadonlyMap<string, ActionPin>> {
    const actions = new Map<string, ActionPin>();
    for (const filePath of (await this.git.listFilesAsync(commit, Resources.workflowsFolderPath)).filter(t => PinsStep.isWorkflow(t))) {
      for (const match of (await this.git.readFileAsync(commit, filePath)).matchAll(Resources.usesPattern)) {
        const [, , action, found, tag] = match as unknown as readonly [string, string, string, string, string | undefined];
        const version = PinsStep.readTagVersion(tag);
        if (version === null || PinsStep.readSharedOwner(action, source) !== null)
          continue;

        const known = actions.get(action);
        if (known === undefined || version.compareTo(known.version) > 0)
          actions.set(action, { commit: found, tag: tag as string, version });
      }
    }

    return actions;
  }

  private async tryUpdateAsync(update: PinsUpdate, repository: string, directory: string): Promise<StepResult> {
    try {
      return await this.updateAsync(update, repository, directory);
    }
    catch (error: unknown) {
      if (!(error instanceof Error))
        throw error;

      return StepResult.failed(Resources.formatRepositoryFailed(repository, error.message));
    }
  }

  private async updateAsync(update: PinsUpdate, repository: string, directory: string): Promise<StepResult> {
    const checkout = await this.updateHost.checkOutAsync(repository, directory);
    if (checkout !== null)
      return StepResult.failed(Resources.formatRepositoryFailed(repository, checkout.message));

    const git = new Git(this.processRunner, directory);
    const filePaths = (await git.listTrackedFilesAsync()).map(t => t.filePath);
    const actions = filePaths.some(t => Resources.dependabotFilePaths.includes(t)) ? new Map<string, ActionPin>() : update.actions;
    const owner = repository.slice(0, repository.indexOf(Resources.repositorySeparator));
    const workflowPaths = filePaths.filter(t => t.startsWith(`${Resources.workflowsFolderPath}/`) && PinsStep.isWorkflow(t));
    const ancestors = await this.readAncestorsAsync(workflowPaths.map(t => path.join(directory, t)), update, owner);
    const changes = workflowPaths.map(t => PinsStep.movePins(path.join(directory, t), t, update, actions, ancestors, owner));
    const moves = changes.flatMap(t => t.moves);
    const majors = changes.flatMap(t => t.majors);
    const left = changes.flatMap(t => t.left);
    if (moves.length + majors.length === 0)
      return StepResult.succeeded(left.length === 0 ? Resources.formatRepositoryPinsCurrent(repository, update.tag) : Resources.formatRepositoryPinsLeft(repository, update.tag, left));

    const title = Resources.formatPinsTitle(update.source, update.tag);
    await git.commitAllAsync(title);
    const branch = Resources.formatPinsBranch(update.source);
    const replaced = await this.updateHost.fetchBranchAsync(repository, directory, branch);
    if (replaced instanceof StepResult)
      return StepResult.failed(Resources.formatRepositoryFailed(repository, replaced.message));
    if (replaced !== null && !await PinsStep.isOwnCommitAsync(git, replaced, update.source))
      return StepResult.failed(Resources.formatRepositoryFailed(repository, Resources.formatBranchNotOwn(branch, replaced)));

    const push = await this.updateHost.pushAsync(repository, directory, branch, replaced);
    if (push !== null)
      return StepResult.failed(Resources.formatRepositoryFailed(repository, push.message));

    const body = Resources.formatPinsBody(update.source, update.tag, update.commit, moves, majors, left, update.notes);
    const proposal = await this.updateHost.proposeAsync(repository, branch, title, body);
    if (proposal instanceof StepResult)
      return StepResult.failed(Resources.formatRepositoryFailed(repository, proposal.message));

    return StepResult.succeeded(Resources.formatRepositoryProposed(repository, proposal, moves.length + majors.length));
  }

  private async readAncestorsAsync(fullPaths: readonly string[], update: PinsUpdate, owner: string): Promise<ReadonlySet<string>> {
    const ancestors = new Set<string>();
    for (const fullPath of fullPaths) {
      for (const match of fs.readFileSync(fullPath, Resources.textEncoding).matchAll(Resources.usesPattern)) {
        const [, , action, found, tag] = match as unknown as readonly [string, string, string, string, string | undefined];
        if (PinsStep.readSharedOwner(action, update.source) === owner.toLowerCase() && PinsStep.readTagVersion(tag) === null
          && await this.git.hasCommitAsync(found) && await this.git.isAncestorAsync(found, update.commit))
          ancestors.add(found);
      }
    }

    return ancestors;
  }

  private static movePins(fullPath: string, filePath: string, update: PinsUpdate, actions: ReadonlyMap<string, ActionPin>, ancestors: ReadonlySet<string>, owner: string): WorkflowChanges {
    const moves: string[] = [];
    const majors: string[] = [];
    const left: string[] = [];
    const text = fs.readFileSync(fullPath, Resources.textEncoding).replace(Resources.usesPattern, (pin: string, prefix: string, action: string, found: string, tag: string | undefined) => {
      const version = PinsStep.readTagVersion(tag);
      if (PinsStep.readSharedOwner(action, update.source) === owner.toLowerCase()) {
        if (found === update.commit || version !== null && version.compareTo(update.version) >= 0)
          return pin;
        if (version === null && !ancestors.has(found)) {
          left.push(Resources.formatWorkflowPinNotTagged(filePath, action, found, update.tag));
          return pin;
        }
        if (version !== null && version.major !== update.version.major) {
          left.push(Resources.formatWorkflowPinLeft(filePath, action, tag as string, update.tag));
          return pin;
        }

        moves.push(Resources.formatWorkflowPinMoved(filePath, action, tag ?? found, update.tag));
        return `${prefix}${action}@${update.commit} # ${update.tag}`;
      }

      const target = actions.get(action);
      if (target === undefined || version === null || version.compareTo(target.version) >= 0)
        return pin;

      (target.version.major === version.major ? moves : majors).push(Resources.formatWorkflowPinMoved(filePath, action, tag as string, target.tag));
      return `${prefix}${action}@${target.commit} # ${target.tag}`;
    });
    if (moves.length + majors.length > 0)
      fs.writeFileSync(fullPath, text);

    return { moves, majors, left };
  }

  private static isWorkflow(filePath: string): boolean {
    return Resources.workflowExtensions.includes(path.posix.extname(filePath));
  }

  private static readSharedOwner(action: string, source: string): string | null {
    const [owner, name, ...rest] = action.toLowerCase().split(Resources.repositorySeparator);

    return rest.length > 0 && name === source.toLowerCase() ? owner as string : null;
  }

  private static readTagVersion(tag: string | undefined): Version | null {
    if (tag?.startsWith(Resources.tagPrefix) !== true)
      return null;

    const text = tag.slice(Resources.tagPrefix.length);

    return Version.validate(text) === null ? Version.parse(text) : null;
  }

  private static async isOwnCommitAsync(git: Git, commit: string, source: string): Promise<boolean> {
    return await git.readCommitterAsync(commit) === await git.readCommitterAsync(Resources.gitHeadRevision)
      && (await git.readSubjectAsync(commit)).startsWith(Resources.formatPinsTitlePrefix(source));
  }
}
