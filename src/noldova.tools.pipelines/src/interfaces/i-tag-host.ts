/**
 * @license
 * Copyright (c) Noldova.
 *
 * This source code is licensed under the license found in the
 * LICENSE file in the root directory of this source tree.
 */

import type { StepResult } from "../models/step-result.js";

export interface ITagHost {
  readTagAsync(tag: string): Promise<string | StepResult>;

  createTagAsync(tag: string, commit: string): Promise<boolean | StepResult>;
}
