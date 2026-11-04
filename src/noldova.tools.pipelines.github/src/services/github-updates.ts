/**
 * @license
 * Copyright (c) Noldova.
 *
 * This source code is licensed under the license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { setTimeout as delayAsync } from "node:timers/promises";

import { type IStepOutput, type IUpdateHost, ProcessRunner, StepResult } from "@noldova/tools.pipelines";

import { GitHubAnswer } from "../models/github-answer.js";
import { Resources } from "../resources.js";
import { GitHubApi } from "./github-api.js";

export class GitHubUpdates implements IUpdateHost {
  private readonly environment: Readonly<Record<string, string | undefined>>;
  private readonly processRunner: ProcessRunner;
  private readonly timeoutMilliseconds: number;
  private readonly waitAsync: (milliseconds: number) => Promise<void>;
  private readonly createSignal: (timeoutMilliseconds: number) => AbortSignal;
  private readonly output: IStepOutput | undefined;

  public readonly credentialVariables: readonly string[] = [Resources.tokenVariable];

  public constructor(environment: Readonly<Record<string, string | undefined>>, processRunner: ProcessRunner = new ProcessRunner(), timeoutMilliseconds: number = Resources.apiTimeoutMilliseconds, waitAsync: (milliseconds: number) => Promise<void> = delayAsync, createSignal: (timeoutMilliseconds: number) => AbortSignal = GitHubApi.createTimeoutSignal, output?: IStepOutput) {
    this.environment = environment;
    this.processRunner = processRunner;
    this.timeoutMilliseconds = timeoutMilliseconds;
    this.waitAsync = waitAsync;
    this.createSignal = createSignal;
    this.output = output;
  }

  public readSourceName(): string | StepResult {
    const missing = this.findMissingVariable();
    if (missing !== null)
      return missing;

    const repository = this.readVariable(Resources.repositoryVariable);

    return repository.slice(repository.indexOf(Resources.repositorySeparator) + 1);
  }

  public async listRepositoriesAsync(): Promise<readonly string[] | StepResult> {
    const missing = this.findMissingVariable();
    if (missing !== null)
      return missing;

    const source = this.readVariable(Resources.repositoryVariable);
    const sourceAnswer = await this.requestAsync(Resources.readMethod, Resources.formatRepositoryResource(source));
    let isSourcePrivate = false;
    if (sourceAnswer instanceof StepResult || sourceAnswer.status !== Resources.foundStatus)
      this.output?.writeSuccess(Resources.formatSourceUnread(source, (sourceAnswer instanceof StepResult ? sourceAnswer : sourceAnswer.toFailure()).message));
    else
      isSourcePrivate = sourceAnswer.readBody().readBoolean(Resources.privateField);
    const repositories: string[] = [];
    for (let page = 1; ; page++) {
      const answer = await this.requestAsync(Resources.readMethod, Resources.formatInstallationRepositoriesPage(page));
      if (answer instanceof StepResult)
        return answer;
      if (answer.status !== Resources.foundStatus)
        return answer.toFailure();

      const items = answer.readBody().readObjectArray(Resources.repositoriesField);
      for (const item of items) {
        const name = item.readString(Resources.fullNameField);
        if (!item.readBoolean(Resources.archivedField) && name.toLowerCase() !== source.toLowerCase() && (isSourcePrivate || !item.readBoolean(Resources.privateField)))
          repositories.push(name);
      }
      if (items.length < Resources.repositoriesPageSize)
        break;
    }

    return repositories.sort();
  }

  public async readReleaseNotesAsync(version: string, commit: string): Promise<string | StepResult> {
    const missing = this.findMissingVariable();
    if (missing !== null)
      return missing;

    const answer = await this.requestAsync(Resources.readMethod, Resources.formatCommitPullsResource(this.readVariable(Resources.repositoryVariable), commit));
    if (answer instanceof StepResult)
      return answer;
    if (answer.status !== Resources.foundStatus)
      return answer.toFailure();

    const pull = answer.readItems().find(t => t.readNullableString(Resources.mergeCommitField) === commit);

    return pull === undefined ? "" : GitHubUpdates.findNotes(pull.readNullableString(Resources.bodyField) ?? "", version);
  }

  public async checkOutAsync(repository: string, directory: string): Promise<StepResult | null> {
    const missing = this.findMissingVariable();
    if (missing !== null)
      return missing;

    return await this.runGitAsync([...Resources.gitCloneValues, this.formatCloneUrl(repository), directory], process.cwd());
  }

  public async fetchBranchAsync(repository: string, directory: string, branch: string): Promise<string | null | StepResult> {
    const missing = this.findMissingVariable();
    if (missing !== null)
      return missing;

    const url = this.formatCloneUrl(repository);
    const values = [...Resources.gitListRemoteValues, Resources.gitOptionsEnd, url, Resources.formatBranchReference(branch)];
    const listed = await this.processRunner.runAsync(Resources.gitProgram, values, directory, this.createGitEnvironment());
    if (listed.exitCode === Resources.gitNoMatchExitCode)
      return null;
    if (!listed.isSuccessful)
      return GitHubUpdates.failGit(values, listed.exitCode, listed.errorOutput);

    const commit = listed.output.slice(0, listed.output.search(Resources.gitReferenceSeparatorPattern));
    const fetched = await this.runGitAsync([...Resources.gitFetchValues, Resources.gitOptionsEnd, url, commit], directory);

    return fetched ?? commit;
  }

  public async pushAsync(repository: string, directory: string, branch: string, replaced: string | null): Promise<StepResult | null> {
    const missing = this.findMissingVariable();
    if (missing !== null)
      return missing;

    const lease = replaced === null ? [] : [Resources.formatForceWithLease(branch, replaced)];
    const values = [...Resources.gitPushValues, ...lease, Resources.gitOptionsEnd, this.formatCloneUrl(repository), Resources.formatPushReference(branch)];

    return await this.runGitAsync(values, directory);
  }

  public async proposeAsync(repository: string, branch: string, title: string, body: string): Promise<string | StepResult> {
    const missing = this.findMissingVariable();
    if (missing !== null)
      return missing;

    const owner = repository.slice(0, repository.indexOf(Resources.repositorySeparator));
    const open = await this.requestAsync(Resources.readMethod, Resources.formatOpenPullsResource(repository, owner, branch));
    if (open instanceof StepResult)
      return open;
    if (open.status !== Resources.foundStatus)
      return open.toFailure();

    const existing = open.readItems()[0];
    if (existing !== undefined) {
      const issue = Resources.linkedIssuePattern.exec(existing.readNullableString(Resources.bodyField) ?? "")?.[1];
      if (issue !== undefined) {
        const renamed = await this.requestAsync(Resources.updateMethod, Resources.formatIssueResource(repository, issue), { title });
        if (renamed instanceof StepResult)
          return renamed;
        if (renamed.status !== Resources.foundStatus)
          return renamed.toFailure();
      }

      const number = String(existing.readInteger(Resources.numberField));
      const updated = await this.requestAsync(Resources.updateMethod, Resources.formatPullResource(repository, number), { title, body: Resources.formatProposalBody(body, issue) });
      if (updated instanceof StepResult)
        return updated;

      return updated.status === Resources.foundStatus ? updated.readBody().readString(Resources.htmlUrlField) : updated.toFailure();
    }

    const target = await this.requestAsync(Resources.readMethod, Resources.formatRepositoryResource(repository));
    if (target instanceof StepResult)
      return target;
    if (target.status !== Resources.foundStatus)
      return target.toFailure();

    const issue = await this.requestAsync(Resources.createMethod, Resources.formatIssuesResource(repository), { title, body: Resources.formatIssueBody(branch) });
    if (issue instanceof StepResult)
      return issue;
    if (issue.status !== Resources.createdStatus)
      return issue.toFailure();

    const number = String(issue.readBody().readInteger(Resources.numberField));
    const base = target.readBody().readString(Resources.defaultBranchField);
    const pull = await this.requestAsync(Resources.createMethod, Resources.formatPullsResource(repository), { title, head: branch, base, body: Resources.formatProposalBody(body, number) });
    if (pull instanceof StepResult)
      return pull;

    return pull.status === Resources.createdStatus ? pull.readBody().readString(Resources.htmlUrlField) : pull.toFailure();
  }

  private async runGitAsync(values: readonly string[], workingDirectory: string): Promise<StepResult | null> {
    const result = await this.processRunner.runAsync(Resources.gitProgram, values, workingDirectory, this.createGitEnvironment());

    return result.isSuccessful ? null : GitHubUpdates.failGit(values, result.exitCode, result.errorOutput);
  }

  private static failGit(values: readonly string[], exitCode: number | null, errorOutput: string): StepResult {
    return StepResult.failed(Resources.formatGitFailed(values, exitCode, errorOutput));
  }

  private createGitEnvironment(): Readonly<Record<string, string>> {
    return {
      [Resources.gitConfigCountVariable]: Resources.gitConfigCount,
      [Resources.gitConfigKeyVariable]: Resources.formatExtraHeaderKey(this.readVariable(Resources.serverUrlVariable)),
      [Resources.gitConfigValueVariable]: Resources.formatBasicAuthorization(this.readVariable(Resources.tokenVariable)),
      [Resources.gitTerminalPromptVariable]: Resources.gitTerminalPromptOff
    };
  }

  private formatCloneUrl(repository: string): string {
    return Resources.formatCloneUrl(this.readVariable(Resources.serverUrlVariable), repository);
  }

  private findMissingVariable(): StepResult | null {
    const missing = [Resources.apiUrlVariable, Resources.serverUrlVariable, Resources.repositoryVariable, Resources.tokenVariable].find(t => this.readVariable(t).length === 0);

    return missing === undefined ? null : StepResult.failed(Resources.formatDependentsVariableMissing(missing));
  }

  private readVariable(name: string): string {
    return this.environment[name] ?? "";
  }

  private async requestAsync(method: string, resource: string, body?: Readonly<Record<string, string>>): Promise<GitHubAnswer | StepResult> {
    const api = new GitHubApi(this.readVariable(Resources.apiUrlVariable), this.readVariable(Resources.tokenVariable), this.timeoutMilliseconds, this.waitAsync, this.createSignal);

    return await api.requestAsync(method, resource, body);
  }

  private static findNotes(body: string, version: string): string {
    const heading = Resources.createNotesHeadingPattern(version);
    const section: string[] = [];
    let level = 0;
    for (const line of body.split(Resources.lineBreakPattern)) {
      const lineLevel = GitHubUpdates.readHeadingLevel(line);
      if (level === 0) {
        if (heading.test(line)) {
          level = lineLevel;
          section.push(line);
        }
      }
      else if (lineLevel > 0 && lineLevel <= level)
        break;
      else
        section.push(line);
    }

    return section.join(Resources.lineSeparator).trim();
  }

  private static readHeadingLevel(line: string): number {
    return Resources.headingPattern.test(line) ? line.search(Resources.notHashPattern) : 0;
  }
}
