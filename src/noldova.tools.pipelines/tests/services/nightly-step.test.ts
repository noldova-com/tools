/**
 * @license
 * Copyright (c) Noldova.
 *
 * This source code is licensed under the license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { JsonException } from "@noldova/context.json";
import { Assert, TestClass, TestData, TestMethod } from "@noldova/context.testing";
import { ArchiveStep, Git, NightlyStep, ProcessResult, ProcessRunner, Tar } from "@noldova/tools.pipelines";

import { FakeNpm } from "./fake-npm.js";
import { GitRepositoryFixture } from "./git-repository.fixture.js";

@TestClass
export class NightlyStepTests {
  private static readonly REGISTRY: string = "https://registry.example/";
  private static readonly OTHER_COMMIT: string = "1111111111111111111111111111111111111111";
  private static readonly NOW: Date = new Date("2026-11-02T12:00:00Z");
  private static readonly FILES: Readonly<Record<string, string>> = {
    "version.json": "{ \"version\": \"0.0.4\" }",
    "src/noldova.a/package.json": "{ \"name\": \"@noldova/a\", \"version\": \"__VERSION__\" }",
    "src/noldova.b/package.json": "{ \"name\": \"@noldova/b\", \"version\": \"__VERSION__\" }"
  };

  @TestMethod
  public namesItselfAndItsValues(): void {
    const step = NightlyStepTests.createStep(".", new FakeNpm({}));

    Assert.areEqual("nightly", step.name);
    Assert.areEqual("<commit> <registry>", step.usage);
  }

  @TestMethod
  public async printsTheNextPatchAsANightlyVersionWhenNoNightlyIsPublishedAsync(): Promise<void> {
    using repository = GitRepositoryFixture.create();
    const commit = NightlyStepTests.commitOnMain(repository, NightlyStepTests.FILES);
    const npm = new FakeNpm({});

    const result = await NightlyStepTests.createStep(repository.directory, npm).runAsync([commit, NightlyStepTests.REGISTRY]);

    Assert.isTrue(result.isSuccessful, result.message);
    Assert.areEqual("0.0.5-nightly.20261102", result.message);
    Assert.areEqual(
      "view @noldova/a dist-tags.nightly https://registry.example/\nview @noldova/b dist-tags.nightly https://registry.example/",
      npm.calls.join("\n"));
  }

  @TestData("1111111111111111111111111111111111111111")
  @TestData("")
  @TestMethod
  public async printsTheVersionWhenAPackagesLastNightlyIsFromAnotherCommitAsync(gitHead: string): Promise<void> {
    using repository = GitRepositoryFixture.create();
    const commit = NightlyStepTests.commitOnMain(repository, NightlyStepTests.FILES);
    const npm = NightlyStepTests.createNpm("0.0.5-nightly.20261101", commit, "0.0.5-nightly.20261101", gitHead);

    const result = await NightlyStepTests.createStep(repository.directory, npm).runAsync([commit, NightlyStepTests.REGISTRY]);

    Assert.isTrue(result.isSuccessful, result.message);
    Assert.areEqual("0.0.5-nightly.20261102", result.message);
    Assert.areEqual(
      [
        "view @noldova/a dist-tags.nightly https://registry.example/",
        "view @noldova/a@0.0.5-nightly.20261101 gitHead https://registry.example/",
        "view @noldova/b dist-tags.nightly https://registry.example/",
        "view @noldova/b@0.0.5-nightly.20261101 gitHead https://registry.example/"
      ].join("\n"),
      npm.calls.join("\n"));
  }

  @TestMethod
  public async printsNothingWhenEveryLastNightlyIsFromTheCommitAsync(): Promise<void> {
    using repository = GitRepositoryFixture.create();
    const commit = NightlyStepTests.commitOnMain(repository, NightlyStepTests.FILES);
    const npm = NightlyStepTests.createNpm("0.0.5-nightly.20261101", commit, "0.0.5-nightly.20261031", commit);

    const result = await NightlyStepTests.createStep(repository.directory, npm).runAsync([commit, NightlyStepTests.REGISTRY]);

    Assert.isTrue(result.isSuccessful, result.message);
    Assert.areEqual("", result.message);
  }

  @TestMethod
  public async printsNothingWhenEveryLastNightlyIsFromTodayAsync(): Promise<void> {
    using repository = GitRepositoryFixture.create();
    const commit = NightlyStepTests.commitOnMain(repository, NightlyStepTests.FILES);
    const npm = NightlyStepTests.createNpm("0.0.5-nightly.20261102", NightlyStepTests.OTHER_COMMIT, "0.0.5-nightly.20261102", NightlyStepTests.OTHER_COMMIT);

    const result = await NightlyStepTests.createStep(repository.directory, npm).runAsync([commit, NightlyStepTests.REGISTRY]);

    Assert.isTrue(result.isSuccessful, result.message);
    Assert.areEqual("", result.message);
  }

  @TestMethod
  public async failsWhenOnlySomeLastNightliesAreFromTodayAsync(): Promise<void> {
    using repository = GitRepositoryFixture.create();
    const commit = NightlyStepTests.commitOnMain(repository, NightlyStepTests.FILES);
    const npm = NightlyStepTests.createNpm("0.0.5-nightly.20261102", NightlyStepTests.OTHER_COMMIT, "0.0.5-nightly.20261101", NightlyStepTests.OTHER_COMMIT);

    const result = await NightlyStepTests.createStep(repository.directory, npm).runAsync([commit, NightlyStepTests.REGISTRY]);

    Assert.isFalse(result.isSuccessful);
    Assert.areEqual(
      "Only some packages' last nightly is from 20261102, UTC, so the publish step would refuse a new one for them: @noldova/a@0.0.5-nightly.20261102.",
      result.message);
  }

  @TestData("2026-11-02T00:30:00+09:00", "0.0.5-nightly.20261101")
  @TestData("2027-01-05T10:00:00Z", "0.0.5-nightly.20270105")
  @TestMethod
  public async datesTheVersionByTheUtcDayAsync(now: string, expected: string): Promise<void> {
    using repository = GitRepositoryFixture.create();
    const commit = NightlyStepTests.commitOnMain(repository, NightlyStepTests.FILES);

    const result = await NightlyStepTests.createStep(repository.directory, new FakeNpm({}), new Date(now)).runAsync([commit, NightlyStepTests.REGISTRY]);

    Assert.isTrue(result.isSuccessful, result.message);
    Assert.areEqual(expected, result.message);
  }

  @TestMethod
  public async datesTheVersionByTheCurrentTimeByDefaultAsync(): Promise<void> {
    using repository = GitRepositoryFixture.create();
    const commit = NightlyStepTests.commitOnMain(repository, NightlyStepTests.FILES);
    const processRunner = new ProcessRunner();
    const git = new Git(processRunner, repository.directory);

    const result = await new NightlyStep(git, new ArchiveStep(git, new Tar(processRunner)), new FakeNpm({})).runAsync([commit, NightlyStepTests.REGISTRY]);

    Assert.isTrue(result.isSuccessful, result.message);
    Assert.isTrue(/^0\.0\.5-nightly\.[0-9]{8}$/.test(result.message), result.message);
  }

  @TestMethod
  public async failsWithNpmsLineForEachReadOfTheRegistryThatFailsAsync(): Promise<void> {
    using repository = GitRepositoryFixture.create();
    const commit = NightlyStepTests.commitOnMain(repository, NightlyStepTests.FILES);
    const npm = new FakeNpm({
      "@noldova/a dist-tags.nightly": [new ProcessResult(1, "", "npm error code ECONNREFUSED\n")],
      "@noldova/b dist-tags.nightly": [FakeNpm.found("0.0.5-nightly.20261101\n")],
      "@noldova/b@0.0.5-nightly.20261101 gitHead": [new ProcessResult(1, "", "")]
    });

    const result = await NightlyStepTests.createStep(repository.directory, npm).runAsync([commit, NightlyStepTests.REGISTRY]);

    Assert.isFalse(result.isSuccessful);
    Assert.areEqual(
      "@noldova/a: npm view exited with code 1: npm error code ECONNREFUSED\n@noldova/b@0.0.5-nightly.20261101: npm view exited with code 1.",
      result.message);
  }

  @TestMethod
  public async failsForANightlyTagThatIsNotAVersionAsync(): Promise<void> {
    using repository = GitRepositoryFixture.create();
    const commit = NightlyStepTests.commitOnMain(repository, NightlyStepTests.FILES);
    const npm = new FakeNpm({ "@noldova/a dist-tags.nightly": [FakeNpm.found("next\n")] });

    const result = await NightlyStepTests.createStep(repository.directory, npm).runAsync([commit, NightlyStepTests.REGISTRY]);

    Assert.isFalse(result.isSuccessful);
    Assert.areEqual("@noldova/a's nightly version, next, is not a version.", result.message);
  }

  @TestData("")
  @TestData("0000000000000000000000000000000000000000")
  @TestData("0000000000000000000000000000000000000000 https://registry.example/ more")
  @TestMethod
  public async failsForAnyNumberOfValuesButTwoAsync(joinedValues: string): Promise<void> {
    const values = joinedValues.length === 0 ? [] : joinedValues.split(" ");

    const result = await NightlyStepTests.createStep(".", new FakeNpm({})).runAsync(values);

    Assert.isFalse(result.isSuccessful);
    Assert.areEqual("The nightly step takes <commit> <registry>.", result.message);
  }

  @TestData("225059f")
  @TestData("main")
  @TestMethod
  public async failsForACommitThatIsNotAFullIdAsync(commit: string): Promise<void> {
    const result = await NightlyStepTests.createStep(".", new FakeNpm({})).runAsync([commit, NightlyStepTests.REGISTRY]);

    Assert.isFalse(result.isSuccessful);
    Assert.areEqual(`"${commit}" is not a commit: a commit is given by its full id, 40 lowercase hexadecimal digits.`, result.message);
  }

  @TestData("http://registry.example/")
  @TestData("https://registry.example/?_authToken=token-value")
  @TestMethod
  public async failsForARegistryThatIsNotOneAsync(registry: string): Promise<void> {
    const result = await NightlyStepTests.createStep(".", new FakeNpm({})).runAsync([NightlyStepTests.OTHER_COMMIT, registry]);

    Assert.isFalse(result.isSuccessful);
    Assert.areEqual("The registry is not an https URL without credentials, a query or a fragment, such as https://registry.npmjs.org/.", result.message);
  }

  @TestMethod
  public async failsForACommitTheCloneDoesNotHoldAsync(): Promise<void> {
    using repository = GitRepositoryFixture.create();
    NightlyStepTests.commitOnMain(repository, NightlyStepTests.FILES);

    const result = await NightlyStepTests.createStep(repository.directory, new FakeNpm({})).runAsync([NightlyStepTests.OTHER_COMMIT, NightlyStepTests.REGISTRY]);

    Assert.isFalse(result.isSuccessful);
    Assert.areEqual(`Commit ${NightlyStepTests.OTHER_COMMIT} is not in this repository.`, result.message);
  }

  @TestMethod
  public async failsForACloneWithoutMainAsync(): Promise<void> {
    using repository = GitRepositoryFixture.create();
    const commit = repository.commit(NightlyStepTests.FILES);

    const result = await NightlyStepTests.createStep(repository.directory, new FakeNpm({})).runAsync([commit, NightlyStepTests.REGISTRY]);

    Assert.isFalse(result.isSuccessful);
    Assert.areEqual("This clone has no origin/main; fetch it with its history before this step.", result.message);
  }

  @TestMethod
  public async failsForACommitThatIsNotOnMainAsync(): Promise<void> {
    using repository = GitRepositoryFixture.create();
    NightlyStepTests.commitOnMain(repository, NightlyStepTests.FILES);
    const later = repository.commit({ "later.txt": "later" });

    const result = await NightlyStepTests.createStep(repository.directory, new FakeNpm({})).runAsync([later, NightlyStepTests.REGISTRY]);

    Assert.isFalse(result.isSuccessful);
    Assert.areEqual(`Commit ${later} is not on origin/main.`, result.message);
  }

  @TestMethod
  public async failsForACommitWithoutAVersionFileAsync(): Promise<void> {
    using repository = GitRepositoryFixture.create();
    const commit = NightlyStepTests.commitOnMain(repository, { "src/noldova.a/package.json": "{ \"name\": \"@noldova/a\" }" });

    const result = await NightlyStepTests.createStep(repository.directory, new FakeNpm({})).runAsync([commit, NightlyStepTests.REGISTRY]);

    Assert.isFalse(result.isSuccessful);
    Assert.areEqual(`Commit ${commit} has no version.json at its root.`, result.message);
  }

  @TestMethod
  public async failsForAVersionFileThatHoldsANightlyVersionAsync(): Promise<void> {
    using repository = GitRepositoryFixture.create();
    const commit = NightlyStepTests.commitOnMain(repository, { ...NightlyStepTests.FILES, "version.json": "{ \"version\": \"0.0.4-nightly.20261101\" }" });

    const result = await NightlyStepTests.createStep(repository.directory, new FakeNpm({})).runAsync([commit, NightlyStepTests.REGISTRY]);

    Assert.isFalse(result.isSuccessful);
    Assert.areEqual(`version.json at commit ${commit} holds 0.0.4-nightly.20261101, not a release version.`, result.message);
  }

  @TestMethod
  public async failsForAVersionFileThatHoldsNoVersionAsync(): Promise<void> {
    using repository = GitRepositoryFixture.create();
    const commit = NightlyStepTests.commitOnMain(repository, { ...NightlyStepTests.FILES, "version.json": "{ \"version\": \"0.0.4x\" }" });

    const result = await NightlyStepTests.createStep(repository.directory, new FakeNpm({})).runAsync([commit, NightlyStepTests.REGISTRY]);

    Assert.isFalse(result.isSuccessful);
    Assert.isTrue(result.message.startsWith("\"0.0.4x\" is not a version: "), result.message);
  }

  @TestMethod
  public async rejectsAVersionFileThatIsNotJsonAsync(): Promise<void> {
    using repository = GitRepositoryFixture.create();
    const commit = NightlyStepTests.commitOnMain(repository, { ...NightlyStepTests.FILES, "version.json": "{ \"version\"" });

    const exception = await Assert.throwsAsync(() => NightlyStepTests.createStep(repository.directory, new FakeNpm({})).runAsync([commit, NightlyStepTests.REGISTRY]), JsonException);

    Assert.isTrue(exception.path.startsWith("version.json"), exception.path);
  }

  @TestMethod
  public async failsForACommitWithoutAPackageToPublishAsync(): Promise<void> {
    using repository = GitRepositoryFixture.create();
    const commit = NightlyStepTests.commitOnMain(repository, {
      "version.json": "{ \"version\": \"0.0.4\" }",
      "src/noldova.c/package.json": "{ \"name\": \"@noldova/c\", \"private\": true }"
    });

    const result = await NightlyStepTests.createStep(repository.directory, new FakeNpm({})).runAsync([commit, NightlyStepTests.REGISTRY]);

    Assert.isFalse(result.isSuccessful);
    Assert.areEqual(`Commit ${commit} has no package to publish under src/.`, result.message);
  }

  private static createStep(directory: string, npm: FakeNpm, now: Date = NightlyStepTests.NOW): NightlyStep {
    const processRunner = new ProcessRunner();
    const git = new Git(processRunner, directory);

    return new NightlyStep(git, new ArchiveStep(git, new Tar(processRunner)), npm, () => now);
  }

  private static createNpm(nightlyA: string, gitHeadA: string, nightlyB: string, gitHeadB: string): FakeNpm {
    return new FakeNpm({
      "@noldova/a dist-tags.nightly": [FakeNpm.found(`${nightlyA}\n`)],
      [`@noldova/a@${nightlyA} gitHead`]: [FakeNpm.found(`${gitHeadA}\n`)],
      "@noldova/b dist-tags.nightly": [FakeNpm.found(`${nightlyB}\n`)],
      [`@noldova/b@${nightlyB} gitHead`]: [FakeNpm.found(`${gitHeadB}\n`)]
    });
  }

  private static commitOnMain(repository: GitRepositoryFixture, files: Readonly<Record<string, string>>): string {
    const commit = repository.commit(files);
    repository.setMain(commit);

    return commit;
  }
}
