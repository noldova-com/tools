/**
 * @license
 * Copyright (c) Noldova.
 *
 * This source code is licensed under the license found in the
 * LICENSE file in the root directory of this source tree.
 */


import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import "@noldova/context.core";

import { PipelineException } from "../exceptions/pipeline.exception.js";
import type { IStep } from "../interfaces/i-step.js";
import type { IStepOutput } from "../interfaces/i-step-output.js";
import { BuildConfig } from "../models/build-config.js";
import { StepResult } from "../models/step-result.js";
import { Resources } from "../resources.js";
import type { ProcessRunner } from "./process-runner.js";

export class TimingStep implements IStep {
  private static readonly TIMES_ENTRY_POINT_PATH: string = fileURLToPath(new URL(Resources.testTimesEntryPointPath, import.meta.url));

  private readonly workingDirectory: string;
  private readonly processRunner: ProcessRunner;
  private readonly output: IStepOutput;

  public readonly name: string = Resources.timingStepName;
  public readonly usage: string = Resources.timingStepUsage;

  public constructor(workingDirectory: string, processRunner: ProcessRunner, output: IStepOutput) {
    this.workingDirectory = workingDirectory;
    this.processRunner = processRunner;
    this.output = output;
  }

  public async runAsync(values: readonly string[]): Promise<StepResult> {
    if (values.length !== 0)
      return StepResult.failed(Resources.formatStepValuesInvalid(this.name, this.usage));

    try {
      return await this.timeAsync(BuildConfig.read(this.workingDirectory));
    }
    catch (error) {
      if (error instanceof PipelineException)
        return StepResult.failed(error.message);

      throw error;
    }
  }

  private async timeAsync(config: BuildConfig): Promise<StepResult> {
    if (Object.isUndefined(config.testTimeoutMilliseconds))
      return StepResult.failed(Resources.testTimeoutMissing);

    const tested = config.packages.filter(t => fs.statSync(this.resolve(Resources.formatPath(t.sourceFolder, Resources.testsProjectPath)), { throwIfNoEntry: false })?.isFile() === true);
    if (tested.length === 0)
      return StepResult.failed(Resources.testsMissing);
    if (tested.some(t => fs.statSync(this.resolve(t.testsFolder), { throwIfNoEntry: false })?.isDirectory() !== true))
      return StepResult.failed(Resources.timingNotBuilt);

    const timingFolder = this.resolve(Resources.timingFolder);
    fs.rmSync(timingFolder, { recursive: true, force: true });
    fs.mkdirSync(timingFolder, { recursive: true });
    const resultsFiles: string[] = [];
    for (let run = 1; run <= Resources.timingRuns; run++) {
      const resultsFile = path.join(timingFolder, `run-${run}.json`);
      this.output.writeProgressStart(Resources.formatTimingRun(run));
      const exitCode = await this.processRunner.runVisibleAsync(process.execPath,
        [Resources.sourceMapsOption, Resources.testEntryPath, ...tested.flatMap(t => [t.name, t.testsFolder])],
        this.workingDirectory,
        {
          [Resources.testFiltersVariable]: JSON.stringify([]),
          [Resources.testTimeoutVariable]: String(config.testTimeoutMilliseconds),
          [Resources.testResultsVariable]: resultsFile,
          [Resources.skipTestDetailsVariable]: Resources.enabledValue
        });
      if (exitCode !== Resources.successExitCode) {
        this.output.writeProgress(Resources.progressFailed);
        return StepResult.failed(Resources.formatTimingRunFailed(run, exitCode));
      }

      this.output.writeProgress(Resources.progressDone);

      resultsFiles.push(resultsFile);
    }

    const judged = await this.processRunner.runVisibleAsync(process.execPath,
      [TimingStep.TIMES_ENTRY_POINT_PATH, Resources.judgeMode, String(Resources.timingBudgetMilliseconds), String(Resources.timingMargin), this.resolve(Resources.readmeFileName), ...resultsFiles],
      this.workingDirectory,
      {});
    if (judged === Resources.successExitCode)
      return StepResult.succeeded(Resources.timingPassed);

    return StepResult.failed(judged === Resources.timesOverExitCode ? Resources.timingOver : Resources.formatTimesUnread(judged));
  }

  private resolve(filePath: string): string {
    return path.join(this.workingDirectory, filePath);
  }
}
