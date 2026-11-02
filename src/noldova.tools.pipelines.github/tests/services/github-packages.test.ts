/**
 * @license
 * Copyright (c) Noldova.
 *
 * This source code is licensed under the license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { JsonException } from "@noldova/context.json";
import { Assert, TestClass, TestData, TestMethod } from "@noldova/context.testing";
import { ArchiveStep, Git, ProcessRunner, PruneStep, StepResult, Tar } from "@noldova/tools.pipelines";
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

  @TestMethod
  public namesItsRegistry(): void {
    Assert.areEqual("https://npm.pkg.github.com/", new GitHubPackages({}).registry);
  }

  @TestMethod
  public async readsEveryVersionAPageAtATimeAsync(): Promise<void> {
    const firstPage = Array.from({ length: 100 }, (_, index) => ({ id: index + 1, name: `0.0.${index + 1}` }));
    await using api = await GitHubApiFixture.startAsync({
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
    await using api = await GitHubApiFixture.startAsync({ [GitHubPackagesTests.FIRST_PAGE]: GitHubApiAnswer.json(200, []) });

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
    await using api = await GitHubApiFixture.startAsync({});
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
    await using api = await GitHubApiFixture.startAsync({});
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
      [GitHubPackagesTests.FIRST_PAGE]: GitHubApiAnswer.json(200, Array.from({ length: 100 }, (_, index) => ({ id: index + 1, name: `0.0.${index + 1}` }))),
      [GitHubPackagesTests.SECOND_PAGE]: GitHubApiAnswer.json(403, { message: "Resource not accessible by integration" })
    });

    const result = await GitHubPackagesTests.createPackages(api).readVersionsAsync(GitHubPackagesTests.PACKAGE);

    const failure = GitHubPackagesTests.readFailure(result);
    Assert.areEqual("GitHub answered GET orgs/noldova-com/packages/npm/tools.pipelines/versions?per_page=100&page=2 with 403: Resource not accessible by integration", failure);
    Assert.isFalse(failure.includes(GitHubPackagesTests.TOKEN));
  }

  @TestData("not JSON")
  @TestData("{ \"id\": 1, \"name\": \"0.0.1\" }")
  @TestData("[1]")
  @TestData("[{ \"id\": \"1\", \"name\": \"0.0.1\" }]")
  @TestData("[{ \"id\": 1.5, \"name\": \"0.0.1\" }]")
  @TestData("[{ \"id\": 1 }]")
  @TestMethod
  public async rejectsWithJsonExceptionForAnAnswerThatIsNotAListOfVersionsAsync(body: string): Promise<void> {
    await using api = await GitHubApiFixture.startAsync({ [GitHubPackagesTests.FIRST_PAGE]: new GitHubApiAnswer(200, body) });

    await Assert.throwsAsync(() => GitHubPackagesTests.createPackages(api).readVersionsAsync(GitHubPackagesTests.PACKAGE), JsonException);
  }

  @TestMethod
  public async deletesAVersionByTheIdItsListGaveAsync(): Promise<void> {
    await using api = await GitHubApiFixture.startAsync({
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
      [GitHubPackagesTests.FIRST_PAGE]: GitHubApiAnswer.json(200, [{ id: 11, name: "0.0.1" }]),
      [`DELETE ${GitHubPackagesTests.VERSIONS}/11`]: new GitHubApiAnswer(204, "", "")
    });

    const deleted = await GitHubPackagesTests.createPackages(api).deleteVersionAsync(GitHubPackagesTests.PACKAGE, "0.0.1");

    Assert.areEqual(true, deleted);
    Assert.areEqual(JSON.stringify(["GET", "DELETE"]), JSON.stringify(api.requests.map(t => t.method)));
  }

  @TestMethod
  public async answersFalseWithoutARequestForAVersionTheListDoesNotHaveAsync(): Promise<void> {
    await using api = await GitHubApiFixture.startAsync({ [GitHubPackagesTests.FIRST_PAGE]: GitHubApiAnswer.json(200, [{ id: 12, name: "0.0.2" }]) });

    const deleted = await GitHubPackagesTests.createPackages(api).deleteVersionAsync(GitHubPackagesTests.PACKAGE, "0.0.1");

    Assert.areEqual(false, deleted);
    Assert.areEqual(JSON.stringify(["GET"]), JSON.stringify(api.requests.map(t => t.method)));
  }

  @TestMethod
  public async answersFalseWhenGitHubNoLongerHasTheVersionAsync(): Promise<void> {
    await using api = await GitHubApiFixture.startAsync({
      [GitHubPackagesTests.FIRST_PAGE]: [GitHubApiAnswer.json(200, [{ id: 11, name: "0.0.1" }]), GitHubApiAnswer.json(200, [{ id: 12, name: "0.0.2" }])]
    });

    const deleted = await GitHubPackagesTests.createPackages(api).deleteVersionAsync(GitHubPackagesTests.PACKAGE, "0.0.1");

    Assert.areEqual(false, deleted);
    Assert.areEqual(JSON.stringify(["GET", "DELETE", "GET"]), JSON.stringify(api.requests.map(t => t.method)));
  }

  @TestMethod
  public async failsWhenGitHubAnswers404ButStillListsTheVersionAsync(): Promise<void> {
    await using api = await GitHubApiFixture.startAsync({ [GitHubPackagesTests.FIRST_PAGE]: GitHubApiAnswer.json(200, [{ id: 11, name: "0.0.1" }]) });

    const deleted = await GitHubPackagesTests.createPackages(api).deleteVersionAsync(GitHubPackagesTests.PACKAGE, "0.0.1");

    Assert.areEqual(
      "GitHub answered 404 to deleting @noldova-com/tools.pipelines@0.0.1 but still lists it, so it is not deleted; the token may not be allowed to delete it.",
      GitHubPackagesTests.readFailure(deleted));
    Assert.areEqual(JSON.stringify(["GET", "DELETE", "GET"]), JSON.stringify(api.requests.map(t => t.method)));
  }

  @TestMethod
  public async failsWithTheListsAnswerWhenListingAfterA404FailsAsync(): Promise<void> {
    await using api = await GitHubApiFixture.startAsync({
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
      [GitHubPackagesTests.FIRST_PAGE]: [GitHubApiAnswer.json(503, { message: "Unavailable" }), GitHubApiAnswer.json(200, [{ id: 11, name: "0.0.1" }])]
    });

    const versions = await GitHubPackagesTests.createPackages(api, waits).readVersionsAsync(GitHubPackagesTests.PACKAGE);

    Assert.areEqual("0.0.1", GitHubPackagesTests.readVersions(versions).join(","));
    Assert.areEqual("5000", waits.join(","));
  }

  @TestMethod
  public async failsNamingTheRequestWhenListingIsNotAnsweredDeletingNothingAsync(): Promise<void> {
    using clone = GitCloneFixture.create({ "src/noldova.tools.pipelines/package.json": "{ \"name\": \"@noldova-com/tools.pipelines\" }" });
    await using api = await GitHubApiFixture.startAsync({ [GitHubPackagesTests.FIRST_PAGE]: GitHubApiAnswer.HELD });

    const result = await GitHubPackagesTests.createStep(clone, api).runAsync(["0.0.4", clone.commit, "@noldova-com", "https://npm.pkg.github.com/", "1"]);

    Assert.isFalse(result.isSuccessful);
    Assert.areEqual("GitHub gave no answer to GET orgs/noldova-com/packages/npm/tools.pipelines/versions?per_page=100&page=1: The operation was aborted due to timeout", result.message);
    Assert.areEqual(JSON.stringify(["GET", "GET", "GET"]), JSON.stringify(api.requests.map(t => t.method)));
  }

  @TestMethod
  public async keepsTheDeletedLinesWhenADeleteIsNotAnsweredAsync(): Promise<void> {
    using clone = GitCloneFixture.create({ "src/noldova.tools.pipelines/package.json": "{ \"name\": \"@noldova-com/tools.pipelines\" }" });
    await using api = await GitHubApiFixture.startAsync({
      [GitHubPackagesTests.FIRST_PAGE]: GitHubApiAnswer.json(200, [{ id: 14, name: "0.0.4" }, { id: 13, name: "0.0.3" }, { id: 12, name: "0.0.2" }]),
      [`DELETE ${GitHubPackagesTests.VERSIONS}/13`]: new GitHubApiAnswer(204, "", ""),
      [`DELETE ${GitHubPackagesTests.VERSIONS}/12`]: GitHubApiAnswer.HELD
    });

    const result = await GitHubPackagesTests.createStep(clone, api).runAsync(["0.0.4", clone.commit, "@noldova-com", "https://npm.pkg.github.com/", "1"]);

    Assert.isFalse(result.isSuccessful);
    Assert.areEqual("@noldova-com/tools.pipelines@0.0.3 deleted.\nGitHub gave no answer to DELETE orgs/noldova-com/packages/npm/tools.pipelines/versions/12: The operation was aborted due to timeout", result.message);
  }

  @TestMethod
  public async failsWithTheListsAnswerWhenListingBeforeADeleteFailsAsync(): Promise<void> {
    await using api = await GitHubApiFixture.startAsync({});

    const deleted = await GitHubPackagesTests.createPackages(api).deleteVersionAsync(GitHubPackagesTests.PACKAGE, "0.0.1");

    Assert.areEqual(
      "GitHub answered GET orgs/noldova-com/packages/npm/tools.pipelines/versions?per_page=100&page=1 with 404: Not Found",
      GitHubPackagesTests.readFailure(deleted));
    Assert.areEqual(1, api.requests.length);
  }

  private static createPackages(api: GitHubApiFixture, waits: number[] = []): GitHubPackages {
    return new GitHubPackages({ GITHUB_API_URL: api.url, GITHUB_TOKEN: GitHubPackagesTests.TOKEN }, undefined, async milliseconds => {
      waits.push(milliseconds);
    }, () => api.createAttemptSignal());
  }

  private static createStep(clone: GitCloneFixture, api: GitHubApiFixture): PruneStep {
    const processRunner = new ProcessRunner();
    const git = new Git(processRunner, clone.directory);

    return new PruneStep(git, new ArchiveStep(git, new Tar(processRunner)), GitHubPackagesTests.createPackages(api));
  }

  private static readVersions(result: readonly string[] | StepResult): readonly string[] {
    if (result instanceof StepResult)
      throw new Error(`Expected versions, not ${result.message}`);

    return result;
  }

  private static readFailure(result: readonly string[] | boolean | StepResult): string {
    if (!(result instanceof StepResult) || result.isSuccessful)
      throw new Error(`Expected a failed result, not ${String(result)}.`);

    return result.message;
  }
}
