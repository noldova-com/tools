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
import { ArchiveStep, Git, Npm, ProcessResult, ProcessRunner, PublishStep, Tar } from "@noldova/tools.pipelines";

import { GitRepositoryFixture } from "./git-repository.fixture.js";

class FakeNpm extends Npm {
  public readonly calls: string[] = [];
  private readonly views: Map<string, ProcessResult[]>;
  private readonly publishes: ReadonlyMap<string, ProcessResult>;

  public constructor(views: Readonly<Record<string, readonly ProcessResult[]>>, publishes: Readonly<Record<string, ProcessResult>> = {}) {
    super(new ProcessRunner(), ".");

    this.views = new Map(Object.entries(views).map(([key, results]) => [key, [...results]]));
    this.publishes = new Map(Object.entries(publishes));
  }

  public override async viewAsync(specifier: string, field: string, registry: string): Promise<ProcessResult> {
    this.calls.push(`view ${specifier} ${field} ${registry}`);
    const results = this.views.get(`${specifier} ${field}`) ?? [PublishStepTests.NOT_FOUND];

    return (results.length > 1 ? results.shift() : results[0]) ?? PublishStepTests.NOT_FOUND;
  }

  public override async publishAsync(archivePath: string, access: string, registry: string): Promise<ProcessResult> {
    this.calls.push(`publish ${path.basename(archivePath)} ${access} ${registry}`);

    return this.publishes.get(path.basename(archivePath)) ?? new ProcessResult(0, "", "");
  }
}

@TestClass
export class PublishStepTests {
  public static readonly NOT_FOUND: ProcessResult = new ProcessResult(1, "", "npm error code E404\nnpm error 404 Not Found - GET https://registry.example/@noldova%2fa - Not found\n");
  private static readonly REGISTRY: string = "https://registry.example/";
  private static readonly COMMIT: string = "0000000000000000000000000000000000000000";
  private static readonly PACKAGES: Readonly<Record<string, string>> = {
    "src/noldova.a/package.json": "{ \"name\": \"@noldova/a\", \"version\": \"__VERSION__\" }",
    "src/noldova.b/package.json": "{ \"name\": \"@noldova/b\", \"version\": \"__VERSION__\" }"
  };

  @TestMethod
  public namesItselfAndItsValues(): void {
    const step = new PublishStep(PublishStepTests.createArchiveStep("."), new Npm(new ProcessRunner(), "."));

    Assert.areEqual("publish", step.name);
    Assert.areEqual("<folder> <version> <commit> <scope> <registry> <access>", step.usage);
  }

  @TestData("")
  @TestData("archives 0.0.4 0000000000000000000000000000000000000000 @noldova https://registry.example/")
  @TestData("archives 0.0.4 0000000000000000000000000000000000000000 @noldova https://registry.example/ public more")
  @TestMethod
  public async failsForAnyNumberOfValuesButSixAsync(joinedValues: string): Promise<void> {
    const values = joinedValues.length === 0 ? [] : joinedValues.split(" ");

    const result = await PublishStepTests.createStep(".", new FakeNpm({})).runAsync(values);

    Assert.isFalse(result.isSuccessful);
    Assert.areEqual("The publish step takes <folder> <version> <commit> <scope> <registry> <access>.", result.message);
  }

  @TestData("http://registry.example/", "http://registry.example/")
  @TestData("registry.example", "registry.example")
  @TestData("https://ci:token-value@registry.example/", "https://registry.example/")
  @TestMethod
  public async failsForARegistryThatIsNotAnHttpsUrlWithoutCredentialsAsync(registry: string, shown: string): Promise<void> {
    const npm = new FakeNpm({});

    const result = await PublishStepTests.createStep(".", npm).runAsync(["archives", "0.0.4", PublishStepTests.COMMIT, "@noldova", registry, "public"]);

    Assert.isFalse(result.isSuccessful);
    Assert.areEqual(`"${shown}" is not a registry: a registry is an https URL without credentials, such as https://registry.npmjs.org/.`, result.message);
    Assert.areEqual(0, npm.calls.length);
  }

  @TestData("private")
  @TestData("Public")
  @TestMethod
  public async failsForAnAccessThatIsNotPublicOrRestrictedAsync(access: string): Promise<void> {
    const result = await PublishStepTests.createStep(".", new FakeNpm({})).runAsync(["archives", "0.0.4", PublishStepTests.COMMIT, "@noldova", PublishStepTests.REGISTRY, access]);

    Assert.isFalse(result.isSuccessful);
    Assert.areEqual(`"${access}" is not an access: the access is public or restricted.`, result.message);
  }

  @TestMethod
  public async failsWithTheArchiveChecksFailureBeforeAskingTheRegistryAsync(): Promise<void> {
    using repository = GitRepositoryFixture.create();
    const commit = repository.commit(PublishStepTests.PACKAGES);
    const folder = path.join(repository.directory, "missing");
    const npm = new FakeNpm({});

    const result = await PublishStepTests.createStep(repository.directory, npm).runAsync([folder, "0.0.4", commit, "@noldova", PublishStepTests.REGISTRY, "public"]);

    Assert.isFalse(result.isSuccessful);
    Assert.areEqual(`There is no folder ${folder}.`, result.message);
    Assert.areEqual(0, npm.calls.length);
  }

  @TestMethod
  public async publishesEachNewVersionAndWaitsUntilTheRegistryServesItAsync(): Promise<void> {
    using repository = GitRepositoryFixture.create();
    const commit = repository.commit(PublishStepTests.PACKAGES);
    const folder = PublishStepTests.packArchives(repository);
    const npm = new FakeNpm({
      "@noldova/a@0.0.4 dist.integrity": [PublishStepTests.NOT_FOUND, PublishStepTests.found(PublishStepTests.integrityOf(folder, "noldova-a-0.0.4.tgz"))],
      "@noldova/b@0.0.4 dist.integrity": [PublishStepTests.found(""), PublishStepTests.found(PublishStepTests.integrityOf(folder, "noldova-b-0.0.4.tgz"))],
      "@noldova/b dist-tags.latest": [PublishStepTests.found("0.0.3\n")]
    });

    const result = await PublishStepTests.createStep(repository.directory, npm).runAsync([folder, "0.0.4", commit, "@noldova", PublishStepTests.REGISTRY, "public"]);

    Assert.isTrue(result.isSuccessful, result.message);
    Assert.areEqual("@noldova/a@0.0.4 published.\n@noldova/b@0.0.4 published.", result.message);
    Assert.areEqual(
      [
        "view @noldova/a@0.0.4 dist.integrity https://registry.example/",
        "view @noldova/a dist-tags.latest https://registry.example/",
        "view @noldova/b@0.0.4 dist.integrity https://registry.example/",
        "view @noldova/b dist-tags.latest https://registry.example/",
        "publish noldova-a-0.0.4.tgz public https://registry.example/",
        "publish noldova-b-0.0.4.tgz public https://registry.example/",
        "view @noldova/a@0.0.4 dist.integrity https://registry.example/",
        "view @noldova/b@0.0.4 dist.integrity https://registry.example/"
      ].join("\n"),
      npm.calls.join("\n"));
  }

  @TestMethod
  public async skipsAVersionThatIsPublishedFromThisArchiveAsync(): Promise<void> {
    using repository = GitRepositoryFixture.create();
    const commit = repository.commit(PublishStepTests.PACKAGES);
    const folder = PublishStepTests.packArchives(repository);
    const npm = new FakeNpm({
      "@noldova/a@0.0.4 dist.integrity": [PublishStepTests.found(PublishStepTests.integrityOf(folder, "noldova-a-0.0.4.tgz"))],
      "@noldova/b@0.0.4 dist.integrity": [PublishStepTests.NOT_FOUND, PublishStepTests.found(PublishStepTests.integrityOf(folder, "noldova-b-0.0.4.tgz"))],
      "@noldova/b dist-tags.latest": [new ProcessResult(1, "npm error code E404", "")]
    });

    const result = await PublishStepTests.createStep(repository.directory, npm).runAsync([folder, "0.0.4", commit, "@noldova", PublishStepTests.REGISTRY, "restricted"]);

    Assert.isTrue(result.isSuccessful, result.message);
    Assert.areEqual("@noldova/a@0.0.4 is already published from this archive.\n@noldova/b@0.0.4 published.", result.message);
    Assert.areEqual("publish noldova-b-0.0.4.tgz restricted https://registry.example/", npm.calls.filter(t => t.startsWith("publish ")).join("\n"));
  }

  @TestData("0.0.4", "@noldova/b@0.0.4 is not newer than 0.0.4, the package's latest version.")
  @TestData("0.1.0", "@noldova/b@0.0.4 is not newer than 0.1.0, the package's latest version.")
  @TestData("next", "@noldova/b's latest version, next, is not a version.")
  @TestMethod
  public async failsBeforePublishingForEveryVersionTheRegistryRefusesAsync(latest: string, expected: string): Promise<void> {
    using repository = GitRepositoryFixture.create();
    const commit = repository.commit(PublishStepTests.PACKAGES);
    const folder = PublishStepTests.packArchives(repository);
    const npm = new FakeNpm({
      "@noldova/a@0.0.4 dist.integrity": [PublishStepTests.found("sha512-another")],
      "@noldova/b dist-tags.latest": [PublishStepTests.found(latest)]
    });

    const result = await PublishStepTests.createStep(repository.directory, npm).runAsync([folder, "0.0.4", commit, "@noldova", PublishStepTests.REGISTRY, "public"]);

    Assert.isFalse(result.isSuccessful);
    Assert.areEqual(`@noldova/a@0.0.4 is already published from another archive.\n${expected}`, result.message);
    Assert.areEqual(0, npm.calls.filter(t => t.startsWith("publish ")).length);
  }

  @TestMethod
  public async failsWithNpmsMessageWithoutCredentialsWhenTheRegistryCannotBeReadAsync(): Promise<void> {
    using repository = GitRepositoryFixture.create();
    const commit = repository.commit(PublishStepTests.PACKAGES);
    const folder = PublishStepTests.packArchives(repository);
    const failure = new ProcessResult(1, "", "npm error code ECONNREFUSED\nnpm error request to https://ci:token-value@registry.example/@noldova%2fa failed\n");
    const npm = new FakeNpm({ "@noldova/a@0.0.4 dist.integrity": [failure], "@noldova/b dist-tags.latest": [new ProcessResult(1, "", "")] });

    const result = await PublishStepTests.createStep(repository.directory, npm).runAsync([folder, "0.0.4", commit, "@noldova", PublishStepTests.REGISTRY, "public"]);

    Assert.isFalse(result.isSuccessful);
    Assert.areEqual(
      [
        "@noldova/a@0.0.4: npm view exited with code 1: npm error code ECONNREFUSED; npm error request to https://registry.example/@noldova%2fa failed",
        "@noldova/b: npm view exited with code 1."
      ].join("\n"),
      result.message);
    Assert.isFalse(result.message.includes("token-value"));
  }

  @TestMethod
  public async stopsAtAFailedPublishAndStillWaitsForTheVersionsBeforeItAsync(): Promise<void> {
    using repository = GitRepositoryFixture.create();
    const commit = repository.commit(PublishStepTests.PACKAGES);
    const folder = PublishStepTests.packArchives(repository);
    const npm = new FakeNpm(
      { "@noldova/a@0.0.4 dist.integrity": [PublishStepTests.NOT_FOUND, PublishStepTests.found(PublishStepTests.integrityOf(folder, "noldova-a-0.0.4.tgz"))] },
      { "noldova-b-0.0.4.tgz": new ProcessResult(1, "", "npm error code E403\nnpm error 403 Forbidden - PUT https://registry.example/@noldova%2fb\n") });

    const result = await PublishStepTests.createStep(repository.directory, npm).runAsync([folder, "0.0.4", commit, "@noldova", PublishStepTests.REGISTRY, "public"]);

    Assert.isFalse(result.isSuccessful);
    Assert.areEqual(
      "@noldova/a@0.0.4 published.\n@noldova/b@0.0.4: npm publish exited with code 1: npm error code E403; npm error 403 Forbidden - PUT https://registry.example/@noldova%2fb",
      result.message);
  }

  @TestMethod
  public async publishesNothingAfterAFailedPublishAsync(): Promise<void> {
    using repository = GitRepositoryFixture.create();
    const commit = repository.commit(PublishStepTests.PACKAGES);
    const folder = PublishStepTests.packArchives(repository);
    const npm = new FakeNpm({}, { "noldova-a-0.0.4.tgz": new ProcessResult(1, "", "npm error code E403\n") });

    const result = await PublishStepTests.createStep(repository.directory, npm).runAsync([folder, "0.0.4", commit, "@noldova", PublishStepTests.REGISTRY, "public"]);

    Assert.isFalse(result.isSuccessful);
    Assert.areEqual("@noldova/a@0.0.4: npm publish exited with code 1: npm error code E403", result.message);
    Assert.areEqual("publish noldova-a-0.0.4.tgz public https://registry.example/", npm.calls.filter(t => t.startsWith("publish ")).join("\n"));
  }

  @TestMethod
  public async keepsAskingUntilTheRegistryServesTheVersionAsync(): Promise<void> {
    using repository = GitRepositoryFixture.create();
    const commit = repository.commit(PublishStepTests.PACKAGES);
    const folder = PublishStepTests.packArchives(repository);
    const npm = new FakeNpm({
      "@noldova/a@0.0.4 dist.integrity": [
        PublishStepTests.NOT_FOUND,
        PublishStepTests.NOT_FOUND,
        new ProcessResult(1, "", "npm error code ETIMEDOUT\n"),
        PublishStepTests.found(PublishStepTests.integrityOf(folder, "noldova-a-0.0.4.tgz"))
      ],
      "@noldova/b@0.0.4 dist.integrity": [PublishStepTests.NOT_FOUND, PublishStepTests.found(PublishStepTests.integrityOf(folder, "noldova-b-0.0.4.tgz"))]
    });

    const result = await PublishStepTests.createStep(repository.directory, npm, 60_000).runAsync([folder, "0.0.4", commit, "@noldova", PublishStepTests.REGISTRY, "public"]);

    Assert.isTrue(result.isSuccessful, result.message);
    Assert.areEqual(4, npm.calls.filter(t => t.startsWith("view @noldova/a@0.0.4 ")).length);
  }

  @TestMethod
  public async failsForAVersionTheRegistryDoesNotServeInTimeAsync(): Promise<void> {
    using repository = GitRepositoryFixture.create();
    const commit = repository.commit(PublishStepTests.PACKAGES);
    const folder = PublishStepTests.packArchives(repository);
    const npm = new FakeNpm({ "@noldova/b@0.0.4 dist.integrity": [PublishStepTests.NOT_FOUND, PublishStepTests.found("sha512-another")] });

    const result = await PublishStepTests.createStep(repository.directory, npm).runAsync([folder, "0.0.4", commit, "@noldova", PublishStepTests.REGISTRY, "public"]);

    Assert.isFalse(result.isSuccessful);
    Assert.areEqual(
      "@noldova/a@0.0.4 was published, but the registry did not serve it within 0 seconds.\n@noldova/b@0.0.4 is already published from another archive.",
      result.message);
  }

  private static createStep(directory: string, npm: Npm, waitMilliseconds: number = 0): PublishStep {
    return new PublishStep(PublishStepTests.createArchiveStep(directory), npm, waitMilliseconds, 1);
  }

  private static createArchiveStep(directory: string): ArchiveStep {
    const processRunner = new ProcessRunner();

    return new ArchiveStep(new Git(processRunner, directory), new Tar(processRunner));
  }

  private static packArchives(repository: GitRepositoryFixture): string {
    repository.pack("archives/noldova-a-0.0.4.tgz", { "package/package.json": "{ \"name\": \"@noldova/a\", \"version\": \"0.0.4\" }" });
    repository.pack("archives/noldova-b-0.0.4.tgz", { "package/package.json": "{ \"name\": \"@noldova/b\", \"version\": \"0.0.4\" }" });

    return path.join(repository.directory, "archives");
  }

  private static integrityOf(folder: string, archiveName: string): string {
    return `sha512-${crypto.createHash("sha512").update(fs.readFileSync(path.join(folder, archiveName))).digest("base64")}\n`;
  }

  private static found(output: string): ProcessResult {
    return new ProcessResult(0, output, "");
  }
}
