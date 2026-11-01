/**
 * @license
 * Copyright (c) Noldova.
 *
 * This source code is licensed under the license found in the
 * LICENSE file in the root directory of this source tree.
 */

import type { StepResult } from "../models/step-result.js";

export interface IStep {
  readonly name: string;
  readonly usage: string;

  runAsync(values: readonly string[]): Promise<StepResult>;
}
