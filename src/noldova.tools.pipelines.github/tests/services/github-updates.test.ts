/**
 * @license
 * Copyright (c) Noldova.
 *
 * This source code is licensed under the license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { Assert, TestClass, TestData, TestMethod } from "@noldova/context.testing";
import { ProcessResult, ProcessRunner, StepResult } from "@noldova/tools.pipelines";
import { GitHubUpdates } from "@noldova/tools.pipelines.github";

import { GitHubApiAnswer, GitHubApiFixture } from "./github-api.fixture.js";
import { GitCloneFixture } from "./git-clone.fixture.js";

class RecordingProcessRunner extends ProcessRunner {
  public readonly environments: Readonly<Record<string, string>>[] = [];
  public readonly calls: string[] = [];

  public override async runAsync(program: string, values: readonly string[], workingDirectory: string, environment?: Readonly<Record<string, string>>): Promise<ProcessResult> {
    this.calls.push(`${program} ${values.join(" ")}`);
    this.environments.push(environment ?? {});

    return await super.runAsync(program, values, workingDirectory, environment);
  }
}

@TestClass
export class GitHubUpdatesTests {
  private static readonly COMMIT: string = "225059f4c1e6a3b2d8f7e9a0b1c2d3e4f5a6b7c8";
  private static readonly OTHER_COMMIT: string = "0123456789abcdef0123456789abcdef01234567";
  private static readonly TOKEN: string = "test-token-value";
  private static readonly BRANCH: string = "pipelines/update-tools";
  private static readonly REPOSITORY: string = "noldova-com/target";
  private static readonly PAGE_1: string = "GET /installation/repositories?per_page=100&page=1";
  private static readonly PAGE_2: string = "GET /installation/repositories?per_page=100&page=2";
  private static readonly SOURCE: string = "GET /repos/noldova-com/tools";
  private static readonly PULLS_OF_COMMIT: string = `GET /repos/noldova-com/tools/commits/${GitHubUpdatesTests.COMMIT}/pulls`;
  private static readonly OPEN_PULLS: string = "GET /repos/noldova-com/target/pulls?state=open&head=noldova-com%3Apipelines%2Fupdate-tools";
  private static readonly TARGET: string = "GET /repos/noldova-com/target";
  private static readonly CREATE_ISSUE: string = "POST /repos/noldova-com/target/issues";
  private static readonly CREATE_PULL: string = "POST /repos/noldova-com/target/pulls";
  private static readonly RENAME_ISSUE: string = "PATCH /repos/noldova-com/target/issues/9";
  private static readonly UPDATE_PULL: string = "PATCH /repos/noldova-com/target/pulls/3";
  private static readonly PULL_URL: string = "https://github.example/noldova-com/target/pull/3";

  @TestMethod
  public async readsTheSourceNameFromTheRepositoryAsync(): Promise<void> {
    await using api = await GitHubApiFixture.startAsync({});

    Assert.areEqual("tools", GitHubUpdatesTests.createUpdates(api).readSourceName());
    Assert.areEqual("GITHUB_TOKEN", GitHubUpdatesTests.createUpdates(api).credentialVariables.join(","));
  }

  @TestData("GITHUB_API_URL")
  @TestData("GITHUB_SERVER_URL")
  @TestData("GITHUB_REPOSITORY")
  @TestData("GITHUB_TOKEN")
  @TestMethod
  public async failsNamingAMissingOrEmptyVariableWithoutARequestAsync(name: string): Promise<void> {
    await using api = await GitHubApiFixture.startAsync({});
    const environment = GitHubUpdatesTests.createEnvironment(api, ".");
    const missing = new GitHubUpdates({ ...environment, [name]: undefined });
    const empty = new GitHubUpdates({ ...environment, [name]: "" });
    const expected = `The environment variable ${name} is not set; the dependents step needs it to reach GitHub.`;

    Assert.areEqual(expected, GitHubUpdatesTests.readFailure(missing.readSourceName()));
    Assert.areEqual(expected, GitHubUpdatesTests.readFailure(await empty.listRepositoriesAsync()));
    Assert.areEqual(expected, GitHubUpdatesTests.readFailure(await missing.readReleaseNotesAsync("0.0.4", GitHubUpdatesTests.COMMIT)));
    Assert.areEqual(expected, GitHubUpdatesTests.readFailure(await empty.checkOutAsync(GitHubUpdatesTests.REPOSITORY, "target")));
    Assert.areEqual(expected, GitHubUpdatesTests.readFailure(await missing.pushAsync(GitHubUpdatesTests.REPOSITORY, "target", GitHubUpdatesTests.BRANCH, null)));
    Assert.areEqual(expected, GitHubUpdatesTests.readFailure(await empty.fetchBranchAsync(GitHubUpdatesTests.REPOSITORY, "target", GitHubUpdatesTests.BRANCH)));
    Assert.areEqual(expected, GitHubUpdatesTests.readFailure(await empty.proposeAsync(GitHubUpdatesTests.REPOSITORY, GitHubUpdatesTests.BRANCH, "Title", "Body")));
    Assert.areEqual(0, api.requests.length);
  }

  @TestMethod
  public async listsTheInstalledRepositoriesAPageAtATimeButTheSourceAndTheArchivedAsync(): Promise<void> {
    const firstPage = Array.from({ length: 100 }, (_, index) => ({ full_name: `noldova-com/r${String(index).padStart(3, "0")}`, archived: index === 5, private: index % 2 === 0 }));
    firstPage[7] = { full_name: "noldova-com/Tools", archived: false, private: true };
    await using api = await GitHubApiFixture.startAsync({
      [GitHubUpdatesTests.SOURCE]: GitHubApiAnswer.json(200, { full_name: "noldova-com/tools", private: true }),
      [GitHubUpdatesTests.PAGE_1]: GitHubApiAnswer.json(200, { total_count: 101, repositories: firstPage }),
      [GitHubUpdatesTests.PAGE_2]: GitHubApiAnswer.json(200, { total_count: 101, repositories: [{ full_name: "noldova-com/a", archived: false, private: false }] })
    });

    const repositories = await GitHubUpdatesTests.createUpdates(api).listRepositoriesAsync();

    if (repositories instanceof StepResult)
      throw new Error(repositories.message);
    Assert.areEqual(99, repositories.length);
    Assert.areEqual("noldova-com/a", repositories[0]);
    Assert.isTrue(repositories.includes("noldova-com/r000"));
    Assert.isFalse(repositories.includes("noldova-com/r005"));
    Assert.isFalse(repositories.includes("noldova-com/Tools"));
    Assert.areEqual(3, api.requests.length);
    Assert.areEqual(`Bearer ${GitHubUpdatesTests.TOKEN}`, api.requests[0]?.headers.authorization);
  }

  @TestData("public")
  @TestData("missing")
  @TestData("refused")
  @TestData("held")
  @TestMethod
  public async listsOnlyPublicRepositoriesUnlessTheSourceIsPrivateAsync(source: string): Promise<void> {
    const answers: Readonly<Record<string, GitHubApiAnswer>> = {
      public: GitHubApiAnswer.json(200, { full_name: "noldova-com/tools", private: false }),
      refused: GitHubUpdatesTests.createFailure(false),
      held: GitHubUpdatesTests.createFailure(true)
    };
    const sourceAnswer = answers[source];
    await using api = await GitHubApiFixture.startAsync({
      ...sourceAnswer === undefined ? {} : { [GitHubUpdatesTests.SOURCE]: sourceAnswer },
      [GitHubUpdatesTests.PAGE_1]: GitHubApiAnswer.json(200, {
        total_count: 2,
        repositories: [{ full_name: "noldova-com/hidden", archived: false, private: true }, { full_name: "noldova-com/open", archived: false, private: false }]
      })
    });

    const repositories = await GitHubUpdatesTests.createUpdates(api).listRepositoriesAsync();

    if (repositories instanceof StepResult)
      throw new Error(repositories.message);
    Assert.areEqual("noldova-com/open", repositories.join(","));
  }

  @TestData(false, "GitHub answered GET installation/repositories?per_page=100&page=1 with 403: Refused")
  @TestData(true, "GitHub gave no answer to GET installation/repositories?per_page=100&page=1: The operation was aborted due to timeout")
  @TestMethod
  public async failsWhenListingTheRepositoriesFailsAsync(isHeld: boolean, expected: string): Promise<void> {
    await using api = await GitHubApiFixture.startAsync({ [GitHubUpdatesTests.PAGE_1]: GitHubUpdatesTests.createFailure(isHeld) });

    Assert.areEqual(expected, GitHubUpdatesTests.readFailure(await GitHubUpdatesTests.createUpdates(api).listRepositoriesAsync()));
  }

  @TestMethod
  public async readsTheNotesSectionOfThePullRequestThatMergedTheCommitAsync(): Promise<void> {
    const body = [
      "# Summary",
      "## Release notes for 0x0x4",
      "- Not these.",
      "## Release notes for 0.0.4",
      "",
      "- Adds a thing.",
      "### Detail",
      "- More.",
      "## Linked issue",
      "Closes #1"
    ].join("\r\n");
    await using api = await GitHubApiFixture.startAsync({
      [GitHubUpdatesTests.PULLS_OF_COMMIT]: GitHubApiAnswer.json(200, [
        { merge_commit_sha: GitHubUpdatesTests.OTHER_COMMIT, body: "## Release notes for 0.0.4\n- Wrong pull request." },
        { merge_commit_sha: GitHubUpdatesTests.COMMIT, body }
      ])
    });

    const notes = await GitHubUpdatesTests.createUpdates(api).readReleaseNotesAsync("0.0.4", GitHubUpdatesTests.COMMIT);

    Assert.areEqual("## Release notes for 0.0.4\n\n- Adds a thing.\n### Detail\n- More.", notes);
  }

  @TestData("[{ \"merge_commit_sha\": null, \"body\": \"# Release notes for 0.0.4\\n- Open.\" }]", "")
  @TestData("[{ \"merge_commit_sha\": \"0123456789abcdef0123456789abcdef01234567\", \"body\": \"# Release notes for 0.0.4\\n- Other.\" }]", "")
  @TestData("[{ \"merge_commit_sha\": \"225059f4c1e6a3b2d8f7e9a0b1c2d3e4f5a6b7c8\", \"body\": \"Release notes for 0.0.4\\n\\n# Release notes for 0.0.4\\n- First.\" }]", "# Release notes for 0.0.4\n- First.")
  @TestData("[{ \"merge_commit_sha\": \"225059f4c1e6a3b2d8f7e9a0b1c2d3e4f5a6b7c8\", \"body\": null }]", "")
  @TestData("[{ \"merge_commit_sha\": \"225059f4c1e6a3b2d8f7e9a0b1c2d3e4f5a6b7c8\", \"body\": \"## Release notes for 0.0.3\\n- Older.\" }]", "")
  @TestData("[]", "")
  @TestMethod
  public async readsNotesOnlyFromThePullRequestThatMergedTheCommitAsync(answer: string, expected: string): Promise<void> {
    await using api = await GitHubApiFixture.startAsync({ [GitHubUpdatesTests.PULLS_OF_COMMIT]: new GitHubApiAnswer(200, answer) });

    Assert.areEqual(expected, await GitHubUpdatesTests.createUpdates(api).readReleaseNotesAsync("0.0.4", GitHubUpdatesTests.COMMIT));
  }

  @TestData(false, "GitHub answered GET repos/noldova-com/tools/commits/225059f4c1e6a3b2d8f7e9a0b1c2d3e4f5a6b7c8/pulls with 403: Refused")
  @TestData(true, "GitHub gave no answer to GET repos/noldova-com/tools/commits/225059f4c1e6a3b2d8f7e9a0b1c2d3e4f5a6b7c8/pulls: The operation was aborted due to timeout")
  @TestMethod
  public async failsWhenReadingThePullRequestsOfTheCommitFailsAsync(isHeld: boolean, expected: string): Promise<void> {
    await using api = await GitHubApiFixture.startAsync({ [GitHubUpdatesTests.PULLS_OF_COMMIT]: GitHubUpdatesTests.createFailure(isHeld) });

    Assert.areEqual(expected, GitHubUpdatesTests.readFailure(await GitHubUpdatesTests.createUpdates(api).readReleaseNotesAsync("0.0.4", GitHubUpdatesTests.COMMIT)));
  }

  @TestMethod
  public async clonesAndPushesWithTheTokenOnlyInTheEnvironmentAsync(): Promise<void> {
    using source = GitCloneFixture.create({ "package.json": "{}\n" });
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "tools-pipelines-github-server-"));
    try {
      execFileSync("git", ["clone", "--quiet", "--bare", "--", source.directory, path.join(root, "noldova-com", "target.git")]);
      await using api = await GitHubApiFixture.startAsync({});
      const processRunner = new RecordingProcessRunner();
      const updates = new GitHubUpdates(GitHubUpdatesTests.createEnvironment(api, root), processRunner);
      const directory = path.join(root, "checkout");

      Assert.isNull(await updates.checkOutAsync(GitHubUpdatesTests.REPOSITORY, directory));
      fs.writeFileSync(path.join(directory, "package.json"), "{ \"changed\": true }\n");
      execFileSync("git", ["-c", "user.name=Pipelines Tests", "-c", "user.email=pipelines-tests@example.com", "-c", "commit.gpgsign=false", "commit", "--quiet", "--all", "--no-verify", "--message", "Change"], { cwd: directory });
      Assert.isNull(await updates.fetchBranchAsync(GitHubUpdatesTests.REPOSITORY, directory, GitHubUpdatesTests.BRANCH));
      Assert.isNull(await updates.pushAsync(GitHubUpdatesTests.REPOSITORY, directory, GitHubUpdatesTests.BRANCH, null));

      const pushed = execFileSync("git", ["rev-parse", `refs/heads/${GitHubUpdatesTests.BRANCH}`], { cwd: path.join(root, "noldova-com", "target.git"), encoding: "utf8" }).trim();
      Assert.areEqual(execFileSync("git", ["rev-parse", "HEAD"], { cwd: directory, encoding: "utf8" }).trim(), pushed);
      const url = `${root}/noldova-com/target.git`;
      Assert.areEqual(
        [
          `git clone --quiet --depth 1 --no-tags -- ${url} ${directory}`,
          `git ls-remote --exit-code --heads -- ${url} refs/heads/${GitHubUpdatesTests.BRANCH}`,
          `git push --quiet -- ${url} HEAD:refs/heads/${GitHubUpdatesTests.BRANCH}`
        ].join("\n"),
        processRunner.calls.join("\n"));
      Assert.isFalse(processRunner.calls.join("\n").includes(GitHubUpdatesTests.TOKEN));
      const environment = processRunner.environments[0];
      Assert.areEqual("1", environment?.["GIT_CONFIG_COUNT"]);
      Assert.areEqual(`http.${root}/.extraheader`, environment?.["GIT_CONFIG_KEY_0"]);
      Assert.areEqual(`AUTHORIZATION: basic ${Buffer.from(`x-access-token:${GitHubUpdatesTests.TOKEN}`).toString("base64")}`, environment?.["GIT_CONFIG_VALUE_0"]);
      Assert.areEqual("0", environment?.["GIT_TERMINAL_PROMPT"]);
      Assert.areEqual(0, api.requests.length);
    }
    finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }

  @TestMethod
  public async failsWithGitsExitCodeAndErrorWhenCloningOrPushingFailsAsync(): Promise<void> {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "tools-pipelines-github-server-"));
    try {
      await using api = await GitHubApiFixture.startAsync({});
      const updates = new GitHubUpdates(GitHubUpdatesTests.createEnvironment(api, root));

      const cloned = GitHubUpdatesTests.readFailure(await updates.checkOutAsync(GitHubUpdatesTests.REPOSITORY, path.join(root, "checkout")));
      const pushed = GitHubUpdatesTests.readFailure(await updates.pushAsync(GitHubUpdatesTests.REPOSITORY, root, GitHubUpdatesTests.BRANCH, null));
      const listed = GitHubUpdatesTests.readFailure(await updates.fetchBranchAsync(GitHubUpdatesTests.REPOSITORY, root, GitHubUpdatesTests.BRANCH));

      Assert.isTrue(cloned.startsWith("git clone exited with code 128: "), cloned);
      Assert.isTrue(pushed.startsWith("git push exited with code 128: "), pushed);
      Assert.isTrue(listed.startsWith("git ls-remote exited with code 128: "), listed);
      Assert.isFalse(cloned.includes(GitHubUpdatesTests.TOKEN));
    }
    finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }

  @TestMethod
  public async failsWithTheExitCodeAloneWhenGitWritesNoErrorAsync(): Promise<void> {
    class SilentProcessRunner extends ProcessRunner {
      public override async runAsync(): Promise<ProcessResult> {
        return new ProcessResult(1, "", " \n");
      }
    }
    await using api = await GitHubApiFixture.startAsync({});

    const result = await new GitHubUpdates(GitHubUpdatesTests.createEnvironment(api, "."), new SilentProcessRunner()).pushAsync(GitHubUpdatesTests.REPOSITORY, ".", GitHubUpdatesTests.BRANCH, null);

    Assert.areEqual("git push exited with code 1.", GitHubUpdatesTests.readFailure(result));
  }

  @TestMethod
  public async fetchesAnOpenBranchAndReplacesItOnlyWhileItIsThereAsync(): Promise<void> {
    using source = GitCloneFixture.create({ "package.json": "{}\n" });
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "tools-pipelines-github-server-"));
    try {
      const server = path.join(root, "noldova-com", "target.git");
      execFileSync("git", ["clone", "--quiet", "--bare", "--", source.directory, server]);
      const open = GitHubUpdatesTests.commitTree(server, "main", "Open");
      execFileSync("git", ["update-ref", `refs/heads/${GitHubUpdatesTests.BRANCH}`, open], { cwd: server });
      await using api = await GitHubApiFixture.startAsync({});
      const updates = new GitHubUpdates(GitHubUpdatesTests.createEnvironment(api, root));
      const directory = path.join(root, "checkout");
      Assert.isNull(await updates.checkOutAsync(GitHubUpdatesTests.REPOSITORY, directory));
      execFileSync("git", ["-c", "user.name=Pipelines Tests", "-c", "user.email=pipelines-tests@example.com", "-c", "commit.gpgsign=false", "commit", "--quiet", "--allow-empty", "--no-verify", "--message", "Change"], { cwd: directory });

      const fetched = await updates.fetchBranchAsync(GitHubUpdatesTests.REPOSITORY, directory, GitHubUpdatesTests.BRANCH);

      Assert.areEqual(open, fetched);
      Assert.areEqual("Open", execFileSync("git", ["log", "-1", "--format=%s", open], { cwd: directory, encoding: "utf8" }).trim());
      Assert.isTrue(GitHubUpdatesTests.readFailure(await updates.pushAsync(GitHubUpdatesTests.REPOSITORY, directory, GitHubUpdatesTests.BRANCH, null)).startsWith("git push exited with code 1: "));
      const moved = GitHubUpdatesTests.commitTree(server, open, "Someone's commit");
      execFileSync("git", ["update-ref", `refs/heads/${GitHubUpdatesTests.BRANCH}`, moved], { cwd: server });
      Assert.isTrue(GitHubUpdatesTests.readFailure(await updates.pushAsync(GitHubUpdatesTests.REPOSITORY, directory, GitHubUpdatesTests.BRANCH, open)).startsWith("git push exited with code 1: "));
      Assert.areEqual(moved, GitHubUpdatesTests.readBranch(server));
      Assert.isNull(await updates.pushAsync(GitHubUpdatesTests.REPOSITORY, directory, GitHubUpdatesTests.BRANCH, moved));
      Assert.areEqual(execFileSync("git", ["rev-parse", "HEAD"], { cwd: directory, encoding: "utf8" }).trim(), GitHubUpdatesTests.readBranch(server));
    }
    finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }

  @TestMethod
  public async failsWhenFetchingTheListedCommitFailsAsync(): Promise<void> {
    class ListingProcessRunner extends ProcessRunner {
      public override async runAsync(_program: string, values: readonly string[]): Promise<ProcessResult> {
        return values[0] === "ls-remote" ? new ProcessResult(0, `${GitHubUpdatesTests.COMMIT}\trefs/heads/pipelines/update-tools\n`, "") : new ProcessResult(128, "", "fatal: no such commit\n");
      }
    }
    await using api = await GitHubApiFixture.startAsync({});

    const result = await new GitHubUpdates(GitHubUpdatesTests.createEnvironment(api, "."), new ListingProcessRunner()).fetchBranchAsync(GitHubUpdatesTests.REPOSITORY, ".", GitHubUpdatesTests.BRANCH);

    Assert.areEqual("git fetch exited with code 128: fatal: no such commit", GitHubUpdatesTests.readFailure(result));
  }

  @TestMethod
  public async proposesANewPullRequestWithItsOwnIssueAsync(): Promise<void> {
    await using api = await GitHubApiFixture.startAsync(GitHubUpdatesTests.createNewProposalAnswers());

    const url = await GitHubUpdatesTests.createUpdates(api).proposeAsync(GitHubUpdatesTests.REPOSITORY, GitHubUpdatesTests.BRANCH, "Move the pins", "Moves the pins.");

    Assert.areEqual(GitHubUpdatesTests.PULL_URL, url);
    Assert.areEqual(
      [GitHubUpdatesTests.OPEN_PULLS, GitHubUpdatesTests.TARGET, GitHubUpdatesTests.CREATE_ISSUE, GitHubUpdatesTests.CREATE_PULL].join("\n"),
      api.requests.map(t => `${t.method} ${t.url}`).join("\n"));
    Assert.areEqual(
      JSON.stringify({ title: "Move the pins", body: "A release moved packages this repository pins exactly; the pull request from `pipelines/update-tools` moves the pins." }),
      api.requests[2]?.body);
    Assert.areEqual(
      JSON.stringify({ title: "Move the pins", head: GitHubUpdatesTests.BRANCH, base: "develop", body: "Moves the pins.\n\n## Linked issue\n\nCloses #9" }),
      api.requests[3]?.body);
  }

  @TestMethod
  public async updatesTheOpenPullRequestAndRenamesItsIssueAsync(): Promise<void> {
    await using api = await GitHubApiFixture.startAsync(GitHubUpdatesTests.createExistingProposalAnswers("Old.\n\n## Linked issue\n\nCloses #9"));

    const url = await GitHubUpdatesTests.createUpdates(api).proposeAsync(GitHubUpdatesTests.REPOSITORY, GitHubUpdatesTests.BRANCH, "Move the pins", "Moves the pins.");

    Assert.areEqual(GitHubUpdatesTests.PULL_URL, url);
    Assert.areEqual(
      [GitHubUpdatesTests.OPEN_PULLS, GitHubUpdatesTests.RENAME_ISSUE, GitHubUpdatesTests.UPDATE_PULL].join("\n"),
      api.requests.map(t => `${t.method} ${t.url}`).join("\n"));
    Assert.areEqual(JSON.stringify({ title: "Move the pins" }), api.requests[1]?.body);
    Assert.areEqual(JSON.stringify({ title: "Move the pins", body: "Moves the pins.\n\n## Linked issue\n\nCloses #9" }), api.requests[2]?.body);
  }

  @TestData("Old.")
  @TestData(null)
  @TestMethod
  public async updatesAnOpenPullRequestWithoutALinkedIssueAloneAsync(body: string | null): Promise<void> {
    await using api = await GitHubApiFixture.startAsync(GitHubUpdatesTests.createExistingProposalAnswers(body));

    const url = await GitHubUpdatesTests.createUpdates(api).proposeAsync(GitHubUpdatesTests.REPOSITORY, GitHubUpdatesTests.BRANCH, "Move the pins", "Moves the pins.");

    Assert.areEqual(GitHubUpdatesTests.PULL_URL, url);
    Assert.areEqual([GitHubUpdatesTests.OPEN_PULLS, GitHubUpdatesTests.UPDATE_PULL].join("\n"), api.requests.map(t => `${t.method} ${t.url}`).join("\n"));
    Assert.areEqual(JSON.stringify({ title: "Move the pins", body: "Moves the pins." }), api.requests[1]?.body);
  }

  @TestData("GET /repos/noldova-com/target/pulls?state=open&head=noldova-com%3Apipelines%2Fupdate-tools", false)
  @TestData("GET /repos/noldova-com/target/pulls?state=open&head=noldova-com%3Apipelines%2Fupdate-tools", true)
  @TestData("GET /repos/noldova-com/target", false)
  @TestData("GET /repos/noldova-com/target", true)
  @TestData("POST /repos/noldova-com/target/issues", false)
  @TestData("POST /repos/noldova-com/target/issues", true)
  @TestData("POST /repos/noldova-com/target/pulls", false)
  @TestData("POST /repos/noldova-com/target/pulls", true)
  @TestMethod
  public async failsWithTheRequestThatFailedWhenProposingANewPullRequestAsync(request: string, isHeld: boolean): Promise<void> {
    await using api = await GitHubApiFixture.startAsync({ ...GitHubUpdatesTests.createNewProposalAnswers(), [request]: GitHubUpdatesTests.createFailure(isHeld) });

    const result = await GitHubUpdatesTests.createUpdates(api).proposeAsync(GitHubUpdatesTests.REPOSITORY, GitHubUpdatesTests.BRANCH, "Move the pins", "Moves the pins.");

    Assert.areEqual(GitHubUpdatesTests.formatFailure(request, isHeld), GitHubUpdatesTests.readFailure(result));
  }

  @TestData("PATCH /repos/noldova-com/target/issues/9", false)
  @TestData("PATCH /repos/noldova-com/target/issues/9", true)
  @TestData("PATCH /repos/noldova-com/target/pulls/3", false)
  @TestData("PATCH /repos/noldova-com/target/pulls/3", true)
  @TestMethod
  public async failsWithTheRequestThatFailedWhenUpdatingAPullRequestAsync(request: string, isHeld: boolean): Promise<void> {
    await using api = await GitHubApiFixture.startAsync({ ...GitHubUpdatesTests.createExistingProposalAnswers("Closes #9"), [request]: GitHubUpdatesTests.createFailure(isHeld) });

    const result = await GitHubUpdatesTests.createUpdates(api).proposeAsync(GitHubUpdatesTests.REPOSITORY, GitHubUpdatesTests.BRANCH, "Move the pins", "Moves the pins.");

    Assert.areEqual(GitHubUpdatesTests.formatFailure(request, isHeld), GitHubUpdatesTests.readFailure(result));
  }

  private static commitTree(directory: string, parent: string, message: string): string {
    const tree = execFileSync("git", ["rev-parse", `${parent}^{tree}`], { cwd: directory, encoding: "utf8" }).trim();

    return execFileSync("git", ["-c", "user.name=Someone", "-c", "user.email=someone@example.com", "commit-tree", tree, "-p", parent, "-m", message], { cwd: directory, encoding: "utf8" }).trim();
  }

  private static readBranch(directory: string): string {
    return execFileSync("git", ["rev-parse", `refs/heads/${GitHubUpdatesTests.BRANCH}`], { cwd: directory, encoding: "utf8" }).trim();
  }

  private static createNewProposalAnswers(): Record<string, GitHubApiAnswer> {
    return {
      [GitHubUpdatesTests.OPEN_PULLS]: GitHubApiAnswer.json(200, []),
      [GitHubUpdatesTests.TARGET]: GitHubApiAnswer.json(200, { default_branch: "develop" }),
      [GitHubUpdatesTests.CREATE_ISSUE]: GitHubApiAnswer.json(201, { number: 9 }),
      [GitHubUpdatesTests.CREATE_PULL]: GitHubApiAnswer.json(201, { html_url: GitHubUpdatesTests.PULL_URL })
    };
  }

  private static createExistingProposalAnswers(body: string | null): Record<string, GitHubApiAnswer> {
    return {
      [GitHubUpdatesTests.OPEN_PULLS]: GitHubApiAnswer.json(200, [{ number: 3, body }]),
      [GitHubUpdatesTests.RENAME_ISSUE]: GitHubApiAnswer.json(200, { number: 9 }),
      [GitHubUpdatesTests.UPDATE_PULL]: GitHubApiAnswer.json(200, { html_url: GitHubUpdatesTests.PULL_URL })
    };
  }

  private static createFailure(isHeld: boolean): GitHubApiAnswer {
    return isHeld ? GitHubApiAnswer.HELD : GitHubApiAnswer.json(403, { message: "Refused" });
  }

  private static formatFailure(request: string, isHeld: boolean): string {
    const [method, url] = request.split(" ");
    const resource = url?.slice(1);

    return isHeld ? `GitHub gave no answer to ${method} ${resource}: The operation was aborted due to timeout` : `GitHub answered ${method} ${resource} with 403: Refused`;
  }

  private static createEnvironment(api: GitHubApiFixture, serverUrl: string): Record<string, string | undefined> {
    return { GITHUB_API_URL: api.url, GITHUB_SERVER_URL: serverUrl, GITHUB_REPOSITORY: "noldova-com/tools", GITHUB_TOKEN: GitHubUpdatesTests.TOKEN };
  }

  private static createUpdates(api: GitHubApiFixture): GitHubUpdates {
    return new GitHubUpdates(GitHubUpdatesTests.createEnvironment(api, "."), undefined, undefined, async () => {}, () => api.createAttemptSignal());
  }

  private static readFailure(result: string | readonly string[] | StepResult | null): string {
    if (!(result instanceof StepResult) || result.isSuccessful)
      throw new Error(`Expected a failed result, not ${String(result)}.`);

    return result.message;
  }
}
