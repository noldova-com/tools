/**
 * @license
 * Copyright (c) Noldova.
 *
 * This source code is licensed under the license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { Resources } from "../resources.js";

export class ProcessResult {
  public readonly exitCode: number | null;
  public readonly output: string;
  public readonly errorOutput: string;

  public constructor(exitCode: number | null, output: string, errorOutput: string) {
    this.exitCode = exitCode;
    this.output = output;
    this.errorOutput = errorOutput;
  }

  public get isSuccessful(): boolean {
    return this.exitCode === Resources.successExitCode;
  }
}
