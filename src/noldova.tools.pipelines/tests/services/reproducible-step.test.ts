/**
 * @license
 * Copyright (c) Noldova.
 *
 * This source code is licensed under the license found in the
 * LICENSE file in the root directory of this source tree.
 */

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { Assert, TestClass, TestData, TestMethod } from "@noldova/context.testing";
import { Git, Npm, ProcessException, ProcessResult, ProcessRunner, ReproducibleStep } from "@noldova/tools.pipelines";

import { GitRepositoryFixture } from "./git-repository.fixture.js";

class BuildingNpm extends Npm {
  public readonly directories: string[] = [];
  public readonly checkedOut: string[] = [];
  private readonly files: Readonly<Record<string, string>>;
  private readonly result: ProcessResult;

  public constructor(files: Readonly<Record<string, string>>, result: ProcessResult = new ProcessResult(0, "", "")) {
    super(new ProcessRunner(), ".");

    this.files = files;
    this.result = result;
  }

  public override async buildAsync(directory: string): Promise<ProcessResult> {
    this.directories.push(directory);
    this.checkedOut.push(fs.readFileSync(path.join(directory, "README.md"), "utf8"));
    for (const [filePath, content] of Object.entries(this.files)) {
      fs.mkdirSync(path.dirname(path.join(directory, filePath)), { recursive: true });
      fs.writeFileSync(path.join(directory, filePath), content);
    }

    return this.result;
  }
}

@TestClass
export class ReproducibleStepTests {
  @TestMethod
  public namesItselfAndItsValues(): void {
    const step = new ReproducibleStep(new Git(new ProcessRunner(), "."), new BuildingNpm({}));

    Assert.areEqual("reproducible", step.name);
    Assert.areEqual("<folder>", step.usage);
  }

  @TestMethod
  public async succeedsWhenTheSecondBuildPacksTheSameArchivesAsync(): Promise<void> {
    using repository = ReproducibleStepTests.createRepository();
    repository.write({ "_packages/noldova-a-0.0.4.tgz": "a", "_packages/noldova-b-0.0.4.tgz": "b", "_packages/notes.txt": "first" });
    const npm = new BuildingNpm({ "_packages/noldova-a-0.0.4.tgz": "a", "_packages/noldova-b-0.0.4.tgz": "b", "_packages/notes.txt": "second" });

    const result = await ReproducibleStepTests.createStep(repository, npm).runAsync(["_packages"]);

    Assert.isTrue(result.isSuccessful, result.message);
    Assert.areEqual(
      [
        `A second build of commit ${repository.readHead()}, in another folder, packed the same 2 archives byte for byte:`,
        `noldova-a-0.0.4.tgz ${ReproducibleStepTests.integrity("a")}`,
        `noldova-b-0.0.4.tgz ${ReproducibleStepTests.integrity("b")}`
      ].join("\n"),
      result.message);
    Assert.areEqual("Read me.\n", npm.checkedOut.join());
  }

  @TestMethod
  public async removesTheWorktreeAndItsFolderAsync(): Promise<void> {
    using repository = ReproducibleStepTests.createRepository();
    repository.write({ "_packages/noldova-a-0.0.4.tgz": "a" });
    const npm = new BuildingNpm({ "_packages/noldova-a-0.0.4.tgz": "a" });

    await ReproducibleStepTests.createStep(repository, npm).runAsync(["_packages"]);

    Assert.areEqual(1, repository.listWorktrees().length);
    Assert.areEqual(1, npm.directories.length);
    Assert.isFalse(fs.existsSync(npm.directories[0] ?? ""));
  }

  @TestData("")
  @TestData("_packages more")
  @TestMethod
  public async failsForAnyNumberOfValuesButOneAsync(joinedValues: string): Promise<void> {
    const values = joinedValues.length === 0 ? [] : joinedValues.split(" ");

    const result = await new ReproducibleStep(new Git(new ProcessRunner(), "."), new BuildingNpm({})).runAsync(values);

    Assert.isFalse(result.isSuccessful);
    Assert.areEqual("The reproducible step takes <folder>.", result.message);
  }

  @TestMethod
  public async failsForAnAbsoluteFolderAsync(): Promise<void> {
    const folder = path.resolve("_packages");

    const result = await new ReproducibleStep(new Git(new ProcessRunner(), "."), new BuildingNpm({})).runAsync([folder]);

    Assert.isFalse(result.isSuccessful);
    Assert.areEqual(`The folder ${folder} must be a path inside the checkout, such as _packages, not an absolute path.`, result.message);
  }

  @TestMethod
  public async failsForAMissingFolderAsync(): Promise<void> {
    using repository = ReproducibleStepTests.createRepository();
    repository.write({ "_packages": "a file" });

    const result = await ReproducibleStepTests.createStep(repository, new BuildingNpm({})).runAsync(["_packages"]);

    Assert.isFalse(result.isSuccessful);
    Assert.areEqual("There is no folder _packages.", result.message);
  }

  @TestMethod
  public async failsForAFolderWithoutArchivesAsync(): Promise<void> {
    using repository = ReproducibleStepTests.createRepository();
    repository.write({ "_packages/notes.txt": "notes" });
    const npm = new BuildingNpm({});

    const result = await ReproducibleStepTests.createStep(repository, npm).runAsync(["_packages"]);

    Assert.isFalse(result.isSuccessful);
    Assert.areEqual("_packages holds no .tgz archive to compare; build and pack the packages before this step.", result.message);
    Assert.areEqual(0, npm.directories.length);
  }

  @TestMethod
  public async failsWhenTheSecondBuildFailsAsync(): Promise<void> {
    using repository = ReproducibleStepTests.createRepository();
    repository.write({ "_packages/noldova-a-0.0.4.tgz": "a" });
    const npm = new BuildingNpm({}, new ProcessResult(1, "", "npm error build failed\nnpm error at https://user:secret@registry.example/?token=x\n"));

    const result = await ReproducibleStepTests.createStep(repository, npm).runAsync(["_packages"]);

    Assert.isFalse(result.isSuccessful);
    Assert.areEqual(
      "The second build, npm run build in a worktree of the same commit, exited with code 1: npm error build failed; npm error at https://registry.example/",
      result.message);
    Assert.areEqual(1, repository.listWorktrees().length);
    Assert.isFalse(fs.existsSync(npm.directories[0] ?? ""));
  }

  @TestMethod
  public async failsWithOneLineForEachArchiveThatDiffersAsync(): Promise<void> {
    using repository = ReproducibleStepTests.createRepository();
    repository.write({ "_packages/noldova-a-0.0.4.tgz": "a", "_packages/noldova-b-0.0.4.tgz": "b", "_packages/noldova-c-0.0.4.tgz": "c" });
    const npm = new BuildingNpm({ "_packages/noldova-a-0.0.4.tgz": "a", "_packages/noldova-b-0.0.4.tgz": "b2", "_packages/noldova-d-0.0.4.tgz": "d" });

    const result = await ReproducibleStepTests.createStep(repository, npm).runAsync(["_packages"]);

    Assert.isFalse(result.isSuccessful);
    Assert.areEqual(
      [
        `noldova-b-0.0.4.tgz differs between the two builds: ${ReproducibleStepTests.integrity("b")} and ${ReproducibleStepTests.integrity("b2")}.`,
        "noldova-c-0.0.4.tgz is only in the first build.",
        "noldova-d-0.0.4.tgz is only in the second build.",
        "A second build of the same commit, in another folder, must pack byte-identical archives, so that rerunning a release publishes nothing new: make the build depend on neither its folder nor the time."
      ].join("\n"),
      result.message);
  }

  @TestMethod
  public async failsWhenTheSecondBuildPacksNothingAsync(): Promise<void> {
    using repository = ReproducibleStepTests.createRepository();
    repository.write({ "_packages/noldova-a-0.0.4.tgz": "a" });

    const result = await ReproducibleStepTests.createStep(repository, new BuildingNpm({})).runAsync(["_packages"]);

    Assert.isFalse(result.isSuccessful);
    Assert.isTrue(result.message.startsWith("noldova-a-0.0.4.tgz is only in the first build.\n"), result.message);
  }

  @TestMethod
  public async rejectsWhenGitFailsOutsideACloneAsync(): Promise<void> {
    const directory = GitRepositoryFixture.createDirectory();
    try {
      fs.mkdirSync(path.join(directory, "_packages"));
      fs.writeFileSync(path.join(directory, "_packages", "noldova-a-0.0.4.tgz"), "a");
      const step = new ReproducibleStep(new Git(new ProcessRunner(), directory), new BuildingNpm({}));

      const exception = await Assert.throwsAsync(() => step.runAsync(["_packages"]), ProcessException);

      Assert.areEqual("git", exception.program);
    }
    finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  }

  private static createRepository(): GitRepositoryFixture {
    const repository = GitRepositoryFixture.create();
    repository.commit({ ".gitignore": "_packages/\n", "README.md": "Read me.\n" });

    return repository;
  }

  private static createStep(repository: GitRepositoryFixture, npm: Npm): ReproducibleStep {
    return new ReproducibleStep(new Git(new ProcessRunner(), repository.directory), npm);
  }

  private static integrity(content: string): string {
    return `sha512-${crypto.createHash("sha512").update(content).digest("base64")}`;
  }
}
