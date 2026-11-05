/**
 * @license
 * Copyright (c) Noldova.
 *
 * This source code is licensed under the license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { createRequire } from "node:module";
import path from "node:path";

import { BuildException } from "../exceptions/build.exception.js";
import type { ProcessResult } from "../models/process-result.js";
import { Resources } from "../resources.js";
import type { ProcessRunner } from "./process-runner.js";

export class TypeScript {
  private readonly processRunner: ProcessRunner;
  public readonly workingDirectory: string;

  public constructor(processRunner: ProcessRunner, workingDirectory: string) {
    this.processRunner = processRunner;
    this.workingDirectory = workingDirectory;
  }

  public async compileAsync(projectPath: string): Promise<ProcessResult> {
    return await this.processRunner.runAsync(process.execPath, [this.findCompiler(), ...Resources.typeScriptCompileValues, projectPath], this.workingDirectory);
  }

  private findCompiler(): string {
    let manifestPath: string;
    try {
      manifestPath = createRequire(path.resolve(this.workingDirectory, Resources.packageManifestFileName)).resolve(Resources.typeScriptManifestPath);
    }
    catch {
      throw new BuildException(Resources.typeScriptMissing);
    }

    return path.join(path.dirname(manifestPath), Resources.typeScriptCompilerPath);
  }
}
