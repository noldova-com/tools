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

  public writeSuccess(message: string): void {
    this.lines.push(`success: ${message}`);
  }

  public writeFailure(message: string): void {
    this.lines.push(`failure: ${message}`);
  }
}

@TestClass
export class PipelinesProgramTests {
  @TestData("[]")
  @TestData("[\"tag\"]")
  @TestMethod
  public async writesTheUsageOfEveryStepWhenNoStepHasTheNameAsync(valuesJson: string): Promise<void> {
    const values: readonly string[] = JSON.parse(valuesJson);
    const output = new RecordingOutput();

    const exitCode = await new PipelinesProgram(output).runAsync(values);

    Assert.areEqual(1, exitCode);
    Assert.areEqual(
      "[\"failure: Usage: pipelines source <version> <commit> | archive <folder> <version> <commit> <scope> | publish <folder> <version> <commit> <scope> <registry> <access> | nightly <commit> <registry>\"]",
      JSON.stringify(output.lines));
  }

  @TestData("source", "<version> <commit>")
  @TestData("archive", "<folder> <version> <commit> <scope>")
  @TestData("publish", "<folder> <version> <commit> <scope> <registry> <access>")
  @TestData("nightly", "<commit> <registry>")
  @TestMethod
  public async runsTheStepItsFirstValueNamesAsync(stepName: string, usage: string): Promise<void> {
    const output = new RecordingOutput();

    const exitCode = await new PipelinesProgram(output).runAsync([stepName]);

    Assert.areEqual(1, exitCode);
    Assert.areEqual(JSON.stringify([`failure: The ${stepName} step takes ${usage}.`]), JSON.stringify(output.lines));
  }
}
