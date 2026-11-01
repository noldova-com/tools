/**
 * @license
 * Copyright (c) Noldova.
 *
 * This source code is licensed under the license found in the
 * LICENSE file in the root directory of this source tree.
 */

import fs from "node:fs";
import path from "node:path";

import { JsonException } from "@noldova/context.json";
import { Assert, TestClass, TestData, TestMethod } from "@noldova/context.testing";
import { ArchiveStep, Git, ProcessResult, ProcessRunner, Tar } from "@noldova/tools.pipelines";

import { GitRepositoryFixture } from "./git-repository.fixture.js";

class FixedTar extends Tar {
  private readonly result: ProcessResult;

  public constructor(result: ProcessResult) {
    super(new ProcessRunner());

    this.result = result;
  }

  public override async readFileAsync(): Promise<ProcessResult> {
    return this.result;
  }
}

@TestClass
export class ArchiveStepTests {
  private static readonly COMMIT: string = "0000000000000000000000000000000000000000";
  private static readonly PACKAGES: Readonly<Record<string, string>> = {
    "README.md": "# Example\n",
    "src/tsconfig.json": "{}",
    "src/noldova.a/package.json": "{ \"name\": \"@noldova/a\", \"version\": \"__VERSION__\" }",
    "src/noldova.a/tests/package.json": "{ \"name\": \"@noldova/a.tests\", \"version\": \"__VERSION__\" }",
    "src/noldova.b/package.json": "{ \"name\": \"@noldova/b\", \"version\": \"__VERSION__\", \"dependencies\": { \"@noldova/a\": \"__VERSION__\" } }",
    "src/noldova.c/package.json": "{ \"name\": \"@noldova/c\", \"version\": \"__VERSION__\", \"private\": true }"
  };
  private static readonly MANIFEST_A: string = "{ \"name\": \"@noldova/a\", \"version\": \"0.0.4\", \"gitHead\": \"__COMMIT__\" }";
  private static readonly MANIFEST_B: string = "{ \"name\": \"@noldova/b\", \"version\": \"0.0.4\", \"gitHead\": \"__COMMIT__\", \"private\": false, \"dependencies\": { \"@noldova/a\": \"0.0.4\", \"@example/d\": \"^1.0.0\" } }";

  @TestMethod
  public namesItselfAndItsValues(): void {
    const step = ArchiveStepTests.createStep(".");

    Assert.areEqual("archive", step.name);
    Assert.areEqual("<folder> <version> <commit> <scope>", step.usage);
  }

  @TestMethod
  public async succeedsForTheArchivesOfThePackagesAtTheVersionAsync(): Promise<void> {
    using repository = GitRepositoryFixture.create();
    const commit = repository.commit(ArchiveStepTests.PACKAGES);
    const folder = ArchiveStepTests.packArchives(repository, ArchiveStepTests.MANIFEST_A, ArchiveStepTests.MANIFEST_B);

    const result = await ArchiveStepTests.createStep(repository.directory).runAsync([folder, "0.0.4", commit, "@noldova"]);

    Assert.isTrue(result.isSuccessful, result.message);
    Assert.areEqual(`noldova-a-0.0.4.tgz: @noldova/a@0.0.4 from commit ${commit}\nnoldova-b-0.0.4.tgz: @noldova/b@0.0.4 from commit ${commit}`, result.message);
  }

  @TestMethod
  public async givesTheCheckedArchivesWithTheResultAsync(): Promise<void> {
    using repository = GitRepositoryFixture.create();
    const commit = repository.commit(ArchiveStepTests.PACKAGES);
    const folder = ArchiveStepTests.packArchives(repository, ArchiveStepTests.MANIFEST_A, ArchiveStepTests.MANIFEST_B);

    const check = await ArchiveStepTests.createStep(repository.directory).checkAsync([folder, "0.0.4", commit, "@noldova"]);

    Assert.isTrue(check.result.isSuccessful, check.result.message);
    Assert.areEqual(
      `@noldova/a ${path.join(folder, "noldova-a-0.0.4.tgz")},@noldova/b ${path.join(folder, "noldova-b-0.0.4.tgz")}`,
      check.archives.map(t => `${t.packageName} ${t.filePath}`).join(","));
  }

  @TestMethod
  public async givesNoArchivesWithAFailedResultAsync(): Promise<void> {
    using repository = GitRepositoryFixture.create();
    const commit = repository.commit(ArchiveStepTests.PACKAGES);
    repository.pack("archives/noldova-a-0.0.4.tgz", { "package/package.json": ArchiveStepTests.withCommit(ArchiveStepTests.MANIFEST_A, commit) });

    const check = await ArchiveStepTests.createStep(repository.directory).checkAsync([path.join(repository.directory, "archives"), "0.0.4", commit, "@noldova"]);

    Assert.isFalse(check.result.isSuccessful);
    Assert.areEqual(0, check.archives.length);
  }

  @TestData("")
  @TestData("archives 0.0.4 0000000000000000000000000000000000000000")
  @TestData("archives 0.0.4 0000000000000000000000000000000000000000 @noldova more")
  @TestMethod
  public async failsForAnyNumberOfValuesButFourAsync(joinedValues: string): Promise<void> {
    const values = joinedValues.length === 0 ? [] : joinedValues.split(" ");

    const result = await ArchiveStepTests.createStep(".").runAsync(values);

    Assert.isFalse(result.isSuccessful);
    Assert.areEqual("The archive step takes <folder> <version> <commit> <scope>.", result.message);
  }

  @TestMethod
  public async failsForAVersionThatIsNotAVersionAsync(): Promise<void> {
    const result = await ArchiveStepTests.createStep(".").runAsync(["archives", "0.0.4x", ArchiveStepTests.COMMIT, "@noldova"]);

    Assert.isFalse(result.isSuccessful);
    Assert.isTrue(result.message.startsWith("\"0.0.4x\" is not a version: "), result.message);
  }

  @TestData("225059f")
  @TestData("main")
  @TestMethod
  public async failsForACommitThatIsNotAFullIdAsync(commit: string): Promise<void> {
    const result = await ArchiveStepTests.createStep(".").runAsync(["archives", "0.0.4", commit, "@noldova"]);

    Assert.isFalse(result.isSuccessful);
    Assert.areEqual(`"${commit}" is not a commit: a commit is given by its full id, 40 lowercase hexadecimal digits.`, result.message);
  }

  @TestData("noldova")
  @TestData("@")
  @TestData("@Noldova")
  @TestData("@noldova/tools")
  @TestData("")
  @TestMethod
  public async failsForAScopeThatIsNotAScopeAsync(scope: string): Promise<void> {
    const result = await ArchiveStepTests.createStep(".").runAsync(["archives", "0.0.4", ArchiveStepTests.COMMIT, scope]);

    Assert.isFalse(result.isSuccessful);
    Assert.areEqual(`"${scope}" is not a scope: a scope is @ and a lowercase name, such as @noldova.`, result.message);
  }

  @TestMethod
  public async failsForACheckoutAtAnotherCommitAsync(): Promise<void> {
    using repository = GitRepositoryFixture.create();
    const commit = repository.commit(ArchiveStepTests.PACKAGES);
    const later = repository.commit({ "later.txt": "later" });
    const folder = ArchiveStepTests.packArchives(repository, ArchiveStepTests.MANIFEST_A, ArchiveStepTests.MANIFEST_B);

    const result = await ArchiveStepTests.createStep(repository.directory).runAsync([folder, "0.0.4", commit, "@noldova"]);

    Assert.isFalse(result.isSuccessful);
    Assert.areEqual(`The checkout is at commit ${later}, not at ${commit}.`, result.message);
  }

  @TestData("missing")
  @TestData("README.md")
  @TestMethod
  public async failsForAFolderThatDoesNotExistAsync(folderName: string): Promise<void> {
    using repository = GitRepositoryFixture.create();
    const commit = repository.commit(ArchiveStepTests.PACKAGES);
    const folder = path.join(repository.directory, folderName);

    const result = await ArchiveStepTests.createStep(repository.directory).runAsync([folder, "0.0.4", commit, "@noldova"]);

    Assert.isFalse(result.isSuccessful);
    Assert.areEqual(`There is no folder ${folder}.`, result.message);
  }

  @TestMethod
  public async failsForACommitWithoutAPackageToPublishAsync(): Promise<void> {
    using repository = GitRepositoryFixture.create();
    const commit = repository.commit({
      "package.json": "{ \"name\": \"@noldova/root\" }",
      "src/noldova.a/tests/package.json": "{ \"name\": \"@noldova/a.tests\" }",
      "src/noldova.c/package.json": "{ \"name\": \"@noldova/c\", \"private\": true }"
    });
    const folder = ArchiveStepTests.packArchives(repository, ArchiveStepTests.MANIFEST_A, ArchiveStepTests.MANIFEST_B);

    const result = await ArchiveStepTests.createStep(repository.directory).runAsync([folder, "0.0.4", commit, "@noldova"]);

    Assert.isFalse(result.isSuccessful);
    Assert.areEqual(`Commit ${commit} has no package to publish under src/.`, result.message);
  }

  @TestMethod
  public async failsWithEveryArchiveTheFolderLacksOrShouldNotHoldAsync(): Promise<void> {
    using repository = GitRepositoryFixture.create();
    const commit = repository.commit(ArchiveStepTests.PACKAGES);
    repository.pack("archives/noldova-a-0.0.4.tgz", { "package/package.json": ArchiveStepTests.withCommit(ArchiveStepTests.MANIFEST_A, commit) });
    repository.pack("archives/noldova-a-0.0.3.tgz", { "package/package.json": "{ \"name\": \"@noldova/a\", \"version\": \"0.0.3\" }" });
    fs.writeFileSync(path.join(repository.directory, "archives", "notes.txt"), "notes");
    const folder = path.join(repository.directory, "archives");

    const result = await ArchiveStepTests.createStep(repository.directory).runAsync([folder, "0.0.4", commit, "@noldova"]);

    Assert.isFalse(result.isSuccessful);
    Assert.areEqual(
      [
        `${folder} has no noldova-b-0.0.4.tgz.`,
        `${folder} holds noldova-a-0.0.3.tgz, which is not one of the packages' archives at 0.0.4.`,
        `${folder} holds notes.txt, which is not one of the packages' archives at 0.0.4.`
      ].join("\n"),
      result.message);
  }

  @TestMethod
  public async failsWithEveryProblemOfAManifestAsync(): Promise<void> {
    using repository = GitRepositoryFixture.create();
    const commit = repository.commit(ArchiveStepTests.PACKAGES);
    const manifest = "{ \"name\": \"@example/a\", \"version\": \"0.0.3\", \"private\": true, \"dependencies\": { \"@noldova/b\": \"^0.0.4\" } }";
    const folder = ArchiveStepTests.packArchives(repository, manifest, ArchiveStepTests.MANIFEST_B);

    const result = await ArchiveStepTests.createStep(repository.directory).runAsync([folder, "0.0.4", commit, "@noldova"]);

    Assert.isFalse(result.isSuccessful);
    Assert.areEqual(
      [
        "noldova-a-0.0.4.tgz: its name is @example/a, not @noldova/a.",
        "noldova-a-0.0.4.tgz: @example/a is outside the scope @noldova.",
        "noldova-a-0.0.4.tgz: its version is 0.0.3, not 0.0.4.",
        `noldova-a-0.0.4.tgz: it has no gitHead, which should be ${commit}.`,
        "noldova-a-0.0.4.tgz: it is marked private.",
        "noldova-a-0.0.4.tgz: its dependency @noldova/b is ^0.0.4, not exactly 0.0.4."
      ].join("\n"),
      result.message);
  }

  @TestMethod
  public async failsForAnArchiveFromAnotherCommitAsync(): Promise<void> {
    using repository = GitRepositoryFixture.create();
    const commit = repository.commit(ArchiveStepTests.PACKAGES);
    const other = "1111111111111111111111111111111111111111";
    const folder = ArchiveStepTests.packArchives(repository, ArchiveStepTests.MANIFEST_A.replace("__COMMIT__", other), ArchiveStepTests.MANIFEST_B);

    const result = await ArchiveStepTests.createStep(repository.directory).runAsync([folder, "0.0.4", commit, "@noldova"]);

    Assert.isFalse(result.isSuccessful);
    Assert.areEqual(`noldova-a-0.0.4.tgz: its gitHead is ${other}, not ${commit}.`, result.message);
  }

  @TestMethod
  public async rejectsAGitHeadThatIsNotATextAsync(): Promise<void> {
    using repository = GitRepositoryFixture.create();
    const commit = repository.commit(ArchiveStepTests.PACKAGES);
    const folder = ArchiveStepTests.packArchives(repository, ArchiveStepTests.MANIFEST_A.replace("\"__COMMIT__\"", "1"), ArchiveStepTests.MANIFEST_B);

    const exception = await Assert.throwsAsync(() => ArchiveStepTests.createStep(repository.directory).runAsync([folder, "0.0.4", commit, "@noldova"]), JsonException);

    Assert.isTrue(exception.path.startsWith("noldova-a-0.0.4.tgz/package/package.json"), exception.path);
  }

  @TestMethod
  public async failsForPackagesOutsideTheScopeAsync(): Promise<void> {
    using repository = GitRepositoryFixture.create();
    const commit = repository.commit(ArchiveStepTests.PACKAGES);
    const folder = ArchiveStepTests.packArchives(repository, ArchiveStepTests.MANIFEST_A, ArchiveStepTests.MANIFEST_B);

    const result = await ArchiveStepTests.createStep(repository.directory).runAsync([folder, "0.0.4", commit, "@example"]);

    Assert.isFalse(result.isSuccessful);
    Assert.areEqual("noldova-a-0.0.4.tgz: @noldova/a is outside the scope @example.\nnoldova-b-0.0.4.tgz: @noldova/b is outside the scope @example.", result.message);
  }

  @TestMethod
  public async failsWithTarsMessageForAnArchiveItCannotReadAsync(): Promise<void> {
    using repository = GitRepositoryFixture.create();
    const commit = repository.commit(ArchiveStepTests.PACKAGES);
    repository.pack("archives/noldova-b-0.0.4.tgz", { "package/README.md": "# Example" });
    fs.writeFileSync(path.join(repository.directory, "archives", "noldova-a-0.0.4.tgz"), "not an archive");
    const folder = path.join(repository.directory, "archives");

    const result = await ArchiveStepTests.createStep(repository.directory).runAsync([folder, "0.0.4", commit, "@noldova"]);

    const lines = result.message.split("\n");
    Assert.isFalse(result.isSuccessful);
    Assert.areEqual(2, lines.length, result.message);
    Assert.isTrue(lines[0]?.startsWith("noldova-a-0.0.4.tgz: tar could not read its package/package.json and exited with code ") === true, result.message);
    Assert.isTrue(lines[1]?.startsWith("noldova-b-0.0.4.tgz: tar could not read its package/package.json and exited with code ") === true, result.message);
  }

  @TestMethod
  public async foldsTarsMessageOntoTheArchivesLineAsync(): Promise<void> {
    using repository = GitRepositoryFixture.create();
    const commit = repository.commit(ArchiveStepTests.PACKAGES);
    const folder = ArchiveStepTests.packArchives(repository, ArchiveStepTests.MANIFEST_A, ArchiveStepTests.MANIFEST_B);
    const errorOutput = "\ngzip: stdin: not in gzip format\r\ntar: Child returned status 1\n  tar: Error is not recoverable: exiting now\n";
    const step = new ArchiveStep(new Git(new ProcessRunner(), repository.directory), new FixedTar(new ProcessResult(2, "", errorOutput)));

    const result = await step.runAsync([folder, "0.0.4", commit, "@noldova"]);

    Assert.isFalse(result.isSuccessful);
    Assert.areEqual(
      [
        "noldova-a-0.0.4.tgz: tar could not read its package/package.json and exited with code 2: gzip: stdin: not in gzip format; tar: Child returned status 1; tar: Error is not recoverable: exiting now",
        "noldova-b-0.0.4.tgz: tar could not read its package/package.json and exited with code 2: gzip: stdin: not in gzip format; tar: Child returned status 1; tar: Error is not recoverable: exiting now"
      ].join("\n"),
      result.message);
  }

  @TestMethod
  public async failsWithTarsExitCodeWhenItWritesNoMessageAsync(): Promise<void> {
    using repository = GitRepositoryFixture.create();
    const commit = repository.commit(ArchiveStepTests.PACKAGES);
    const folder = ArchiveStepTests.packArchives(repository, ArchiveStepTests.MANIFEST_A, ArchiveStepTests.MANIFEST_B);
    const step = new ArchiveStep(new Git(new ProcessRunner(), repository.directory), new FixedTar(new ProcessResult(2, "", " \n")));

    const result = await step.runAsync([folder, "0.0.4", commit, "@noldova"]);

    Assert.isFalse(result.isSuccessful);
    Assert.areEqual(
      "noldova-a-0.0.4.tgz: tar could not read its package/package.json and exited with code 2.\nnoldova-b-0.0.4.tgz: tar could not read its package/package.json and exited with code 2.",
      result.message);
  }

  @TestMethod
  public async rejectsAManifestInAnArchiveThatIsNotJsonAsync(): Promise<void> {
    using repository = GitRepositoryFixture.create();
    const commit = repository.commit(ArchiveStepTests.PACKAGES);
    const folder = ArchiveStepTests.packArchives(repository, "{ \"name\"", ArchiveStepTests.MANIFEST_B);

    const exception = await Assert.throwsAsync(() => ArchiveStepTests.createStep(repository.directory).runAsync([folder, "0.0.4", commit, "@noldova"]), JsonException);

    Assert.isTrue(exception.path.startsWith("noldova-a-0.0.4.tgz/package/package.json"), exception.path);
  }

  @TestMethod
  public async rejectsAPackageManifestThatIsNotJsonAsync(): Promise<void> {
    using repository = GitRepositoryFixture.create();
    const commit = repository.commit({ ...ArchiveStepTests.PACKAGES, "src/noldova.b/package.json": "{ \"name\"" });
    const folder = ArchiveStepTests.packArchives(repository, ArchiveStepTests.MANIFEST_A, ArchiveStepTests.MANIFEST_B);

    const exception = await Assert.throwsAsync(() => ArchiveStepTests.createStep(repository.directory).runAsync([folder, "0.0.4", commit, "@noldova"]), JsonException);

    Assert.isTrue(exception.path.startsWith("src/noldova.b/package.json"), exception.path);
  }

  private static createStep(directory: string): ArchiveStep {
    const processRunner = new ProcessRunner();

    return new ArchiveStep(new Git(processRunner, directory), new Tar(processRunner));
  }

  private static packArchives(repository: GitRepositoryFixture, manifestA: string, manifestB: string): string {
    const commit = repository.readHead();
    repository.pack("archives/noldova-a-0.0.4.tgz", { "package/package.json": ArchiveStepTests.withCommit(manifestA, commit) });
    repository.pack("archives/noldova-b-0.0.4.tgz", { "package/package.json": ArchiveStepTests.withCommit(manifestB, commit) });

    return path.join(repository.directory, "archives");
  }

  private static withCommit(manifest: string, commit: string): string {
    return manifest.replace("__COMMIT__", commit);
  }
}
