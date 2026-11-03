/**
 * @license
 * Copyright (c) Noldova.
 *
 * This source code is licensed under the license found in the
 * LICENSE file in the root directory of this source tree.
 */

import path from "node:path";

import { Assert, TestClass, TestData, TestMethod } from "@noldova/context.testing";
import { Npm, ProcessException, ProcessResult, ProcessRunner } from "@noldova/tools.pipelines";

class RecordingProcessRunner extends ProcessRunner {
  public readonly calls: string[] = [];
  public readonly environments: (Readonly<Record<string, string | undefined>> | undefined)[] = [];
  public readonly timeouts: (number | undefined)[] = [];
  private readonly result: ProcessResult;

  public constructor(result: ProcessResult) {
    super();

    this.result = result;
  }

  public override async runAsync(program: string, values: readonly string[], workingDirectory: string, environment?: Readonly<Record<string, string | undefined>>, timeoutMilliseconds?: number): Promise<ProcessResult> {
    this.calls.push(`${workingDirectory}: ${program} ${values.join(" ")}`);
    this.environments.push(environment);
    this.timeouts.push(timeoutMilliseconds);

    return this.result;
  }
}

@TestClass
export class NpmTests {
  @TestMethod
  public async viewsAFieldOnTheRegistryWithoutItsCacheAsync(): Promise<void> {
    const processRunner = new RecordingProcessRunner(new ProcessResult(0, "sha512-abc\n", ""));

    const result = await new Npm(processRunner, "release").viewAsync("@noldova/a@0.0.4", "dist.integrity", "https://registry.example/");

    Assert.areEqual("sha512-abc\n", result.output);
    Assert.areEqual("release: npm view @noldova/a@0.0.4 dist.integrity --prefer-online --registry https://registry.example/", processRunner.calls.join("\n"));
  }

  @TestMethod
  public async publishesAnArchiveByItsFullPathWithTheTagAndAccessToTheRegistryAsync(): Promise<void> {
    const processRunner = new RecordingProcessRunner(new ProcessResult(1, "", "npm error code E403"));

    const result = await new Npm(processRunner, "release").publishAsync("archives/noldova-a-0.0.4.tgz", "latest", "public", "https://registry.example/");

    Assert.areEqual(1, result.exitCode);
    Assert.areEqual(
      `release: npm publish ${path.resolve("archives/noldova-a-0.0.4.tgz")} --tag latest --access public --registry https://registry.example/`,
      processRunner.calls.join("\n"));
  }

  @TestData("linux", "release: npm --version")
  @TestData("darwin", "release: npm --version")
  @TestData("win32", "release: cmd.exe /d /s /c npm.cmd --version")
  @TestMethod
  public async readsItsVersionAsTheirPlatformRunsItAsync(platform: string, expected: string): Promise<void> {
    const processRunner = new RecordingProcessRunner(new ProcessResult(0, "11.19.0\n", ""));

    const version = await new Npm(processRunner, "release", platform).readVersionAsync();

    Assert.areEqual("11.19.0", version);
    Assert.areEqual(expected, processRunner.calls.join("\n"));
  }

  @TestData("linux", "second: npm run build")
  @TestData("win32", "second: cmd.exe /d /s /c npm.cmd run build")
  @TestMethod
  public async buildsInTheDirectoryGivenAsTheirPlatformRunsItAsync(platform: string, expected: string): Promise<void> {
    const processRunner = new RecordingProcessRunner(new ProcessResult(0, "", ""));

    const result = await new Npm(processRunner, "release", platform).buildAsync("second");

    Assert.isTrue(result.isSuccessful);
    Assert.areEqual(expected, processRunner.calls.join("\n"));
  }

  @TestData("linux", "release: npm run build --silent -- --list-copies")
  @TestData("win32", "release: cmd.exe /d /s /c npm.cmd run build --silent -- --list-copies")
  @TestMethod
  public async listsTheBuildsCopiesInItsDirectoryAsTheirPlatformRunsItAsync(platform: string, expected: string): Promise<void> {
    const processRunner = new RecordingProcessRunner(new ProcessResult(0, "LICENSE\t@noldova/a\tLICENSE\n", ""));
    const npm = new Npm(processRunner, "release", platform);

    const result = await npm.listCopiesAsync();

    Assert.areEqual("LICENSE\t@noldova/a\tLICENSE\n", result.output);
    Assert.areEqual(expected, processRunner.calls.join("\n"));
    Assert.areEqual("release", npm.workingDirectory);
  }

  @TestData("linux", "locked: npm install --package-lock-only --ignore-scripts --no-audit --no-fund")
  @TestData("win32", "locked: cmd.exe /d /s /c npm.cmd install --package-lock-only --ignore-scripts --no-audit --no-fund")
  @TestMethod
  public async refreshesTheLockFileInTheDirectoryGivenAsTheirPlatformRunsItAsync(platform: string, expected: string): Promise<void> {
    const processRunner = new RecordingProcessRunner(new ProcessResult(1, "", "npm error"));

    const result = await new Npm(processRunner, "release", platform).lockAsync("locked");

    Assert.areEqual(1, result.exitCode);
    Assert.areEqual(expected, processRunner.calls.join("\n"));
    Assert.areEqual("{}", JSON.stringify(processRunner.environments[0]));
    Assert.areEqual(300000, processRunner.timeouts[0]);
  }

  @TestData("linux")
  @TestData("win32")
  @TestMethod
  public async keepsTheHiddenVariablesFromTheLockRefreshAsync(platform: string): Promise<void> {
    const processRunner = new RecordingProcessRunner(new ProcessResult(0, "", ""));

    await new Npm(processRunner, "release", platform).lockAsync("locked", ["GITHUB_TOKEN", "OTHER_TOKEN"]);

    Assert.areEqual("GITHUB_TOKEN,OTHER_TOKEN", Object.keys(processRunner.environments[0] ?? {}).join(","));
    Assert.isTrue(Object.values(processRunner.environments[0] ?? {}).every(t => t === undefined));
  }

  @TestMethod
  public async rejectsWhenReadingItsVersionFailsAsync(): Promise<void> {
    const npm = new Npm(new RecordingProcessRunner(new ProcessResult(1, "", "npm error broken\n")), "release");

    const exception = await Assert.throwsAsync(() => npm.readVersionAsync(), ProcessException);

    Assert.areEqual("npm", exception.program);
    Assert.areEqual("\"npm --version\" failed with exit code 1: npm error broken", exception.message);
  }

  @TestMethod
  public async rejectsWhenNpmCannotStartAsync(): Promise<void> {
    const npm = new Npm(new ProcessRunner(), "tools-pipelines-missing-directory");

    const exception = await Assert.throwsAsync(() => npm.viewAsync("@noldova/a", "dist-tags.latest", "https://registry.example/"), ProcessException);

    Assert.areEqual("npm", exception.program);
  }
}
