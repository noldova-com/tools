/**
 * @license
 * Copyright (c) Noldova.
 *
 * This source code is licensed under the license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { JsonException } from "@noldova/context.json";
import { Assert, TestClass, TestData, TestMethod } from "@noldova/context.testing";
import { StepResult, TagStep } from "@noldova/tools.pipelines";
import { GitHubTags } from "@noldova/tools.pipelines.github";

import { GitHubApiAnswer, GitHubApiFixture } from "./github-api.fixture.js";

@TestClass
export class GitHubTagsTests {
  private static readonly COMMIT: string = "225059f4c1e6a3b2d8f7e9a0b1c2d3e4f5a6b7c8";
  private static readonly TAG_OBJECT: string = "0123456789abcdef0123456789abcdef01234567";
  private static readonly OUTER_TAG_OBJECT: string = "89abcdef0123456789abcdef0123456789abcdef";
  private static readonly REFERENCE: string = "GET /repos/noldova-com/tools/git/ref/tags/v0.0.4";
  private static readonly CREATE: string = "POST /repos/noldova-com/tools/git/refs";
  private static readonly TOKEN: string = "test-token-value";

  @TestMethod
  public async readsTheCommitALightweightTagPointsToAsync(): Promise<void> {
    await using api = await GitHubApiFixture.startAsync({
      [GitHubTagsTests.REFERENCE]: GitHubApiAnswer.json(200, { ref: "refs/tags/v0.0.4", object: { type: "commit", sha: GitHubTagsTests.COMMIT } })
    });

    const commit = await GitHubTagsTests.createTags(api).readTagAsync("v0.0.4");

    Assert.areEqual(GitHubTagsTests.COMMIT, commit);
    Assert.areEqual(1, api.requests.length);
    const request = api.requests[0];
    Assert.areEqual("GET", request?.method);
    Assert.areEqual("/repos/noldova-com/tools/git/ref/tags/v0.0.4", request?.url);
    Assert.areEqual("application/vnd.github+json", request?.headers.accept);
    Assert.areEqual(`Bearer ${GitHubTagsTests.TOKEN}`, request?.headers.authorization);
    Assert.areEqual("2022-11-28", request?.headers["x-github-api-version"]);
    Assert.isUndefined(request?.headers["content-type"]);
  }

  @TestMethod
  public async followsAnnotatedTagsToTheirCommitAsync(): Promise<void> {
    await using api = await GitHubApiFixture.startAsync({
      [GitHubTagsTests.REFERENCE]: GitHubApiAnswer.json(200, { object: { type: "tag", sha: GitHubTagsTests.OUTER_TAG_OBJECT } }),
      [`GET /repos/noldova-com/tools/git/tags/${GitHubTagsTests.OUTER_TAG_OBJECT}`]: GitHubApiAnswer.json(200, { object: { type: "tag", sha: GitHubTagsTests.TAG_OBJECT } }),
      [`GET /repos/noldova-com/tools/git/tags/${GitHubTagsTests.TAG_OBJECT}`]: GitHubApiAnswer.json(200, { object: { type: "commit", sha: GitHubTagsTests.COMMIT } })
    });

    const commit = await GitHubTagsTests.createTags(api).readTagAsync("v0.0.4");

    Assert.areEqual(GitHubTagsTests.COMMIT, commit);
    Assert.areEqual(3, api.requests.length);
  }

  @TestMethod
  public async readsNothingWhenTheRepositoryHasNoSuchTagAsync(): Promise<void> {
    await using api = await GitHubApiFixture.startAsync({});

    const commit = await GitHubTagsTests.createTags(api).readTagAsync("v0.0.4");

    Assert.areEqual("", commit);
  }

  @TestMethod
  public async failsForATagThatPointsToSomethingOtherThanACommitAsync(): Promise<void> {
    await using api = await GitHubApiFixture.startAsync({
      [GitHubTagsTests.REFERENCE]: GitHubApiAnswer.json(200, { object: { type: "tree", sha: GitHubTagsTests.COMMIT } })
    });

    const result = await GitHubTagsTests.createTags(api).readTagAsync("v0.0.4");

    Assert.areEqual("v0.0.4 points to a tree, not a commit.", GitHubTagsTests.readFailure(result));
  }

  @TestData(403, "application/json", "{ \"message\": \"Resource not accessible by integration\" }", "Resource not accessible by integration")
  @TestData(500, "application/json", "{ \"error\": \"broken\" }", "{ \"error\": \"broken\" }")
  @TestData(502, "text/html", "<html>Bad gateway</html>\n", "<html>Bad gateway</html>")
  @TestData(503, "text/plain", "  ", "Service Unavailable")
  @TestData(500, "", "{ \"message\": \"broken\" }", "{ \"message\": \"broken\" }")
  @TestData(500, "application/json", "[\"broken\"]", "[\"broken\"]")
  @TestMethod
  public async failsWithTheRequestTheStatusAndGitHubsMessageAsync(status: number, contentType: string, body: string, message: string): Promise<void> {
    await using api = await GitHubApiFixture.startAsync({ [GitHubTagsTests.REFERENCE]: new GitHubApiAnswer(status, body, contentType) });

    const result = await GitHubTagsTests.createTags(api).readTagAsync("v0.0.4");

    const failure = GitHubTagsTests.readFailure(result);
    Assert.areEqual(`GitHub answered GET repos/noldova-com/tools/git/ref/tags/v0.0.4 with ${status}: ${message}`, failure);
    Assert.isFalse(failure.includes(GitHubTagsTests.TOKEN));
  }

  @TestMethod
  public async failsWhenReadingAnAnnotatedTagFailsAsync(): Promise<void> {
    await using api = await GitHubApiFixture.startAsync({
      [GitHubTagsTests.REFERENCE]: GitHubApiAnswer.json(200, { object: { type: "tag", sha: GitHubTagsTests.TAG_OBJECT } })
    });

    const result = await GitHubTagsTests.createTags(api).readTagAsync("v0.0.4");

    Assert.areEqual(`GitHub answered GET repos/noldova-com/tools/git/tags/${GitHubTagsTests.TAG_OBJECT} with 404: Not Found`, GitHubTagsTests.readFailure(result));
  }

  @TestData("{ \"object\": { \"type\": \"commit\" } }")
  @TestData("{ \"ref\": \"refs/tags/v0.0.4\" }")
  @TestData("not JSON")
  @TestMethod
  public async rejectsWithJsonExceptionForAnAnswerThatIsNotGitHubsJsonAsync(body: string): Promise<void> {
    await using api = await GitHubApiFixture.startAsync({ [GitHubTagsTests.REFERENCE]: new GitHubApiAnswer(200, body) });

    await Assert.throwsAsync(() => GitHubTagsTests.createTags(api).readTagAsync("v0.0.4"), JsonException);
  }

  @TestMethod
  public async createsALightweightTagAtTheCommitAsync(): Promise<void> {
    await using api = await GitHubApiFixture.startAsync({
      [GitHubTagsTests.CREATE]: GitHubApiAnswer.json(201, { ref: "refs/tags/v0.0.4", object: { type: "commit", sha: GitHubTagsTests.COMMIT } })
    });

    const created = await GitHubTagsTests.createTags(api).createTagAsync("v0.0.4", GitHubTagsTests.COMMIT);

    Assert.areEqual(true, created);
    const request = api.requests[0];
    Assert.areEqual("POST", request?.method);
    Assert.areEqual(JSON.stringify({ ref: "refs/tags/v0.0.4", sha: GitHubTagsTests.COMMIT }), request?.body);
    Assert.areEqual("application/json", request?.headers["content-type"]);
    Assert.areEqual(`Bearer ${GitHubTagsTests.TOKEN}`, request?.headers.authorization);
  }

  @TestData(true)
  @TestData(false)
  @TestMethod
  public async letsTheTagStepReadATagAnotherRunMadeFirstAsync(isSameCommit: boolean): Promise<void> {
    const found = isSameCommit ? GitHubTagsTests.COMMIT : GitHubTagsTests.TAG_OBJECT;
    await using api = await GitHubApiFixture.startAsync({
      [GitHubTagsTests.REFERENCE]: [GitHubApiAnswer.json(404, { message: "Not Found" }), GitHubApiAnswer.json(200, { object: { type: "commit", sha: found } })],
      [GitHubTagsTests.CREATE]: GitHubApiAnswer.json(422, { message: "Reference already exists" })
    });

    const result = await new TagStep(GitHubTagsTests.createTags(api)).runAsync(["0.0.4", GitHubTagsTests.COMMIT]);

    Assert.areEqual(isSameCommit, result.isSuccessful);
    Assert.areEqual(
      isSameCommit
        ? `v0.0.4 already points to commit ${GitHubTagsTests.COMMIT}.`
        : `v0.0.4 points to commit ${GitHubTagsTests.TAG_OBJECT}, not ${GitHubTagsTests.COMMIT}; a tag is never moved.`,
      result.message);
    Assert.areEqual(JSON.stringify(["GET", "POST", "GET", "GET"]), JSON.stringify(api.requests.map(t => t.method)));
  }

  @TestMethod
  public async answersFalseWhenGitHubRefusesATagThatExistsAsync(): Promise<void> {
    await using api = await GitHubApiFixture.startAsync({
      [GitHubTagsTests.CREATE]: GitHubApiAnswer.json(422, { message: "Reference already exists" }),
      [GitHubTagsTests.REFERENCE]: GitHubApiAnswer.json(200, { object: { type: "commit", sha: GitHubTagsTests.COMMIT } })
    });

    const created = await GitHubTagsTests.createTags(api).createTagAsync("v0.0.4", GitHubTagsTests.COMMIT);

    Assert.areEqual(false, created);
    Assert.areEqual(JSON.stringify(["POST", "GET"]), JSON.stringify(api.requests.map(t => t.method)));
  }

  @TestMethod
  public async failsWithTheRefusalWhenGitHubRefusesATagThatDoesNotExistAsync(): Promise<void> {
    await using api = await GitHubApiFixture.startAsync({ [GitHubTagsTests.CREATE]: GitHubApiAnswer.json(422, { message: "Object does not exist" }) });

    const created = await GitHubTagsTests.createTags(api).createTagAsync("v0.0.4", GitHubTagsTests.COMMIT);

    Assert.areEqual("GitHub answered POST repos/noldova-com/tools/git/refs with 422: Object does not exist", GitHubTagsTests.readFailure(created));
    Assert.areEqual(JSON.stringify(["POST", "GET"]), JSON.stringify(api.requests.map(t => t.method)));
  }

  @TestMethod
  public async failsWithTheReadsAnswerWhenReadingARefusedTagFailsAsync(): Promise<void> {
    await using api = await GitHubApiFixture.startAsync({
      [GitHubTagsTests.CREATE]: GitHubApiAnswer.json(422, { message: "Reference already exists" }),
      [GitHubTagsTests.REFERENCE]: GitHubApiAnswer.json(403, { message: "Resource not accessible by integration" })
    });

    const created = await GitHubTagsTests.createTags(api).createTagAsync("v0.0.4", GitHubTagsTests.COMMIT);

    Assert.areEqual("GitHub answered GET repos/noldova-com/tools/git/ref/tags/v0.0.4 with 403: Resource not accessible by integration", GitHubTagsTests.readFailure(created));
  }

  @TestMethod
  public async failsWithoutReadingWhenGitHubForbidsTheTagAsync(): Promise<void> {
    await using api = await GitHubApiFixture.startAsync({ [GitHubTagsTests.CREATE]: GitHubApiAnswer.json(403, { message: "Resource not accessible by integration" }) });

    const created = await GitHubTagsTests.createTags(api).createTagAsync("v0.0.4", GitHubTagsTests.COMMIT);

    Assert.areEqual("GitHub answered POST repos/noldova-com/tools/git/refs with 403: Resource not accessible by integration", GitHubTagsTests.readFailure(created));
    Assert.areEqual(1, api.requests.length);
  }

  @TestMethod
  public async rejectsWithTimeoutErrorWhenGitHubDoesNotAnswerInTimeAsync(): Promise<void> {
    await using api = await GitHubApiFixture.startAsync({ [GitHubTagsTests.REFERENCE]: GitHubApiAnswer.HELD });
    const tags = new GitHubTags({ GITHUB_API_URL: api.url, GITHUB_REPOSITORY: "noldova-com/tools", GITHUB_TOKEN: GitHubTagsTests.TOKEN }, 100);

    const error = await Assert.throwsAsync(() => tags.readTagAsync("v0.0.4"), DOMException);

    Assert.areEqual("TimeoutError", error.name);
  }

  @TestData("GITHUB_API_URL")
  @TestData("GITHUB_REPOSITORY")
  @TestData("GITHUB_TOKEN")
  @TestMethod
  public async failsNamingAMissingOrEmptyVariableWithoutARequestAsync(name: string): Promise<void> {
    await using api = await GitHubApiFixture.startAsync({});
    const environment = { GITHUB_API_URL: api.url, GITHUB_REPOSITORY: "noldova-com/tools", GITHUB_TOKEN: GitHubTagsTests.TOKEN };
    const missing = { ...environment, [name]: undefined };
    const empty = { ...environment, [name]: "" };
    const expected = `The environment variable ${name} is not set; the tag step needs it to reach GitHub.`;

    Assert.areEqual(expected, GitHubTagsTests.readFailure(await new GitHubTags(missing).readTagAsync("v0.0.4")));
    Assert.areEqual(expected, GitHubTagsTests.readFailure(await new GitHubTags(empty).createTagAsync("v0.0.4", GitHubTagsTests.COMMIT)));
    Assert.areEqual(0, api.requests.length);
  }

  private static createTags(api: GitHubApiFixture): GitHubTags {
    return new GitHubTags({ GITHUB_API_URL: api.url, GITHUB_REPOSITORY: "noldova-com/tools", GITHUB_TOKEN: GitHubTagsTests.TOKEN });
  }

  private static readFailure(result: string | boolean | StepResult): string {
    if (!(result instanceof StepResult) || result.isSuccessful)
      throw new Error(`Expected a failed result, not ${String(result)}.`);

    return result.message;
  }
}
