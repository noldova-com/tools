/**
 * @license
 * Copyright (c) Noldova.
 *
 * This source code is licensed under the license found in the
 * LICENSE file in the root directory of this source tree.
 */

import type { IStepOutput } from "@noldova/tools.pipelines";

import { Resources } from "../resources.js";

export class GitHubStepOutput implements IStepOutput {
  private readonly standardOutput: NodeJS.WritableStream;
  private readonly standardError: NodeJS.WritableStream;

  public constructor(standardOutput: NodeJS.WritableStream, standardError: NodeJS.WritableStream) {
    this.standardOutput = standardOutput;
    this.standardError = standardError;
  }

  public writeSuccess(message: string): void {
    if (message.length > 0)
      this.standardOutput.write(`${message}${Resources.lineSeparator}`);
  }

  public writeFailure(message: string): void {
    this.standardError.write(Resources.formatErrorAnnotation(message));
  }
}
