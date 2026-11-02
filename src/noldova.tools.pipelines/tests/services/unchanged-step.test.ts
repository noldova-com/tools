/**
 * @license
 * Copyright (c) Noldova.
 *
 * This source code is licensed under the license found in the
 * LICENSE file in the root directory of this source tree.
 */

import fs from "node:fs";
import path from "node:path";

import { Assert, TestClass, TestData, TestMethod } from "@noldova/context.testing";
import { Git, ProcessException, ProcessRunner, UnchangedStep } from "@noldova/tools.pipelines";

import { GitRepositoryFixture } from "./git-repository.fixture.js";

@TestClass
export class UnchangedStepTests {
  @TestMethod
  public namesItselfAndTakesNoValues(): void {
    const step = new UnchangedStep(new Git(new ProcessRunner(), "."));

    Assert.areEqual("unchanged", step.name);
    Assert.areEqual("", step.usage);
  }

  @TestMethod
  public async succeedsForACheckoutAsCommittedAsync(): Promise<void> {
    using repository = GitRepositoryFixture.create();
    repository.commit({ ".gitignore": "_build/\n", "README.md": "Read me.\n" });
    repository.write({ "_build/output.js": "built" });

    const result = await UnchangedStepTests.createStep(repository).runAsync([]);

    Assert.isTrue(result.isSuccessful);
    Assert.areEqual("The checkout has no changed or untracked file.", result.message);
  }

  @TestData("src")
  @TestData("src more")
  @TestMethod
  public async failsForAnyValueAsync(joinedValues: string): Promise<void> {
    const result = await new UnchangedStep(new Git(new ProcessRunner(), ".")).runAsync(joinedValues.split(" "));

    Assert.isFalse(result.isSuccessful);
    Assert.areEqual("The unchanged step takes no values.", result.message);
  }

  @TestMethod
  public async failsNamingEachChangedAndUntrackedPathAsync(): Promise<void> {
    using repository = GitRepositoryFixture.create();
    repository.commit({ ".gitignore": "_build/\n", "README.md": "Read me.\n", "src/a.ts": "a\n" });
    repository.write({ "README.md": "Changed.\n", "src/new file.ts": "new\n", "_build/output.js": "built" });
    fs.rmSync(path.join(repository.directory, "src", "a.ts"));

    const result = await UnchangedStepTests.createStep(repository).runAsync([]);

    Assert.isFalse(result.isSuccessful);
    Assert.areEqual(
      [
        "The checkout has changed or untracked files:",
        " M README.md",
        " D src/a.ts",
        "?? \"src/new file.ts\"",
        "What runs before this step must leave every tracked file as committed and write only to ignored paths: undo the change, or ignore the output in .gitignore."
      ].join("\n"),
      result.message);
  }

  @TestMethod
  public async rejectsWhenGitFailsOutsideACloneAsync(): Promise<void> {
    const directory = GitRepositoryFixture.createDirectory();
    try {
      const step = new UnchangedStep(new Git(new ProcessRunner(), directory));

      const exception = await Assert.throwsAsync(() => step.runAsync([]), ProcessException);

      Assert.areEqual("git", exception.program);
    }
    finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  }

  private static createStep(repository: GitRepositoryFixture): UnchangedStep {
    return new UnchangedStep(new Git(new ProcessRunner(), repository.directory));
  }
}
