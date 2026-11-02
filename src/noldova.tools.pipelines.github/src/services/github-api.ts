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

  public constructor(apiUrl: string, token: string, timeoutMilliseconds: number) {
    this.apiUrl = apiUrl;
    this.token = token;
    this.timeoutMilliseconds = timeoutMilliseconds;
  }

  public async requestAsync(method: string, resource: string, body?: Readonly<Record<string, string>>): Promise<GitHubAnswer> {
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

    return new GitHubAnswer(method, resource, response.status, response.statusText, response.headers.get(Resources.contentTypeHeader) ?? "", await response.text());
  }
}
