/**
 * @license
 * Copyright (c) Noldova.
 *
 * This source code is licensed under the license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { Assert, TestClass, TestData, TestMethod } from "@noldova/context.testing";
import type { IStepOutput } from "@noldova/tools.pipelines";
import { PipelinesProgram } from "@noldova/tools.pipelines.github";

class RecordingOutput implements IStepOutput {
  public readonly lines: string[] = [];

  public writeProgress(message: string): void {
    this.lines.push(`progress: ${message}`);
  }

  public writeProgressStart(message: string): void {
    this.lines.push(`progress start: ${message}`);
  }

  public writeSuccess(message: string): void {
    this.lines.push(`success: ${message}`);
  }

  public writeFailure(message: string): void {
    this.lines.push(`failure: ${message}`);
  }
}

@TestClass
export class PipelinesProgramTests {
  @TestData("")
  @TestData("release")
  @TestMethod
  public async writesTheUsageOfEveryStepWhenNoStepHasTheNameAsync(text: string): Promise<void> {
    const values = text.length === 0 ? [] : [text];
    const output = new RecordingOutput();

    const exitCode = await new PipelinesProgram(output).runAsync(values);

    Assert.areEqual(1, exitCode);
    Assert.areEqual(
      "[\"failure: Usage: pipelines source <version> <commit> | archive <folder> <version> <commit> <scope> | publish <folder> <version> <commit> <scope> <registry> <access> | nightly <commit> <registry> | prune <version> <commit> <scope> <registry> <keep-versions> | tag <version> <commit> | toolchain <node-version> [<npm-version>] | line-endings | unchanged | reproducible <folder> | dependents <version> <commit> | pins <version> <commit> | installed [<folder>] | build [--version <version>] [<package>...], or --list-copies | test [--skip-test-details] [--skip-coverage-details] [<filter>...]\"]",
      JSON.stringify(output.lines));
  }

  @TestData("source", "<version> <commit>")
  @TestData("archive", "<folder> <version> <commit> <scope>")
  @TestData("publish", "<folder> <version> <commit> <scope> <registry> <access>")
  @TestData("nightly", "<commit> <registry>")
  @TestData("prune", "<version> <commit> <scope> <registry> <keep-versions>")
  @TestData("tag", "<version> <commit>")
  @TestData("toolchain", "<node-version> [<npm-version>]")
  @TestData("reproducible", "<folder>")
  @TestMethod
  public async runsTheStepItsFirstValueNamesAsync(stepName: string, usage: string): Promise<void> {
    const output = new RecordingOutput();

    const exitCode = await new PipelinesProgram(output).runAsync([stepName]);

    Assert.areEqual(1, exitCode);
    Assert.areEqual(JSON.stringify([`failure: The ${stepName} step takes ${usage}.`]), JSON.stringify(output.lines));
  }

  @TestMethod
  public async runsTheBuildAndTestStepsAsync(): Promise<void> {
    const output = new RecordingOutput();

    Assert.areEqual(1, await new PipelinesProgram(output).runAsync(["build", "--list-copies", "more"]));
    Assert.areEqual(1, await new PipelinesProgram(output).runAsync(["test", "--unknown"]));
    Assert.areEqual(JSON.stringify([
      "failure: The option --list-copies takes no other value.",
      "failure: Unknown option --unknown; the step takes [--skip-test-details] [--skip-coverage-details] [<filter>...]."
    ]), JSON.stringify(output.lines));
  }

  @TestData("line-endings")
  @TestData("unchanged")
  @TestMethod
  public async runsTheStepThatTakesNoValuesAsync(stepName: string): Promise<void> {
    const output = new RecordingOutput();

    const exitCode = await new PipelinesProgram(output).runAsync([stepName, "more"]);

    Assert.areEqual(1, exitCode);
    Assert.areEqual(JSON.stringify([`failure: The ${stepName} step takes no values.`]), JSON.stringify(output.lines));
  }

  @TestMethod
  public async runsTheInstalledStepAsync(): Promise<void> {
    const output = new RecordingOutput();

    const exitCode = await new PipelinesProgram(output).runAsync(["installed", "a", "b"]);

    Assert.areEqual(1, exitCode);
    Assert.areEqual(JSON.stringify(["failure: The installed step takes [<folder>]."]), JSON.stringify(output.lines));
  }
}
