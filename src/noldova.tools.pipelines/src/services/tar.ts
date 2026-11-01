/**
 * @license
 * Copyright (c) Noldova.
 *
 * This source code is licensed under the license found in the
 * LICENSE file in the root directory of this source tree.
 */

import path from "node:path";

import type { ProcessResult } from "../models/process-result.js";
import { Resources } from "../resources.js";
import type { ProcessRunner } from "./process-runner.js";

export class Tar {
  private readonly processRunner: ProcessRunner;

  public constructor(processRunner: ProcessRunner) {
    this.processRunner = processRunner;
  }

  // tar runs in the archive's folder and is given only its file name, since GNU tar reads a name with a colon, such as a Windows drive, as a remote host.
  public async readFileAsync(archivePath: string, filePath: string): Promise<ProcessResult> {
    return await this.processRunner.runAsync(Resources.tarProgram, [...Resources.tarReadFileValues, path.basename(archivePath), filePath], path.dirname(archivePath));
  }
}
