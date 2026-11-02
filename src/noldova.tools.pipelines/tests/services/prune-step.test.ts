/**
 * @license
 * Copyright (c) Noldova.
 *
 * This source code is licensed under the license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { Assert, TestClass, TestData, TestMethod } from "@noldova/context.testing";
import { ArchiveStep, Git, type IRegistryHost, ProcessRunner, PruneStep, StepResult, Tar } from "@noldova/tools.pipelines";

import { GitRepositoryFixture } from "./git-repository.fixture.js";

class FakeRegistryHost implements IRegistryHost {
  private readonly versions: Readonly<Record<string, readonly string[] | StepResult>>;
  private readonly deletes: Readonly<Record<string, boolean | StepResult>>;
  private readonly rejections: Readonly<Record<string, unknown>>;

  public readonly registry: string;
  public readonly calls: string[] = [];

  public constructor(versions: Readonly<Record<string, readonly string[] | StepResult>>, deletes: Readonly<Record<string, boolean | StepResult>> = {}, rejections: Readonly<Record<string, unknown>> = {}, registry: string = "https://npm.pkg.github.com/") {
    this.versions = versions;
    this.deletes = deletes;
    this.rejections = rejections;
    this.registry = registry;
  }

  public async readVersionsAsync(packageName: string): Promise<readonly string[] | StepResult> {
    this.calls.push(`read ${packageName}`);
    return this.versions[packageName] ?? [];
  }

  public async deleteVersionAsync(packageName: string, version: string): Promise<boolean | StepResult> {
    this.calls.push(`delete ${packageName}@${version}`);
    const rejection = this.rejections[`${packageName}@${version}`];
    if (rejection !== undefined)
      return await Promise.reject(rejection as Error);

    return this.deletes[`${packageName}@${version}`] ?? true;
  }
}

@TestClass
export class PruneStepTests {
  private static readonly REGISTRY: string = "https://npm.pkg.github.com/";
  private static readonly COMMIT: string = "225059f4c1e6a3b2d8f7e9a0b1c2d3e4f5a6b7c8";
  private static readonly FILES: Readonly<Record<string, string>> = {
    "src/noldova.a/package.json": "{ \"name\": \"@noldova/a\", \"version\": \"__VERSION__\" }",
    "src/noldova.b/package.json": "{ \"name\": \"@noldova/b\", \"version\": \"__VERSION__\" }"
  };

  @TestMethod
  public namesItselfAndItsValues(): void {
    const step = PruneStepTests.createStep(".", new FakeRegistryHost({}));

    Assert.areEqual("prune", step.name);
    Assert.areEqual("<version> <commit> <scope> <registry> <keep-versions>", step.usage);
  }

  @TestData("", "The prune step takes <version> <commit> <scope> <registry> <keep-versions>.")
  @TestData("0.0.4 225059f4c1e6a3b2d8f7e9a0b1c2d3e4f5a6b7c8 @noldova https://npm.pkg.github.com/", "The prune step takes <version> <commit> <scope> <registry> <keep-versions>.")
  @TestData("0.0.4 225059f4c1e6a3b2d8f7e9a0b1c2d3e4f5a6b7c8 @noldova https://npm.pkg.github.com/ 5 more", "The prune step takes <version> <commit> <scope> <registry> <keep-versions>.")
  @TestData("1.4 225059f4c1e6a3b2d8f7e9a0b1c2d3e4f5a6b7c8 @noldova https://npm.pkg.github.com/ 5", "\"1.4\" is not a version: a version is major.minor.patch, each a whole number without a leading zero, such as 1.4.0, or a nightly version, major.minor.patch-nightly.YYYYMMDD, such as 1.4.1-nightly.20261101.")
  @TestData("0.0.5-nightly.20261102 225059f4c1e6a3b2d8f7e9a0b1c2d3e4f5a6b7c8 @noldova https://npm.pkg.github.com/ 5", "0.0.5-nightly.20261102 is a nightly version; the prune step runs after a release, with its version.")
  @TestData("0.0.4 225059f @noldova https://npm.pkg.github.com/ 5", "\"225059f\" is not a commit: a commit is given by its full id, 40 lowercase hexadecimal digits.")
  @TestData("0.0.4 225059f4c1e6a3b2d8f7e9a0b1c2d3e4f5a6b7c8 noldova https://npm.pkg.github.com/ 5", "\"noldova\" is not a scope: a scope is @ and a lowercase name, such as @noldova.")
  @TestData("0.0.4 225059f4c1e6a3b2d8f7e9a0b1c2d3e4f5a6b7c8 @noldova http://npm.pkg.github.com/ 5", "The registry is not an https URL without credentials, a query or a fragment, such as https://registry.npmjs.org/.")
  @TestData("0.0.4 225059f4c1e6a3b2d8f7e9a0b1c2d3e4f5a6b7c8 @noldova https://registry.npmjs.org/ 5", "The prune step never deletes a version on npm's registry, https://registry.npmjs.org/.")
  @TestData("0.0.4 225059f4c1e6a3b2d8f7e9a0b1c2d3e4f5a6b7c8 @noldova https://REGISTRY.npmjs.org/path 5", "The prune step never deletes a version on npm's registry, https://REGISTRY.npmjs.org/path.")
  @TestData("0.0.4 225059f4c1e6a3b2d8f7e9a0b1c2d3e4f5a6b7c8 @noldova https://registry.example.com/ 5", "The prune step deletes versions only on https://npm.pkg.github.com/, not on https://registry.example.com/.")
  @TestData("0.0.4 225059f4c1e6a3b2d8f7e9a0b1c2d3e4f5a6b7c8 @noldova https://npm.pkg.github.com/ 0", "\"0\" is not a number of versions to keep: it is a whole number above 0 without a leading zero, such as 5.")
  @TestData("0.0.4 225059f4c1e6a3b2d8f7e9a0b1c2d3e4f5a6b7c8 @noldova https://npm.pkg.github.com/ 05", "\"05\" is not a number of versions to keep: it is a whole number above 0 without a leading zero, such as 5.")
  @TestData("0.0.4 225059f4c1e6a3b2d8f7e9a0b1c2d3e4f5a6b7c8 @noldova https://npm.pkg.github.com/ -1", "\"-1\" is not a number of versions to keep: it is a whole number above 0 without a leading zero, such as 5.")
  @TestData("0.0.4 225059f4c1e6a3b2d8f7e9a0b1c2d3e4f5a6b7c8 @noldova https://npm.pkg.github.com/ five", "\"five\" is not a number of versions to keep: it is a whole number above 0 without a leading zero, such as 5.")
  @TestData("0.0.4 225059f4c1e6a3b2d8f7e9a0b1c2d3e4f5a6b7c8 @noldova https://npm.pkg.github.com/ 9007199254740993", "\"9007199254740993\" is not a number of versions to keep: it is a whole number above 0 without a leading zero, such as 5.")
  @TestMethod
  public async failsForWrongValuesWithoutAskingTheRegistryAsync(joinedValues: string, expected: string): Promise<void> {
    const host = new FakeRegistryHost({});
    const values = joinedValues.length === 0 ? [] : joinedValues.split(" ");

    const result = await PruneStepTests.createStep(".", host).runAsync(values);

    Assert.isFalse(result.isSuccessful);
    Assert.areEqual(expected, result.message);
    Assert.areEqual(0, host.calls.length);
  }

  @TestMethod
  public async refusesNpmsRegistryEvenWhenTheHostNamesItAsync(): Promise<void> {
    const host = new FakeRegistryHost({}, {}, {}, "https://registry.npmjs.org/");

    const result = await PruneStepTests.createStep(".", host).runAsync(["0.0.4", PruneStepTests.COMMIT, "@noldova", "https://registry.npmjs.org/", "5"]);

    Assert.isFalse(result.isSuccessful);
    Assert.areEqual("The prune step never deletes a version on npm's registry, https://registry.npmjs.org/.", result.message);
    Assert.areEqual(0, host.calls.length);
  }

  @TestData("https://npm.pkg.github.com/")
  @TestData("https://npm.pkg.github.com")
  @TestMethod
  public async deletesTheOlderReleaseVersionsAfterListingEveryPackageAsync(registry: string): Promise<void> {
    using repository = GitRepositoryFixture.create();
    const commit = repository.commit(PruneStepTests.FILES);
    const host = new FakeRegistryHost({
      "@noldova/a": ["0.0.1", "0.0.4", "0.0.3", "0.0.2", "0.0.5-nightly.20261102", "0.0.04"],
      "@noldova/b": ["0.0.4", "0.0.3"]
    });

    const result = await PruneStepTests.createStep(repository.directory, host).runAsync(["0.0.4", commit, "@noldova", registry, "2"]);

    Assert.isTrue(result.isSuccessful, result.message);
    Assert.areEqual("@noldova/a@0.0.2 deleted.\n@noldova/a@0.0.1 deleted.", result.message);
    Assert.areEqual(
      ["read @noldova/a", "read @noldova/b", "delete @noldova/a@0.0.2", "delete @noldova/a@0.0.1"].join("\n"),
      host.calls.join("\n"));
  }

  @TestMethod
  public async ordersVersionsByTheirPartsNotTheirTextAsync(): Promise<void> {
    using repository = GitRepositoryFixture.create();
    const commit = repository.commit({ "src/noldova.a/package.json": "{ \"name\": \"@noldova/a\" }" });
    const host = new FakeRegistryHost({ "@noldova/a": ["0.0.9", "0.0.11", "0.0.10", "0.1.0", "1.0.0"] });

    const result = await PruneStepTests.createStep(repository.directory, host).runAsync(["1.0.0", commit, "@noldova", PruneStepTests.REGISTRY, "2"]);

    Assert.isTrue(result.isSuccessful, result.message);
    Assert.areEqual("@noldova/a@0.0.11 deleted.\n@noldova/a@0.0.10 deleted.\n@noldova/a@0.0.9 deleted.", result.message);
  }

  @TestMethod
  public async deletesNothingWhenNoPackageHasMoreVersionsThanItKeepsAsync(): Promise<void> {
    using repository = GitRepositoryFixture.create();
    const commit = repository.commit(PruneStepTests.FILES);
    const host = new FakeRegistryHost({ "@noldova/a": ["0.0.4", "0.0.3", "0.0.5-nightly.20261102"], "@noldova/b": ["0.0.4"] });

    const result = await PruneStepTests.createStep(repository.directory, host).runAsync(["0.0.4", commit, "@noldova", PruneStepTests.REGISTRY, "2"]);

    Assert.isTrue(result.isSuccessful, result.message);
    Assert.areEqual("No package has more than 2 release versions on the registry, so nothing is deleted.", result.message);
    Assert.areEqual("read @noldova/a\nread @noldova/b", host.calls.join("\n"));
  }

  @TestMethod
  public async deletesNothingInAnyPackageWhenTheVersionIsNotTheNewestOfOneAsync(): Promise<void> {
    using repository = GitRepositoryFixture.create();
    const commit = repository.commit(PruneStepTests.FILES);
    const host = new FakeRegistryHost({
      "@noldova/a": ["0.0.4", "0.0.3", "0.0.2", "0.0.1"],
      "@noldova/b": ["0.0.5", "0.0.4", "0.0.3", "0.0.2"]
    });

    const result = await PruneStepTests.createStep(repository.directory, host).runAsync(["0.0.4", commit, "@noldova", PruneStepTests.REGISTRY, "1"]);

    Assert.isFalse(result.isSuccessful);
    Assert.areEqual("@noldova/b's newest release version on the registry is 0.0.5, not 0.0.4, so nothing is deleted.", result.message);
    Assert.areEqual("read @noldova/a\nread @noldova/b", host.calls.join("\n"));
  }

  @TestMethod
  public async failsWithALineForEveryPackageItCannotPruneAsync(): Promise<void> {
    using repository = GitRepositoryFixture.create();
    const commit = repository.commit({ ...PruneStepTests.FILES, "src/noldova.c/package.json": "{ \"name\": \"@noldova/c\" }" });
    const host = new FakeRegistryHost({
      "@noldova/a": StepResult.failed("GitHub answered GET orgs/noldova/packages/npm/a/versions?per_page=100&page=1 with 403: Forbidden"),
      "@noldova/b": ["0.0.5-nightly.20261102"],
      "@noldova/c": ["0.0.4", "0.0.3"]
    });

    const result = await PruneStepTests.createStep(repository.directory, host).runAsync(["0.0.4", commit, "@noldova", PruneStepTests.REGISTRY, "1"]);

    Assert.isFalse(result.isSuccessful);
    Assert.areEqual(
      [
        "GitHub answered GET orgs/noldova/packages/npm/a/versions?per_page=100&page=1 with 403: Forbidden",
        "@noldova/b has no release version on the registry, not even 0.0.4, so nothing is deleted."
      ].join("\n"),
      result.message);
    Assert.areEqual("read @noldova/a\nread @noldova/b\nread @noldova/c", host.calls.join("\n"));
  }

  @TestMethod
  public async succeedsForAVersionAnotherRunDeletedFirstAsync(): Promise<void> {
    using repository = GitRepositoryFixture.create();
    const commit = repository.commit(PruneStepTests.FILES);
    const host = new FakeRegistryHost({ "@noldova/a": ["0.0.4", "0.0.3"], "@noldova/b": ["0.0.4", "0.0.3"] }, { "@noldova/a@0.0.3": false });

    const result = await PruneStepTests.createStep(repository.directory, host).runAsync(["0.0.4", commit, "@noldova", PruneStepTests.REGISTRY, "1"]);

    Assert.isTrue(result.isSuccessful, result.message);
    Assert.areEqual("@noldova/a@0.0.3 was already deleted.\n@noldova/b@0.0.3 deleted.", result.message);
  }

  @TestMethod
  public async stopsAtTheFirstDeleteThatFailsAsync(): Promise<void> {
    using repository = GitRepositoryFixture.create();
    const commit = repository.commit(PruneStepTests.FILES);
    const failure = StepResult.failed("GitHub answered DELETE orgs/noldova/packages/npm/a/versions/2 with 400: Publicly visible package versions with more than 5000 downloads cannot be deleted.");
    const host = new FakeRegistryHost({ "@noldova/a": ["0.0.4", "0.0.3", "0.0.2"], "@noldova/b": ["0.0.4", "0.0.3"] }, { "@noldova/a@0.0.2": failure });

    const result = await PruneStepTests.createStep(repository.directory, host).runAsync(["0.0.4", commit, "@noldova", PruneStepTests.REGISTRY, "1"]);

    Assert.isFalse(result.isSuccessful);
    Assert.areEqual(`@noldova/a@0.0.3 deleted.\n${failure.message}`, result.message);
    Assert.areEqual(
      ["read @noldova/a", "read @noldova/b", "delete @noldova/a@0.0.3", "delete @noldova/a@0.0.2"].join("\n"),
      host.calls.join("\n"));
  }

  @TestMethod
  public async failsForACommitTheCloneDoesNotHoldAsync(): Promise<void> {
    using repository = GitRepositoryFixture.create();
    repository.commit(PruneStepTests.FILES);
    const host = new FakeRegistryHost({});

    const result = await PruneStepTests.createStep(repository.directory, host).runAsync(["0.0.4", PruneStepTests.COMMIT, "@noldova", PruneStepTests.REGISTRY, "1"]);

    Assert.isFalse(result.isSuccessful);
    Assert.areEqual(`Commit ${PruneStepTests.COMMIT} is not in this repository.`, result.message);
    Assert.areEqual(0, host.calls.length);
  }

  @TestMethod
  public async failsForACommitWithoutAPackageToPublishAsync(): Promise<void> {
    using repository = GitRepositoryFixture.create();
    const commit = repository.commit({ "src/noldova.a/package.json": "{ \"name\": \"@noldova/a\", \"private\": true }" });
    const host = new FakeRegistryHost({});

    const result = await PruneStepTests.createStep(repository.directory, host).runAsync(["0.0.4", commit, "@noldova", PruneStepTests.REGISTRY, "1"]);

    Assert.isFalse(result.isSuccessful);
    Assert.areEqual(`Commit ${commit} has no package to publish under src/.`, result.message);
    Assert.areEqual(0, host.calls.length);
  }

  @TestMethod
  public async failsForAPackageOutsideTheScopeWithoutAskingTheRegistryAsync(): Promise<void> {
    using repository = GitRepositoryFixture.create();
    const commit = repository.commit({ ...PruneStepTests.FILES, "src/other.c/package.json": "{ \"name\": \"@other/c\" }" });
    const host = new FakeRegistryHost({});

    const result = await PruneStepTests.createStep(repository.directory, host).runAsync(["0.0.4", commit, "@noldova", PruneStepTests.REGISTRY, "1"]);

    Assert.isFalse(result.isSuccessful);
    Assert.areEqual("@other/c is outside the scope @noldova.", result.message);
    Assert.areEqual(0, host.calls.length);
  }

  @TestMethod
  public async keepsTheDeletedLinesWhenADeleteRejectsAsync(): Promise<void> {
    using repository = GitRepositoryFixture.create();
    const commit = repository.commit(PruneStepTests.FILES);
    const host = new FakeRegistryHost({ "@noldova/a": ["0.0.4", "0.0.3", "0.0.2"], "@noldova/b": ["0.0.4", "0.0.3"] }, {}, { "@noldova/a@0.0.2": new TypeError("fetch failed") });

    const result = await PruneStepTests.createStep(repository.directory, host).runAsync(["0.0.4", commit, "@noldova", PruneStepTests.REGISTRY, "1"]);

    Assert.isFalse(result.isSuccessful);
    Assert.areEqual("@noldova/a@0.0.3 deleted.\nDeleting @noldova/a@0.0.2 failed: fetch failed", result.message);
    Assert.areEqual(
      ["read @noldova/a", "read @noldova/b", "delete @noldova/a@0.0.3", "delete @noldova/a@0.0.2"].join("\n"),
      host.calls.join("\n"));
  }

  @TestMethod
  public async passesOnADeleteThatRejectsWithSomethingElseAsync(): Promise<void> {
    using repository = GitRepositoryFixture.create();
    const commit = repository.commit(PruneStepTests.FILES);
    const host = new FakeRegistryHost({ "@noldova/a": ["0.0.4", "0.0.3"], "@noldova/b": ["0.0.4"] }, {}, { "@noldova/a@0.0.3": "not an error" });

    const rejection = await PruneStepTests.createStep(repository.directory, host).runAsync(["0.0.4", commit, "@noldova", PruneStepTests.REGISTRY, "1"]).then(() => null, (error: unknown) => error);

    Assert.areEqual("not an error", rejection);
  }

  private static createStep(directory: string, host: IRegistryHost): PruneStep {
    const processRunner = new ProcessRunner();
    const git = new Git(processRunner, directory);

    return new PruneStep(git, new ArchiveStep(git, new Tar(processRunner)), host);
  }
}
