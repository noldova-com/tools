/**
 * @license
 * Copyright (c) Noldova.
 *
 * This source code is licensed under the license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { StepResult } from "@noldova/tools.pipelines";

import { GitHubAnswer } from "../models/github-answer.js";
import { Resources } from "../resources.js";

export class GitHubApi {
  private readonly apiUrl: string;
  private readonly token: string;
  private readonly timeoutMilliseconds: number;
  private readonly waitAsync: (milliseconds: number) => Promise<void>;
  private readonly createSignal: (timeoutMilliseconds: number) => AbortSignal;

  public constructor(apiUrl: string, token: string, timeoutMilliseconds: number, waitAsync: (milliseconds: number) => Promise<void>, createSignal: (timeoutMilliseconds: number) => AbortSignal) {
    this.apiUrl = apiUrl;
    this.token = token;
    this.timeoutMilliseconds = timeoutMilliseconds;
    this.waitAsync = waitAsync;
    this.createSignal = createSignal;
  }

  public static createTimeoutSignal(timeoutMilliseconds: number): AbortSignal {
    return AbortSignal.timeout(timeoutMilliseconds);
  }

  public async requestAsync(method: string, resource: string, body?: Readonly<Record<string, string>>): Promise<GitHubAnswer | StepResult> {
    for (const retryMilliseconds of Resources.apiRetryMilliseconds) {
      const answer = await this.sendAsync(method, resource, body);
      const waitMilliseconds = answer instanceof StepResult ? retryMilliseconds : answer.readRetryMilliseconds(retryMilliseconds);
      if (waitMilliseconds === null)
        return answer;

      await this.waitAsync(waitMilliseconds);
    }

    return await this.sendAsync(method, resource, body);
  }

  private async sendAsync(method: string, resource: string, body?: Readonly<Record<string, string>>): Promise<GitHubAnswer | StepResult> {
    try {
      const response = await fetch(`${this.apiUrl}/${resource}`, {
        method,
        headers: {
          [Resources.acceptHeader]: Resources.apiMediaType,
          [Resources.authorizationHeader]: Resources.formatAuthorization(this.token),
          [Resources.apiVersionHeader]: Resources.apiVersion,
          ...(body === undefined ? {} : { [Resources.contentTypeHeader]: Resources.jsonContentType })
        },
        signal: this.createSignal(this.timeoutMilliseconds),
        ...(body === undefined ? {} : { body: JSON.stringify(body) })
      });
      const headers = response.headers;

      return new GitHubAnswer(method, resource, response.status, response.statusText, headers.get(Resources.contentTypeHeader) ?? "", headers.get(Resources.retryAfterHeader) ?? "", await response.text());
    }
    catch (error: unknown) {
      if (!GitHubApi.isUnanswered(error))
        throw error;

      return StepResult.failed(Resources.formatApiUnanswered(method, resource, (error.cause instanceof Error ? error.cause.message : "") || error.message));
    }
  }

  private static isUnanswered(error: unknown): error is Error {
    return (error instanceof DOMException && error.name === Resources.timeoutErrorName) || (error instanceof TypeError && error.cause instanceof Error);
  }
}
