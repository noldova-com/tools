/**
 * @license
 * Copyright (c) Noldova.
 *
 * This source code is licensed under the license found in the
 * LICENSE file in the root directory of this source tree.
 */


import fs from "node:fs";
import path from "node:path";

import type { IStep } from "../interfaces/i-step.js";
import { DependentsUpdate } from "../models/dependents-update.js";
import { HandledFailure } from "../models/handled-failure.js";
import { RelockedFiles } from "../models/relocked-files.js";
import { StepResult } from "../models/step-result.js";
import { Resources } from "../resources.js";
import { DependentRelock } from "./dependent-relock.js";
import type { Npm } from "./npm.js";
import type { ProcessRunner } from "./process-runner.js";

export class RelockStep implements IStep {
  private readonly relock: DependentRelock;
  private readonly workingDirectory: string;

  public readonly name: string = Resources.relockStepName;
  public readonly usage: string = Resources.relockStepUsage;

  public constructor(processRunner: ProcessRunner, npm: Npm, workingDirectory: string) {
    this.relock = new DependentRelock(processRunner, npm, []);
    this.workingDirectory = workingDirectory;
  }

  public async runAsync(values: readonly string[]): Promise<StepResult> {
    const [repository, request, resultPath, ...scriptValues] = values;
    if (repository === undefined || request === undefined || resultPath === undefined)
      return StepResult.failed(Resources.formatStepValuesInvalid(this.name, this.usage));

    const lockScripts = new Map<string, string>();
    for (const value of scriptValues) {
      const index = value.indexOf(Resources.lockScriptSeparator);
      const lockFilePath = value.slice(0, index);
      const script = value.slice(index + Resources.lockScriptSeparator.length);
      if (index <= 0 || lockScripts.has(lockFilePath) || !Resources.lockScriptPattern.test(script))
        return StepResult.failed(Resources.formatLockScriptInvalid(value));

      lockScripts.set(lockFilePath, script);
    }

    const relocked = await this.tryRelockAsync(DependentsUpdate.parseRequest(request), repository, lockScripts);
    fs.writeFileSync(path.resolve(this.workingDirectory, resultPath), RelockedFiles.format(relocked));

    return StepResult.succeeded(relocked instanceof StepResult ? relocked.message : Resources.formatRelockWritten(repository, relocked.moves.length, Object.keys(relocked.files).length));
  }

  private async tryRelockAsync(update: DependentsUpdate, repository: string, lockScripts: ReadonlyMap<string, string>): Promise<StepResult | RelockedFiles> {
    try {
      return await this.relock.relockAsync(update, repository, this.workingDirectory, lockScripts);
    }
    catch (error: unknown) {
      if (!HandledFailure.isHandled(error))
        throw error;

      return StepResult.failed(Resources.formatRepositoryFailed(repository, error.message));
    }
  }
}
