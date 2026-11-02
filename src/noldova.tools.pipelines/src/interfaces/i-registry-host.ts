/**
 * @license
 * Copyright (c) Noldova.
 *
 * This source code is licensed under the license found in the
 * LICENSE file in the root directory of this source tree.
 */

import type { StepResult } from "../models/step-result.js";

export interface IRegistryHost {
  readonly registry: string;

  readVersionsAsync(packageName: string): Promise<readonly string[] | StepResult>;

  deleteVersionAsync(packageName: string, version: string): Promise<boolean | StepResult>;
}
