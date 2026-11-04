/**
 * @license
 * Copyright (c) Noldova.
 *
 * This source code is licensed under the license found in the
 * LICENSE file in the root directory of this source tree.
 */

import fs from "node:fs";
import path from "node:path";

import { Assert, TestClass, TestData, TestMethod } from "@noldova/context.testing";
import { Git, PinsStep, ProcessRunner, StepResult } from "@noldova/tools.pipelines";

import { FakeUpdateHost, RecordingOutput } from "./fake-update-host.js";
import { GitRepositoryFixture } from "./git-repository.fixture.js";

@TestClass
export class PinsStepTests {
  private static readonly OLD: string = "1".repeat(40);
  private static readonly OLDER: string = "2".repeat(40);
  private static readonly NEWER: string = "3".repeat(40);
  private static readonly CHECKOUT_4: string = "4".repeat(40);
  private static readonly CHECKOUT_5: string = "5".repeat(40);
  private static readonly CHECKOUT_45: string = "6".repeat(40);
  private static readonly SETUP_5: string = "7".repeat(40);
  private static readonly SETUP_6: string = "8".repeat(40);
  private static readonly OTHER: string = "9".repeat(40);

  private static readonly SHARED: Readonly<Record<string, string>> = {
    ".github/workflows/check.yml": [
      "jobs:",
      "  check:",
      "    steps:",
      `      - uses: actions/checkout@${PinsStepTests.CHECKOUT_4} # v4.0.0`,
      `      - uses: actions/checkout@${PinsStepTests.CHECKOUT_5} # v5.0.0`,
      `      - uses: actions/checkout@${PinsStepTests.CHECKOUT_45} # v4.5.0`,
      `      - uses: actions/setup-node@${PinsStepTests.SETUP_5} # v5.0.0`,
      `      - uses: actions/upload-artifact@${PinsStepTests.OTHER} # main`,
      `      - uses: actions/cache@${PinsStepTests.OTHER}`,
      `  nested:`,
      `    uses: noldova-com/source/.github/workflows/other.yml@${PinsStepTests.OTHER} # v9.0.0`,
      ""
    ].join("\n"),
    ".github/workflows/README.md": `- uses: actions/checkout@${PinsStepTests.OTHER} # v9.0.0\n`
  };

  @TestMethod
  public namesItselfAndItsValues(): void {
    const step = new PinsStep(new Git(new ProcessRunner(), "."), new FakeUpdateHost(), new ProcessRunner());

    Assert.areEqual("pins", step.name);
    Assert.areEqual("<version> <commit>", step.usage);
  }

  @TestMethod
  public async movesTheOlderPinsAndProposesThemAsync(): Promise<void> {
    using source = PinsStepTests.createSource();
    const commit = source.readHead();
    const workflow = [
      "jobs:",
      "  older:",
      `    uses: noldova-com/source/.github/workflows/check.yml@${PinsStepTests.OLD} # v1.1.0`,
      "  untagged:",
      `    uses: Noldova-Com/Source/.github/workflows/release.yml@${PinsStepTests.OLD}`,
      "  major:",
      `    uses: noldova-com/source/.github/workflows/check.yml@${PinsStepTests.OLDER} # v0.9.0`,
      "  newer:",
      `    uses: noldova-com/source/.github/workflows/check.yml@${PinsStepTests.NEWER} # v1.3.0`,
      "  current:",
      `    uses: noldova-com/source/.github/workflows/check.yml@${commit} # v1.2.0`,
      "  foreign:",
      `    uses: someone/source/.github/workflows/check.yml@${PinsStepTests.OLD} # v1.0.0`,
      "  steps:",
      "    steps:",
      `      - uses: actions/checkout@${PinsStepTests.OLD} # v4.0.0`,
      `      - uses: actions/setup-node@${PinsStepTests.SETUP_6} # v6.0.0`,
      `      - uses: actions/cache@${PinsStepTests.OLD} # v1.0.0`,
      `      - uses: actions/checkout@${PinsStepTests.OLD}`,
      `      - uses: actions/checkout@${PinsStepTests.OLD} # vNext`,
      "      - uses: ./.github/actions/local",
      ""
    ].join("\n");
    using pinned = PinsStepTests.createTarget({
      ".github/workflows/ci.yaml": workflow,
      ".github/workflows/plain.yml": "jobs: {}\n",
      ".github/workflows/notes.md": `uses: actions/checkout@${PinsStepTests.OLD} # v4.0.0\n`,
      "docs/ci.yml": `uses: actions/checkout@${PinsStepTests.OLD} # v4.0.0\n`
    });
    using current = PinsStepTests.createTarget({ ".github/workflows/ci.yml": `jobs:\n  check:\n    uses: noldova-com/source/.github/workflows/check.yml@${commit} # v1.2.0\n` });
    const host = new FakeUpdateHost();
    host.repositories.set("noldova-com/pinned", pinned);
    host.repositories.set("noldova-com/current", current);

    const result = await PinsStepTests.createStep(source, host).runAsync(["1.2.0", commit]);

    Assert.isTrue(result.isSuccessful, result.message);
    Assert.areEqual(
      [
        "Looked for pins on source's workflows older than v1.2.0 in 2 repositories:",
        "noldova-com/pinned: moved 3 pins in https://example.test/noldova-com/pinned/pull/1",
        "noldova-com/current: pins nothing older than v1.2.0."
      ].join("\n"),
      result.message);
    const pushed = host.pushed.get("noldova-com/pinned");
    Assert.areEqual("pipelines/pins-source", pushed?.["branch"]);
    Assert.areEqual("Move the pins on source's workflows to v1.2.0", pushed?.["message"]);
    Assert.areEqual(
      workflow
        .replace(`check.yml@${PinsStepTests.OLD} # v1.1.0`, `check.yml@${commit} # v1.2.0`)
        .replace(`release.yml@${PinsStepTests.OLD}`, `release.yml@${commit} # v1.2.0`)
        .replace(`checkout@${PinsStepTests.OLD} # v4.0.0`, `checkout@${PinsStepTests.CHECKOUT_5} # v5.0.0`),
      pushed?.[".github/workflows/ci.yaml"]);
    Assert.areEqual("jobs: {}\n", pushed?.[".github/workflows/plain.yml"]);
    Assert.areEqual(`uses: actions/checkout@${PinsStepTests.OLD} # v4.0.0\n`, pushed?.[".github/workflows/notes.md"]);
    Assert.areEqual(`uses: actions/checkout@${PinsStepTests.OLD} # v4.0.0\n`, pushed?.["docs/ci.yml"]);
    Assert.isFalse(host.pushed.has("noldova-com/current"));
    Assert.areEqual(
      [
        "noldova-com/pinned",
        "pipelines/pins-source",
        "Move the pins on source's workflows to v1.2.0",
        [
          "## Summary",
          "",
          `source tagged v1.2.0 at commit ${commit}; this moves every older pin on its workflows within the same major version, and every outside action older than the one source uses.`,
          "",
          "- `.github/workflows/ci.yaml`: `noldova-com/source/.github/workflows/check.yml` from v1.1.0 to v1.2.0",
          `- \`.github/workflows/ci.yaml\`: \`Noldova-Com/Source/.github/workflows/release.yml\` from ${PinsStepTests.OLD} to v1.2.0`,
          "- `.github/workflows/ci.yaml`: `actions/checkout` from v4.0.0 to v5.0.0",
          "",
          "Left a major version behind, to move by hand after reading the release notes:",
          "",
          "- `.github/workflows/ci.yaml`: `noldova-com/source/.github/workflows/check.yml` at v0.9.0, a major version behind v1.2.0",
          "",
          "## Release notes for 0.0.4",
          "",
          "- Adds a thing."
        ].join("\n")
      ].join("\n---\n"),
      host.proposals.join("\n===\n"));
  }

  @TestMethod
  public async namesThePinsItLeavesWhenNothingMovesAsync(): Promise<void> {
    using source = PinsStepTests.createSource();
    using behind = PinsStepTests.createTarget({ ".github/workflows/ci.yml": `jobs:\n  check:\n    uses: noldova-com/source/.github/workflows/check.yml@${PinsStepTests.OLD} # v0.9.0\n` });
    const host = new FakeUpdateHost();
    host.repositories.set("noldova-com/behind", behind);

    const result = await PinsStepTests.createStep(source, host).runAsync(["1.2.0", source.readHead()]);

    Assert.isTrue(result.isSuccessful, result.message);
    Assert.areEqual(
      "noldova-com/behind: moves nothing to v1.2.0; left a major version behind: `.github/workflows/ci.yml`: `noldova-com/source/.github/workflows/check.yml` at v0.9.0, a major version behind v1.2.0.",
      result.message.split("\n")[1]);
    Assert.isFalse(host.pushed.has("noldova-com/behind"));
  }

  @TestData(".github/dependabot.yml")
  @TestData(".github/dependabot.yaml")
  @TestMethod
  public async leavesARepositoryWithADependabotFileAsync(filePath: string): Promise<void> {
    using source = PinsStepTests.createSource();
    using dependabot = PinsStepTests.createTarget({
      [filePath]: "version: 2\n",
      ".github/workflows/ci.yml": `jobs:\n  check:\n    uses: noldova-com/source/.github/workflows/check.yml@${PinsStepTests.OLD} # v1.1.0\n`
    });
    const host = new FakeUpdateHost();
    host.repositories.set("noldova-com/dependabot", dependabot);

    const result = await PinsStepTests.createStep(source, host).runAsync(["1.2.0", source.readHead()]);

    Assert.isTrue(result.isSuccessful, result.message);
    Assert.areEqual("noldova-com/dependabot: has a Dependabot file, so Dependabot moves its pins.", result.message.split("\n")[1]);
    Assert.isFalse(host.pushed.has("noldova-com/dependabot"));
  }

  @TestMethod
  public async writesEachRepositorysLineAsItIsDoneAsync(): Promise<void> {
    using source = PinsStepTests.createSource();
    using failed = PinsStepTests.createTarget(PinsStepTests.createPinned());
    using current = PinsStepTests.createTarget({ "README.md": "Read me.\n" });
    const host = new FakeUpdateHost();
    host.repositories.set("noldova-com/failed", failed);
    host.repositories.set("noldova-com/current", current);
    host.failures.set("push noldova-com/failed", StepResult.failed("rejected"));
    const output = new RecordingOutput(host.events);

    const result = await new PinsStep(new Git(new ProcessRunner(), source.directory), host, new ProcessRunner(), "", output).runAsync(["1.2.0", source.readHead()]);

    Assert.isFalse(result.isSuccessful);
    Assert.areEqual(
      [
        "check out noldova-com/failed",
        "failure: noldova-com/failed: rejected",
        "check out noldova-com/current",
        "success: noldova-com/current: pins nothing older than v1.2.0."
      ].join("\n"),
      host.events.join("\n"));
    Assert.areEqual("Looked for pins on source's workflows older than v1.2.0 in 2 repositories; each one's line is above.", result.message);
  }

  @TestMethod
  public async saysWhenTheReleaseHasNoNotesAsync(): Promise<void> {
    using source = PinsStepTests.createSource();
    using pinned = PinsStepTests.createTarget(PinsStepTests.createPinned());
    const host = new FakeUpdateHost();
    host.repositories.set("noldova-com/pinned", pinned);
    host.notes = "";

    const result = await PinsStepTests.createStep(source, host).runAsync(["1.2.0", source.readHead()]);

    Assert.isTrue(result.isSuccessful, result.message);
    Assert.areEqual(`The pull request that merged ${source.readHead()} has no "Release notes for 1.2.0" section.`, host.proposals[0]?.split("\n").at(-1));
  }

  @TestMethod
  public async triesEveryRepositoryAndFailsWithEachThatFailedAsync(): Promise<void> {
    using source = PinsStepTests.createSource();
    using first = PinsStepTests.createTarget(PinsStepTests.createPinned());
    using second = PinsStepTests.createTarget(PinsStepTests.createPinned());
    using third = PinsStepTests.createTarget(PinsStepTests.createPinned());
    using fourth = PinsStepTests.createTarget(PinsStepTests.createPinned());
    using fifth = PinsStepTests.createTarget(PinsStepTests.createPinned());
    const host = new FakeUpdateHost();
    host.repositories.set("noldova-com/checkout", first);
    host.repositories.set("noldova-com/fetch", second);
    host.repositories.set("noldova-com/propose", third);
    host.repositories.set("noldova-com/push", fourth);
    host.repositories.set("noldova-com/works", fifth);
    host.failures.set("checkOut noldova-com/checkout", StepResult.failed("git clone exited with code 128: not found"));
    host.failures.set("fetch noldova-com/fetch", StepResult.failed("git ls-remote exited with code 128: denied"));
    host.failures.set("push noldova-com/push", StepResult.failed("git push exited with code 1: rejected"));
    host.failures.set("propose noldova-com/propose", StepResult.failed("GitHub answered POST repos/noldova-com/propose/pulls with 403: Forbidden"));

    const result = await PinsStepTests.createStep(source, host).runAsync(["1.2.0", source.readHead()]);

    Assert.isFalse(result.isSuccessful);
    Assert.areEqual(
      [
        "Looked for pins on source's workflows older than v1.2.0 in 5 repositories:",
        "noldova-com/checkout: git clone exited with code 128: not found",
        "noldova-com/fetch: git ls-remote exited with code 128: denied",
        "noldova-com/propose: GitHub answered POST repos/noldova-com/propose/pulls with 403: Forbidden",
        "noldova-com/push: git push exited with code 1: rejected",
        "noldova-com/works: moved 1 pins in https://example.test/noldova-com/works/pull/1"
      ].join("\n"),
      result.message);
  }

  @TestMethod
  public async replacesABranchAtItsOwnEarlierCommitWhileItIsThereAsync(): Promise<void> {
    using source = PinsStepTests.createSource();
    using pinned = PinsStepTests.createTarget(PinsStepTests.createPinned());
    const host = new FakeUpdateHost();
    host.repositories.set("noldova-com/pinned", pinned);
    host.branches.set("noldova-com/pinned", ["pipelines-tests@example.com", "Move the pins on source's workflows to v1.1.0"]);

    const result = await PinsStepTests.createStep(source, host).runAsync(["1.2.0", source.readHead()]);

    Assert.isTrue(result.isSuccessful, result.message);
    Assert.isTrue(/^[0-9a-f]{40}$/.test(host.pushed.get("noldova-com/pinned")?.["replaced"] ?? ""));
  }

  @TestData("someone@example.com", "Move the pins on source's workflows to v1.1.0")
  @TestData("pipelines-tests@example.com", "Fix the workflow for the new version")
  @TestMethod
  public async leavesABranchWithACommitItDidNotMakeAndGoesOnAsync(committer: string, subject: string): Promise<void> {
    using source = PinsStepTests.createSource();
    using taken = PinsStepTests.createTarget(PinsStepTests.createPinned());
    const host = new FakeUpdateHost();
    host.repositories.set("noldova-com/taken", taken);
    host.branches.set("noldova-com/taken", [committer, subject]);

    const result = await PinsStepTests.createStep(source, host).runAsync(["1.2.0", source.readHead()]);

    Assert.isFalse(result.isSuccessful);
    const line = result.message.split("\n")[1] ?? "";
    Assert.isTrue(/^noldova-com\/taken: pipelines\/pins-source is at [0-9a-f]{40}, a commit this step didn't make, so it is left as it is; /.test(line), line);
    Assert.isFalse(host.pushed.has("noldova-com/taken"));
  }

  @TestMethod
  public async turnsAnErrorInOneRepositoryIntoItsLineAndGoesOnAsync(): Promise<void> {
    using source = PinsStepTests.createSource();
    using broken = PinsStepTests.createTarget(PinsStepTests.createPinned());
    using works = PinsStepTests.createTarget(PinsStepTests.createPinned());
    const host = new FakeUpdateHost();
    host.repositories.set("noldova-com/broken", broken);
    host.repositories.set("noldova-com/works", works);
    host.thrown.set("noldova-com/broken", new Error("git broke"));

    const result = await PinsStepTests.createStep(source, host).runAsync(["1.2.0", source.readHead()]);

    Assert.isFalse(result.isSuccessful);
    Assert.areEqual(
      ["noldova-com/broken: git broke", "noldova-com/works: moved 1 pins in https://example.test/noldova-com/works/pull/1"].join("\n"),
      result.message.split("\n").slice(1).join("\n"));
  }

  @TestMethod
  public async rejectsWithWhatIsThrownThatIsNotAnErrorAsync(): Promise<void> {
    using source = PinsStepTests.createSource();
    using pinned = PinsStepTests.createTarget(PinsStepTests.createPinned());
    const host = new FakeUpdateHost();
    host.repositories.set("noldova-com/pinned", pinned);
    host.thrown.set("noldova-com/pinned", "not an error");

    let thrown: unknown = null;
    try {
      await PinsStepTests.createStep(source, host).runAsync(["1.2.0", source.readHead()]);
    }
    catch (error: unknown) {
      thrown = error;
    }

    Assert.areEqual("not an error", thrown);
  }

  @TestMethod
  public async removesItsTemporaryFolderAsync(): Promise<void> {
    using source = PinsStepTests.createSource();
    using pinned = PinsStepTests.createTarget(PinsStepTests.createPinned());
    const host = new FakeUpdateHost();
    host.repositories.set("noldova-com/pinned", pinned);
    host.failures.set("push noldova-com/pinned", StepResult.failed("rejected"));
    const root = fs.mkdtempSync(path.join(source.directory, "..", "tools-pipelines-root-"));
    try {
      await new PinsStep(new Git(new ProcessRunner(), source.directory), host, new ProcessRunner(), root).runAsync(["1.2.0", source.readHead()]);

      Assert.areEqual("", fs.readdirSync(root).join());
    }
    finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }

  @TestData("")
  @TestData("1.2.0")
  @TestData("1.2.0 0000000000000000000000000000000000000000 more")
  @TestMethod
  public async failsForAnyNumberOfValuesButTwoAsync(values: string): Promise<void> {
    const step = new PinsStep(new Git(new ProcessRunner(), "."), new FakeUpdateHost(), new ProcessRunner());

    const result = await step.runAsync(values.split(" ").filter(t => t.length > 0));

    Assert.areEqual("The pins step takes <version> <commit>.", result.message);
  }

  @TestData("01.2.0", "\"01.2.0\" is not a version")
  @TestData("1.2.0-nightly.20261102", "1.2.0-nightly.20261102 is a nightly version; only a release version moves the pins on the shared workflows.")
  @TestMethod
  public async failsForAVersionThatIsNotAReleaseAsync(version: string, message: string): Promise<void> {
    const step = new PinsStep(new Git(new ProcessRunner(), "."), new FakeUpdateHost(), new ProcessRunner());

    const result = await step.runAsync([version, "0000000000000000000000000000000000000000"]);

    Assert.isFalse(result.isSuccessful);
    Assert.isTrue(result.message.startsWith(message), result.message);
  }

  @TestMethod
  public async failsForACommitThatIsNotAFullIdAsync(): Promise<void> {
    const step = new PinsStep(new Git(new ProcessRunner(), "."), new FakeUpdateHost(), new ProcessRunner());

    const result = await step.runAsync(["1.2.0", "main"]);

    Assert.isFalse(result.isSuccessful);
    Assert.isTrue(result.message.includes("main"), result.message);
  }

  @TestMethod
  public async failsWithWhatTheHostCannotAnswerAsync(): Promise<void> {
    using source = PinsStepTests.createSource();
    const host = new FakeUpdateHost();
    const step = PinsStepTests.createStep(source, host);

    host.source = StepResult.failed("no source");
    Assert.areEqual("no source", (await step.runAsync(["1.2.0", source.readHead()])).message);
    host.source = "source";
    host.listed = StepResult.failed("no list");
    Assert.areEqual("no list", (await step.runAsync(["1.2.0", source.readHead()])).message);
    host.listed = null;
    host.notes = StepResult.failed("no notes");
    Assert.areEqual("no notes", (await step.runAsync(["1.2.0", source.readHead()])).message);
  }

  private static createSource(): GitRepositoryFixture {
    const source = GitRepositoryFixture.create();
    source.commit(PinsStepTests.SHARED);

    return source;
  }

  private static createPinned(): Readonly<Record<string, string>> {
    return { ".github/workflows/ci.yml": `jobs:\n  check:\n    uses: noldova-com/source/.github/workflows/check.yml@${PinsStepTests.OLD} # v1.1.0\n` };
  }

  private static createTarget(files: Readonly<Record<string, string>>): GitRepositoryFixture {
    const target = GitRepositoryFixture.create();
    target.commit(files);

    return target;
  }

  private static createStep(source: GitRepositoryFixture, host: FakeUpdateHost): PinsStep {
    return new PinsStep(new Git(new ProcessRunner(), source.directory), host, new ProcessRunner());
  }
}
