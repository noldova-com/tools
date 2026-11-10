/**
 * @license
 * Copyright (c) Noldova.
 *
 * This source code is licensed under the license found in the
 * LICENSE file in the root directory of this source tree.
 */

import type { StepResult } from "../models/step-result.js";

export interface IUpdateHost {
  readonly credentialVariables: readonly string[];

  readSourceName(): string | StepResult;

  listRepositoriesAsync(): Promise<readonly string[] | StepResult>;

  readReleaseNotesAsync(version: string, commit: string): Promise<string | StepResult>;

  relockAsync(repository: string, commit: string, request: string): Promise<string | null | StepResult>;

  checkOutAsync(repository: string, directory: string): Promise<StepResult | null>;

  fetchBranchAsync(repository: string, directory: string, branch: string): Promise<string | null | StepResult>;

  pushAsync(repository: string, directory: string, branch: string, replaced: string | null): Promise<StepResult | null>;

  proposeAsync(repository: string, branch: string, title: string, body: string, summary: string): Promise<string | StepResult>;
}
