/**
 * @license
 * Copyright (c) Noldova.
 *
 * This source code is licensed under the license found in the
 * LICENSE file in the root directory of this source tree.
 */

import type { IStep } from "../interfaces/i-step.js";
import { StepResult } from "../models/step-result.js";
import { Resources } from "../resources.js";
import type { Git } from "./git.js";

export class UnchangedStep implements IStep {
  private readonly git: Git;

  public readonly name: string = Resources.unchangedStepName;
  public readonly usage: string = Resources.unchangedStepUsage;

  public constructor(git: Git) {
    this.git = git;
  }

  public async runAsync(values: readonly string[]): Promise<StepResult> {
    if (values.length !== 0)
      return StepResult.failed(Resources.formatStepValuesInvalid(this.name, this.usage));

    const changes = await this.git.listChangesAsync();
    if (changes.length > 0)
      return StepResult.failed(Resources.formatCheckoutChanged(changes));

    return StepResult.succeeded(Resources.checkoutUnchanged);
  }
}
