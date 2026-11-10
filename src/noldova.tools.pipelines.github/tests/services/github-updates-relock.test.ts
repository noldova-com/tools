/**
 * @license
 * Copyright (c) Noldova.
 *
 * This source code is licensed under the license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { Assert, TestClass, TestData, TestMethod } from "@noldova/context.testing";
import { type IStepOutput, StepResult } from "@noldova/tools.pipelines";
import { GitHubUpdates } from "@noldova/tools.pipelines.github";

import { GitHubApiAnswer, GitHubApiFixture } from "./github-api.fixture.js";
import { ZipArchiveFixture } from "./zip-archive.fixture.js";

class RecordingOutput implements IStepOutput {
  public readonly lines: string[] = [];

  public writeProgress(message: string): void {
    this.lines.push(`progress: ${message}`);
  }

  public writeProgressStart(message: string): void {
    this.lines.push(`progress start: ${message}`);
  }

  public writeSuccess(message: string): void {
    this.lines.push(`success: ${message}`);
  }

  public writeFailure(message: string): void {
    this.lines.push(`failure: ${message}`);
  }
}

@TestClass
export class GitHubUpdatesRelockTests {
  private static readonly COMMIT: string = "225059f4c1e6a3b2d8f7e9a0b1c2d3e4f5a6b7c8";
  private static readonly TOKEN: string = "test-token-value";
  private static readonly REPOSITORY: string = "noldova-com/target";
  private static readonly REQUEST: string = "{\"source\":\"tools\"}";
  private static readonly RESULT: string = "{\"moves\":[],\"lockLines\":[],\"files\":{}}";
  private static readonly RUN_URL: string = "https://github.example/noldova-com/target/actions/runs/77";
  private static readonly WORKFLOW: string = "GET /repos/noldova-com/target/actions/workflows/relock.yml";
  private static readonly TARGET: string = "GET /repos/noldova-com/target";
  private static readonly DISPATCH: string = "POST /repos/noldova-com/target/actions/workflows/relock.yml/dispatches";
  private static readonly RUN: string = "GET /repos/noldova-com/target/actions/runs/77";
  private static readonly ARTIFACTS: string = "GET /repos/noldova-com/target/actions/runs/77/artifacts";
  private static readonly ARCHIVE: string = "GET /repos/noldova-com/target/actions/artifacts/5/zip";
  private static readonly DOWNLOAD: string = "GET /download/relock.zip";

  @TestMethod
  public async answersNullForARepositoryWithoutTheRelockWorkflowAsync(): Promise<void> {
    await using api = await GitHubApiFixture.startAsync({});

    Assert.isNull(await GitHubUpdatesRelockTests.createUpdates(api).relockAsync(GitHubUpdatesRelockTests.REPOSITORY, GitHubUpdatesRelockTests.COMMIT, GitHubUpdatesRelockTests.REQUEST));
    Assert.areEqual(GitHubUpdatesRelockTests.WORKFLOW, api.requests.map(t => `${t.method} ${t.url}`).join("\n"));
  }

  @TestData(true)
  @TestData(false)
  @TestMethod
  public async dispatchesWaitsAndReadsTheResultFromTheArtifactAsync(isDeflated: boolean): Promise<void> {
    const archive = ZipArchiveFixture.create([
      { name: "other.json", text: "{}", isDeflated },
      { name: "relock.json", text: GitHubUpdatesRelockTests.RESULT, isDeflated }
    ]);
    await using api = await GitHubApiFixture.startAsync({
      ...GitHubUpdatesRelockTests.createAnswers(),
      [GitHubUpdatesRelockTests.RUN]: [
        GitHubApiAnswer.json(200, { status: "queued", conclusion: null }),
        GitHubApiAnswer.json(200, { status: "in_progress", conclusion: null }),
        GitHubApiAnswer.json(200, { status: "completed", conclusion: "success" })
      ],
      [GitHubUpdatesRelockTests.DOWNLOAD]: GitHubApiAnswer.binary(archive)
    });
    const output = new RecordingOutput();
    const waits: number[] = [];

    const result = await GitHubUpdatesRelockTests.createUpdates(api, output, waits).relockAsync(GitHubUpdatesRelockTests.REPOSITORY, GitHubUpdatesRelockTests.COMMIT, GitHubUpdatesRelockTests.REQUEST);

    Assert.areEqual(GitHubUpdatesRelockTests.RESULT, result);
    Assert.areEqual("15000,15000", waits.join(","));
    Assert.areEqual(`progress: noldova-com/target relocks itself in ${GitHubUpdatesRelockTests.RUN_URL}`, output.lines.join("\n"));
    Assert.areEqual(
      [
        GitHubUpdatesRelockTests.WORKFLOW,
        GitHubUpdatesRelockTests.TARGET,
        GitHubUpdatesRelockTests.DISPATCH,
        GitHubUpdatesRelockTests.RUN,
        GitHubUpdatesRelockTests.RUN,
        GitHubUpdatesRelockTests.RUN,
        GitHubUpdatesRelockTests.ARTIFACTS,
        GitHubUpdatesRelockTests.ARCHIVE,
        GitHubUpdatesRelockTests.DOWNLOAD
      ].join("\n"),
      api.requests.map(t => `${t.method} ${t.url}`).join("\n"));
    const dispatch = api.requests.find(t => `${t.method} ${t.url}` === GitHubUpdatesRelockTests.DISPATCH);
    Assert.areEqual(
      JSON.stringify({ ref: "trunk", inputs: { commit: GitHubUpdatesRelockTests.COMMIT, request: GitHubUpdatesRelockTests.REQUEST }, return_run_details: true }),
      dispatch?.body);
    const requested = api.requests.find(t => `${t.method} ${t.url}` === GitHubUpdatesRelockTests.ARCHIVE);
    Assert.areEqual(`Bearer ${GitHubUpdatesRelockTests.TOKEN}`, requested?.headers.authorization);
    const downloaded = api.requests.find(t => `${t.method} ${t.url}` === GitHubUpdatesRelockTests.DOWNLOAD);
    Assert.isUndefined(downloaded?.headers.authorization);
  }

  @TestData("workflow")
  @TestData("target")
  @TestData("dispatch")
  @TestData("run")
  @TestData("artifacts")
  @TestMethod
  public async failsWithGitHubsAnswerWhenARequestIsRefusedAsync(request: string): Promise<void> {
    const keys: Readonly<Record<string, string>> = {
      workflow: GitHubUpdatesRelockTests.WORKFLOW,
      target: GitHubUpdatesRelockTests.TARGET,
      dispatch: GitHubUpdatesRelockTests.DISPATCH,
      run: GitHubUpdatesRelockTests.RUN,
      artifacts: GitHubUpdatesRelockTests.ARTIFACTS
    };
    const key = keys[request] ?? "";
    await using api = await GitHubApiFixture.startAsync({ ...GitHubUpdatesRelockTests.createAnswers(), [key]: GitHubApiAnswer.json(403, { message: "Refused" }) });

    const result = await GitHubUpdatesRelockTests.createUpdates(api).relockAsync(GitHubUpdatesRelockTests.REPOSITORY, GitHubUpdatesRelockTests.COMMIT, GitHubUpdatesRelockTests.REQUEST);

    const [method, resource] = key.split(" ");
    Assert.areEqual(`GitHub answered ${method} ${resource?.slice(1)} with 403: Refused`, GitHubUpdatesRelockTests.readFailure(result));
  }

  @TestData("workflow")
  @TestData("target")
  @TestMethod
  public async failsWhenGitHubGivesNoAnswerAsync(request: string): Promise<void> {
    const key = request === "workflow" ? GitHubUpdatesRelockTests.WORKFLOW : GitHubUpdatesRelockTests.TARGET;
    await using api = await GitHubApiFixture.startAsync({ ...GitHubUpdatesRelockTests.createAnswers(), [key]: GitHubApiAnswer.RESET });

    const result = await GitHubUpdatesRelockTests.createUpdates(api).relockAsync(GitHubUpdatesRelockTests.REPOSITORY, GitHubUpdatesRelockTests.COMMIT, GitHubUpdatesRelockTests.REQUEST);

    Assert.isTrue(GitHubUpdatesRelockTests.readFailure(result).startsWith(`GitHub gave no answer to ${key.replace(" /", " ")}: `));
  }

  @TestData("failure", "The repository's relock run https://github.example/noldova-com/target/actions/runs/77 ended failure, so its pins are left as they are.")
  @TestData(null, "The repository's relock run https://github.example/noldova-com/target/actions/runs/77 ended without a conclusion, so its pins are left as they are.")
  @TestMethod
  public async failsARunThatDidntSucceedAsync(conclusion: string | null, expected: string): Promise<void> {
    await using api = await GitHubApiFixture.startAsync({ ...GitHubUpdatesRelockTests.createAnswers(), [GitHubUpdatesRelockTests.RUN]: GitHubApiAnswer.json(200, { status: "completed", conclusion }) });

    const result = await GitHubUpdatesRelockTests.createUpdates(api).relockAsync(GitHubUpdatesRelockTests.REPOSITORY, GitHubUpdatesRelockTests.COMMIT, GitHubUpdatesRelockTests.REQUEST);

    Assert.areEqual(expected, GitHubUpdatesRelockTests.readFailure(result));
    Assert.isFalse(api.requests.some(t => `${t.method} ${t.url}` === GitHubUpdatesRelockTests.ARTIFACTS));
  }

  @TestMethod
  public async failsARunThatDoesntFinishInTimeAsync(): Promise<void> {
    await using api = await GitHubApiFixture.startAsync({ ...GitHubUpdatesRelockTests.createAnswers(), [GitHubUpdatesRelockTests.RUN]: GitHubApiAnswer.json(200, { status: "in_progress", conclusion: null }) });
    const waits: number[] = [];

    const result = await GitHubUpdatesRelockTests.createUpdates(api, undefined, waits).relockAsync(GitHubUpdatesRelockTests.REPOSITORY, GitHubUpdatesRelockTests.COMMIT, GitHubUpdatesRelockTests.REQUEST);

    Assert.areEqual("The repository's relock run https://github.example/noldova-com/target/actions/runs/77 didn't finish within 60 minutes, so its pins are left as they are.", GitHubUpdatesRelockTests.readFailure(result));
    Assert.areEqual(240, waits.length);
    Assert.areEqual(241, api.requests.filter(t => `${t.method} ${t.url}` === GitHubUpdatesRelockTests.RUN).length);
  }

  @TestMethod
  public async failsARunWithoutTheArtifactAsync(): Promise<void> {
    await using api = await GitHubApiFixture.startAsync({ ...GitHubUpdatesRelockTests.createAnswers(), [GitHubUpdatesRelockTests.ARTIFACTS]: GitHubApiAnswer.json(200, { artifacts: [{ id: 5, name: "other" }] }) });

    const result = await GitHubUpdatesRelockTests.createUpdates(api).relockAsync(GitHubUpdatesRelockTests.REPOSITORY, GitHubUpdatesRelockTests.COMMIT, GitHubUpdatesRelockTests.REQUEST);

    Assert.areEqual("The repository's relock run https://github.example/noldova-com/target/actions/runs/77 left no artifact named relock.", GitHubUpdatesRelockTests.readFailure(result));
  }

  @TestData("archive", "GitHub answered the download of repos/noldova-com/target/actions/artifacts/5/zip with 403 Forbidden.")
  @TestData("unredirected", "GitHub answered the download of repos/noldova-com/target/actions/artifacts/5/zip with 302 Found.")
  @TestData("download", "GitHub answered the download of repos/noldova-com/target/actions/artifacts/5/zip with 404 Not Found.")
  @TestMethod
  public async failsWhenTheArtifactCantBeDownloadedAsync(failing: string, expected: string): Promise<void> {
    const answers: Record<string, GitHubApiAnswer> = {};
    if (failing === "archive")
      answers[GitHubUpdatesRelockTests.ARCHIVE] = new GitHubApiAnswer(403, "", "");
    else if (failing === "unredirected")
      answers[GitHubUpdatesRelockTests.ARCHIVE] = new GitHubApiAnswer(302, "", "");
    else
      answers[GitHubUpdatesRelockTests.DOWNLOAD] = new GitHubApiAnswer(404, "", "");
    await using api = await GitHubApiFixture.startAsync({ ...GitHubUpdatesRelockTests.createAnswers(), ...answers });

    const result = await GitHubUpdatesRelockTests.createUpdates(api).relockAsync(GitHubUpdatesRelockTests.REPOSITORY, GitHubUpdatesRelockTests.COMMIT, GitHubUpdatesRelockTests.REQUEST);

    Assert.areEqual(expected, GitHubUpdatesRelockTests.readFailure(result));
  }

  @TestMethod
  public async failsWhenTheDownloadGetsNoAnswerAsync(): Promise<void> {
    await using api = await GitHubApiFixture.startAsync({ ...GitHubUpdatesRelockTests.createAnswers(), [GitHubUpdatesRelockTests.ARCHIVE]: GitHubApiAnswer.HELD });

    const result = await GitHubUpdatesRelockTests.createUpdates(api).relockAsync(GitHubUpdatesRelockTests.REPOSITORY, GitHubUpdatesRelockTests.COMMIT, GitHubUpdatesRelockTests.REQUEST);

    Assert.areEqual("GitHub gave no answer to GET repos/noldova-com/target/actions/artifacts/5/zip: The operation was aborted due to timeout", GitHubUpdatesRelockTests.readFailure(result));
  }

  @TestMethod
  public async rejectsWhatTheDownloadThrowsThatIsNoMissingAnswerAsync(): Promise<void> {
    await using api = await GitHubApiFixture.startAsync(GitHubUpdatesRelockTests.createAnswers());
    let signals = 0;
    const createSignal = (): AbortSignal => {
      signals++;
      if (signals === 6)
        throw new Error("The signal broke.");

      return api.createAttemptSignal();
    };
    const updates = new GitHubUpdates(GitHubUpdatesRelockTests.createEnvironment(api), undefined, undefined, async () => {}, createSignal);

    const rejection = await updates.relockAsync(GitHubUpdatesRelockTests.REPOSITORY, GitHubUpdatesRelockTests.COMMIT, GitHubUpdatesRelockTests.REQUEST).then(() => null, (error: unknown) => error);

    Assert.areEqual("The signal broke.", rejection instanceof Error ? rejection.message : String(rejection));
  }

  @TestData("without")
  @TestData("unzipped")
  @TestMethod
  public async failsAnArtifactWithoutTheResultAsync(archive: string): Promise<void> {
    const body = archive === "without" ? ZipArchiveFixture.create([{ name: "other.json", text: "{}", isDeflated: true }]) : Buffer.from(GitHubUpdatesRelockTests.RESULT, "utf8");
    await using api = await GitHubApiFixture.startAsync({ ...GitHubUpdatesRelockTests.createAnswers(), [GitHubUpdatesRelockTests.DOWNLOAD]: GitHubApiAnswer.binary(body) });

    const result = await GitHubUpdatesRelockTests.createUpdates(api).relockAsync(GitHubUpdatesRelockTests.REPOSITORY, GitHubUpdatesRelockTests.COMMIT, GitHubUpdatesRelockTests.REQUEST);

    Assert.areEqual("The relock artifact of https://github.example/noldova-com/target/actions/runs/77 holds no relock.json.", GitHubUpdatesRelockTests.readFailure(result));
  }

  private static createAnswers(): Record<string, GitHubApiAnswer | readonly GitHubApiAnswer[]> {
    return {
      [GitHubUpdatesRelockTests.WORKFLOW]: GitHubApiAnswer.json(200, { id: 3, path: ".github/workflows/relock.yml" }),
      [GitHubUpdatesRelockTests.TARGET]: GitHubApiAnswer.json(200, { default_branch: "trunk" }),
      [GitHubUpdatesRelockTests.DISPATCH]: GitHubApiAnswer.json(200, { workflow_run_id: 77, html_url: GitHubUpdatesRelockTests.RUN_URL }),
      [GitHubUpdatesRelockTests.RUN]: GitHubApiAnswer.json(200, { status: "completed", conclusion: "success" }),
      [GitHubUpdatesRelockTests.ARTIFACTS]: GitHubApiAnswer.json(200, { artifacts: [{ id: 4, name: "other" }, { id: 5, name: "relock" }] }),
      [GitHubUpdatesRelockTests.ARCHIVE]: GitHubApiAnswer.redirect("/download/relock.zip"),
      [GitHubUpdatesRelockTests.DOWNLOAD]: GitHubApiAnswer.binary(ZipArchiveFixture.create([{ name: "relock.json", text: GitHubUpdatesRelockTests.RESULT, isDeflated: true }]))
    };
  }

  private static createEnvironment(api: GitHubApiFixture): Record<string, string | undefined> {
    return { GITHUB_API_URL: api.url, GITHUB_SERVER_URL: ".", GITHUB_REPOSITORY: "noldova-com/tools", GITHUB_TOKEN: GitHubUpdatesRelockTests.TOKEN };
  }

  private static createUpdates(api: GitHubApiFixture, output?: IStepOutput, waits: number[] = []): GitHubUpdates {
    return new GitHubUpdates(GitHubUpdatesRelockTests.createEnvironment(api), undefined, undefined, async (milliseconds: number) => {
      waits.push(milliseconds);
    }, () => api.createAttemptSignal(), output);
  }

  private static readFailure(result: string | null | StepResult): string {
    if (!(result instanceof StepResult) || result.isSuccessful)
      throw new Error(`Expected a failed result, not ${String(result)}.`);

    return result.message;
  }
}
