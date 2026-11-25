/**
 * @license
 * Copyright (c) Noldova.
 *
 * This source code is licensed under the license found in the
 * LICENSE file in the root directory of this source tree.
 */

export class BranchHeadFixture {
  public readonly committer: string;
  public readonly subject: string;

  public constructor(committer: string, subject: string) {
    this.committer = committer;
    this.subject = subject;
  }
}
