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

  public async requestAsync(method: string, resource: string, body?: Readonly<Record<string, unknown>>): Promise<GitHubAnswer | StepResult> {
    for (const retryMilliseconds of Resources.apiRetryMilliseconds) {
      const answer = await this.sendAsync(method, resource, body);
      const waitMilliseconds = answer instanceof StepResult ? retryMilliseconds : answer.readRetryMilliseconds(retryMilliseconds);
      if (waitMilliseconds === null)
        return answer;

      await this.waitAsync(waitMilliseconds);
    }

    return await this.sendAsync(method, resource, body);
  }

  // Downloads what a resource redirects to, such as an artifact's archive, sending the token only to the API, never to the
  // address the redirect names.
  public async downloadAsync(resource: string): Promise<Buffer | StepResult> {
    try {
      const response = await fetch(Resources.formatApiUrl(this.apiUrl, resource), {
        headers: {
          [Resources.authorizationHeader]: Resources.formatAuthorization(this.token),
          [Resources.apiVersionHeader]: Resources.apiVersion
        },
        redirect: Resources.manualRedirect,
        signal: this.createSignal(this.timeoutMilliseconds)
      });
      const location = response.headers.get(Resources.locationHeader);
      await response.arrayBuffer();
      if (response.status !== Resources.redirectStatus || location === null)
        return StepResult.failed(Resources.formatDownloadFailed(resource, response.status, response.statusText));

      const download = await fetch(new URL(location, this.apiUrl), { signal: this.createSignal(this.timeoutMilliseconds) });
      if (download.status !== Resources.foundStatus)
        return StepResult.failed(Resources.formatDownloadFailed(resource, download.status, download.statusText));

      return Buffer.from(await download.arrayBuffer());
    }
    catch (error: unknown) {
      if (!GitHubApi.isUnanswered(error))
        throw error;

      return GitHubApi.failUnanswered(Resources.readMethod, resource, error);
    }
  }

  private async sendAsync(method: string, resource: string, body?: Readonly<Record<string, unknown>>): Promise<GitHubAnswer | StepResult> {
    try {
      const response = await fetch(Resources.formatApiUrl(this.apiUrl, resource), {
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

      return GitHubApi.failUnanswered(method, resource, error);
    }
  }

  private static failUnanswered(method: string, resource: string, error: Error): StepResult {
    return StepResult.failed(Resources.formatApiUnanswered(method, resource, (error.cause instanceof Error ? error.cause.message : "") || error.message));
  }

  private static isUnanswered(error: unknown): error is Error {
    return (error instanceof DOMException && error.name === Resources.timeoutErrorName) || (error instanceof TypeError && error.cause instanceof Error);
  }
}
