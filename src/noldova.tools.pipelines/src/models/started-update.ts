/**
 * @license
 * Copyright (c) Noldova.
 *
 * This source code is licensed under the license found in the
 * LICENSE file in the root directory of this source tree.
 */

import type { Git } from "../services/git.js";

// A dependent the dependents step checked out, at the head it read, with the relock run the host started for it, or
// null when the step relocks the checkout itself.
export class StartedUpdate {
  public readonly repository: string;
  public readonly directory: string;
  public readonly git: Git;
  public readonly head: string;
  public readonly run: string | null;

  public constructor(repository: string, directory: string, git: Git, head: string, run: string | null) {
    this.repository = repository;
    this.directory = directory;
    this.git = git;
    this.head = head;
    this.run = run;
  }
}
