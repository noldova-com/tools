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
  private readonly annotates: boolean;

  public constructor(standardOutput: NodeJS.WritableStream, standardError: NodeJS.WritableStream, annotates: boolean = true) {
    this.standardOutput = standardOutput;
    this.standardError = standardError;
    this.annotates = annotates;
  }

  public writeProgress(message: string): void {
    this.standardOutput.write(`${message}${Resources.lineSeparator}`);
  }

  public writeSuccess(message: string): void {
    if (message.length > 0)
      this.standardOutput.write(`${message}${Resources.lineSeparator}`);
  }

  public writeFailure(message: string): void {
    if (message.length > 0)
      this.standardError.write(this.annotates ? Resources.formatErrorAnnotation(message) : `${message}${Resources.lineSeparator}`);
  }
}
