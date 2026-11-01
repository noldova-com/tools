/**
 * @license
 * Copyright (c) Noldova.
 *
 * This source code is licensed under the license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { Assert, TestClass, TestMethod } from "@noldova/context.testing";
import { ProcessException, ProcessRunner } from "@noldova/tools.pipelines";

@TestClass
export class ProcessRunnerTests {
  @TestMethod
  public async collectsTheOutputAndTheExitCodeAsync(): Promise<void> {
    const result = await new ProcessRunner().runAsync(
      process.execPath,
      ["-e", "process.stdout.write('written'); process.stderr.write('warned'); process.exitCode = 3;"],
      ".");

    Assert.areEqual(3, result.exitCode);
    Assert.areEqual("written", result.output);
    Assert.areEqual("warned", result.errorOutput);
    Assert.isFalse(result.isSuccessful);
  }

  @TestMethod
  public async succeedsForAProgramThatWritesNothingAsync(): Promise<void> {
    const result = await new ProcessRunner().runAsync(process.execPath, ["-e", ""], ".");

    Assert.areEqual(0, result.exitCode);
    Assert.areEqual("", result.output);
    Assert.areEqual("", result.errorOutput);
    Assert.isTrue(result.isSuccessful);
  }

  @TestMethod
  public async passesEachValueAsOneArgumentWithoutAShellAsync(): Promise<void> {
    const result = await new ProcessRunner().runAsync(
      process.execPath,
      ["-e", "process.stdout.write(JSON.stringify(process.argv.slice(1)));", "two words", "$HOME", "*", "a;b", ""],
      ".");

    Assert.areEqual("[\"two words\",\"$HOME\",\"*\",\"a;b\",\"\"]", result.output);
  }

  @TestMethod
  public async readsTheOutputAsUtf8Async(): Promise<void> {
    const result = await new ProcessRunner().runAsync(process.execPath, ["-e", "process.stdout.write('caf\\u00e9 \\u2713');"], ".");

    Assert.areEqual("café ✓", result.output);
  }

  @TestMethod
  public async rejectsAProgramThatCannotStartAsync(): Promise<void> {
    const exception = await Assert.throwsAsync(
      () => new ProcessRunner().runAsync("tools-pipelines-missing-program", [], "."),
      ProcessException);

    Assert.areEqual("tools-pipelines-missing-program", exception.program);
    Assert.isInstanceOf(exception.cause, Error);
    Assert.isTrue(exception.message.startsWith("\"tools-pipelines-missing-program\" could not start: "), exception.message);
  }

  @TestMethod
  public async rejectsADirectoryThatDoesNotExistAsync(): Promise<void> {
    const exception = await Assert.throwsAsync(
      () => new ProcessRunner().runAsync(process.execPath, ["-e", ""], "tools-pipelines-missing-directory"),
      ProcessException);

    Assert.areEqual(process.execPath, exception.program);
  }
}
