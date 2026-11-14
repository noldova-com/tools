/**
 * @license
 * Copyright (c) Noldova.
 *
 * This source code is licensed under the license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { JsonException } from "@noldova/context.json";
import { Assert, TestClass, TestData, TestMethod } from "@noldova/context.testing";
import { ArchiveStep, Git, Npm, ProcessRunner, PruneStep, StepResult, Tar } from "@noldova/tools.pipelines";
import { GitHubPackages } from "@noldova/tools.pipelines.github";

import { GitHubApiAnswer, GitHubApiFixture } from "./github-api.fixture.js";
import { GitCloneFixture } from "./git-clone.fixture.js";

@TestClass
export class GitHubPackagesTests {
  private static readonly PACKAGE: string = "@noldova-com/tools.pipelines";
  private static readonly VERSIONS: string = "/orgs/noldova-com/packages/npm/tools.pipelines/versions";
  private static readonly FIRST_PAGE: string = `GET ${GitHubPackagesTests.VERSIONS}?per_page=100&page=1`;
  private static readonly SECOND_PAGE: string = `GET ${GitHubPackagesTests.VERSIONS}?per_page=100&page=2`;
  private static readonly TOKEN: string = "test-token-value";
  private static readonly REPOSITORIES_TOKEN: string = "test-repositories-token-value";
  private static readonly REPOSITORIES_PAGE: string = "GET /installation/repositories?per_page=100&page=1";
  private static readonly ONE_REPOSITORY: GitHubApiAnswer = GitHubApiAnswer.json(200, { total_count: 1, repositories: [{ full_name: "noldova-com/one", default_branch: "main", archived: false }] });
  private static readonly SOURCE: string = "GET /repos/noldova-com/source";
  private static readonly PRIVATE_SOURCE: GitHubApiAnswer = GitHubApiAnswer.json(200, { full_name: "noldova-com/source", private: true });
  private static readonly NO_REPOSITORIES: GitHubApiAnswer = GitHubApiAnswer.json(200, { total_count: 0, repositories: [] });

  @TestMethod
  public namesItsRegistry(): void {
    Assert.areEqual("https://npm.pkg.github.com/", new GitHubPackages({}).registry);
  }

  @TestMethod
  public async readsEveryVersionAPageAtATimeAsync(): Promise<void> {
    const firstPage = Array.from({ length: 100 }, (_, index) => ({ id: index + 1, name: `0.0.${index + 1}` }));
    await using api = await GitHubApiFixture.startAsync({
      [GitHubPackagesTests.SOURCE]: GitHubPackagesTests.PRIVATE_SOURCE,
      [GitHubPackagesTests.FIRST_PAGE]: GitHubApiAnswer.json(200, firstPage),
      [GitHubPackagesTests.SECOND_PAGE]: GitHubApiAnswer.json(200, [{ id: 101, name: "0.0.101-nightly.20261102" }])
    });

    const versions = await GitHubPackagesTests.createPackages(api).readVersionsAsync(GitHubPackagesTests.PACKAGE);

    Assert.areEqual([...firstPage.map(t => t.name), "0.0.101-nightly.20261102"].join(","), GitHubPackagesTests.readVersions(versions).join(","));
    Assert.areEqual(JSON.stringify([GitHubPackagesTests.FIRST_PAGE, GitHubPackagesTests.SECOND_PAGE]), JSON.stringify(api.requests.map(t => `${t.method} ${t.url}`)));
    const request = api.requests[0];
    Assert.areEqual("application/vnd.github+json", request?.headers.accept);
    Assert.areEqual(`Bearer ${GitHubPackagesTests.TOKEN}`, request?.headers.authorization);
    Assert.areEqual("2022-11-28", request?.headers["x-github-api-version"]);
  }

  @TestMethod
  public async readsAnEmptyListAsNoVersionsAsync(): Promise<void> {
    await using api = await GitHubApiFixture.startAsync({ [GitHubPackagesTests.SOURCE]: GitHubPackagesTests.PRIVATE_SOURCE, [GitHubPackagesTests.FIRST_PAGE]: GitHubApiAnswer.json(200, []) });

    const versions = await GitHubPackagesTests.createPackages(api).readVersionsAsync(GitHubPackagesTests.PACKAGE);

    Assert.areEqual(0, GitHubPackagesTests.readVersions(versions).length);
    Assert.areEqual(1, api.requests.length);
  }

  @TestMethod
  public async encodesThePackagesNameInTheRequestAsync(): Promise<void> {
    await using api = await GitHubApiFixture.startAsync({ "GET /orgs/noldova-com/packages/npm/a%20b/versions?per_page=100&page=1": GitHubApiAnswer.json(200, []) });

    const versions = await GitHubPackagesTests.createPackages(api).readVersionsAsync("@noldova-com/a b");

    Assert.areEqual(0, GitHubPackagesTests.readVersions(versions).length);
  }

  @TestData("tools.pipelines")
  @TestData("@noldova-com")
  @TestData("@/tools.pipelines")
  @TestData("@noldova-com/")
  @TestData("@noldova-com/tools/pipelines")
  @TestMethod
  public async failsForANameWithoutAnOwnerWithoutARequestAsync(packageName: string): Promise<void> {
    await using api = await GitHubApiFixture.startAsync({ [GitHubPackagesTests.SOURCE]: GitHubPackagesTests.PRIVATE_SOURCE });
    const packages = GitHubPackagesTests.createPackages(api);
    const expected = `${packageName} has no scope; a package on GitHub Packages is named @<owner>/<name>.`;

    Assert.areEqual(expected, GitHubPackagesTests.readFailure(await packages.readVersionsAsync(packageName)));
    Assert.areEqual(expected, GitHubPackagesTests.readFailure(await packages.deleteVersionAsync(packageName, "0.0.1")));
    Assert.areEqual(0, api.requests.length);
  }

  @TestData("GITHUB_API_URL")
  @TestData("GITHUB_TOKEN")
  @TestMethod
  public async failsNamingAMissingOrEmptyVariableWithoutARequestAsync(name: string): Promise<void> {
    await using api = await GitHubApiFixture.startAsync({ [GitHubPackagesTests.SOURCE]: GitHubPackagesTests.PRIVATE_SOURCE });
    const environment = { GITHUB_API_URL: api.url, GITHUB_TOKEN: GitHubPackagesTests.TOKEN };
    const missing = { ...environment, [name]: undefined };
    const empty = { ...environment, [name]: "" };
    const expected = `The environment variable ${name} is not set; the prune step needs it to reach GitHub.`;

    Assert.areEqual(expected, GitHubPackagesTests.readFailure(await new GitHubPackages(missing).readVersionsAsync(GitHubPackagesTests.PACKAGE)));
    Assert.areEqual(expected, GitHubPackagesTests.readFailure(await new GitHubPackages(empty).deleteVersionAsync(GitHubPackagesTests.PACKAGE, "0.0.1")));
    Assert.areEqual(0, api.requests.length);
  }

  @TestMethod
  public async failsWithTheRequestTheStatusAndGitHubsMessageAsync(): Promise<void> {
    await using api = await GitHubApiFixture.startAsync({
      [GitHubPackagesTests.SOURCE]: GitHubPackagesTests.PRIVATE_SOURCE,
      [GitHubPackagesTests.FIRST_PAGE]: GitHubApiAnswer.json(200, Array.from({ length: 100 }, (_, index) => ({ id: index + 1, name: `0.0.${index + 1}` }))),
      [GitHubPackagesTests.SECOND_PAGE]: GitHubApiAnswer.json(403, { message: "Resource not accessible by integration" })
    });

    const result = await GitHubPackagesTests.createPackages(api).readVersionsAsync(GitHubPackagesTests.PACKAGE);

    const failure = GitHubPackagesTests.readFailure(result);
    Assert.areEqual("GitHub answered GET orgs/noldova-com/packages/npm/tools.pipelines/versions?per_page=100&page=2 with 403: Resource not accessible by integration", failure);
    Assert.isFalse(failure.includes(GitHubPackagesTests.TOKEN));
  }

  @TestMethod
  public async keepsWhyAnAnswerIsNotJsonAsync(): Promise<void> {
    await using api = await GitHubApiFixture.startAsync({ [GitHubPackagesTests.SOURCE]: GitHubPackagesTests.PRIVATE_SOURCE, [GitHubPackagesTests.FIRST_PAGE]: new GitHubApiAnswer(200, "not JSON") });

    const exception = await Assert.throwsAsync(() => GitHubPackagesTests.createPackages(api).readVersionsAsync(GitHubPackagesTests.PACKAGE), JsonException);

    Assert.isTrue(exception.cause instanceof SyntaxError);
  }

  @TestData("not JSON")
  @TestData("{ \"id\": 1, \"name\": \"0.0.1\" }")
  @TestData("[1]")
  @TestData("[{ \"id\": \"1\", \"name\": \"0.0.1\" }]")
  @TestData("[{ \"id\": 1.5, \"name\": \"0.0.1\" }]")
  @TestData("[{ \"id\": 1 }]")
  @TestMethod
  public async rejectsWithJsonExceptionForAnAnswerThatIsNotAListOfVersionsAsync(body: string): Promise<void> {
    await using api = await GitHubApiFixture.startAsync({ [GitHubPackagesTests.SOURCE]: GitHubPackagesTests.PRIVATE_SOURCE, [GitHubPackagesTests.FIRST_PAGE]: new GitHubApiAnswer(200, body) });

    await Assert.throwsAsync(() => GitHubPackagesTests.createPackages(api).readVersionsAsync(GitHubPackagesTests.PACKAGE), JsonException);
  }

  @TestMethod
  public async deletesAVersionByTheIdItsListGaveAsync(): Promise<void> {
    await using api = await GitHubApiFixture.startAsync({
      [GitHubPackagesTests.SOURCE]: GitHubPackagesTests.PRIVATE_SOURCE,
      [GitHubPackagesTests.FIRST_PAGE]: GitHubApiAnswer.json(200, [{ id: 12, name: "0.0.2" }, { id: 11, name: "0.0.1" }]),
      [`DELETE ${GitHubPackagesTests.VERSIONS}/11`]: new GitHubApiAnswer(204, "", "")
    });
    const packages = GitHubPackagesTests.createPackages(api);

    await packages.readVersionsAsync(GitHubPackagesTests.PACKAGE);
    const deleted = await packages.deleteVersionAsync(GitHubPackagesTests.PACKAGE, "0.0.1");
    const deletedAgain = await packages.deleteVersionAsync(GitHubPackagesTests.PACKAGE, "0.0.1");

    Assert.areEqual(true, deleted);
    Assert.areEqual(false, deletedAgain);
    Assert.areEqual(JSON.stringify([GitHubPackagesTests.FIRST_PAGE, `DELETE ${GitHubPackagesTests.VERSIONS}/11`]), JSON.stringify(api.requests.map(t => `${t.method} ${t.url}`)));
    Assert.areEqual(`Bearer ${GitHubPackagesTests.TOKEN}`, api.requests[1]?.headers.authorization);
  }

  @TestMethod
  public async listsThePackageFirstWhenItHasNotYetAsync(): Promise<void> {
    await using api = await GitHubApiFixture.startAsync({
      [GitHubPackagesTests.SOURCE]: GitHubPackagesTests.PRIVATE_SOURCE,
      [GitHubPackagesTests.FIRST_PAGE]: GitHubApiAnswer.json(200, [{ id: 11, name: "0.0.1" }]),
      [`DELETE ${GitHubPackagesTests.VERSIONS}/11`]: new GitHubApiAnswer(204, "", "")
    });

    const deleted = await GitHubPackagesTests.createPackages(api).deleteVersionAsync(GitHubPackagesTests.PACKAGE, "0.0.1");

    Assert.areEqual(true, deleted);
    Assert.areEqual(JSON.stringify(["GET", "DELETE"]), JSON.stringify(api.requests.map(t => t.method)));
  }

  @TestMethod
  public async answersFalseWithoutARequestForAVersionTheListDoesNotHaveAsync(): Promise<void> {
    await using api = await GitHubApiFixture.startAsync({ [GitHubPackagesTests.SOURCE]: GitHubPackagesTests.PRIVATE_SOURCE, [GitHubPackagesTests.FIRST_PAGE]: GitHubApiAnswer.json(200, [{ id: 12, name: "0.0.2" }]) });

    const deleted = await GitHubPackagesTests.createPackages(api).deleteVersionAsync(GitHubPackagesTests.PACKAGE, "0.0.1");

    Assert.areEqual(false, deleted);
    Assert.areEqual(JSON.stringify(["GET"]), JSON.stringify(api.requests.map(t => t.method)));
  }

  @TestMethod
  public async answersFalseWhenGitHubNoLongerHasTheVersionAsync(): Promise<void> {
    await using api = await GitHubApiFixture.startAsync({
      [GitHubPackagesTests.SOURCE]: GitHubPackagesTests.PRIVATE_SOURCE,
      [GitHubPackagesTests.FIRST_PAGE]: [GitHubApiAnswer.json(200, [{ id: 11, name: "0.0.1" }]), GitHubApiAnswer.json(200, [{ id: 12, name: "0.0.2" }])]
    });

    const deleted = await GitHubPackagesTests.createPackages(api).deleteVersionAsync(GitHubPackagesTests.PACKAGE, "0.0.1");

    Assert.areEqual(false, deleted);
    Assert.areEqual(JSON.stringify(["GET", "DELETE", "GET"]), JSON.stringify(api.requests.map(t => t.method)));
  }

  @TestMethod
  public async failsWhenGitHubAnswers404ButStillListsTheVersionAsync(): Promise<void> {
    await using api = await GitHubApiFixture.startAsync({ [GitHubPackagesTests.SOURCE]: GitHubPackagesTests.PRIVATE_SOURCE, [GitHubPackagesTests.FIRST_PAGE]: GitHubApiAnswer.json(200, [{ id: 11, name: "0.0.1" }]) });

    const deleted = await GitHubPackagesTests.createPackages(api).deleteVersionAsync(GitHubPackagesTests.PACKAGE, "0.0.1");

    Assert.areEqual(
      "GitHub answered 404 to deleting @noldova-com/tools.pipelines@0.0.1 but still lists it, so it is not deleted; the token may not be allowed to delete it.",
      GitHubPackagesTests.readFailure(deleted));
    Assert.areEqual(JSON.stringify(["GET", "DELETE", "GET"]), JSON.stringify(api.requests.map(t => t.method)));
  }

  @TestMethod
  public async failsWithTheListsAnswerWhenListingAfterA404FailsAsync(): Promise<void> {
    await using api = await GitHubApiFixture.startAsync({
      [GitHubPackagesTests.SOURCE]: GitHubPackagesTests.PRIVATE_SOURCE,
      [GitHubPackagesTests.FIRST_PAGE]: [GitHubApiAnswer.json(200, [{ id: 11, name: "0.0.1" }]), GitHubApiAnswer.json(403, { message: "Forbidden" })]
    });

    const deleted = await GitHubPackagesTests.createPackages(api).deleteVersionAsync(GitHubPackagesTests.PACKAGE, "0.0.1");

    Assert.areEqual(
      "GitHub answered GET orgs/noldova-com/packages/npm/tools.pipelines/versions?per_page=100&page=1 with 403: Forbidden",
      GitHubPackagesTests.readFailure(deleted));
  }

  @TestMethod
  public async failsWithGitHubsAnswerWhenItRefusesTheDeleteAsync(): Promise<void> {
    await using api = await GitHubApiFixture.startAsync({
      [GitHubPackagesTests.SOURCE]: GitHubPackagesTests.PRIVATE_SOURCE,
      [GitHubPackagesTests.FIRST_PAGE]: GitHubApiAnswer.json(200, [{ id: 11, name: "0.0.1" }]),
      [`DELETE ${GitHubPackagesTests.VERSIONS}/11`]: GitHubApiAnswer.json(400, { message: "You cannot delete the last version of a package." })
    });

    const deleted = await GitHubPackagesTests.createPackages(api).deleteVersionAsync(GitHubPackagesTests.PACKAGE, "0.0.1");

    Assert.areEqual(
      "GitHub answered DELETE orgs/noldova-com/packages/npm/tools.pipelines/versions/11 with 400: You cannot delete the last version of a package.",
      GitHubPackagesTests.readFailure(deleted));
  }

  @TestData(true)
  @TestData(false)
  @TestMethod
  public async reportsARepeatedDeleteAnswered404AsAlreadyDeletedAsync(isTimeout: boolean): Promise<void> {
    const waits: number[] = [];
    await using api = await GitHubApiFixture.startAsync({
      [GitHubPackagesTests.SOURCE]: GitHubPackagesTests.PRIVATE_SOURCE,
      [GitHubPackagesTests.FIRST_PAGE]: [GitHubApiAnswer.json(200, [{ id: 11, name: "0.0.1" }]), GitHubApiAnswer.json(200, [])],
      [`DELETE ${GitHubPackagesTests.VERSIONS}/11`]: [isTimeout ? GitHubApiAnswer.HELD : GitHubApiAnswer.json(502, { message: "Bad gateway" }), GitHubApiAnswer.json(404, { message: "Not Found" })]
    });

    const deleted = await GitHubPackagesTests.createPackages(api, waits).deleteVersionAsync(GitHubPackagesTests.PACKAGE, "0.0.1");

    Assert.areEqual(false, deleted);
    Assert.areEqual(JSON.stringify(["GET", "DELETE", "DELETE", "GET"]), JSON.stringify(api.requests.map(t => t.method)));
    Assert.areEqual("5000", waits.join(","));
  }

  @TestMethod
  public async readsThePageAGitHubOutageInterruptedAgainAsync(): Promise<void> {
    const waits: number[] = [];
    await using api = await GitHubApiFixture.startAsync({
      [GitHubPackagesTests.SOURCE]: GitHubPackagesTests.PRIVATE_SOURCE,
      [GitHubPackagesTests.FIRST_PAGE]: [GitHubApiAnswer.json(503, { message: "Unavailable" }), GitHubApiAnswer.json(200, [{ id: 11, name: "0.0.1" }])]
    });

    const versions = await GitHubPackagesTests.createPackages(api, waits).readVersionsAsync(GitHubPackagesTests.PACKAGE);

    Assert.areEqual("0.0.1", GitHubPackagesTests.readVersions(versions).join(","));
    Assert.areEqual("5000", waits.join(","));
  }

  @TestMethod
  public async failsNamingTheRequestWhenListingIsNotAnsweredDeletingNothingAsync(): Promise<void> {
    using clone = GitCloneFixture.create({ "src/noldova.tools.pipelines/package.json": "{ \"name\": \"@noldova-com/tools.pipelines\" }" });
    await using api = await GitHubApiFixture.startAsync({ [GitHubPackagesTests.SOURCE]: GitHubPackagesTests.PRIVATE_SOURCE, [GitHubPackagesTests.FIRST_PAGE]: GitHubApiAnswer.HELD });

    const result = await GitHubPackagesTests.createStep(clone, api).runAsync(["0.0.4", clone.commit, "@noldova-com", "https://npm.pkg.github.com/", "1"]);

    Assert.isFalse(result.isSuccessful);
    Assert.areEqual("GitHub gave no answer to GET orgs/noldova-com/packages/npm/tools.pipelines/versions?per_page=100&page=1: The operation was aborted due to timeout", result.message);
    Assert.areEqual(JSON.stringify(["GET", "GET", "GET"]), JSON.stringify(api.requests.map(t => t.method)));
  }

  @TestMethod
  public async keepsTheDeletedLinesWhenADeleteIsNotAnsweredAsync(): Promise<void> {
    using clone = GitCloneFixture.create({ "src/noldova.tools.pipelines/package.json": "{ \"name\": \"@noldova-com/tools.pipelines\" }" });
    await using api = await GitHubApiFixture.startAsync({
      [GitHubPackagesTests.SOURCE]: GitHubPackagesTests.PRIVATE_SOURCE,
      [GitHubPackagesTests.FIRST_PAGE]: GitHubApiAnswer.json(200, [{ id: 14, name: "0.0.4" }, { id: 13, name: "0.0.3" }, { id: 12, name: "0.0.2" }]),
      [GitHubPackagesTests.REPOSITORIES_PAGE]: GitHubPackagesTests.NO_REPOSITORIES,
      [`DELETE ${GitHubPackagesTests.VERSIONS}/13`]: new GitHubApiAnswer(204, "", ""),
      [`DELETE ${GitHubPackagesTests.VERSIONS}/12`]: GitHubApiAnswer.HELD
    });

    const result = await GitHubPackagesTests.createStep(clone, api).runAsync(["0.0.4", clone.commit, "@noldova-com", "https://npm.pkg.github.com/", "1"]);

    Assert.isFalse(result.isSuccessful);
    Assert.areEqual("@noldova-com/tools.pipelines@0.0.3 deleted.\nGitHub gave no answer to DELETE orgs/noldova-com/packages/npm/tools.pipelines/versions/12: The operation was aborted due to timeout", result.message);
  }

  @TestMethod
  public async failsWithTheListsAnswerWhenListingBeforeADeleteFailsAsync(): Promise<void> {
    await using api = await GitHubApiFixture.startAsync({ [GitHubPackagesTests.SOURCE]: GitHubPackagesTests.PRIVATE_SOURCE });

    const deleted = await GitHubPackagesTests.createPackages(api).deleteVersionAsync(GitHubPackagesTests.PACKAGE, "0.0.1");

    Assert.areEqual(
      "GitHub answered GET orgs/noldova-com/packages/npm/tools.pipelines/versions?per_page=100&page=1 with 404: Not Found",
      GitHubPackagesTests.readFailure(deleted));
    Assert.areEqual(1, api.requests.length);
  }

  @TestMethod
  public async readsTheLockFilesOfEveryRepositoryOfTheInstallationAsync(): Promise<void> {
    const archived = Array.from({ length: 100 }, (_, index) => ({ full_name: `noldova-com/old-${index}`, default_branch: "main", archived: true }));
    const lock = "{ \"packages\": {} }\n";
    const nested = "{ \"packages\": { \"node_modules/@noldova-com/a\": { \"version\": \"0.0.1\" } } }\n";
    const emptyTrees = Object.fromEntries(archived.map(t => [`GET /repos/${t.full_name}/git/trees/main?recursive=1`, GitHubApiAnswer.json(200, { truncated: false, tree: [] })]));
    await using api = await GitHubApiFixture.startAsync({
      [GitHubPackagesTests.SOURCE]: GitHubPackagesTests.PRIVATE_SOURCE,
      ...emptyTrees,
      [GitHubPackagesTests.REPOSITORIES_PAGE]: GitHubApiAnswer.json(200, { total_count: 103, repositories: archived }),
      "GET /installation/repositories?per_page=100&page=2": GitHubApiAnswer.json(200, {
        total_count: 103,
        repositories: [
          { full_name: "noldova-com/one", default_branch: "main", archived: false },
          { full_name: "noldova-com/empty", default_branch: "main", archived: false },
          { full_name: "noldova-com/two", default_branch: "release/1 x", archived: false }
        ]
      }),
      "GET /repos/noldova-com/old-7/git/trees/main?recursive=1": GitHubApiAnswer.json(200, { truncated: false, tree: [{ path: "package-lock.json", type: "blob", sha: "b7" }] }),
      "GET /repos/noldova-com/old-7/git/blobs/b7": GitHubApiAnswer.json(200, { encoding: "base64", content: Buffer.from(lock).toString("base64") }),
      "GET /repos/noldova-com/one/git/trees/main?recursive=1": GitHubApiAnswer.json(200, {
        truncated: false,
        tree: [
          { path: "package-lock.json", type: "blob", sha: "a1" },
          { path: "package.json", type: "blob", sha: "a2" },
          { path: "src/package-lock.json", type: "tree", sha: "a3" },
          { path: "src/a/package-lock.json", type: "blob", sha: "a4" },
          { path: "node_modules/b/package-lock.json", type: "blob", sha: "a5" },
          { path: "src/old-package-lock.json", type: "blob", sha: "a6" }
        ]
      }),
      "GET /repos/noldova-com/one/git/blobs/a1": GitHubApiAnswer.json(200, { encoding: "base64", content: Buffer.from(lock).toString("base64") }),
      "GET /repos/noldova-com/one/git/blobs/a4": GitHubApiAnswer.json(200, { encoding: "base64", content: Buffer.from(nested).toString("base64").replace(/(.{20})/g, "$1\n") }),
      "GET /repos/noldova-com/empty/git/trees/main?recursive=1": GitHubApiAnswer.json(409, { message: "Git Repository is empty." }),
      "GET /repos/noldova-com/two/git/trees/release/1%20x?recursive=1": GitHubApiAnswer.json(200, { truncated: false, tree: [] })
    });

    const lockFiles = await GitHubPackagesTests.createPackages(api).readLockFilesAsync();

    if (lockFiles instanceof StepResult)
      throw new Error(`Expected lock files, not ${lockFiles.message}`);
    Assert.areEqual(
      JSON.stringify([["noldova-com/old-7/package-lock.json", lock], ["noldova-com/one/package-lock.json", lock], ["noldova-com/one/src/a/package-lock.json", nested]]),
      JSON.stringify([...lockFiles]));
    Assert.areEqual(111, api.requests.length);
    Assert.areEqual("/installation/repositories?per_page=100&page=2", api.requests.at(-1)?.url);
    Assert.isTrue(api.requests.every(t => t.headers.authorization === `Bearer ${GitHubPackagesTests.REPOSITORIES_TOKEN}`));
  }

  @TestMethod
  public async failsWhenTheListDoesNotHoldEveryRepositoryAsync(): Promise<void> {
    await using api = await GitHubApiFixture.startAsync({
      [GitHubPackagesTests.SOURCE]: GitHubPackagesTests.PRIVATE_SOURCE,
      [GitHubPackagesTests.REPOSITORIES_PAGE]: GitHubApiAnswer.json(200, { total_count: 2, repositories: [{ full_name: "noldova-com/one", default_branch: "main", archived: false }] })
    });

    Assert.areEqual(
      "GitHub listed 1 of the installation's 2 repositories, so the lock files could not all be found.",
      GitHubPackagesTests.readFailure(await GitHubPackagesTests.createPackages(api).readLockFilesAsync()));
    Assert.areEqual(2, api.requests.length);
  }

  @TestData("added", "{ \"total_count\": 2, \"repositories\": [{ \"full_name\": \"noldova-com/one\", \"default_branch\": \"main\" }, { \"full_name\": \"noldova-com/two\", \"default_branch\": \"main\" }] }")
  @TestData("renamed", "{ \"total_count\": 1, \"repositories\": [{ \"full_name\": \"noldova-com/uno\", \"default_branch\": \"main\" }] }")
  @TestData("new default branch", "{ \"total_count\": 1, \"repositories\": [{ \"full_name\": \"noldova-com/one\", \"default_branch\": \"next\" }] }")
  @TestMethod
  public async failsWhenTheRepositoriesChangeWhileTheLockFilesAreReadAsync(_: string, relisted: string): Promise<void> {
    await using api = await GitHubApiFixture.startAsync({
      [GitHubPackagesTests.SOURCE]: GitHubPackagesTests.PRIVATE_SOURCE,
      [GitHubPackagesTests.REPOSITORIES_PAGE]: [GitHubPackagesTests.ONE_REPOSITORY, new GitHubApiAnswer(200, relisted)],
      "GET /repos/noldova-com/one/git/trees/main?recursive=1": GitHubApiAnswer.json(200, { truncated: false, tree: [] })
    });

    Assert.areEqual(
      "The installation's repositories changed while their lock files were read, so the lock files could not all be found.",
      GitHubPackagesTests.readFailure(await GitHubPackagesTests.createPackages(api).readLockFilesAsync()));
  }

  @TestData("GITHUB_API_URL")
  @TestData("GITHUB_REPOSITORY")
  @TestData("REPOSITORIES_TOKEN")
  @TestMethod
  public async failsNamingAMissingVariableBeforeReadingLockFilesAsync(name: string): Promise<void> {
    await using api = await GitHubApiFixture.startAsync({ [GitHubPackagesTests.SOURCE]: GitHubPackagesTests.PRIVATE_SOURCE });
    const environment = { GITHUB_API_URL: api.url, GITHUB_REPOSITORY: "noldova-com/source", GITHUB_TOKEN: GitHubPackagesTests.TOKEN, REPOSITORIES_TOKEN: GitHubPackagesTests.REPOSITORIES_TOKEN };
    const expected = `The environment variable ${name} is not set; the prune step needs it to reach GitHub.`;

    Assert.areEqual(expected, GitHubPackagesTests.readFailure(await new GitHubPackages({ ...environment, [name]: undefined }).readLockFilesAsync()));
    Assert.areEqual(expected, GitHubPackagesTests.readFailure(await new GitHubPackages({ ...environment, [name]: "" }).readLockFilesAsync()));
    Assert.areEqual(0, api.requests.length);
  }

  @TestData("repositories", "GitHub answered GET installation/repositories?per_page=100&page=1 with 401: Bad credentials")
  @TestData("repositories held", "GitHub gave no answer to GET installation/repositories?per_page=100&page=1: The operation was aborted due to timeout")
  @TestData("tree", "GitHub answered GET repos/noldova-com/one/git/trees/main?recursive=1 with 404: Not Found")
  @TestData("tree held", "GitHub gave no answer to GET repos/noldova-com/one/git/trees/main?recursive=1: The operation was aborted due to timeout")
  @TestData("truncated", "GitHub listed only part of noldova-com/one's files on main, so its lock files could not all be found.")
  @TestData("blob", "GitHub answered GET repos/noldova-com/one/git/blobs/a1 with 403: Forbidden")
  @TestData("blob held", "GitHub gave no answer to GET repos/noldova-com/one/git/blobs/a1: The operation was aborted due to timeout")
  @TestData("repositories again", "GitHub answered GET installation/repositories?per_page=100&page=1 with 502: Bad gateway")
  @TestMethod
  public async failsWhenALockFileCannotBeReadAsync(failing: string, expected: string): Promise<void> {
    const answers: Record<string, GitHubApiAnswer | readonly GitHubApiAnswer[]> = {
      [GitHubPackagesTests.REPOSITORIES_PAGE]: GitHubPackagesTests.ONE_REPOSITORY,
      "GET /repos/noldova-com/one/git/trees/main?recursive=1": GitHubApiAnswer.json(200, { truncated: false, tree: [{ path: "package-lock.json", type: "blob", sha: "a1" }] }),
      "GET /repos/noldova-com/one/git/blobs/a1": GitHubApiAnswer.json(200, { encoding: "base64", content: "" })
    };
    const failures: Readonly<Record<string, readonly [string, GitHubApiAnswer | readonly GitHubApiAnswer[]]>> = {
      "repositories": [GitHubPackagesTests.REPOSITORIES_PAGE, GitHubApiAnswer.json(401, { message: "Bad credentials" })],
      "repositories held": [GitHubPackagesTests.REPOSITORIES_PAGE, GitHubApiAnswer.HELD],
      "tree": ["GET /repos/noldova-com/one/git/trees/main?recursive=1", GitHubApiAnswer.json(404, { message: "Not Found" })],
      "tree held": ["GET /repos/noldova-com/one/git/trees/main?recursive=1", GitHubApiAnswer.HELD],
      "truncated": ["GET /repos/noldova-com/one/git/trees/main?recursive=1", GitHubApiAnswer.json(200, { truncated: true, tree: [] })],
      "blob": ["GET /repos/noldova-com/one/git/blobs/a1", GitHubApiAnswer.json(403, { message: "Forbidden" })],
      "blob held": ["GET /repos/noldova-com/one/git/blobs/a1", GitHubApiAnswer.HELD],
      "repositories again": [GitHubPackagesTests.REPOSITORIES_PAGE, [GitHubPackagesTests.ONE_REPOSITORY, new GitHubApiAnswer(502, "Bad gateway", "text/plain")]]
    };
    const [route, answer] = failures[failing] ?? ["", GitHubApiAnswer.HELD];
    await using api = await GitHubApiFixture.startAsync({ [GitHubPackagesTests.SOURCE]: GitHubPackagesTests.PRIVATE_SOURCE, ...answers, [route]: answer });

    Assert.areEqual(expected, GitHubPackagesTests.readFailure(await GitHubPackagesTests.createPackages(api).readLockFilesAsync()));
  }

  @TestData("public", "noldova-com/source is public, so the prune step reads no lock file and deletes nothing: its log would name the private repositories that lock a version, and leaving them out could delete a version they lock.")
  @TestData("missing", "Could not read noldova-com/source, so the prune step can't tell that it is private, and reads no lock file and deletes nothing: GitHub answered GET repos/noldova-com/source with 404: Not Found")
  @TestData("held", "Could not read noldova-com/source, so the prune step can't tell that it is private, and reads no lock file and deletes nothing: GitHub gave no answer to GET repos/noldova-com/source: The operation was aborted due to timeout")
  @TestMethod
  public async readsNoLockFileUnlessTheReleasingRepositoryIsPrivateAsync(source: string, expected: string): Promise<void> {
    const answers: Readonly<Record<string, GitHubApiAnswer>> = {
      public: GitHubApiAnswer.json(200, { full_name: "noldova-com/source", private: false }),
      missing: GitHubApiAnswer.json(404, { message: "Not Found" }),
      held: GitHubApiAnswer.HELD
    };
    await using api = await GitHubApiFixture.startAsync({
      [GitHubPackagesTests.SOURCE]: answers[source] ?? GitHubApiAnswer.HELD,
      [GitHubPackagesTests.REPOSITORIES_PAGE]: GitHubPackagesTests.ONE_REPOSITORY
    });

    Assert.areEqual(expected, GitHubPackagesTests.readFailure(await GitHubPackagesTests.createPackages(api).readLockFilesAsync()));
    Assert.isFalse(api.requests.some(t => t.url.startsWith("/installation/")));
  }

  @TestData("not JSON")
  @TestData("{ \"full_name\": \"noldova-com/source\" }")
  @TestData("{ \"full_name\": \"noldova-com/source\", \"private\": null }")
  @TestData("{ \"full_name\": \"noldova-com/source\", \"private\": \"true\" }")
  @TestMethod
  public async rejectsWithJsonExceptionForAReleasingRepositoryAnswerWithoutItsVisibilityAsync(body: string): Promise<void> {
    await using api = await GitHubApiFixture.startAsync({
      [GitHubPackagesTests.SOURCE]: new GitHubApiAnswer(200, body),
      [GitHubPackagesTests.REPOSITORIES_PAGE]: GitHubPackagesTests.ONE_REPOSITORY
    });

    await Assert.throwsAsync(() => GitHubPackagesTests.createPackages(api).readLockFilesAsync(), JsonException);
    Assert.isFalse(api.requests.some(t => t.url.startsWith("/installation/")));
  }

  @TestMethod
  public async keepsAVersionALockFileHoldsAsync(): Promise<void> {
    using clone = GitCloneFixture.create({ "src/noldova.tools.pipelines/package.json": "{ \"name\": \"@noldova-com/tools.pipelines\" }" });
    const lock = JSON.stringify({ packages: { "node_modules/@noldova-com/tools.pipelines": { version: "0.0.3" } } });
    await using api = await GitHubApiFixture.startAsync({
      [GitHubPackagesTests.SOURCE]: GitHubPackagesTests.PRIVATE_SOURCE,
      [GitHubPackagesTests.FIRST_PAGE]: GitHubApiAnswer.json(200, [{ id: 14, name: "0.0.4" }, { id: 13, name: "0.0.3" }, { id: 12, name: "0.0.2" }]),
      [GitHubPackagesTests.REPOSITORIES_PAGE]: GitHubPackagesTests.ONE_REPOSITORY,
      "GET /repos/noldova-com/one/git/trees/main?recursive=1": GitHubApiAnswer.json(200, { truncated: false, tree: [{ path: "package-lock.json", type: "blob", sha: "a1" }] }),
      "GET /repos/noldova-com/one/git/blobs/a1": GitHubApiAnswer.json(200, { encoding: "base64", content: Buffer.from(lock).toString("base64") }),
      [`DELETE ${GitHubPackagesTests.VERSIONS}/12`]: new GitHubApiAnswer(204, "", "")
    });

    const result = await GitHubPackagesTests.createStep(clone, api).runAsync(["0.0.4", clone.commit, "@noldova-com", "https://npm.pkg.github.com/", "1"]);

    Assert.isTrue(result.isSuccessful, result.message);
    Assert.areEqual("@noldova-com/tools.pipelines@0.0.3 kept, since noldova-com/one/package-lock.json locks it.\n@noldova-com/tools.pipelines@0.0.2 deleted.", result.message);
    Assert.areEqual(`Bearer ${GitHubPackagesTests.TOKEN}`, api.requests.at(-1)?.headers.authorization);
  }

  private static createPackages(api: GitHubApiFixture, waits: number[] = []): GitHubPackages {
    return new GitHubPackages({ GITHUB_API_URL: api.url, GITHUB_REPOSITORY: "noldova-com/source", GITHUB_TOKEN: GitHubPackagesTests.TOKEN, REPOSITORIES_TOKEN: GitHubPackagesTests.REPOSITORIES_TOKEN }, undefined, async milliseconds => {
      waits.push(milliseconds);
    }, () => api.createAttemptSignal());
  }

  private static createStep(clone: GitCloneFixture, api: GitHubApiFixture): PruneStep {
    const processRunner = new ProcessRunner();
    const git = new Git(processRunner, clone.directory);

    return new PruneStep(git, new ArchiveStep(git, new Tar(processRunner), new Npm(processRunner, process.cwd())), GitHubPackagesTests.createPackages(api));
  }

  private static readVersions(result: readonly string[] | StepResult): readonly string[] {
    if (result instanceof StepResult)
      throw new Error(`Expected versions, not ${result.message}`);

    return result;
  }

  private static readFailure(result: readonly string[] | ReadonlyMap<string, string> | boolean | StepResult): string {
    if (!(result instanceof StepResult) || result.isSuccessful)
      throw new Error(`Expected a failed result, not ${String(result)}.`);

    return result.message;
  }
}
