/**
 * @license
 * Copyright (c) Noldova.
 *
 * This source code is licensed under the license found in the
 * LICENSE file in the root directory of this source tree.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { JsonException } from "@noldova/context.json";
import { Assert, TestClass, TestData, TestMethod } from "@noldova/context.testing";
import { ProcessRunner, TimingStep } from "@noldova/tools.pipelines";

import { RecordingOutput } from "./fake-update-host.js";

class FakeRunner extends ProcessRunner {
  public readonly calls: string[][] = [];
  public readonly environments: Readonly<Record<string, string>>[] = [];
  private readonly exitCodes: (number | null)[];

  public constructor(...exitCodes: (number | null)[]) {
    super();

    this.exitCodes = exitCodes;
  }

  public override async runVisibleAsync(program: string, values: readonly string[], workingDirectory: string, environment: Readonly<Record<string, string>>): Promise<number | null> {
    this.calls.push([program, ...values, workingDirectory]);
    this.environments.push(environment);

    const [exitCode = 0] = this.exitCodes.splice(0, 1);

    return exitCode;
  }
}

class Checkout implements Disposable {
  public readonly directory: string = fs.mkdtempSync(path.join(os.tmpdir(), "tools-pipelines-"));

  public constructor(files: Readonly<Record<string, string>> = {}) {
    this.write({
      "build.json": "{\"testTimeoutMilliseconds\":30000,\"packages\":[{\"name\":\"noldova.a\"},{\"name\":\"noldova.b\"}]}",
      "src/noldova.a/tests/tsconfig.json": "{}",
      "_build/tests/noldova.a/a.test.js": "",
      ...files
    });
  }

  public write(files: Readonly<Record<string, string>>): void {
    for (const [filePath, content] of Object.entries(files)) {
      fs.mkdirSync(path.dirname(path.join(this.directory, filePath)), { recursive: true });
      fs.writeFileSync(path.join(this.directory, filePath), content);
    }
  }

  public exists(filePath: string): boolean {
    return fs.existsSync(path.join(this.directory, filePath));
  }

  public [Symbol.dispose](): void {
    fs.rmSync(this.directory, { recursive: true, force: true });
  }
}

@TestClass
export class TimingStepTests {
  private static readonly TIMES_ENTRY_POINT_PATH: string = fileURLToPath(import.meta.resolve("@noldova/tools.pipelines/services/test-times-entry-point.js"));
  // A stand-in for the checkout's @noldova/context.testing: records are { file, ms }, and a file is over when one of its records exceeds the budget
  // with its margin.
  private static readonly TESTING_PACKAGE: Readonly<Record<string, string>> = {
    "node_modules/@noldova/context.testing/package.json": "{\"name\":\"@noldova/context.testing\",\"type\":\"module\",\"main\":\"index.js\"}",
    "node_modules/@noldova/context.testing/index.js": [
      "export class TestTimeRecord {",
      "  static parseAll(text) { return JSON.parse(text); }",
      "  static formatSlowest(records, count) { return [`slowest ${count}`, ...records.map(t => `${t.file} ${t.ms}`)]; }",
      "}",
      "export class TestTimingCheck {",
      "  constructor(budget, margin, listed) { this.limit = budget * (1 + margin); this.listed = listed; }",
      "  static readListed(markdown) { return new Map(markdown.split('\\n').filter(t => t !== '').map(t => [t, 1])); }",
      "  static formatSummary(timings, runs) { return `summary ${timings.length} files ${runs} runs`; }",
      "  judge(runs) {",
      "    const records = runs.flat();",
      "    return [...new Set([...records.map(t => t.file), ...this.listed.keys()])].map(file => ({",
      "      isOver: records.some(t => t.file === file && t.ms > this.limit), isListed: this.listed.has(file), format: () => `timing ${file}`",
      "    }));",
      "  }",
      "}"
    ].join("\n")
  };

  @TestMethod
  public namesItselfAndItsValues(): void {
    const step = new TimingStep(".", new FakeRunner(), new RecordingOutput([]));

    Assert.areEqual("timing", step.name);
    Assert.areEqual("", step.usage);
  }

  @TestMethod
  public async runsTheCompiledTestsThreeTimesAndJudgesTheirTimesAsync(): Promise<void> {
    using checkout = new Checkout({ "_build/timing/stale.json": "" });
    const runner = new FakeRunner();
    const lines: string[] = [];

    const result = await new TimingStep(checkout.directory, runner, new RecordingOutput(lines)).runAsync([]);

    Assert.isTrue(result.isSuccessful);
    Assert.areEqual("Every test file is within its time.", result.message);
    Assert.isFalse(checkout.exists("_build/timing/stale.json"));
    const runFiles = [1, 2, 3].map(t => path.join(checkout.directory, "_build/timing", `run-${t}.json`));
    const testRun = [process.execPath, "--enable-source-maps", "node_modules/@noldova/context.testing/services/execution/test-run-entry-point.js", "noldova.a", "_build/tests/noldova.a", checkout.directory];
    Assert.areEqual(JSON.stringify([
      testRun,
      testRun,
      testRun,
      [process.execPath, TimingStepTests.TIMES_ENTRY_POINT_PATH, "judge", "2000", "0.5", path.join(checkout.directory, "README.md"), ...runFiles, checkout.directory]
    ]), JSON.stringify(runner.calls));
    Assert.areEqual(JSON.stringify([
      ...runFiles.map(t => ({ CONTEXT_TEST_FILTERS: "[]", CONTEXT_TEST_TIMEOUT_MILLISECONDS: "30000", CONTEXT_TEST_RESULTS_FILE: t, CONTEXT_SKIP_TEST_DETAILS: "1" })),
      {}
    ]), JSON.stringify(runner.environments));
    Assert.areEqual(
      "progress start: Timing run 1 of 3...|progress:  Done.|progress start: Timing run 2 of 3...|progress:  Done.|progress start: Timing run 3 of 3...|progress:  Done.",
      lines.join("|"));
  }

  @TestMethod
  public async stopsAtARunThatFailsAsync(): Promise<void> {
    using checkout = new Checkout();
    const runner = new FakeRunner(0, 3);
    const lines: string[] = [];

    const result = await new TimingStep(checkout.directory, runner, new RecordingOutput(lines)).runAsync([]);

    Assert.isFalse(result.isSuccessful);
    Assert.areEqual("Timing run 2 failed with exit code 3; the timing check judges only a passing suite.", result.message);
    Assert.areEqual(2, runner.calls.length);
    Assert.areEqual("progress start: Timing run 1 of 3...|progress:  Done.|progress start: Timing run 2 of 3...|progress:  Failed.", lines.join("|"));
  }

  @TestData(1, "A test file is over its time.")
  @TestData(2, "The test times were not read: their report exited with code 2.")
  @TestData(null, "The test times were not read: their report exited with code null.")
  @TestMethod
  public async failsForAFileOverItsTimeOrTimesNotReadAsync(exitCode: number | null, message: string): Promise<void> {
    using checkout = new Checkout();

    const result = await new TimingStep(checkout.directory, new FakeRunner(0, 0, 0, exitCode), new RecordingOutput([])).runAsync([]);

    Assert.isFalse(result.isSuccessful);
    Assert.areEqual(message, result.message);
  }

  @TestMethod
  public async failsForAValueAsync(): Promise<void> {
    const result = await new TimingStep(".", new FakeRunner(), new RecordingOutput([])).runAsync(["--runs"]);

    Assert.isFalse(result.isSuccessful);
    Assert.areEqual("The timing step takes no values.", result.message);
  }

  @TestMethod
  public async failsWithoutABuildFileAsync(): Promise<void> {
    using checkout = new Checkout();
    fs.rmSync(path.join(checkout.directory, "build.json"));

    const result = await new TimingStep(checkout.directory, new FakeRunner(), new RecordingOutput([])).runAsync([]);

    Assert.areEqual("The checkout has no build.json, which names the packages to build.", result.message);
  }

  @TestMethod
  public async rejectsAFaultAsync(): Promise<void> {
    using checkout = new Checkout({ "build.json": "{" });

    await Assert.throwsAsync(() => new TimingStep(checkout.directory, new FakeRunner(), new RecordingOutput([])).runAsync([]), JsonException);
  }

  @TestMethod
  public async failsWithoutTheSuitesHangLimitAsync(): Promise<void> {
    using checkout = new Checkout({ "build.json": "{\"packages\":[{\"name\":\"noldova.a\"}]}" });
    const runner = new FakeRunner();

    const result = await new TimingStep(checkout.directory, runner, new RecordingOutput([])).runAsync([]);

    Assert.isFalse(result.isSuccessful);
    Assert.areEqual(
      "build.json sets no testTimeoutMilliseconds, the suite's hang limit: at least three times its slowest test on any target, with the measurement in README's Checks.",
      result.message);
    Assert.areEqual(0, runner.calls.length);
  }

  @TestMethod
  public async failsWhenNoPackageHasTestsAsync(): Promise<void> {
    using checkout = new Checkout();
    fs.rmSync(path.join(checkout.directory, "src/noldova.a/tests/tsconfig.json"));

    const result = await new TimingStep(checkout.directory, new FakeRunner(), new RecordingOutput([])).runAsync([]);

    Assert.areEqual("No package has tests.", result.message);
  }

  @TestMethod
  public async failsWhenTheTestsAreNotCompiledAsync(): Promise<void> {
    using checkout = new Checkout();
    fs.rmSync(path.join(checkout.directory, "_build/tests/noldova.a"), { recursive: true });
    const runner = new FakeRunner();

    const result = await new TimingStep(checkout.directory, runner, new RecordingOutput([])).runAsync([]);

    Assert.areEqual("The tests are not compiled; run the test step first.", result.message);
    Assert.areEqual(0, runner.calls.length);
  }

  @TestMethod
  public async printsTheSlowestTestsOfARunAsync(): Promise<void> {
    using checkout = new Checkout({ ...TimingStepTests.TESTING_PACKAGE, "_build/test-results.json": "[{\"file\":\"a\",\"ms\":5}]" });

    const result = await new ProcessRunner().runAsync(process.execPath, [TimingStepTests.TIMES_ENTRY_POINT_PATH, "slowest", "_build/test-results.json", "10"], checkout.directory);

    Assert.areEqual(0, result.exitCode);
    Assert.areEqual("slowest 10\na 5\n", result.output);
  }

  @TestMethod
  public async failsToPrintTheSlowestTestsWithoutTheRunsTimesAsync(): Promise<void> {
    using checkout = new Checkout(TimingStepTests.TESTING_PACKAGE);

    const result = await new ProcessRunner().runAsync(process.execPath, [TimingStepTests.TIMES_ENTRY_POINT_PATH, "slowest", "_build/test-results.json", "10"], checkout.directory);

    Assert.areEqual(2, result.exitCode);
    Assert.areEqual("_build/test-results.json holds no test times: the test run wrote none.\n", result.errorOutput);
  }

  @TestData("[{\"file\":\"a\",\"ms\":200}]", "", 1, "timing a\nsummary 1 files 2 runs\n")
  @TestData("[{\"file\":\"a\",\"ms\":100}]", "", 0, "summary 1 files 2 runs\n")
  @TestData("[{\"file\":\"a\",\"ms\":100}]", "a\n", 0, "timing a\nsummary 1 files 2 runs\n")
  @TestMethod
  public async judgesTheRunsTimesWithTheReadmesListAsync(secondRun: string, readme: string, exitCode: number, output: string): Promise<void> {
    using checkout = new Checkout({ ...TimingStepTests.TESTING_PACKAGE, "run-1.json": "[{\"file\":\"a\",\"ms\":100}]", "run-2.json": secondRun, ...readme === "" ? {} : { "README.md": readme } });

    const result = await new ProcessRunner().runAsync(process.execPath, [TimingStepTests.TIMES_ENTRY_POINT_PATH, "judge", "100", "0.5", "README.md", "run-1.json", "run-2.json"], checkout.directory);

    Assert.areEqual(exitCode, result.exitCode);
    Assert.areEqual(output, result.output);
  }

  @TestMethod
  public async failsToJudgeWithoutTheTestingPackageAsync(): Promise<void> {
    using checkout = new Checkout();

    const result = await new ProcessRunner().runAsync(process.execPath, [TimingStepTests.TIMES_ENTRY_POINT_PATH, "judge", "100", "0.5", "README.md"], checkout.directory);

    Assert.areEqual(2, result.exitCode);
    Assert.areEqual("@noldova/context.testing is not installed; the repository's devDependencies name it.\n", result.errorOutput);
  }
}
