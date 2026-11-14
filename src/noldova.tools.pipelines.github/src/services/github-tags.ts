/**
 * @license
 * Copyright (c) Noldova.
 *
 * This source code is licensed under the license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { setTimeout as delayAsync } from "node:timers/promises";

import { type ITagHost, StepResult } from "@noldova/tools.pipelines";

import { GitHubAnswer } from "../models/github-answer.js";
import { GitHubConnection } from "../models/github-connection.js";
import { Resources } from "../resources.js";
import { GitHubApi } from "./github-api.js";

export class GitHubTags implements ITagHost {
  private readonly environment: Readonly<Record<string, string | undefined>>;
  private readonly timeoutMilliseconds: number;
  private readonly waitAsync: (milliseconds: number) => Promise<void>;
  private readonly createSignal: (timeoutMilliseconds: number) => AbortSignal;

  public constructor(environment: Readonly<Record<string, string | undefined>>, timeoutMilliseconds: number = Resources.apiTimeoutMilliseconds, waitAsync: (milliseconds: number) => Promise<void> = delayAsync, createSignal: (timeoutMilliseconds: number) => AbortSignal = GitHubApi.createTimeoutSignal) {
    this.environment = environment;
    this.timeoutMilliseconds = timeoutMilliseconds;
    this.waitAsync = waitAsync;
    this.createSignal = createSignal;
  }

  public async readTagAsync(tag: string): Promise<string | StepResult> {
    const connection = this.readConnection();
    if (connection instanceof StepResult)
      return connection;

    const reference = await this.requestAsync(connection, Resources.readMethod, Resources.formatTagReferencePath(tag));
    if (reference instanceof StepResult)
      return reference;
    if (reference.status === Resources.notFoundStatus)
      return "";
    if (reference.status !== Resources.foundStatus)
      return reference.toFailure();

    let target = reference.readBody().readObject(Resources.objectField);
    while (target.readString(Resources.typeField) === Resources.annotatedTagType) {
      const tagObject = await this.requestAsync(connection, Resources.readMethod, Resources.formatTagObjectPath(target.readString(Resources.shaField)));
      if (tagObject instanceof StepResult)
        return tagObject;
      if (tagObject.status !== Resources.foundStatus)
        return tagObject.toFailure();

      target = tagObject.readBody().readObject(Resources.objectField);
    }

    const type = target.readString(Resources.typeField);
    if (type !== Resources.commitType)
      return StepResult.failed(Resources.formatTagTargetInvalid(tag, type));

    return target.readString(Resources.shaField);
  }

  public async createTagAsync(tag: string, commit: string): Promise<boolean | StepResult> {
    const connection = this.readConnection();
    if (connection instanceof StepResult)
      return connection;

    const answer = await this.requestAsync(connection, Resources.createMethod, Resources.referencesPath, { [Resources.refField]: Resources.formatTagReference(tag), [Resources.shaField]: commit });
    if (answer instanceof StepResult)
      return answer;
    if (answer.status === Resources.createdStatus)
      return true;
    if (answer.status === Resources.forbiddenStatus)
      return StepResult.failed(Resources.formatTagForbidden(answer.toFailure().message));
    if (answer.status !== Resources.unprocessableStatus)
      return answer.toFailure();

    const found = await this.readTagAsync(tag);
    if (found instanceof StepResult)
      return found;

    return found.length > 0 ? false : answer.toFailure();
  }

  private readConnection(): GitHubConnection | StepResult {
    const missing = [Resources.apiUrlVariable, Resources.repositoryVariable, Resources.tokenVariable].find(t => this.readVariable(t).length === 0);
    if (missing !== undefined)
      return StepResult.failed(Resources.formatVariableMissing(missing));

    return new GitHubConnection(this.readVariable(Resources.apiUrlVariable), this.readVariable(Resources.repositoryVariable), this.readVariable(Resources.tokenVariable));
  }

  private readVariable(name: string): string {
    return this.environment[name] ?? "";
  }

  private async requestAsync(connection: GitHubConnection, method: string, path: string, body?: Readonly<Record<string, string>>): Promise<GitHubAnswer | StepResult> {
    return new GitHubApi(connection.apiUrl, connection.token, this.timeoutMilliseconds, this.waitAsync, this.createSignal).requestAsync(method, Resources.formatResource(connection.repository, path), body);
  }
}
