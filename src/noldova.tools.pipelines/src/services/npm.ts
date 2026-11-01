/**
 * @license
 * Copyright (c) Noldova.
 *
 * This source code is licensed under the license found in the
 * LICENSE file in the root directory of this source tree.
 */

import type { ProcessResult } from "../models/process-result.js";
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

  public async publishAsync(archivePath: string, access: string, registry: string): Promise<ProcessResult> {
    return await this.runAsync([...Resources.npmPublishValues, archivePath, ...Resources.npmAccessValues, access, ...Resources.npmRegistryValues, registry]);
  }

  private async runAsync(values: readonly string[]): Promise<ProcessResult> {
    return await this.processRunner.runAsync(Resources.npmProgram, values, this.workingDirectory);
  }
}
