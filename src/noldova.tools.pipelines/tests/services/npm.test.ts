/**
 * @license
 * Copyright (c) Noldova.
 *
 * This source code is licensed under the license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { Assert, TestClass, TestMethod } from "@noldova/context.testing";
import { Npm, ProcessException, ProcessResult, ProcessRunner } from "@noldova/tools.pipelines";

class RecordingProcessRunner extends ProcessRunner {
  public readonly calls: string[] = [];
  private readonly result: ProcessResult;

  public constructor(result: ProcessResult) {
    super();

    this.result = result;
  }

  public override async runAsync(program: string, values: readonly string[], workingDirectory: string): Promise<ProcessResult> {
    this.calls.push(`${workingDirectory}: ${program} ${values.join(" ")}`);

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
  public async publishesAnArchiveWithTheAccessToTheRegistryAsync(): Promise<void> {
    const processRunner = new RecordingProcessRunner(new ProcessResult(1, "", "npm error code E403"));

    const result = await new Npm(processRunner, "release").publishAsync("archives/noldova-a-0.0.4.tgz", "public", "https://registry.example/");

    Assert.areEqual(1, result.exitCode);
    Assert.areEqual("release: npm publish archives/noldova-a-0.0.4.tgz --access public --registry https://registry.example/", processRunner.calls.join("\n"));
  }

  @TestMethod
  public async rejectsWhenNpmCannotStartAsync(): Promise<void> {
    const npm = new Npm(new ProcessRunner(), "tools-pipelines-missing-directory");

    const exception = await Assert.throwsAsync(() => npm.viewAsync("@noldova/a", "dist-tags.latest", "https://registry.example/"), ProcessException);

    Assert.areEqual("npm", exception.program);
  }
}
