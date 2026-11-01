/**
 * @license
 * Copyright (c) Noldova.
 *
 * This source code is licensed under the license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { ProcessException } from "../exceptions/process.exception.js";
import type { ProcessResult } from "../models/process-result.js";
import { Resources } from "../resources.js";
import type { ProcessRunner } from "./process-runner.js";

export class Git {
  private readonly processRunner: ProcessRunner;
  private readonly workingDirectory: string;

  public constructor(processRunner: ProcessRunner, workingDirectory: string) {
    this.processRunner = processRunner;
    this.workingDirectory = workingDirectory;
  }

  public async hasCommitAsync(revision: string): Promise<boolean> {
    return await this.verifyAsync(Resources.formatGitCommitRevision(revision));
  }

  public async hasFileAsync(commit: string, filePath: string): Promise<boolean> {
    return await this.verifyAsync(Resources.formatGitFileRevision(commit, filePath));
  }

  public async isAncestorAsync(commit: string, descendant: string): Promise<boolean> {
    return await this.testAsync([...Resources.gitIsAncestorValues, commit, descendant]);
  }

  public async readFileAsync(commit: string, filePath: string): Promise<string> {
    const values = [...Resources.gitReadFileValues, Resources.formatGitFileRevision(commit, filePath)];
    const result = await this.runAsync(values);
    if (!result.isSuccessful)
      throw Git.failed(values, result);

    return result.output;
  }

  private async verifyAsync(revision: string): Promise<boolean> {
    return await this.testAsync([...Resources.gitVerifyValues, revision]);
  }

  private async testAsync(values: readonly string[]): Promise<boolean> {
    const result = await this.runAsync(values);
    if (!result.isSuccessful && result.exitCode !== Resources.gitNotFoundExitCode)
      throw Git.failed(values, result);

    return result.isSuccessful;
  }

  private async runAsync(values: readonly string[]): Promise<ProcessResult> {
    return await this.processRunner.runAsync(Resources.gitProgram, values, this.workingDirectory);
  }

  private static failed(values: readonly string[], result: ProcessResult): ProcessException {
    const command = [Resources.gitProgram, ...values].join(Resources.valueSeparator);

    return new ProcessException(Resources.gitProgram, Resources.formatProcessFailed(command, result.exitCode, result.errorOutput));
  }
}
