/**
 * @license
 * Copyright (c) Noldova.
 *
 * This source code is licensed under the license found in the
 * LICENSE file in the root directory of this source tree.
 */

import fs from "node:fs";

import { Assert, TestClass, TestData, TestMethod } from "@noldova/context.testing";
import { Git, ProcessException, ProcessResult, ProcessRunner } from "@noldova/tools.pipelines";

import { GitRepositoryFixture } from "./git-repository.fixture.js";

class FixedProcessRunner extends ProcessRunner {
  private readonly result: ProcessResult;

  public constructor(result: ProcessResult) {
    super();

    this.result = result;
  }

  public override async runAsync(): Promise<ProcessResult> {
    return this.result;
  }
}

@TestClass
export class GitTests {
  @TestMethod
  public async findsACommitByItsIdAndByAReferenceAsync(): Promise<void> {
    using repository = GitRepositoryFixture.create();
    const commit = repository.commit({ "version.json": "{}" });
    repository.setMain(commit);
    const git = GitTests.createGit(repository);

    Assert.isTrue(await git.hasCommitAsync(commit));
    Assert.isTrue(await git.hasCommitAsync("refs/remotes/origin/main"));
  }

  @TestData("0123456789abcdef0123456789abcdef01234567")
  @TestData("refs/remotes/origin/main")
  @TestMethod
  public async findsNoCommitThatTheCloneDoesNotHoldAsync(revision: string): Promise<void> {
    using repository = GitRepositoryFixture.create();
    repository.commit({ "version.json": "{}" });

    Assert.isFalse(await GitTests.createGit(repository).hasCommitAsync(revision));
  }

  @TestMethod
  public async findsNoCommitForATreeOrAFileAsync(): Promise<void> {
    using repository = GitRepositoryFixture.create();
    const commit = repository.commit({ "version.json": "{}" });
    const git = GitTests.createGit(repository);

    Assert.isFalse(await git.hasCommitAsync(`${commit}^{tree}`));
    Assert.isFalse(await git.hasCommitAsync(`${commit}:version.json`));
  }

  @TestMethod
  public async findsTheFilesACommitHoldsAsync(): Promise<void> {
    using repository = GitRepositoryFixture.create();
    const first = repository.commit({ "version.json": "{}" });
    const second = repository.commit({ "README.md": "# Example\n" });
    const git = GitTests.createGit(repository);

    Assert.isTrue(await git.hasFileAsync(first, "version.json"));
    Assert.isFalse(await git.hasFileAsync(first, "README.md"));
    Assert.isTrue(await git.hasFileAsync(second, "README.md"));
    Assert.isFalse(await git.hasFileAsync(second, "missing.json"));
  }

  @TestMethod
  public async tellsWhetherACommitIsInAnotherCommitsHistoryAsync(): Promise<void> {
    using repository = GitRepositoryFixture.create();
    const first = repository.commit({ "version.json": "{}" });
    const second = repository.commit({ "README.md": "# Example\n" });
    const git = GitTests.createGit(repository);

    Assert.isTrue(await git.isAncestorAsync(first, second));
    Assert.isTrue(await git.isAncestorAsync(second, second));
    Assert.isFalse(await git.isAncestorAsync(second, first));
  }

  @TestMethod
  public async readsAFileAsTheCommitHoldsItAsync(): Promise<void> {
    using repository = GitRepositoryFixture.create();
    const first = repository.commit({ "version.json": "{\n  \"version\": \"0.0.3\"\n}\n" });
    const second = repository.commit({ "version.json": "{ \"version\": \"0.0.4\" }" });
    const git = GitTests.createGit(repository);

    Assert.areEqual("{\n  \"version\": \"0.0.3\"\n}\n", await git.readFileAsync(first, "version.json"));
    Assert.areEqual("{ \"version\": \"0.0.4\" }", await git.readFileAsync(second, "version.json"));
  }

  @TestMethod
  public async rejectsReadingAFileTheCommitDoesNotHoldAsync(): Promise<void> {
    using repository = GitRepositoryFixture.create();
    const commit = repository.commit({ "version.json": "{}" });

    const exception = await Assert.throwsAsync(() => GitTests.createGit(repository).readFileAsync(commit, "missing.json"), ProcessException);

    Assert.areEqual("git", exception.program);
    Assert.isTrue(exception.message.startsWith(`"git cat-file blob ${commit}:missing.json" failed with exit code 128: `), exception.message);
  }

  @TestMethod
  public async rejectsWhenGitFailsOutsideACloneAsync(): Promise<void> {
    const directory = GitRepositoryFixture.createDirectory();
    try {
      const git = new Git(new ProcessRunner(), directory);

      const exception = await Assert.throwsAsync(() => git.isAncestorAsync("HEAD", "HEAD"), ProcessException);

      Assert.isTrue(exception.message.startsWith("\"git merge-base --is-ancestor HEAD HEAD\" failed with exit code 128: "), exception.message);
    }
    finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  }

  @TestMethod
  public async rejectsAFailureWithoutErrorOutputByItsExitCodeAsync(): Promise<void> {
    const git = new Git(new FixedProcessRunner(new ProcessResult(2, "", " \n")), ".");

    const exception = await Assert.throwsAsync(() => git.hasCommitAsync("HEAD"), ProcessException);

    Assert.areEqual("\"git rev-parse --verify --quiet HEAD^{commit}\" failed with exit code 2.", exception.message);
  }

  @TestMethod
  public async rejectsWhenGitCannotStartAsync(): Promise<void> {
    const git = new Git(new ProcessRunner(), "tools-pipelines-missing-directory");

    const exception = await Assert.throwsAsync(() => git.hasCommitAsync("HEAD"), ProcessException);

    Assert.areEqual("git", exception.program);
    Assert.isTrue(exception.message.startsWith("\"git\" could not start: "), exception.message);
  }

  private static createGit(repository: GitRepositoryFixture): Git {
    return new Git(new ProcessRunner(), repository.directory);
  }
}
