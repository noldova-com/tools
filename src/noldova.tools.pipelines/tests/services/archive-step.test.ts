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
import { ArchiveStep, Git, Npm, ProcessResult, ProcessRunner, Tar } from "@noldova/tools.pipelines";

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

class UnextractableTar extends Tar {
  public override async extractAsync(): Promise<ProcessResult> {
    return new ProcessResult(2, "", "tar: Unexpected end of archive\n");
  }
}

class LinkingTar extends Tar {
  public override async extractAsync(archivePath: string): Promise<ProcessResult> {
    const result = await super.extractAsync(archivePath);
    const packagePath = path.join(path.dirname(archivePath), "package");
    fs.symlinkSync(path.join(packagePath, "real"), path.join(packagePath, "linked"), "junction");

    return result;
  }
}

class ListingNpm extends Npm {
  private readonly result: ProcessResult;

  public constructor(directory: string, result: ProcessResult) {
    super(new ProcessRunner(), directory);

    this.result = result;
  }

  public override async listCopiesAsync(): Promise<ProcessResult> {
    return this.result;
  }
}

class UnlistableTar extends Tar {
  private readonly result: ProcessResult;

  public constructor(result: ProcessResult) {
    super(new ProcessRunner());

    this.result = result;
  }

  public override async listFilesAsync(): Promise<ProcessResult> {
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
  private static readonly MANIFEST_A: string = "{ \"name\": \"@noldova/a\", \"version\": \"0.0.4\", \"gitHead\": \"__COMMIT__\", \"license\": \"MIT\" }";
  private static readonly MANIFEST_B: string = "{ \"name\": \"@noldova/b\", \"version\": \"0.0.4\", \"gitHead\": \"__COMMIT__\", \"license\": \"MIT\", \"private\": false, \"dependencies\": { \"@noldova/a\": \"0.0.4\", \"@example/d\": \"^1.0.0\" } }";
  private static readonly LICENSE: Readonly<Record<string, string>> = { "package/LICENSE": "MIT License" };

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
    Assert.areEqual(`noldova-a-0.0.4.tgz: @noldova/a@0.0.4 from commit ${commit}\nnoldova-b-0.0.4.tgz: @noldova/b@0.0.4 from commit ${commit}\nThe build copies no file into a package.`, result.message);
  }

  @TestMethod
  public async succeedsWhenEachArchiveHoldsTheFilesTheBuildCopiesInAsync(): Promise<void> {
    using repository = GitRepositoryFixture.create();
    const commit = repository.commit({ ...ArchiveStepTests.PACKAGES, "LICENSE": "MIT License", "documents/NOTICE.txt": "Notice" });
    const folder = ArchiveStepTests.packArchives(repository, ArchiveStepTests.MANIFEST_A, ArchiveStepTests.MANIFEST_B, { "package/dist/NOTICE.txt": "Notice" });
    const copies = "LICENSE\t@noldova/a\tLICENSE\r\n\r\nLICENSE\t@noldova/b\tLICENSE\n  \ndocuments/NOTICE.txt\t@noldova/a\tdist/NOTICE.txt\n";

    const result = await ArchiveStepTests.createStep(repository.directory, copies).runAsync([folder, "0.0.4", commit, "@noldova"]);

    Assert.isTrue(result.isSuccessful, result.message);
    Assert.areEqual("Each of the 3 files the build copies in matches its source.", result.message.split("\n").at(-1));
  }

  @TestMethod
  public async namesTheOneFileTheBuildCopiesInAsync(): Promise<void> {
    using repository = GitRepositoryFixture.create();
    const commit = repository.commit({ ...ArchiveStepTests.PACKAGES, "LICENSE": "MIT License" });
    const folder = ArchiveStepTests.packArchives(repository, ArchiveStepTests.MANIFEST_A, ArchiveStepTests.MANIFEST_B);

    const result = await ArchiveStepTests.createStep(repository.directory, "LICENSE\t@noldova/b\tLICENSE\n").runAsync([folder, "0.0.4", commit, "@noldova"]);

    Assert.isTrue(result.isSuccessful, result.message);
    Assert.areEqual("The file the build copies in matches its source.", result.message.split("\n").at(-1));
  }

  @TestMethod
  public async failsWithNpmsMessageWhenTheBuildCannotListItsCopiesAsync(): Promise<void> {
    using repository = GitRepositoryFixture.create();
    const commit = repository.commit(ArchiveStepTests.PACKAGES);
    const folder = ArchiveStepTests.packArchives(repository, ArchiveStepTests.MANIFEST_A, ArchiveStepTests.MANIFEST_B);
    const step = ArchiveStepTests.createStep(repository.directory, new ProcessResult(1, "", "npm error Missing script: \"build\"\n"));

    const result = await step.runAsync([folder, "0.0.4", commit, "@noldova"]);

    Assert.isFalse(result.isSuccessful);
    Assert.areEqual("The build could not list the files it copies in: npm run build --silent -- --list-copies exited with code 1: npm error Missing script: \"build\"", result.message);
  }

  @TestData("")
  @TestData("LICENSE\t@noldova/a\tLICENSE\n")
  @TestData("end of copies\nLICENSE\t@noldova/a\tLICENSE\n")
  @TestData("End of copies\n")
  @TestMethod
  public async failsWhenTheBuildDoesNotEndItsCopiesWithTheEndLineAsync(output: string): Promise<void> {
    using repository = GitRepositoryFixture.create();
    const commit = repository.commit({ ...ArchiveStepTests.PACKAGES, "LICENSE": "MIT License" });
    const folder = ArchiveStepTests.packArchives(repository, ArchiveStepTests.MANIFEST_A, ArchiveStepTests.MANIFEST_B);

    const result = await ArchiveStepTests.createStep(repository.directory, new ProcessResult(0, output, "")).runAsync([folder, "0.0.4", commit, "@noldova"]);

    Assert.isFalse(result.isSuccessful);
    Assert.areEqual("The build did not end its list of copies with the line \"end of copies\": its build script must take --list-copies, print each file it copies into a package, and end with that line.", result.message);
  }

  @TestMethod
  public async failsForACopyWhoseSourceIsALinkOrUnderOneAsync(): Promise<void> {
    using repository = GitRepositoryFixture.create();
    const commit = repository.commit({ ...ArchiveStepTests.PACKAGES, "documents/LICENSE": "MIT License" });
    const folder = ArchiveStepTests.packArchives(repository, ArchiveStepTests.MANIFEST_A, ArchiveStepTests.MANIFEST_B);
    fs.symlinkSync(path.join(repository.directory, "documents"), path.join(repository.directory, "linked"), "junction");

    const result = await ArchiveStepTests.createStep(repository.directory, "linked/LICENSE\t@noldova/a\tLICENSE\nlinked\t@noldova/b\tLICENSE").runAsync([folder, "0.0.4", commit, "@noldova"]);

    Assert.isFalse(result.isSuccessful);
    Assert.areEqual("linked/LICENSE, which the build lists as a copy, is a symbolic link or lies under one.\nlinked, which the build lists as a copy, is a symbolic link or lies under one.", result.message);
  }

  @TestMethod
  public async failsForACopyInAnArchiveThatIsALinkOrUnderOneAsync(): Promise<void> {
    using repository = GitRepositoryFixture.create();
    const commit = repository.commit({ ...ArchiveStepTests.PACKAGES, "LICENSE": "MIT License" });
    const folder = ArchiveStepTests.packArchives(repository, ArchiveStepTests.MANIFEST_A, ArchiveStepTests.MANIFEST_B, { "package/real/LICENSE": "MIT License" });
    const npm = new ListingNpm(repository.directory, new ProcessResult(0, "LICENSE\t@noldova/a\tlinked/LICENSE\nLICENSE\t@noldova/a\tlinked\nLICENSE\t@noldova/a\treal/LICENSE\nend of copies\n", ""));
    const step = new ArchiveStep(new Git(new ProcessRunner(), repository.directory), new LinkingTar(new ProcessRunner()), npm);

    const result = await step.runAsync([folder, "0.0.4", commit, "@noldova"]);

    Assert.isFalse(result.isSuccessful);
    Assert.areEqual("noldova-a-0.0.4.tgz: its package/linked/LICENSE is a symbolic link or lies under one.\nnoldova-a-0.0.4.tgz: its package/linked is a symbolic link or lies under one.", result.message);
  }

  @TestMethod
  public async failsForACopyThatIsAFolderInTheArchiveAsync(): Promise<void> {
    using repository = GitRepositoryFixture.create();
    const commit = repository.commit({ ...ArchiveStepTests.PACKAGES, "LICENSE": "MIT License" });
    const folder = ArchiveStepTests.packArchives(repository, ArchiveStepTests.MANIFEST_A, ArchiveStepTests.MANIFEST_B, { "package/documents/README.md": "# A" });

    const result = await ArchiveStepTests.createStep(repository.directory, "LICENSE\t@noldova/a\tdocuments").runAsync([folder, "0.0.4", commit, "@noldova"]);

    Assert.isFalse(result.isSuccessful);
    Assert.areEqual("noldova-a-0.0.4.tgz: its package/documents, the copy of LICENSE, is not a file.", result.message);
  }

  @TestMethod
  public async leavesTheCopiesToRunWhenItOnlyChecksAsync(): Promise<void> {
    using repository = GitRepositoryFixture.create();
    const commit = repository.commit(ArchiveStepTests.PACKAGES);
    const folder = ArchiveStepTests.packArchives(repository, ArchiveStepTests.MANIFEST_A, ArchiveStepTests.MANIFEST_B);
    const step = ArchiveStepTests.createStep(repository.directory, new ProcessResult(1, "", "npm error\n"));

    const check = await step.checkAsync([folder, "0.0.4", commit, "@noldova"]);

    Assert.isTrue(check.result.isSuccessful, check.result.message);
  }

  @TestData("LICENSE\t@noldova/a")
  @TestData("LICENSE\t@noldova/a\tLICENSE\textra")
  @TestData("LICENSE @noldova/a LICENSE")
  @TestMethod
  public async failsForACopyLineThatIsNotThreeFieldsAsync(line: string): Promise<void> {
    using repository = GitRepositoryFixture.create();
    const commit = repository.commit(ArchiveStepTests.PACKAGES);
    const folder = ArchiveStepTests.packArchives(repository, ArchiveStepTests.MANIFEST_A, ArchiveStepTests.MANIFEST_B);

    const result = await ArchiveStepTests.createStep(repository.directory, `${line}\n`).runAsync([folder, "0.0.4", commit, "@noldova"]);

    Assert.isFalse(result.isSuccessful);
    Assert.areEqual(`"${line}" is not a copy the build lists: a source path from the repository's root, a package's name and a path inside the package, separated by tabs.`, result.message);
  }

  @TestData("/etc/LICENSE")
  @TestData("C:/LICENSE")
  @TestData("documents\\LICENSE")
  @TestData("../LICENSE")
  @TestData("documents/./LICENSE")
  @TestData("documents//LICENSE")
  @TestData("")
  @TestMethod
  public async failsForACopyPathOutsideItsFolderAsync(filePath: string): Promise<void> {
    using repository = GitRepositoryFixture.create();
    const commit = repository.commit(ArchiveStepTests.PACKAGES);
    const folder = ArchiveStepTests.packArchives(repository, ArchiveStepTests.MANIFEST_A, ArchiveStepTests.MANIFEST_B);
    const lines = [`${filePath}\t@noldova/a\tLICENSE`, `LICENSE\t@noldova/b\t${filePath}`];

    const result = await ArchiveStepTests.createStep(repository.directory, lines.join("\n")).runAsync([folder, "0.0.4", commit, "@noldova"]);

    Assert.isFalse(result.isSuccessful);
    Assert.areEqual(lines.map(t => `"${t}": "${filePath}" is not a path inside its folder, with / between its parts.`).join("\n"), result.message);
  }

  @TestMethod
  public async failsForACopyIntoAPackageWithoutAnArchiveAsync(): Promise<void> {
    using repository = GitRepositoryFixture.create();
    const commit = repository.commit({ ...ArchiveStepTests.PACKAGES, "LICENSE": "MIT License" });
    const folder = ArchiveStepTests.packArchives(repository, ArchiveStepTests.MANIFEST_A, ArchiveStepTests.MANIFEST_B);

    const result = await ArchiveStepTests.createStep(repository.directory, "LICENSE\t@noldova/c\tLICENSE").runAsync([folder, "0.0.4", commit, "@noldova"]);

    Assert.isFalse(result.isSuccessful);
    Assert.areEqual("\"LICENSE\t@noldova/c\tLICENSE\": @noldova/c has no archive to check.", result.message);
  }

  @TestMethod
  public async failsForACopyWhoseSourceIsNotAFileAsync(): Promise<void> {
    using repository = GitRepositoryFixture.create();
    const commit = repository.commit(ArchiveStepTests.PACKAGES);
    const folder = ArchiveStepTests.packArchives(repository, ArchiveStepTests.MANIFEST_A, ArchiveStepTests.MANIFEST_B);

    const result = await ArchiveStepTests.createStep(repository.directory, "NOTICE.txt\t@noldova/a\tNOTICE.txt\nsrc\t@noldova/b\tLICENSE").runAsync([folder, "0.0.4", commit, "@noldova"]);

    Assert.isFalse(result.isSuccessful);
    Assert.areEqual("NOTICE.txt, which the build lists as a copy, is not a file.\nsrc, which the build lists as a copy, is not a file.", result.message);
  }

  @TestMethod
  public async failsForACopyAnArchiveLacksOrHoldsWithOtherBytesAsync(): Promise<void> {
    using repository = GitRepositoryFixture.create();
    const commit = repository.commit({ ...ArchiveStepTests.PACKAGES, "LICENSE": "MIT License\n", "NOTICE.txt": "Notice" });
    const folder = ArchiveStepTests.packArchives(repository, ArchiveStepTests.MANIFEST_A, ArchiveStepTests.MANIFEST_B);

    const result = await ArchiveStepTests.createStep(repository.directory, "LICENSE\t@noldova/a\tLICENSE\nNOTICE.txt\t@noldova/b\tdist/NOTICE.txt").runAsync([folder, "0.0.4", commit, "@noldova"]);

    Assert.isFalse(result.isSuccessful);
    Assert.areEqual("noldova-a-0.0.4.tgz: its package/LICENSE differs from LICENSE.\nnoldova-b-0.0.4.tgz: it has no package/dist/NOTICE.txt, the copy of NOTICE.txt.", result.message);
  }

  @TestMethod
  public async failsWithTarsMessageWhenItCannotExtractAnArchiveAsync(): Promise<void> {
    using repository = GitRepositoryFixture.create();
    const commit = repository.commit({ ...ArchiveStepTests.PACKAGES, "LICENSE": "MIT License" });
    const folder = ArchiveStepTests.packArchives(repository, ArchiveStepTests.MANIFEST_A, ArchiveStepTests.MANIFEST_B);
    const npm = new ListingNpm(repository.directory, new ProcessResult(0, "LICENSE\t@noldova/a\tLICENSE\nNOTICE.txt\t@noldova/a\tNOTICE.txt\nend of copies\n", ""));
    const step = new ArchiveStep(new Git(new ProcessRunner(), repository.directory), new UnextractableTar(new ProcessRunner()), npm);

    const result = await step.runAsync([folder, "0.0.4", commit, "@noldova"]);

    Assert.isFalse(result.isSuccessful);
    Assert.areEqual("noldova-a-0.0.4.tgz: tar could not extract it and exited with code 2: tar: Unexpected end of archive\nNOTICE.txt, which the build lists as a copy, is not a file.", result.message);
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
    repository.pack("archives/noldova-a-0.0.4.tgz", { "package/package.json": ArchiveStepTests.withCommit(ArchiveStepTests.MANIFEST_A, commit), ...ArchiveStepTests.LICENSE });
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
        "noldova-a-0.0.4.tgz: its package.json has no license.",
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
    const step = new ArchiveStep(new Git(new ProcessRunner(), repository.directory), new FixedTar(new ProcessResult(2, "", errorOutput)), new Npm(new ProcessRunner(), repository.directory));

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
    const step = new ArchiveStep(new Git(new ProcessRunner(), repository.directory), new FixedTar(new ProcessResult(2, "", " \n")), new Npm(new ProcessRunner(), repository.directory));

    const result = await step.runAsync([folder, "0.0.4", commit, "@noldova"]);

    Assert.isFalse(result.isSuccessful);
    Assert.areEqual(
      "noldova-a-0.0.4.tgz: tar could not read its package/package.json and exited with code 2.\nnoldova-b-0.0.4.tgz: tar could not read its package/package.json and exited with code 2.",
      result.message);
  }

  @TestData(".npmrc")
  @TestData("dist/.npmrc")
  @TestData(".netrc")
  @TestData(".env")
  @TestData(".env.production")
  @TestData("config/.ENV.local")
  @TestData("id_rsa")
  @TestData("keys/id_ed25519")
  @TestData("id_dsa")
  @TestData(".ssh/id_ecdsa")
  @TestData(".key")
  @TestData("certs/.PEM")
  @TestData("cert.pem")
  @TestData("signing.KEY")
  @TestData("store.p12")
  @TestData("store.pfx")
  @TestMethod
  public async failsForAFileOfAKindThatHoldsCredentialsAsync(filePath: string): Promise<void> {
    using repository = GitRepositoryFixture.create();
    const commit = repository.commit(ArchiveStepTests.PACKAGES);
    const folder = ArchiveStepTests.packArchives(repository, ArchiveStepTests.MANIFEST_A, ArchiveStepTests.MANIFEST_B, { [`package/${filePath}`]: "" });

    const result = await ArchiveStepTests.createStep(repository.directory).runAsync([folder, "0.0.4", commit, "@noldova"]);

    Assert.isFalse(result.isSuccessful);
    Assert.areEqual(`noldova-a-0.0.4.tgz: it holds package/${filePath}, a file of a kind that holds credentials, which is never published.`, result.message);
  }

  @TestMethod
  public async succeedsForFilesThatOnlyLookLikeCredentialFilesAsync(): Promise<void> {
    using repository = GitRepositoryFixture.create();
    const commit = repository.commit(ArchiveStepTests.PACKAGES);
    const files = ["env.ts", ".env-example", "npmrc.md", "keys.md", "monkey.js", "id_rsa.pub", "pem/README.md", "notes.keys", "dist/.envrc"];
    const folder = ArchiveStepTests.packArchives(repository, ArchiveStepTests.MANIFEST_A, ArchiveStepTests.MANIFEST_B, Object.fromEntries(files.map(t => [`package/${t}`, ""])));

    const result = await ArchiveStepTests.createStep(repository.directory).runAsync([folder, "0.0.4", commit, "@noldova"]);

    Assert.isTrue(result.isSuccessful, result.message);
  }

  @TestMethod
  public async failsForAnArchiveWithoutItsLicenseFileAsync(): Promise<void> {
    using repository = GitRepositoryFixture.create();
    const commit = repository.commit(ArchiveStepTests.PACKAGES);
    const folder = ArchiveStepTests.packArchives(repository, ArchiveStepTests.MANIFEST_A, ArchiveStepTests.MANIFEST_B);
    repository.pack("archives/noldova-b-0.0.4.tgz", { "package/package.json": ArchiveStepTests.withCommit(ArchiveStepTests.MANIFEST_B, commit), "package/dist/LICENSE": "MIT License" });

    const result = await ArchiveStepTests.createStep(repository.directory).runAsync([folder, "0.0.4", commit, "@noldova"]);

    Assert.isFalse(result.isSuccessful);
    Assert.areEqual("noldova-b-0.0.4.tgz: it has no package/LICENSE.", result.message);
  }

  @TestData("{ \"name\": \"@noldova/a\", \"version\": \"0.0.4\", \"gitHead\": \"__COMMIT__\" }")
  @TestData("{ \"name\": \"@noldova/a\", \"version\": \"0.0.4\", \"gitHead\": \"__COMMIT__\", \"license\": \"\" }")
  @TestMethod
  public async failsForAManifestWithoutALicenseAsync(manifest: string): Promise<void> {
    using repository = GitRepositoryFixture.create();
    const commit = repository.commit(ArchiveStepTests.PACKAGES);
    const folder = ArchiveStepTests.packArchives(repository, manifest, ArchiveStepTests.MANIFEST_B);

    const result = await ArchiveStepTests.createStep(repository.directory).runAsync([folder, "0.0.4", commit, "@noldova"]);

    Assert.isFalse(result.isSuccessful);
    Assert.areEqual("noldova-a-0.0.4.tgz: its package.json has no license.", result.message);
  }

  @TestMethod
  public async rejectsALicenseThatIsNotATextAsync(): Promise<void> {
    using repository = GitRepositoryFixture.create();
    const commit = repository.commit(ArchiveStepTests.PACKAGES);
    const folder = ArchiveStepTests.packArchives(repository, ArchiveStepTests.MANIFEST_A.replace("\"MIT\"", "{ \"type\": \"MIT\" }"), ArchiveStepTests.MANIFEST_B);

    const exception = await Assert.throwsAsync(() => ArchiveStepTests.createStep(repository.directory).runAsync([folder, "0.0.4", commit, "@noldova"]), JsonException);

    Assert.isTrue(exception.path.startsWith("noldova-a-0.0.4.tgz/package/package.json"), exception.path);
  }

  @TestMethod
  public async failsWithTarsMessageWhenItCannotListAnArchivesFilesAsync(): Promise<void> {
    using repository = GitRepositoryFixture.create();
    const commit = repository.commit(ArchiveStepTests.PACKAGES);
    const folder = ArchiveStepTests.packArchives(repository, ArchiveStepTests.MANIFEST_A, ArchiveStepTests.MANIFEST_B);
    const step = new ArchiveStep(new Git(new ProcessRunner(), repository.directory), new UnlistableTar(new ProcessResult(2, "", "tar: Unexpected end of archive\n")), new Npm(new ProcessRunner(), repository.directory));

    const result = await step.runAsync([folder, "0.0.4", commit, "@noldova"]);

    Assert.isFalse(result.isSuccessful);
    Assert.areEqual(
      "noldova-a-0.0.4.tgz: tar could not list its files and exited with code 2: tar: Unexpected end of archive\nnoldova-b-0.0.4.tgz: tar could not list its files and exited with code 2: tar: Unexpected end of archive",
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

  private static createStep(directory: string, copies: string | ProcessResult = ""): ArchiveStep {
    const processRunner = new ProcessRunner();
    const listed = typeof copies === "string" ? new ProcessResult(0, `${copies}\nend of copies\n`, "") : copies;

    return new ArchiveStep(new Git(processRunner, directory), new Tar(processRunner), new ListingNpm(directory, listed));
  }

  private static packArchives(repository: GitRepositoryFixture, manifestA: string, manifestB: string, filesA: Readonly<Record<string, string>> = {}): string {
    const commit = repository.readHead();
    repository.pack("archives/noldova-a-0.0.4.tgz", { "package/package.json": ArchiveStepTests.withCommit(manifestA, commit), ...ArchiveStepTests.LICENSE, ...filesA });
    repository.pack("archives/noldova-b-0.0.4.tgz", { "package/package.json": ArchiveStepTests.withCommit(manifestB, commit), ...ArchiveStepTests.LICENSE });

    return path.join(repository.directory, "archives");
  }

  private static withCommit(manifest: string, commit: string): string {
    return manifest.replace("__COMMIT__", commit);
  }
}
