/**
 * @license
 * Copyright (c) Noldova.
 *
 * This source code is licensed under the license found in the
 * LICENSE file in the root directory of this source tree.
 */

import fs from "node:fs";

import { JsonException } from "@noldova/context.json";
import { Assert, TestClass, TestData, TestMethod } from "@noldova/context.testing";
import { Git, ProcessException, ProcessRunner, SourceStep } from "@noldova/tools.pipelines";

import { GitRepositoryFixture } from "./git-repository.fixture.js";

@TestClass
export class SourceStepTests {
  @TestMethod
  public namesItselfAndItsValues(): void {
    const step = new SourceStep(new Git(new ProcessRunner(), "."));

    Assert.areEqual("source", step.name);
    Assert.areEqual("<version> <commit>", step.usage);
  }

  @TestMethod
  public async succeedsForTheCommitOnMainThatHoldsTheVersionAsync(): Promise<void> {
    using repository = GitRepositoryFixture.create();
    const commit = repository.commit({ "version.json": "{\n  \"version\": \"0.0.4\"\n}\n" });
    repository.setMain(commit);

    const result = await SourceStepTests.createStep(repository).runAsync(["0.0.4", commit]);

    Assert.isTrue(result.isSuccessful);
    Assert.areEqual(`Commit ${commit} is on origin/main, and its version.json holds 0.0.4.`, result.message);
  }

  @TestMethod
  public async succeedsForACommitBehindMainAsync(): Promise<void> {
    using repository = GitRepositoryFixture.create();
    const commit = repository.commit({ "version.json": "{ \"version\": \"1.4.1-nightly.20261101\" }" });
    repository.setMain(repository.commit({ "later.txt": "later" }));

    const result = await SourceStepTests.createStep(repository).runAsync(["1.4.1-nightly.20261101", commit]);

    Assert.isTrue(result.isSuccessful);
  }

  @TestData("")
  @TestData("0.0.4")
  @TestData("0.0.4 0000000000000000000000000000000000000000 more")
  @TestMethod
  public async failsForAnyNumberOfValuesButTwoAsync(joinedValues: string): Promise<void> {
    const values = joinedValues.length === 0 ? [] : joinedValues.split(" ");

    const result = await new SourceStep(new Git(new ProcessRunner(), ".")).runAsync(values);

    Assert.isFalse(result.isSuccessful);
    Assert.areEqual("The source step takes <version> <commit>.", result.message);
  }

  @TestMethod
  public async failsForAVersionThatIsNotAVersionAsync(): Promise<void> {
    const result = await new SourceStep(new Git(new ProcessRunner(), ".")).runAsync(["0.0.4x", "0000000000000000000000000000000000000000"]);

    Assert.isFalse(result.isSuccessful);
    Assert.areEqual(
      "\"0.0.4x\" is not a version: a version is major.minor.patch, each a whole number without a leading zero, such as 1.4.0, or a nightly version, major.minor.patch-nightly.YYYYMMDD, such as 1.4.1-nightly.20261101.",
      result.message);
  }

  @TestData("225059f")
  @TestData("225059F4C1E6A3B2D8F7E9A0B1C2D3E4F5A6B7C8")
  @TestData("225059f4c1e6a3b2d8f7e9a0b1c2d3e4f5a6b7c")
  @TestData("225059f4c1e6a3b2d8f7e9a0b1c2d3e4f5a6b7c8a")
  @TestData("main")
  @TestData("")
  @TestMethod
  public async failsForACommitThatIsNotAFullIdAsync(commit: string): Promise<void> {
    const result = await new SourceStep(new Git(new ProcessRunner(), ".")).runAsync(["0.0.4", commit]);

    Assert.isFalse(result.isSuccessful);
    Assert.areEqual(`"${commit}" is not a commit: a commit is given by its full id, 40 lowercase hexadecimal digits.`, result.message);
  }

  @TestMethod
  public async failsForACommitTheCloneDoesNotHoldAsync(): Promise<void> {
    using repository = GitRepositoryFixture.create();
    repository.setMain(repository.commit({ "version.json": "{ \"version\": \"0.0.4\" }" }));

    const result = await SourceStepTests.createStep(repository).runAsync(["0.0.4", "0123456789abcdef0123456789abcdef01234567"]);

    Assert.isFalse(result.isSuccessful);
    Assert.areEqual("Commit 0123456789abcdef0123456789abcdef01234567 is not in this repository.", result.message);
  }

  @TestMethod
  public async failsForACloneWithoutMainAsync(): Promise<void> {
    using repository = GitRepositoryFixture.create();
    const commit = repository.commit({ "version.json": "{ \"version\": \"0.0.4\" }" });

    const result = await SourceStepTests.createStep(repository).runAsync(["0.0.4", commit]);

    Assert.isFalse(result.isSuccessful);
    Assert.areEqual("This clone has no origin/main; fetch it with its history before this step.", result.message);
  }

  @TestMethod
  public async failsForACommitNotOnMainAsync(): Promise<void> {
    using repository = GitRepositoryFixture.create();
    repository.setMain(repository.commit({ "version.json": "{ \"version\": \"0.0.3\" }" }));
    const commit = repository.commit({ "version.json": "{ \"version\": \"0.0.4\" }" });

    const result = await SourceStepTests.createStep(repository).runAsync(["0.0.4", commit]);

    Assert.isFalse(result.isSuccessful);
    Assert.areEqual(`Commit ${commit} is not on origin/main.`, result.message);
  }

  @TestData("README.md")
  @TestData("version.json/version.json")
  @TestMethod
  public async failsForACommitWithoutTheVersionFileAsync(filePath: string): Promise<void> {
    using repository = GitRepositoryFixture.create();
    const commit = repository.commit({ [filePath]: "{ \"version\": \"0.0.4\" }" });
    repository.setMain(commit);

    const result = await SourceStepTests.createStep(repository).runAsync(["0.0.4", commit]);

    Assert.isFalse(result.isSuccessful);
    Assert.areEqual(`Commit ${commit} has no version.json at its root.`, result.message);
  }

  @TestData("0.0.4")
  @TestData("{ version: \"0.0.4\" }")
  @TestData("[\"0.0.4\"]")
  @TestData("null")
  @TestData("{}")
  @TestData("{ \"Version\": \"0.0.4\" }")
  @TestData("{ \"version\": 4 }")
  @TestData("{ \"version\": null }")
  @TestMethod
  public async rejectsAVersionFileWithoutAVersionTextAsync(content: string): Promise<void> {
    using repository = GitRepositoryFixture.create();
    const commit = repository.commit({ "version.json": content });
    repository.setMain(commit);

    const exception = await Assert.throwsAsync(() => SourceStepTests.createStep(repository).runAsync(["0.0.4", commit]), JsonException);

    Assert.isTrue(exception.path.startsWith("version.json"), exception.path);
  }

  @TestData("0.0.3", "0.0.4")
  @TestData("0.04.0", "0.4.0")
  @TestData(" 0.0.4", "0.0.4")
  @TestData("0.0.4-nightly.20261101", "0.0.4")
  @TestData("0.0.4", "0.0.4-nightly.20261101")
  @TestMethod
  public async failsForAVersionFileThatHoldsAnotherVersionAsync(found: string, expected: string): Promise<void> {
    using repository = GitRepositoryFixture.create();
    const commit = repository.commit({ "version.json": `{ "version": "${found}" }` });
    repository.setMain(commit);

    const result = await SourceStepTests.createStep(repository).runAsync([expected, commit]);

    Assert.isFalse(result.isSuccessful);
    Assert.areEqual(`version.json at commit ${commit} holds ${found}, not ${expected}.`, result.message);
  }

  @TestMethod
  public async rejectsWhenGitFailsOutsideACloneAsync(): Promise<void> {
    const directory = GitRepositoryFixture.createDirectory();
    try {
      const step = new SourceStep(new Git(new ProcessRunner(), directory));

      const exception = await Assert.throwsAsync(() => step.runAsync(["0.0.4", "0123456789abcdef0123456789abcdef01234567"]), ProcessException);

      Assert.areEqual("git", exception.program);
    }
    finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  }

  private static createStep(repository: GitRepositoryFixture): SourceStep {
    return new SourceStep(new Git(new ProcessRunner(), repository.directory));
  }
}
