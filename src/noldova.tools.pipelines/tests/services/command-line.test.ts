/**
 * @license
 * Copyright (c) Noldova.
 *
 * This source code is licensed under the license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { JsonReader } from "@noldova/context.json";
import { Assert, TestClass, TestData, TestMethod } from "@noldova/context.testing";
import { CommandLine, type IStep, type IStepOutput, ProcessException, StepResult } from "@noldova/tools.pipelines";

class RecordingOutput implements IStepOutput {
  public readonly lines: string[] = [];

  public writeSuccess(message: string): void {
    this.lines.push(`success: ${message}`);
  }

  public writeFailure(message: string): void {
    this.lines.push(`failure: ${message}`);
  }
}

class RecordingStep implements IStep {
  private readonly result: StepResult;

  public readonly name: string;
  public readonly usage: string;
  public readonly calls: (readonly string[])[] = [];

  public constructor(name: string, usage: string, result: StepResult) {
    this.name = name;
    this.usage = usage;
    this.result = result;
  }

  public async runAsync(values: readonly string[]): Promise<StepResult> {
    this.calls.push(values);
    return this.result;
  }
}

@TestClass
export class CommandLineTests {
  @TestMethod
  public async runsTheNamedStepWithTheValuesAfterItsNameAsync(): Promise<void> {
    const output = new RecordingOutput();
    const source = new RecordingStep("source", "<version> <commit>", StepResult.succeeded("Source checked."));
    const check = new RecordingStep("check", "<folder>", StepResult.succeeded("Archives checked."));

    const exitCode = await new CommandLine("pipelines", [source, check], output).runAsync(["check", "_packages", "extra"]);

    Assert.areEqual(0, exitCode);
    Assert.areEqual(0, source.calls.length);
    Assert.areEqual("[[\"_packages\",\"extra\"]]", JSON.stringify(check.calls));
    Assert.areEqual("[\"success: Archives checked.\"]", JSON.stringify(output.lines));
  }

  @TestMethod
  public async writesAFailedStepsMessageAndExitsWithOneAsync(): Promise<void> {
    const output = new RecordingOutput();
    const source = new RecordingStep("source", "<version> <commit>", StepResult.failed("Commit 225059f… is not on origin/main."));

    const exitCode = await new CommandLine("pipelines", [source], output).runAsync(["source", "0.0.4", "225059f"]);

    Assert.areEqual(1, exitCode);
    Assert.areEqual("[[\"0.0.4\",\"225059f\"]]", JSON.stringify(source.calls));
    Assert.areEqual("[\"failure: Commit 225059f… is not on origin/main.\"]", JSON.stringify(output.lines));
  }

  @TestData("{ \"values\": [] }")
  @TestData("{ \"values\": [\"publish\"] }")
  @TestData("{ \"values\": [\"Source\", \"0.0.4\"] }")
  @TestData("{ \"values\": [\"\"] }")
  @TestMethod
  public async writesTheUsageWhenNoStepHasTheNameAsync(valuesJson: string): Promise<void> {
    const values = JsonReader.parse(valuesJson).readStringArray("values");
    const output = new RecordingOutput();
    const source = new RecordingStep("source", "<version> <commit>", StepResult.succeeded("Source checked."));
    const check = new RecordingStep("check", "<folder> <version> <commit>", StepResult.succeeded("Archives checked."));

    const exitCode = await new CommandLine("pipelines", [source, check], output).runAsync(values);

    Assert.areEqual(1, exitCode);
    Assert.areEqual(0, source.calls.length + check.calls.length);
    Assert.areEqual("[\"failure: Usage: pipelines source <version> <commit> | check <folder> <version> <commit>\"]", JSON.stringify(output.lines));
  }

  @TestMethod
  public async rejectsWithTheFaultOfAStepAsync(): Promise<void> {
    const output = new RecordingOutput();
    const fault = new ProcessException("git");
    const step: IStep = { name: "source", usage: "<version> <commit>", runAsync: async () => { throw fault; } };

    const exception = await Assert.throwsAsync(() => new CommandLine("pipelines", [step], output).runAsync(["source"]), ProcessException);

    Assert.areEqual(fault, exception);
    Assert.areEqual(0, output.lines.length);
  }
}
