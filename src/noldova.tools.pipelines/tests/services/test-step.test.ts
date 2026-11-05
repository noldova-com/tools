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
import { ProcessException, ProcessResult, ProcessRunner, TestStep, TypeScript } from "@noldova/tools.pipelines";

import { RecordingOutput } from "./fake-update-host.js";

class FakeTypeScript extends TypeScript {
  public readonly calls: string[] = [];
  private readonly result: ProcessResult;

  public constructor(directory: string, result: ProcessResult = new ProcessResult(0, "", "")) {
    super(new ProcessRunner(), directory);

    this.result = result;
  }

  public override async compileAsync(projectPath: string): Promise<ProcessResult> {
    this.calls.push(projectPath);

    return this.result;
  }
}

class RejectingTypeScript extends TypeScript {
  public override async compileAsync(): Promise<ProcessResult> {
    throw new ProcessException("tsc", "tsc could not start.");
  }
}

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
      "build.json": "{\"packages\":[{\"name\":\"noldova.a\"},{\"name\":\"noldova.b\",\"path\":\"group/noldova.b\"}]}",
      "src/noldova.a/tests/tsconfig.json": "{}",
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
export class TestStepTests {
  private static readonly COVERAGE_ENTRY_POINT_PATH: string = fileURLToPath(import.meta.resolve("@noldova/tools.pipelines/services/coverage-entry-point.js"));

  @TestMethod
  public namesItselfAndItsValues(): void {
    const step = new TestStep(new FakeTypeScript("."), new FakeRunner(), new RecordingOutput([]));

    Assert.areEqual("test", step.name);
    Assert.areEqual("[--skip-test-details] [--skip-coverage-details] [<filter>...]", step.usage);
  }

  @TestMethod
  public async compilesAndRunsTheTestsAndRequiresCompleteCoverageAsync(): Promise<void> {
    using checkout = new Checkout({ "_build/tests/noldova.a/stale.js": "", "_build/coverage/stale.json": "" });
    const typeScript = new FakeTypeScript(checkout.directory);
    const runner = new FakeRunner(0, 0);
    const lines: string[] = [];

    const result = await new TestStep(typeScript, runner, new RecordingOutput(lines)).runAsync([]);

    Assert.isTrue(result.isSuccessful);
    Assert.areEqual("The tests passed, and coverage is complete.", result.message);
    Assert.areEqual("src/noldova.a/tests/tsconfig.json", typeScript.calls.join(","));
    Assert.isFalse(checkout.exists("_build/tests/noldova.a/stale.js"));
    Assert.isFalse(checkout.exists("_build/coverage/stale.json"));
    Assert.isTrue(checkout.exists("_build/coverage"));
    const coverageFolder = path.join(checkout.directory, "_build/coverage");
    const projects = [
      ["noldova.a", path.join(checkout.directory, "node_modules/@noldova/a"), path.join(checkout.directory, "src/noldova.a/src")],
      ["noldova.b", path.join(checkout.directory, "node_modules/@noldova/b"), path.join(checkout.directory, "src/group/noldova.b/src")]
    ];
    Assert.areEqual(JSON.stringify([
      [process.execPath, "--enable-source-maps", "node_modules/@noldova/context.testing/services/execution/test-run-entry-point.js", "noldova.a", "_build/tests/noldova.a", checkout.directory],
      [process.execPath, TestStepTests.COVERAGE_ENTRY_POINT_PATH, coverageFolder, "", JSON.stringify(projects), checkout.directory]
    ]), JSON.stringify(runner.calls));
    Assert.areEqual(JSON.stringify([{ CONTEXT_TEST_FILTERS: "[]", NODE_V8_COVERAGE: coverageFolder }, {}]), JSON.stringify(runner.environments));
    Assert.areEqual("progress start: Compiling the tests of noldova.a...|progress:  Done.", lines.join("|"));
  }

  @TestMethod
  public async passesTheOptionsToTheRunAndTheReportAsync(): Promise<void> {
    using checkout = new Checkout();
    const runner = new FakeRunner(0, 0);

    await new TestStep(new FakeTypeScript(checkout.directory), runner, new RecordingOutput([])).runAsync(["--skip-test-details", "--skip-coverage-details"]);

    Assert.areEqual("1", runner.environments[0]?.["CONTEXT_SKIP_TEST_DETAILS"]);
    Assert.areEqual("1", runner.calls[1]?.[3]);
  }

  @TestData(0, "The coverage gate is skipped for a filtered run.")
  @TestData(1, "The tests failed with exit code 1.\nThe coverage gate is skipped for a filtered run.")
  @TestMethod
  public async skipsTheCoverageGateForAFilteredRunAsync(exitCode: number, message: string): Promise<void> {
    using checkout = new Checkout();
    const runner = new FakeRunner(exitCode);

    const result = await new TestStep(new FakeTypeScript(checkout.directory), runner, new RecordingOutput([])).runAsync(["ArchiveStep", "noldova.a"]);

    Assert.areEqual(exitCode === 0, result.isSuccessful);
    Assert.areEqual(message, result.message);
    Assert.areEqual(JSON.stringify([{ CONTEXT_TEST_FILTERS: "[\"ArchiveStep\",\"noldova.a\"]" }]), JSON.stringify(runner.environments));
  }

  @TestData(null, 1, "The tests failed with exit code null.\nCoverage is incomplete.")
  @TestData(0, 2, "The coverage report exited with code 2.")
  @TestData(0, null, "The coverage report exited with code null.")
  @TestMethod
  public async failsForFailedTestsOrCoverageAsync(testsExitCode: number | null, coverageExitCode: number | null, message: string): Promise<void> {
    using checkout = new Checkout();

    const result = await new TestStep(new FakeTypeScript(checkout.directory), new FakeRunner(testsExitCode, coverageExitCode), new RecordingOutput([])).runAsync([]);

    Assert.isFalse(result.isSuccessful);
    Assert.areEqual(message, result.message);
  }

  @TestMethod
  public async failsForAnUnknownOptionAsync(): Promise<void> {
    const result = await new TestStep(new FakeTypeScript("."), new FakeRunner(), new RecordingOutput([])).runAsync(["--skip-details"]);

    Assert.isFalse(result.isSuccessful);
    Assert.areEqual("Unknown option --skip-details; the step takes [--skip-test-details] [--skip-coverage-details] [<filter>...].", result.message);
  }

  @TestMethod
  public async failsWithoutABuildFileAsync(): Promise<void> {
    using checkout = new Checkout();
    fs.rmSync(path.join(checkout.directory, "build.json"));

    const result = await new TestStep(new FakeTypeScript(checkout.directory), new FakeRunner(), new RecordingOutput([])).runAsync([]);

    Assert.areEqual("The checkout has no build.json, which names the packages to build.", result.message);
  }

  @TestMethod
  public async failsWhenNoPackageHasTestsAsync(): Promise<void> {
    using checkout = new Checkout();
    fs.rmSync(path.join(checkout.directory, "src/noldova.a/tests/tsconfig.json"));

    const result = await new TestStep(new FakeTypeScript(checkout.directory), new FakeRunner(), new RecordingOutput([])).runAsync([]);

    Assert.isFalse(result.isSuccessful);
    Assert.areEqual("No package has tests.", result.message);
  }

  @TestMethod
  public async failsWhenTheTestsDoNotCompileAsync(): Promise<void> {
    using checkout = new Checkout();
    const runner = new FakeRunner();

    const lines: string[] = [];

    const result = await new TestStep(new FakeTypeScript(checkout.directory, new ProcessResult(2, "error TS2322: wrong", "")), runner, new RecordingOutput(lines)).runAsync([]);

    Assert.areEqual("The TypeScript compiler exited with code 2 for src/noldova.a/tests/tsconfig.json:\nerror TS2322: wrong", result.message);
    Assert.areEqual("progress start: Compiling the tests of noldova.a...|progress:  Failed.", lines.join("|"));
    Assert.areEqual(0, runner.calls.length);
  }

  @TestMethod
  public async endsTheProgressLineWhenTheCompilerCannotStartAsync(): Promise<void> {
    using checkout = new Checkout();
    const lines: string[] = [];

    const result = await new TestStep(new RejectingTypeScript(new ProcessRunner(), checkout.directory), new FakeRunner(), new RecordingOutput(lines)).runAsync([]);

    Assert.areEqual("tsc could not start.", result.message);
    Assert.areEqual("progress start: Compiling the tests of noldova.a...|progress:  Failed.", lines.join("|"));
  }

  @TestMethod
  public async rejectsAFaultAsync(): Promise<void> {
    using checkout = new Checkout({ "build.json": "{" });

    await Assert.throwsAsync(() => new TestStep(new FakeTypeScript(checkout.directory), new FakeRunner(), new RecordingOutput([])).runAsync([]), JsonException);
  }

  @TestData(true, 0, "report true 1|project noldova.a node_modules/@noldova/a src/noldova.a/src")
  @TestData(false, 1, "report false 1|project noldova.a node_modules/@noldova/a src/noldova.a/src")
  @TestMethod
  public async reportsTheCoverageThroughTheCheckoutsTestingPackageAsync(isComplete: boolean, exitCode: number, report: string): Promise<void> {
    using checkout = new Checkout({
      "node_modules/@noldova/context.testing/package.json": "{\"name\":\"@noldova/context.testing\",\"type\":\"module\",\"main\":\"index.js\"}",
      "node_modules/@noldova/context.testing/index.js": [
        "const projects = [];",
        "export class CoverageProject { constructor(...values) { projects.push(values.join(' ')); } }",
        `export class CoverageAnalyzer { async analyzeAsync(folder, given) { return { isComplete: ${isComplete}, count: given.length, folder }; } }`,
        "export class CoverageReportWriter { formatLines(coverage, skipDetails) { return [`report ${coverage.isComplete} ${coverage.count}`, `project ${projects[0]}`, `skip ${skipDetails} ${coverage.folder}`]; } }"
      ].join("\n")
    });

    const result = await new ProcessRunner().runAsync(process.execPath, [TestStepTests.COVERAGE_ENTRY_POINT_PATH, "_build/coverage", "1", JSON.stringify([["noldova.a", "node_modules/@noldova/a", "src/noldova.a/src"]])], checkout.directory);

    Assert.areEqual(exitCode, result.exitCode);
    Assert.areEqual(`${report.replaceAll("|", "\n")}\nskip true _build/coverage\n`, result.output);
  }

  @TestMethod
  public async failsToReportWithoutTheTestingPackageAsync(): Promise<void> {
    using checkout = new Checkout();

    const result = await new ProcessRunner().runAsync(process.execPath, [TestStepTests.COVERAGE_ENTRY_POINT_PATH, "_build/coverage", "", "[]"], checkout.directory);

    Assert.areEqual(2, result.exitCode);
    Assert.areEqual("@noldova/context.testing is not installed; the repository's devDependencies name it.\n", result.errorOutput);
  }
}
