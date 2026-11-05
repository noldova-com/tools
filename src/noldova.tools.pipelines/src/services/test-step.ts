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

import { BuildException } from "../exceptions/build.exception.js";
import { PipelineException } from "../exceptions/pipeline.exception.js";
import type { IStep } from "../interfaces/i-step.js";
import type { IStepOutput } from "../interfaces/i-step-output.js";
import { BuildConfig } from "../models/build-config.js";
import type { BuildPackage } from "../models/build-package.js";
import { StepResult } from "../models/step-result.js";
import { Resources } from "../resources.js";
import type { ProcessRunner } from "./process-runner.js";
import type { TypeScript } from "./type-script.js";

export class TestStep implements IStep {
  private static readonly COVERAGE_ENTRY_POINT_PATH: string = fileURLToPath(new URL(Resources.coverageEntryPointPath, import.meta.url));

  private readonly typeScript: TypeScript;
  private readonly processRunner: ProcessRunner;
  private readonly output: IStepOutput;

  public readonly name: string = Resources.testStepName;
  public readonly usage: string = Resources.testStepUsage;

  public constructor(typeScript: TypeScript, processRunner: ProcessRunner, output: IStepOutput) {
    this.typeScript = typeScript;
    this.processRunner = processRunner;
    this.output = output;
  }

  public async runAsync(values: readonly string[]): Promise<StepResult> {
    const options = new Set<string>();
    const filters: string[] = [];
    for (const value of values) {
      if (!value.startsWith(Resources.optionPrefix))
        filters.push(value);
      else if (Resources.testOptions.includes(value))
        options.add(value);
      else
        return StepResult.failed(Resources.formatOptionUnknown(value, this.usage));
    }

    try {
      return await this.testAsync(BuildConfig.read(this.typeScript.workingDirectory), options, filters);
    }
    catch (error) {
      if (error instanceof PipelineException)
        return StepResult.failed(error.message);

      throw error;
    }
  }

  private async testAsync(config: BuildConfig, options: ReadonlySet<string>, filters: readonly string[]): Promise<StepResult> {
    const projectValues: string[] = [];
    for (const buildPackage of config.packages) {
      const projectPath = `${buildPackage.sourceFolder}/${Resources.testsProjectPath}`;
      if (fs.statSync(this.resolve(projectPath), { throwIfNoEntry: false })?.isFile() !== true)
        continue;

      this.output.writeProgressStart(Resources.formatCompilingTests(buildPackage.name));
      try {
        await this.compileTestsAsync(buildPackage, projectPath);
      }
      catch (error) {
        this.output.writeProgress(Resources.progressFailed);
        throw error;
      }

      this.output.writeProgress(Resources.progressDone);
      projectValues.push(buildPackage.name, buildPackage.testsFolder);
    }

    if (projectValues.length === 0)
      return StepResult.failed(Resources.testsMissing);

    const coverageFolder = this.resolve(Resources.coverageFolder);
    const environment: Record<string, string> = { [Resources.testFiltersVariable]: JSON.stringify(filters) };
    if (options.has(Resources.skipTestDetailsOption))
      environment[Resources.skipTestDetailsVariable] = Resources.enabledValue;
    if (filters.length === 0) {
      fs.rmSync(coverageFolder, { recursive: true, force: true });
      fs.mkdirSync(coverageFolder, { recursive: true });
      environment[Resources.coverageVariable] = coverageFolder;
    }

    const exitCode = await this.processRunner.runVisibleAsync(process.execPath, [Resources.sourceMapsOption, Resources.testEntryPath, ...projectValues], this.typeScript.workingDirectory, environment);
    const problems = exitCode === Resources.successExitCode ? [] : [Resources.formatTestsFailed(exitCode)];
    if (filters.length > 0)
      return problems.length === 0 ? StepResult.succeeded(Resources.filteredCoverageSkipped) : StepResult.failed([...problems, Resources.filteredCoverageSkipped].join(Resources.lineSeparator));

    const projects = config.packages.map(t => [t.name, this.resolve(`${Resources.nodeModulesFolder}/${t.packageName}`), this.resolve(`${t.sourceFolder}/${Resources.sourceFolder}`)]);
    const skipDetails = options.has(Resources.skipCoverageDetailsOption) ? Resources.enabledValue : "";
    const coverageExitCode = await this.processRunner.runVisibleAsync(process.execPath, [TestStep.COVERAGE_ENTRY_POINT_PATH, coverageFolder, skipDetails, JSON.stringify(projects)], this.typeScript.workingDirectory, {});
    if (coverageExitCode === Resources.failureExitCode)
      problems.push(Resources.coverageIncomplete);
    else if (coverageExitCode !== Resources.successExitCode)
      problems.push(Resources.formatCoverageUnread(coverageExitCode));

    return problems.length === 0 ? StepResult.succeeded(Resources.testsPassed) : StepResult.failed(problems.join(Resources.lineSeparator));
  }

  private async compileTestsAsync(buildPackage: BuildPackage, projectPath: string): Promise<void> {
    fs.rmSync(this.resolve(buildPackage.testsFolder), { recursive: true, force: true });
    const compiled = await this.typeScript.compileAsync(projectPath);
    if (!compiled.isSuccessful)
      throw new BuildException(Resources.formatCompileFailed(projectPath, compiled.exitCode, `${compiled.output}${compiled.errorOutput}`));
  }

  private resolve(filePath: string): string {
    return path.join(this.typeScript.workingDirectory, filePath);
  }
}
