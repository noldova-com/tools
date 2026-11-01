/**
 * @license
 * Copyright (c) Noldova.
 *
 * This source code is licensed under the license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { type ITagHost, StepResult } from "@noldova/tools.pipelines";

import { GitHubAnswer } from "../models/github-answer.js";
import { GitHubConnection } from "../models/github-connection.js";
import { Resources } from "../resources.js";

export class GitHubTags implements ITagHost {
  private readonly environment: Readonly<Record<string, string | undefined>>;

  public constructor(environment: Readonly<Record<string, string | undefined>>) {
    this.environment = environment;
  }

  public async readTagAsync(tag: string): Promise<string | StepResult> {
    const connection = this.readConnection();
    if (connection instanceof StepResult)
      return connection;

    const reference = await GitHubTags.requestAsync(connection, Resources.readMethod, Resources.formatTagReferencePath(tag));
    if (reference.status === Resources.notFoundStatus)
      return "";
    if (reference.status !== Resources.foundStatus)
      return reference.toFailure();

    let target = reference.readBody().readObject(Resources.objectField);
    while (target.readString(Resources.typeField) === Resources.annotatedTagType) {
      const tagObject = await GitHubTags.requestAsync(connection, Resources.readMethod, Resources.formatTagObjectPath(target.readString(Resources.shaField)));
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

    const answer = await GitHubTags.requestAsync(connection, Resources.createMethod, Resources.referencesPath, { ref: Resources.formatTagReference(tag), sha: commit });
    if (answer.status === Resources.createdStatus)
      return true;
    if (answer.status === Resources.unprocessableStatus && answer.readMessage() === Resources.referenceExistsMessage)
      return false;

    return answer.toFailure();
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

  private static async requestAsync(connection: GitHubConnection, method: string, path: string, body?: Readonly<Record<string, string>>): Promise<GitHubAnswer> {
    const resource = Resources.formatResource(connection.repository, path);
    const response = await fetch(`${connection.apiUrl}/${resource}`, {
      method,
      headers: {
        [Resources.acceptHeader]: Resources.apiMediaType,
        [Resources.authorizationHeader]: Resources.formatAuthorization(connection.token),
        [Resources.apiVersionHeader]: Resources.apiVersion
      },
      signal: AbortSignal.timeout(Resources.apiTimeoutMilliseconds),
      ...(body === undefined ? {} : { body: JSON.stringify(body) })
    });

    return new GitHubAnswer(method, resource, response.status, response.statusText, response.headers.get(Resources.contentTypeHeader) ?? "", await response.text());
  }
}
