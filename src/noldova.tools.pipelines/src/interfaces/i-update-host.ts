/**
 * @license
 * Copyright (c) Noldova.
 *
 * This source code is licensed under the license found in the
 * LICENSE file in the root directory of this source tree.
 */

import type { StepResult } from "../models/step-result.js";

export interface IUpdateHost {
  readSourceName(): string | StepResult;

  listRepositoriesAsync(): Promise<readonly string[] | StepResult>;

  readReleaseNotesAsync(version: string, commit: string): Promise<string | StepResult>;

  checkOutAsync(repository: string, directory: string): Promise<StepResult | null>;

  pushAsync(repository: string, directory: string, branch: string): Promise<StepResult | null>;

  proposeAsync(repository: string, branch: string, title: string, body: string): Promise<string | StepResult>;
}
