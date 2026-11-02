/**
 * @license
 * Copyright (c) Noldova.
 *
 * This source code is licensed under the license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { GitHubAnswer } from "../models/github-answer.js";
import { Resources } from "../resources.js";

export class GitHubApi {
  private readonly apiUrl: string;
  private readonly token: string;
  private readonly timeoutMilliseconds: number;
  private readonly waitAsync: (milliseconds: number) => Promise<void>;

  public constructor(apiUrl: string, token: string, timeoutMilliseconds: number, waitAsync: (milliseconds: number) => Promise<void>) {
    this.apiUrl = apiUrl;
    this.token = token;
    this.timeoutMilliseconds = timeoutMilliseconds;
    this.waitAsync = waitAsync;
  }

  public async requestAsync(method: string, resource: string, body?: Readonly<Record<string, string>>): Promise<GitHubAnswer> {
    for (const retryMilliseconds of Resources.apiRetryMilliseconds) {
      let waitMilliseconds = retryMilliseconds;
      try {
        const answer = await this.sendAsync(method, resource, body);
        const askedMilliseconds = answer.readRetryMilliseconds(retryMilliseconds);
        if (askedMilliseconds === null)
          return answer;

        waitMilliseconds = askedMilliseconds;
      }
      catch (error: unknown) {
        if (!(error instanceof DOMException) || error.name !== Resources.timeoutErrorName)
          throw error;
      }

      await this.waitAsync(waitMilliseconds);
    }

    return await this.sendAsync(method, resource, body);
  }

  private async sendAsync(method: string, resource: string, body?: Readonly<Record<string, string>>): Promise<GitHubAnswer> {
    const response = await fetch(`${this.apiUrl}/${resource}`, {
      method,
      headers: {
        [Resources.acceptHeader]: Resources.apiMediaType,
        [Resources.authorizationHeader]: Resources.formatAuthorization(this.token),
        [Resources.apiVersionHeader]: Resources.apiVersion,
        ...(body === undefined ? {} : { [Resources.contentTypeHeader]: Resources.jsonContentType })
      },
      signal: AbortSignal.timeout(this.timeoutMilliseconds),
      ...(body === undefined ? {} : { body: JSON.stringify(body) })
    });

    const headers = response.headers;

    return new GitHubAnswer(method, resource, response.status, response.statusText, headers.get(Resources.contentTypeHeader) ?? "", headers.get(Resources.retryAfterHeader) ?? "", await response.text());
  }
}
