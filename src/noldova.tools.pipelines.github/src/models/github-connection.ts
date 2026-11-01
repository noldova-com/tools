/**
 * @license
 * Copyright (c) Noldova.
 *
 * This source code is licensed under the license found in the
 * LICENSE file in the root directory of this source tree.
 */

export class GitHubConnection {
  public readonly apiUrl: string;
  public readonly repository: string;
  public readonly token: string;

  public constructor(apiUrl: string, repository: string, token: string) {
    this.apiUrl = apiUrl;
    this.repository = repository;
    this.token = token;
  }
}
