/**
 * @license
 * Copyright (c) Noldova.
 *
 * This source code is licensed under the license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { Assert, TestClass, TestData, TestMethod } from "@noldova/context.testing";
import { Npm, ProcessException, ProcessRunner, ToolchainStep } from "@noldova/tools.pipelines";

class VersionNpm extends Npm {
  public calls: number = 0;
  private readonly version: string;

  public constructor(version: string) {
    super(new ProcessRunner(), ".");

    this.version = version;
  }

  public override async readVersionAsync(): Promise<string> {
    this.calls++;

    return this.version;
  }
}

@TestClass
export class ToolchainStepTests {
  @TestMethod
  public namesItselfAndItsValues(): void {
    const step = new ToolchainStep(new VersionNpm("11.19.0"), "v24.21.0");

    Assert.areEqual("toolchain", step.name);
    Assert.areEqual("<node-version> [<npm-version>]", step.usage);
  }

  @TestMethod
  public async succeedsWhenNodeAndNpmAreTheVersionsGivenAsync(): Promise<void> {
    const result = await new ToolchainStep(new VersionNpm("11.19.0"), "v24.21.0").runAsync(["24.21.0", "11.19.0"]);

    Assert.isTrue(result.isSuccessful);
    Assert.areEqual("Node.js v24.21.0 and npm 11.19.0 run this step.", result.message);
  }

  @TestData("24.21.0")
  @TestData("24.21.0 ")
  @TestMethod
  public async checksOnlyNodeWithoutAnNpmVersionAsync(joinedValues: string): Promise<void> {
    const npm = new VersionNpm("0.0.0");

    const result = await new ToolchainStep(npm, "v24.21.0").runAsync(joinedValues.split(" "));

    Assert.isTrue(result.isSuccessful);
    Assert.areEqual("Node.js v24.21.0 runs this step; npm is not checked.", result.message);
    Assert.areEqual(0, npm.calls);
  }

  @TestData("")
  @TestData("24.21.0 11.19.0 more")
  @TestMethod
  public async failsForNoValuesOrMoreThanTwoAsync(joinedValues: string): Promise<void> {
    const values = joinedValues.length === 0 ? [] : joinedValues.split(" ");

    const result = await new ToolchainStep(new VersionNpm("11.19.0"), "v24.21.0").runAsync(values);

    Assert.isFalse(result.isSuccessful);
    Assert.areEqual("The toolchain step takes <node-version> [<npm-version>].", result.message);
  }

  @TestData("24", "11.19.0", "24")
  @TestData("24a21b0", "11.19.0", "24a21b0")
  @TestData("v24.21.0", "11.19.0", "v24.21.0")
  @TestData("24.021.0", "11.19.0", "24.021.0")
  @TestData("", "11.19.0", "")
  @TestData("24.21.0", "11.19", "11.19")
  @TestData("24.21.0", "11.19.0-pre", "11.19.0-pre")
  @TestMethod
  public async failsForAVersionThatIsNotExactAsync(nodeVersion: string, npmVersion: string, invalid: string): Promise<void> {
    const npm = new VersionNpm("11.19.0");

    const result = await new ToolchainStep(npm, "v24.21.0").runAsync([nodeVersion, npmVersion]);

    Assert.isFalse(result.isSuccessful);
    Assert.areEqual(`"${invalid}" is not an exact version: write major.minor.patch, such as 24.21.0.`, result.message);
    Assert.areEqual(0, npm.calls);
  }

  @TestMethod
  public async failsWhenNodeIsAnotherVersionAsync(): Promise<void> {
    const result = await new ToolchainStep(new VersionNpm("11.19.0"), "v24.20.0").runAsync(["24.21.0", "11.19.0"]);

    Assert.isFalse(result.isSuccessful);
    Assert.areEqual("Node.js v24.20.0 runs this step, not v24.21.0; set up Node.js 24.21.0 before it.", result.message);
  }

  @TestMethod
  public async failsWhenNpmIsAnotherVersionAsync(): Promise<void> {
    const result = await new ToolchainStep(new VersionNpm("11.18.0"), "v24.21.0").runAsync(["24.21.0", "11.19.0"]);

    Assert.isFalse(result.isSuccessful);
    Assert.areEqual("npm 11.18.0 runs this step, not 11.19.0; install npm 11.19.0 before it.", result.message);
  }

  @TestMethod
  public async failsWithOneLineForEachVersionThatDiffersAsync(): Promise<void> {
    const result = await new ToolchainStep(new VersionNpm("11.18.0"), "v24.20.0").runAsync(["24.21.0", "11.19.0"]);

    Assert.isFalse(result.isSuccessful);
    Assert.areEqual(
      "Node.js v24.20.0 runs this step, not v24.21.0; set up Node.js 24.21.0 before it.\nnpm 11.18.0 runs this step, not 11.19.0; install npm 11.19.0 before it.",
      result.message);
  }

  @TestMethod
  public async rejectsWhenNpmCannotStartAsync(): Promise<void> {
    const step = new ToolchainStep(new Npm(new ProcessRunner(), "tools-pipelines-missing-directory"), "v24.21.0");

    const exception = await Assert.throwsAsync(() => step.runAsync(["24.21.0", "11.19.0"]), ProcessException);

    Assert.areEqual("npm", exception.program);
  }
}
