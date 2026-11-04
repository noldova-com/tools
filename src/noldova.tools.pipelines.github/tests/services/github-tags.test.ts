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
  public async failsWithoutReadingWhenGitHubAnswersTheCreateWithAnotherStatusAsync(): Promise<void> {
    await using api = await GitHubApiFixture.startAsync({ [GitHubTagsTests.CREATE]: GitHubApiAnswer.json(404, { message: "Not Found" }) });

    const created = await GitHubTagsTests.createTags(api).createTagAsync("v0.0.4", GitHubTagsTests.COMMIT);

    Assert.areEqual("GitHub answered POST repos/noldova-com/tools/git/refs with 404: Not Found", GitHubTagsTests.readFailure(created));
    Assert.areEqual(1, api.requests.length);
  }

  @TestMethod
  public async failsWithoutReadingNamingTheWorkflowsPermissionWhenGitHubForbidsTheTagAsync(): Promise<void> {
    await using api = await GitHubApiFixture.startAsync({
      [GitHubTagsTests.REFERENCE]: GitHubApiAnswer.json(404, { message: "Not Found" }),
      [GitHubTagsTests.CREATE]: GitHubApiAnswer.json(403, { message: "Resource not accessible by integration" })
    });

    const result = await new TagStep(GitHubTagsTests.createTags(api)).runAsync(["0.0.4", GitHubTagsTests.COMMIT]);

    Assert.isFalse(result.isSuccessful);
    Assert.areEqual(
      "GitHub answered POST repos/noldova-com/tools/git/refs with 403: Resource not accessible by integration; a tag at a commit whose workflow files differ from the default branch's, such as one released before a workflow change merged, needs a token with the workflows permission besides write access to the contents.",
      result.message);
    Assert.areEqual(JSON.stringify(["GET", "POST"]), JSON.stringify(api.requests.map(t => t.method)));
  }

  @TestMethod
  public async failsNamingTheRequestWhenGitHubAnswersNoAttemptInTimeAsync(): Promise<void> {
    const waits: number[] = [];
    await using api = await GitHubApiFixture.startAsync({ [GitHubTagsTests.REFERENCE]: GitHubApiAnswer.HELD });

    const result = await new TagStep(GitHubTagsTests.createTags(api, waits)).runAsync(["0.0.4", GitHubTagsTests.COMMIT]);

    Assert.isFalse(result.isSuccessful);
    Assert.areEqual("GitHub gave no answer to GET repos/noldova-com/tools/git/ref/tags/v0.0.4: The operation was aborted due to timeout", result.message);
    Assert.isFalse(result.message.includes(GitHubTagsTests.TOKEN));
    Assert.areEqual(3, api.requests.length);
    Assert.areEqual("5000,15000", waits.join(","));
  }

  @TestMethod
  public async endsAnAttemptAtTheTimeoutItIsGivenAsync(): Promise<void> {
    const waits: number[] = [];
    await using api = await GitHubApiFixture.startAsync({ [GitHubTagsTests.REFERENCE]: GitHubApiAnswer.HELD });
    const environment = { GITHUB_API_URL: api.url, GITHUB_REPOSITORY: "noldova-com/tools", GITHUB_TOKEN: GitHubTagsTests.TOKEN };
    const tags = new GitHubTags(environment, 1, async milliseconds => {
      waits.push(milliseconds);
    });

    const result = await tags.readTagAsync("v0.0.4");

    Assert.areEqual("GitHub gave no answer to GET repos/noldova-com/tools/git/ref/tags/v0.0.4: The operation was aborted due to timeout", GitHubTagsTests.readFailure(result));
    Assert.areEqual("5000,15000", waits.join(","));
  }

  @TestMethod
  public async failsNamingTheRequestWhenReadingAnAnnotatedTagIsNotAnsweredAsync(): Promise<void> {
    await using api = await GitHubApiFixture.startAsync({
      [GitHubTagsTests.REFERENCE]: GitHubApiAnswer.json(200, { object: { type: "tag", sha: GitHubTagsTests.TAG_OBJECT } }),
      [`GET /repos/noldova-com/tools/git/tags/${GitHubTagsTests.TAG_OBJECT}`]: GitHubApiAnswer.HELD
    });

    const result = await GitHubTagsTests.createTags(api).readTagAsync("v0.0.4");

    Assert.areEqual(`GitHub gave no answer to GET repos/noldova-com/tools/git/tags/${GitHubTagsTests.TAG_OBJECT}: The operation was aborted due to timeout`, GitHubTagsTests.readFailure(result));
  }

  @TestMethod
  public async failsNamingTheRequestWhenCreatingATagIsNotAnsweredAsync(): Promise<void> {
    await using api = await GitHubApiFixture.startAsync({
      [GitHubTagsTests.REFERENCE]: GitHubApiAnswer.json(404, { message: "Not Found" }),
      [GitHubTagsTests.CREATE]: GitHubApiAnswer.HELD
    });

    const result = await new TagStep(GitHubTagsTests.createTags(api)).runAsync(["0.0.4", GitHubTagsTests.COMMIT]);

    Assert.isFalse(result.isSuccessful);
    Assert.areEqual("GitHub gave no answer to POST repos/noldova-com/tools/git/refs: The operation was aborted due to timeout", result.message);
    Assert.areEqual(JSON.stringify(["GET", "POST", "POST", "POST"]), JSON.stringify(api.requests.map(t => t.method)));
  }

  @TestMethod
  public async sendsARequestAgainWhenGitHubDoesNotAnswerInTimeAsync(): Promise<void> {
    const waits: number[] = [];
    await using api = await GitHubApiFixture.startAsync({ [GitHubTagsTests.REFERENCE]: [GitHubApiAnswer.HELD, GitHubApiAnswer.json(200, { object: { type: "commit", sha: GitHubTagsTests.COMMIT } })] });

    const commit = await GitHubTagsTests.createTags(api, waits).readTagAsync("v0.0.4");

    Assert.areEqual(GitHubTagsTests.COMMIT, commit);
    Assert.areEqual(2, api.requests.length);
    Assert.areEqual("5000", waits.join(","));
  }

  @TestData(502)
  @TestData(503)
  @TestData(504)
  @TestMethod
  public async sendsARequestAgainWhenGitHubIsUnavailableAsync(status: number): Promise<void> {
    const waits: number[] = [];
    await using api = await GitHubApiFixture.startAsync({ [GitHubTagsTests.REFERENCE]: [GitHubApiAnswer.json(status, { message: "Unavailable" }), GitHubApiAnswer.json(200, { object: { type: "commit", sha: GitHubTagsTests.COMMIT } })] });

    const commit = await GitHubTagsTests.createTags(api, waits).readTagAsync("v0.0.4");

    Assert.areEqual(GitHubTagsTests.COMMIT, commit);
    Assert.areEqual(2, api.requests.length);
    Assert.areEqual("5000", waits.join(","));
  }

  @TestMethod
  public async reportsTheLastAnswerWhenTheAttemptsRunOutAsync(): Promise<void> {
    const waits: number[] = [];
    await using api = await GitHubApiFixture.startAsync({
      [GitHubTagsTests.REFERENCE]: [GitHubApiAnswer.json(502, { message: "First" }), GitHubApiAnswer.json(503, { message: "Second" }), GitHubApiAnswer.json(504, { message: "Third" }), GitHubApiAnswer.json(200, { object: { type: "commit", sha: GitHubTagsTests.COMMIT } })]
    });

    const result = await GitHubTagsTests.createTags(api, waits).readTagAsync("v0.0.4");

    Assert.areEqual("GitHub answered GET repos/noldova-com/tools/git/ref/tags/v0.0.4 with 504: Third", GitHubTagsTests.readFailure(result));
    Assert.areEqual(3, api.requests.length);
    Assert.areEqual("5000,15000", waits.join(","));
  }

  @TestData(400)
  @TestData(403)
  @TestData(500)
  @TestMethod
  public async returnsAnotherAnswerAtOnceAsync(status: number): Promise<void> {
    const waits: number[] = [];
    await using api = await GitHubApiFixture.startAsync({ [GitHubTagsTests.REFERENCE]: [GitHubApiAnswer.json(status, { message: "Refused" }), GitHubApiAnswer.json(200, { object: { type: "commit", sha: GitHubTagsTests.COMMIT } })] });

    const result = await GitHubTagsTests.createTags(api, waits).readTagAsync("v0.0.4");

    Assert.areEqual(`GitHub answered GET repos/noldova-com/tools/git/ref/tags/v0.0.4 with ${status}: Refused`, GitHubTagsTests.readFailure(result));
    Assert.areEqual(1, api.requests.length);
    Assert.areEqual(0, waits.length);
  }

  @TestData(503, "7", 7_000)
  @TestData(403, "60", 60_000)
  @TestData(429, "0", 0)
  @TestData(503, "Wed, 21 Oct 2026 07:28:00 GMT", 5_000)
  @TestMethod
  public async waitsAsGitHubAsksBeforeSendingARequestAgainAsync(status: number, retryAfter: string, expected: number): Promise<void> {
    const waits: number[] = [];
    await using api = await GitHubApiFixture.startAsync({ [GitHubTagsTests.REFERENCE]: [GitHubApiAnswer.json(status, { message: "Wait" }, retryAfter), GitHubApiAnswer.json(200, { object: { type: "commit", sha: GitHubTagsTests.COMMIT } })] });

    const commit = await GitHubTagsTests.createTags(api, waits).readTagAsync("v0.0.4");

    Assert.areEqual(GitHubTagsTests.COMMIT, commit);
    Assert.areEqual(2, api.requests.length);
    Assert.areEqual(String(expected), waits.join(","));
  }

  @TestData(503, "61")
  @TestData(403, "3600")
  @TestData(403, "Wed, 21 Oct 2026 07:28:00 GMT")
  @TestMethod
  public async doesNotWaitForALongerRetryAfterAsync(status: number, retryAfter: string): Promise<void> {
    const waits: number[] = [];
    await using api = await GitHubApiFixture.startAsync({ [GitHubTagsTests.REFERENCE]: [GitHubApiAnswer.json(status, { message: "Wait" }, retryAfter), GitHubApiAnswer.json(200, { object: { type: "commit", sha: GitHubTagsTests.COMMIT } })] });

    const result = await GitHubTagsTests.createTags(api, waits).readTagAsync("v0.0.4");

    Assert.areEqual(`GitHub answered GET repos/noldova-com/tools/git/ref/tags/v0.0.4 with ${status}: Wait`, GitHubTagsTests.readFailure(result));
    Assert.areEqual(1, api.requests.length);
    Assert.areEqual(0, waits.length);
  }

  @TestMethod
  public async countsARetryAfterAmongTheAttemptsAsync(): Promise<void> {
    const waits: number[] = [];
    await using api = await GitHubApiFixture.startAsync({ [GitHubTagsTests.REFERENCE]: GitHubApiAnswer.json(403, { message: "Wait" }, "1") });

    const result = await GitHubTagsTests.createTags(api, waits).readTagAsync("v0.0.4");

    Assert.areEqual("GitHub answered GET repos/noldova-com/tools/git/ref/tags/v0.0.4 with 403: Wait", GitHubTagsTests.readFailure(result));
    Assert.areEqual(3, api.requests.length);
    Assert.areEqual("1000,1000", waits.join(","));
  }

  @TestMethod
  public async ignoresARetryAfterOnAnAnswerThatIsNotAFailureAsync(): Promise<void> {
    const waits: number[] = [];
    await using api = await GitHubApiFixture.startAsync({
      [GitHubTagsTests.REFERENCE]: GitHubApiAnswer.json(200, { object: { type: "commit", sha: GitHubTagsTests.COMMIT } }, "7")
    });

    const commit = await GitHubTagsTests.createTags(api, waits).readTagAsync("v0.0.4");

    Assert.areEqual(GitHubTagsTests.COMMIT, commit);
    Assert.areEqual(1, api.requests.length);
    Assert.areEqual(0, waits.length);
  }

  @TestMethod
  public async waitsWithATimerWhenItIsGivenNoOtherWayAsync(): Promise<void> {
    await using api = await GitHubApiFixture.startAsync({ [GitHubTagsTests.REFERENCE]: [GitHubApiAnswer.json(503, { message: "Wait" }, "0"), GitHubApiAnswer.json(200, { object: { type: "commit", sha: GitHubTagsTests.COMMIT } })] });
    const tags = new GitHubTags({ GITHUB_API_URL: api.url, GITHUB_REPOSITORY: "noldova-com/tools", GITHUB_TOKEN: GitHubTagsTests.TOKEN });

    const commit = await tags.readTagAsync("v0.0.4");

    Assert.areEqual(GitHubTagsTests.COMMIT, commit);
    Assert.areEqual(2, api.requests.length);
  }

  @TestMethod
  public async failsNamingTheRequestWhenGitHubCannotBeReachedAsync(): Promise<void> {
    const waits: number[] = [];
    const api = await GitHubApiFixture.startAsync({});
    const tags = GitHubTagsTests.createTags(api, waits);
    await api[Symbol.asyncDispose]();

    const result = await tags.readTagAsync("v0.0.4");

    const failure = GitHubTagsTests.readFailure(result);
    Assert.isTrue(failure.startsWith("GitHub gave no answer to GET repos/noldova-com/tools/git/ref/tags/v0.0.4: "), failure);
    Assert.isTrue(failure.includes("ECONNREFUSED"), failure);
    Assert.areEqual("5000,15000", waits.join(","));
  }

  @TestMethod
  public async sendsARequestAgainWhenTheConnectionIsLostAsync(): Promise<void> {
    const waits: number[] = [];
    await using api = await GitHubApiFixture.startAsync({ [GitHubTagsTests.REFERENCE]: [GitHubApiAnswer.RESET, GitHubApiAnswer.json(200, { object: { type: "commit", sha: GitHubTagsTests.COMMIT } })] });

    const commit = await GitHubTagsTests.createTags(api, waits).readTagAsync("v0.0.4");

    Assert.areEqual(GitHubTagsTests.COMMIT, commit);
    Assert.areEqual(2, api.requests.length);
    Assert.areEqual("5000", waits.join(","));
  }

  @TestMethod
  public async passesOnAnErrorThatIsNotALostRequestAsync(): Promise<void> {
    const waits: number[] = [];
    await using api = await GitHubApiFixture.startAsync({});
    const environment = { GITHUB_API_URL: api.url, GITHUB_REPOSITORY: "noldova-com/tools", GITHUB_TOKEN: GitHubTagsTests.TOKEN };
    const tags = new GitHubTags(environment, undefined, async milliseconds => {
      waits.push(milliseconds);
    }, () => {
      throw new RangeError("Broken");
    });

    await Assert.throwsAsync(() => tags.readTagAsync("v0.0.4"), RangeError);

    Assert.areEqual(0, waits.length);
  }

  @TestData(true)
  @TestData(false)
  @TestMethod
  public async treatsARepeatedCreateGitHubRefusesAsDoneWhenTheTagIsAtTheCommitAsync(isTimeout: boolean): Promise<void> {
    const waits: number[] = [];
    await using api = await GitHubApiFixture.startAsync({
      [GitHubTagsTests.REFERENCE]: [GitHubApiAnswer.json(404, { message: "Not Found" }), GitHubApiAnswer.json(200, { object: { type: "commit", sha: GitHubTagsTests.COMMIT } })],
      [GitHubTagsTests.CREATE]: [isTimeout ? GitHubApiAnswer.HELD : GitHubApiAnswer.json(502, { message: "Bad gateway" }), GitHubApiAnswer.json(422, { message: "Reference already exists" })]
    });

    const result = await new TagStep(GitHubTagsTests.createTags(api, waits)).runAsync(["0.0.4", GitHubTagsTests.COMMIT]);

    Assert.isTrue(result.isSuccessful, result.message);
    Assert.areEqual(`v0.0.4 already points to commit ${GitHubTagsTests.COMMIT}.`, result.message);
    Assert.areEqual(JSON.stringify(["GET", "POST", "POST", "GET", "GET"]), JSON.stringify(api.requests.map(t => t.method)));
    Assert.areEqual("5000", waits.join(","));
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

  private static createTags(api: GitHubApiFixture, waits: number[] = []): GitHubTags {
    const environment = { GITHUB_API_URL: api.url, GITHUB_REPOSITORY: "noldova-com/tools", GITHUB_TOKEN: GitHubTagsTests.TOKEN };

    return new GitHubTags(environment, undefined, async milliseconds => {
      waits.push(milliseconds);
    }, () => api.createAttemptSignal());
  }

  private static readFailure(result: string | boolean | StepResult): string {
    if (!(result instanceof StepResult) || result.isSuccessful)
      throw new Error(`Expected a failed result, not ${String(result)}.`);

    return result.message;
  }
}
