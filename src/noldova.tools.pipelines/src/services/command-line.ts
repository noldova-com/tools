/**
 * @license
 * Copyright (c) Noldova.
 *
 * This source code is licensed under the license found in the
 * LICENSE file in the root directory of this source tree.
 */

import type { IStep } from "../interfaces/i-step.js";
import type { IStepOutput } from "../interfaces/i-step-output.js";
import { Resources } from "../resources.js";

export class CommandLine {
  private readonly programName: string;
  private readonly steps: readonly IStep[];
  private readonly output: IStepOutput;

  public constructor(programName: string, steps: readonly IStep[], output: IStepOutput) {
    this.programName = programName;
    this.steps = steps;
    this.output = output;
  }

  public async runAsync(values: readonly string[]): Promise<number> {
    const [name, ...stepValues] = values;
    const step = this.steps.find(t => t.name === name);
    if (step === undefined) {
      this.output.writeFailure(Resources.formatUsage(this.programName, this.steps.map(t => Resources.formatStepUsage(t.name, t.usage))));
      return Resources.failureExitCode;
    }

    const result = await step.runAsync(stepValues);
    if (!result.isSuccessful) {
      this.output.writeFailure(result.message);
      return Resources.failureExitCode;
    }

    this.output.writeSuccess(result.message);
    return Resources.successExitCode;
  }
}
