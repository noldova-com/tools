/**
 * @license
 * Copyright (c) Noldova.
 *
 * This source code is licensed under the license found in the
 * LICENSE file in the root directory of this source tree.
 */

import path from "node:path";

import type { ProcessResult } from "../models/process-result.js";
import { StepResult } from "../models/step-result.js";
import { Resources } from "../resources.js";
import type { ProcessRunner } from "./process-runner.js";

export class Npm {
  private readonly processRunner: ProcessRunner;
  private readonly workingDirectory: string;

  public constructor(processRunner: ProcessRunner, workingDirectory: string) {
    this.processRunner = processRunner;
    this.workingDirectory = workingDirectory;
  }

  public async viewAsync(specifier: string, field: string, registry: string): Promise<ProcessResult> {
    return await this.runAsync([...Resources.npmViewValues, specifier, field, ...Resources.npmPreferOnlineValues, ...Resources.npmRegistryValues, registry]);
  }

  public async readFieldOrEmptyAsync(specifier: string, field: string, registry: string): Promise<string | StepResult> {
    const result = await this.viewAsync(specifier, field, registry);
    if (result.isSuccessful)
      return result.output.trim();
    if (result.output.includes(Resources.npmNotFoundCode) || result.errorOutput.includes(Resources.npmNotFoundCode))
      return "";

    return StepResult.failed(Resources.formatNpmFailed(specifier, Resources.npmViewValues, result.exitCode, result.errorOutput));
  }

  public async publishAsync(archivePath: string, tag: string, access: string, registry: string): Promise<ProcessResult> {
    const values = [...Resources.npmPublishValues, path.resolve(archivePath), ...Resources.npmTagValues, tag, ...Resources.npmAccessValues, access, ...Resources.npmRegistryValues, registry];

    return await this.runAsync(values);
  }

  public static isRegistry(text: string): boolean {
    if (!URL.canParse(text))
      return false;

    const url = new URL(text);

    return url.protocol === Resources.registryProtocol && url.username.length === 0 && url.password.length === 0 && url.search.length === 0 && url.hash.length === 0;
  }

  private async runAsync(values: readonly string[]): Promise<ProcessResult> {
    return await this.processRunner.runAsync(Resources.npmProgram, values, this.workingDirectory);
  }
}
