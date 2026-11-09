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
import { ArchiveStep, DependentsStep, Git, Npm, ProcessResult, ProcessRunner, StepResult, Tar } from "@noldova/tools.pipelines";

import { FakeUpdateHost, RecordingOutput } from "./fake-update-host.js";
import { GitRepositoryFixture } from "./git-repository.fixture.js";

class LockingNpm extends Npm {
  public readonly directories: string[] = [];
  public readonly hiddenVariables: string[] = [];
  public readonly oldLocks: boolean[] = [];
  public result: ProcessResult = new ProcessResult(0, "", "");
  public locked: object | null = null;

  public constructor() {
    super(new ProcessRunner(), ".");
  }

  public override async lockAsync(directory: string, hiddenVariables: readonly string[] = []): Promise<ProcessResult> {
    this.directories.push(path.basename(directory));
    this.hiddenVariables.push(...hiddenVariables);
    this.oldLocks.push(fs.existsSync(path.join(directory, "package-lock.json")));
    const locked = this.locked ?? { lockedFrom: fs.readFileSync(path.join(directory, "package.json"), "utf8") };
    fs.writeFileSync(path.join(directory, "package-lock.json"), `${JSON.stringify(locked)}\n`);

    return this.result;
  }
}

@TestClass
export class DependentsStepTests {
  private static readonly PINNED: Readonly<Record<string, string>> = {
    "package.json": "{\n  \"dependencies\": { \"@noldova/a\": \"0.0.3\", \"@noldova/c\": \"0.0.1\" },\n  \"peerDependencies\": { \"@noldova/a\": \"0.0.3\" }\n}\n",
    "package-lock.json": "{}\n",
    "src/package.json": "{ \"devDependencies\": { \"@noldova/a.b\": \"0.0.2\", \"@noldova/aXb\": \"0.0.2\", \"@noldova/a\": \"^0.0.3\" } }\n",
    "src/package-lock.json": "{}\n",
    "README.md": "Read me.\n"
  };

  @TestMethod
  public namesItselfAndItsValues(): void {
    const step = new DependentsStep(DependentsStepTests.createArchiveStep("."), new FakeUpdateHost(), new ProcessRunner(), new LockingNpm());

    Assert.areEqual("dependents", step.name);
    Assert.areEqual("<version> <commit>", step.usage);
  }

  @TestMethod
  public async movesTheOlderExactPinsAndProposesThemAsync(): Promise<void> {
    using source = DependentsStepTests.createSource();
    using pinned = DependentsStepTests.createTarget(DependentsStepTests.PINNED);
    using unpinned = DependentsStepTests.createTarget({ "package.json": "{ \"dependencies\": { \"@noldova/a\": \"0.0.4\", \"@noldova/a.b\": \"0.0.5\", \"@noldova/b\": \"__VERSION__\" } }\n" });
    const host = new FakeUpdateHost();
    host.repositories.set("noldova-com/pinned", pinned);
    host.repositories.set("noldova-com/unpinned", unpinned);
    const npm = new LockingNpm();

    const result = await DependentsStepTests.createStep(source, host, npm).runAsync(["0.0.4", source.readHead()]);

    Assert.isTrue(result.isSuccessful, result.message);
    Assert.areEqual(
      [
        "Looked for exact pins of @noldova/a, @noldova/a.b, @noldova/b older than 0.0.4 in 2 repositories:",
        "noldova-com/pinned: moved 3 pins in https://example.test/noldova-com/pinned/pull/1",
        "noldova-com/unpinned: pins none of them below 0.0.4."
      ].join("\n"),
      result.message);
    const pushed = host.pushed.get("noldova-com/pinned");
    Assert.areEqual("pipelines/update-source", pushed?.["branch"]);
    Assert.areEqual("Move the pins of source's packages to 0.0.4", pushed?.["message"]);
    Assert.areEqual("null", pushed?.["replaced"]);
    Assert.areEqual("SECRET_TOKEN,SECRET_TOKEN", npm.hiddenVariables.join(","));
    Assert.areEqual("{\n  \"dependencies\": { \"@noldova/a\": \"0.0.4\", \"@noldova/c\": \"0.0.1\" },\n  \"peerDependencies\": { \"@noldova/a\": \"0.0.4\" }\n}\n", pushed?.["package.json"]);
    Assert.areEqual("{ \"devDependencies\": { \"@noldova/a.b\": \"0.0.4\", \"@noldova/aXb\": \"0.0.2\", \"@noldova/a\": \"^0.0.3\" } }\n", pushed?.["src/package.json"]);
    Assert.areEqual(`${JSON.stringify({ lockedFrom: pushed?.["package.json"] })}\n`, pushed?.["package-lock.json"]);
    Assert.areEqual(`${JSON.stringify({ lockedFrom: pushed?.["src/package.json"] })}\n`, pushed?.["src/package-lock.json"]);
    Assert.areEqual(2, npm.directories.length);
    Assert.areEqual([false, false], npm.oldLocks);
    Assert.isFalse(host.pushed.has("noldova-com/unpinned"));
    Assert.areEqual(
      [
        "noldova-com/pinned",
        "pipelines/update-source",
        "Move the pins of source's packages to 0.0.4",
        "A release moved packages this repository pins exactly",
        [
          "## Summary",
          "",
          `source released 0.0.4 from commit ${source.readHead()}; this moves every exact pin of its packages that was older.`,
          "",
          "- `package.json`: `@noldova/a` from 0.0.3 to 0.0.4",
          "- `package.json`: `@noldova/a` from 0.0.3 to 0.0.4",
          "- `src/package.json`: `@noldova/a.b` from 0.0.2 to 0.0.4",
          "- `package-lock.json`: regenerated with `npm install --package-lock-only --ignore-scripts --no-audit --no-fund`",
          "- `src/package-lock.json`: regenerated with `npm install --package-lock-only --ignore-scripts --no-audit --no-fund`",
          "",
          "## Release notes for 0.0.4",
          "",
          "- Adds a thing."
        ].join("\n")
      ].join("\n---\n"),
      host.proposals.join("\n===\n"));
  }

  @TestMethod
  public async leavesARepositoryWhoseLockedPackagesNeedAnotherExactVersionAsync(): Promise<void> {
    using source = DependentsStepTests.createSource();
    const lock = {
      packages: {
        "": { name: "blocked", dependencies: { "@noldova/a": "0.0.3", "@noldova/window": "0.0.48" } },
        "node_modules/@noldova/window": { version: "0.0.48", peerDependencies: { "@noldova/a": "0.0.3", "@noldova/c": "0.0.1" } },
        "node_modules/@noldova/panel": { version: "0.0.7", peerDependencies: { "@noldova/a": "0.0.3" }, peerDependenciesMeta: { "@noldova/a": { optional: true } } },
        "node_modules/@noldova/window/node_modules/@noldova/a.b": { version: "0.0.2", peerDependencies: { "@noldova/a": "0.0.2" } },
        "node_modules/@noldova/plain": { version: "2.0.0" },
        "node_modules/@noldova/ranged": { version: "1.0.0", peerDependencies: { "@noldova/a": "^0.0.3" } },
        "node_modules/@noldova/current": { version: "1.0.0", peerDependencies: { "@noldova/a": "0.0.4" } },
        "src/window": { name: "@noldova/local", peerDependencies: { "@noldova/a": "0.0.3" } }
      }
    };
    using blocked = DependentsStepTests.createTarget({
      "package.json": "{ \"dependencies\": { \"@noldova/a\": \"0.0.3\", \"@noldova/window\": \"0.0.48\" } }\n",
      "package-lock.json": `${JSON.stringify(lock, null, 2)}\n`
    });
    using works = DependentsStepTests.createTarget(DependentsStepTests.PINNED);
    const host = new FakeUpdateHost();
    host.repositories.set("noldova-com/blocked", blocked);
    host.repositories.set("noldova-com/works", works);
    const npm = new LockingNpm();

    const result = await DependentsStepTests.createStep(source, host, npm).runAsync(["0.0.4", source.readHead()]);

    Assert.isTrue(result.isSuccessful, result.message);
    Assert.areEqual(
      "noldova-com/blocked: left at its pins until these accept 0.0.4: package-lock.json locks @noldova/window 0.0.48, which needs @noldova/a 0.0.3; package-lock.json locks @noldova/panel 0.0.7, which needs @noldova/a 0.0.3.",
      result.message.split("\n")[1]);
    Assert.isFalse(host.pushed.has("noldova-com/blocked"));
    Assert.areEqual(2, npm.directories.length);
  }

  @TestMethod
  public async movesThePinsOfWhatAReleasedPackageNeedsAsAPeerAsync(): Promise<void> {
    using source = DependentsStepTests.createSource();
    using pinned = DependentsStepTests.createTarget({
      "package.json": "{ \"dependencies\": { \"@noldova/a\": \"0.0.3\", \"@noldova/kit\": \"0.0.4\", \"@noldova/range\": \"0.9.0\" } }\n",
      "package-lock.json": "{}\n"
    });
    using peerOnly = DependentsStepTests.createTarget({ "package.json": "{ \"dependencies\": { \"@noldova/kit\": \"0.0.4\" } }\n" });
    const host = new FakeUpdateHost();
    host.repositories.set("noldova-com/pinned", pinned);
    host.repositories.set("noldova-com/peer-only", peerOnly);

    const result = await DependentsStepTests.createStep(source, host, new LockingNpm()).runAsync(["0.0.4", source.readHead()]);

    Assert.isTrue(result.isSuccessful, result.message);
    Assert.areEqual(
      ["noldova-com/pinned: moved 2 pins in https://example.test/noldova-com/pinned/pull/1", "noldova-com/peer-only: pins none of them below 0.0.4."].join("\n"),
      result.message.split("\n").slice(1).join("\n"));
    Assert.areEqual("{ \"dependencies\": { \"@noldova/a\": \"0.0.4\", \"@noldova/kit\": \"0.0.5\", \"@noldova/range\": \"0.9.0\" } }\n", host.pushed.get("noldova-com/pinned")?.["package.json"]);
    Assert.isTrue(
      (host.proposals[0] ?? "").includes("- `package.json`: `@noldova/a` from 0.0.3 to 0.0.4\n- `package.json`: `@noldova/kit` from 0.0.4 to 0.0.5, which `@noldova/a.b` 0.0.4 needs as a peer\n"),
      host.proposals[0] ?? "");
  }

  @TestMethod
  public async leavesARepositoryWhoseLockedPackagesNeedAnotherVersionOfAMovedPeerAsync(): Promise<void> {
    using source = DependentsStepTests.createSource();
    const lock = { packages: { "node_modules/@noldova/panel": { version: "0.0.7", peerDependencies: { "@noldova/kit": "0.0.4" } } } };
    using blocked = DependentsStepTests.createTarget({
      "package.json": "{ \"dependencies\": { \"@noldova/a\": \"0.0.3\", \"@noldova/kit\": \"0.0.4\" } }\n",
      "package-lock.json": `${JSON.stringify(lock)}\n`
    });
    const host = new FakeUpdateHost();
    host.repositories.set("noldova-com/blocked", blocked);
    const npm = new LockingNpm();

    const result = await DependentsStepTests.createStep(source, host, npm).runAsync(["0.0.4", source.readHead()]);

    Assert.isTrue(result.isSuccessful, result.message);
    Assert.areEqual(
      "noldova-com/blocked: left at its pins until these accept 0.0.4: package-lock.json locks @noldova/panel 0.0.7, which needs @noldova/kit 0.0.4.",
      result.message.split("\n")[1]);
    Assert.areEqual(0, npm.directories.length);
  }

  @TestMethod
  public async leavesARepositoryWhoseRefreshedLockStillHoldsAPeerConflictAsync(): Promise<void> {
    using source = DependentsStepTests.createSource();
    using pinned = DependentsStepTests.createTarget({
      "package.json": "{ \"dependencies\": { \"@noldova/a\": \"0.0.3\", \"@noldova/kit\": \"0.0.4\" } }\n",
      "package-lock.json": "{}\n"
    });
    const host = new FakeUpdateHost();
    host.repositories.set("noldova-com/pinned", pinned);
    const npm = new LockingNpm();
    npm.locked = {
      packages: {
        "": { name: "pinned" },
        "node_modules/@noldova/kit": { version: "0.0.5", peerDependencies: { "@noldova/z": "2.0.0", "@noldova/absent": "1.0.0" } },
        "node_modules/@noldova/z": { version: "1.0.0" },
        "node_modules/@noldova/kit/node_modules/@noldova/y": { version: "1.0.0", peerDependencies: { "@noldova/w": "3.0.0", "@noldova/z": "1.0.0" } },
        "node_modules/@noldova/kit/node_modules/@noldova/w": { version: "3.0.0" }
      }
    };

    const result = await DependentsStepTests.createStep(source, host, npm).runAsync(["0.0.4", source.readHead()]);

    Assert.isTrue(result.isSuccessful, result.message);
    Assert.areEqual(
      "noldova-com/pinned: left at its pins, since the lock files regenerated for 0.0.4 still hold packages whose exact peers differ from what they lock: package-lock.json locks @noldova/kit 0.0.5, which needs @noldova/z 2.0.0.",
      result.message.split("\n")[1]);
    Assert.isFalse(host.pushed.has("noldova-com/pinned"));
  }

  @TestMethod
  public async writesEachRepositorysLineAsItIsDoneAsync(): Promise<void> {
    using source = DependentsStepTests.createSource();
    using failed = DependentsStepTests.createTarget(DependentsStepTests.PINNED);
    using unpinned = DependentsStepTests.createTarget({ "README.md": "Read me.\n" });
    const host = new FakeUpdateHost();
    host.repositories.set("noldova-com/failed", failed);
    host.repositories.set("noldova-com/unpinned", unpinned);
    host.failures.set("push noldova-com/failed", StepResult.failed("rejected"));
    const output = new RecordingOutput(host.events);

    const result = await new DependentsStep(DependentsStepTests.createArchiveStep(source.directory), host, new ProcessRunner(), new LockingNpm(), undefined, output).runAsync(["0.0.4", source.readHead()]);

    Assert.isFalse(result.isSuccessful);
    Assert.areEqual(
      [
        "check out noldova-com/failed",
        "failure: noldova-com/failed: rejected",
        "check out noldova-com/unpinned",
        "success: noldova-com/unpinned: pins none of them below 0.0.4."
      ].join("\n"),
      host.events.join("\n"));
    Assert.areEqual("Looked for exact pins of @noldova/a, @noldova/a.b, @noldova/b older than 0.0.4 in 2 repositories; each one's line is above.", result.message);
  }

  @TestMethod
  public async saysWhenTheReleaseHasNoNotesAsync(): Promise<void> {
    using source = DependentsStepTests.createSource();
    using pinned = DependentsStepTests.createTarget({ "package.json": "{ \"dependencies\": { \"@noldova/b\": \"0.0.3\" } }\n" });
    const host = new FakeUpdateHost();
    host.repositories.set("noldova-com/pinned", pinned);
    host.notes = "";

    const result = await DependentsStepTests.createStep(source, host, new LockingNpm()).runAsync(["0.0.4", source.readHead()]);

    Assert.isTrue(result.isSuccessful, result.message);
    Assert.areEqual(`The pull request that merged ${source.readHead()} has no "Release notes" section.`, host.proposals[0]?.split("\n").at(-1));
  }

  @TestMethod
  public async triesEveryRepositoryAndFailsWithEachThatFailedAsync(): Promise<void> {
    using source = DependentsStepTests.createSource();
    using first = DependentsStepTests.createTarget(DependentsStepTests.PINNED);
    using second = DependentsStepTests.createTarget(DependentsStepTests.PINNED);
    using third = DependentsStepTests.createTarget(DependentsStepTests.PINNED);
    using fourth = DependentsStepTests.createTarget(DependentsStepTests.PINNED);
    const host = new FakeUpdateHost();
    host.repositories.set("noldova-com/checkout", first);
    host.repositories.set("noldova-com/propose", second);
    host.repositories.set("noldova-com/push", third);
    host.repositories.set("noldova-com/works", fourth);
    host.failures.set("checkOut noldova-com/checkout", StepResult.failed("git clone exited with code 128: not found"));
    host.failures.set("push noldova-com/push", StepResult.failed("git push exited with code 1: rejected"));
    host.failures.set("propose noldova-com/propose", StepResult.failed("GitHub answered POST repos/noldova-com/propose/pulls with 403: Forbidden"));

    const result = await DependentsStepTests.createStep(source, host, new LockingNpm()).runAsync(["0.0.4", source.readHead()]);

    Assert.isFalse(result.isSuccessful);
    Assert.areEqual(
      [
        "Looked for exact pins of @noldova/a, @noldova/a.b, @noldova/b older than 0.0.4 in 4 repositories:",
        "noldova-com/checkout: git clone exited with code 128: not found",
        "noldova-com/propose: GitHub answered POST repos/noldova-com/propose/pulls with 403: Forbidden",
        "noldova-com/push: git push exited with code 1: rejected",
        "noldova-com/works: moved 3 pins in https://example.test/noldova-com/works/pull/1"
      ].join("\n"),
      result.message);
  }

  @TestMethod
  public async replacesABranchAtItsOwnEarlierCommitWhileItIsThereAsync(): Promise<void> {
    using source = DependentsStepTests.createSource();
    using pinned = DependentsStepTests.createTarget(DependentsStepTests.PINNED);
    const host = new FakeUpdateHost();
    host.repositories.set("noldova-com/pinned", pinned);
    host.branches.set("noldova-com/pinned", ["pipelines-tests@example.com", "Move the pins of source's packages to 0.0.3"]);

    const result = await DependentsStepTests.createStep(source, host, new LockingNpm()).runAsync(["0.0.4", source.readHead()]);

    Assert.isTrue(result.isSuccessful, result.message);
    Assert.isTrue(/^[0-9a-f]{40}$/.test(host.pushed.get("noldova-com/pinned")?.["replaced"] ?? ""));
  }

  @TestData("someone@example.com", "Move the pins of source's packages to 0.0.3")
  @TestData("pipelines-tests@example.com", "Fix the build for the new version")
  @TestData("pipelines-tests@example.com", "Move the pins of other's packages to 0.0.3")
  @TestMethod
  public async leavesABranchWithACommitItDidNotMakeAndGoesOnAsync(committer: string, subject: string): Promise<void> {
    using source = DependentsStepTests.createSource();
    using taken = DependentsStepTests.createTarget(DependentsStepTests.PINNED);
    using works = DependentsStepTests.createTarget(DependentsStepTests.PINNED);
    const host = new FakeUpdateHost();
    host.repositories.set("noldova-com/taken", taken);
    host.repositories.set("noldova-com/works", works);
    host.branches.set("noldova-com/taken", [committer, subject]);

    const result = await DependentsStepTests.createStep(source, host, new LockingNpm()).runAsync(["0.0.4", source.readHead()]);

    Assert.isFalse(result.isSuccessful);
    const lines = result.message.split("\n");
    Assert.isTrue(/^noldova-com\/taken: pipelines\/update-source is at [0-9a-f]{40}, a commit this step didn't make, so it is left as it is; /.test(lines[1] ?? ""), lines[1]);
    Assert.areEqual("noldova-com/works: moved 3 pins in https://example.test/noldova-com/works/pull/1", lines[2]);
    Assert.isFalse(host.pushed.has("noldova-com/taken"));
  }

  @TestMethod
  public async failsARepositoryWhoseBranchItCannotReadAsync(): Promise<void> {
    using source = DependentsStepTests.createSource();
    using pinned = DependentsStepTests.createTarget(DependentsStepTests.PINNED);
    const host = new FakeUpdateHost();
    host.repositories.set("noldova-com/pinned", pinned);
    host.failures.set("fetch noldova-com/pinned", StepResult.failed("git ls-remote exited with code 128: denied"));

    const result = await DependentsStepTests.createStep(source, host, new LockingNpm()).runAsync(["0.0.4", source.readHead()]);

    Assert.areEqual("noldova-com/pinned: git ls-remote exited with code 128: denied", result.message.split("\n")[1]);
    Assert.isFalse(host.pushed.has("noldova-com/pinned"));
  }

  @TestMethod
  public async turnsAnErrorInOneRepositoryIntoItsLineAndGoesOnAsync(): Promise<void> {
    using source = DependentsStepTests.createSource();
    using broken = DependentsStepTests.createTarget(DependentsStepTests.PINNED);
    using works = DependentsStepTests.createTarget(DependentsStepTests.PINNED);
    const host = new FakeUpdateHost();
    host.repositories.set("noldova-com/broken", broken);
    host.repositories.set("noldova-com/works", works);
    host.thrown.set("noldova-com/broken", new Error("git broke"));

    const result = await DependentsStepTests.createStep(source, host, new LockingNpm()).runAsync(["0.0.4", source.readHead()]);

    Assert.isFalse(result.isSuccessful);
    Assert.areEqual(
      ["noldova-com/broken: git broke", "noldova-com/works: moved 3 pins in https://example.test/noldova-com/works/pull/1"].join("\n"),
      result.message.split("\n").slice(1).join("\n"));
  }

  @TestMethod
  public async rejectsWithWhatIsThrownThatIsNotAnErrorAsync(): Promise<void> {
    using source = DependentsStepTests.createSource();
    using pinned = DependentsStepTests.createTarget(DependentsStepTests.PINNED);
    const host = new FakeUpdateHost();
    host.repositories.set("noldova-com/pinned", pinned);
    host.thrown.set("noldova-com/pinned", "not an error");

    let thrown: unknown = null;
    try {
      await DependentsStepTests.createStep(source, host, new LockingNpm()).runAsync(["0.0.4", source.readHead()]);
    }
    catch (error: unknown) {
      thrown = error;
    }

    Assert.areEqual("not an error", thrown);
  }

  @TestMethod
  public async failsARepositoryWhoseLockFileDoesNotRefreshAsync(): Promise<void> {
    using source = DependentsStepTests.createSource();
    using pinned = DependentsStepTests.createTarget(DependentsStepTests.PINNED);
    const host = new FakeUpdateHost();
    host.repositories.set("noldova-com/pinned", pinned);
    const npm = new LockingNpm();
    npm.result = new ProcessResult(1, "", "npm error code E401\nnpm error Unable to authenticate\n");

    const result = await DependentsStepTests.createStep(source, host, npm).runAsync(["0.0.4", source.readHead()]);

    Assert.isFalse(result.isSuccessful);
    Assert.areEqual(
      "noldova-com/pinned: Regenerating package-lock.json, npm install --package-lock-only --ignore-scripts --no-audit --no-fund, exited with code 1: npm error code E401; npm error Unable to authenticate",
      result.message.split("\n")[1]);
    Assert.isFalse(host.pushed.has("noldova-com/pinned"));
  }

  @TestMethod
  public async removesItsTemporaryFolderAsync(): Promise<void> {
    using source = DependentsStepTests.createSource();
    using pinned = DependentsStepTests.createTarget(DependentsStepTests.PINNED);
    const host = new FakeUpdateHost();
    host.repositories.set("noldova-com/pinned", pinned);
    host.failures.set("push noldova-com/pinned", StepResult.failed("rejected"));
    const root = fs.mkdtempSync(path.join(source.directory, "..", "tools-pipelines-root-"));
    try {
      await new DependentsStep(DependentsStepTests.createArchiveStep(source.directory), host, new ProcessRunner(), new LockingNpm(), root).runAsync(["0.0.4", source.readHead()]);

      Assert.areEqual("", fs.readdirSync(root).join());
    }
    finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }

  @TestData("")
  @TestData("0.0.4")
  @TestData("0.0.4 0000000000000000000000000000000000000000 more")
  @TestMethod
  public async failsForAnyNumberOfValuesButTwoAsync(values: string): Promise<void> {
    const step = new DependentsStep(DependentsStepTests.createArchiveStep("."), new FakeUpdateHost(), new ProcessRunner(), new LockingNpm());

    const result = await step.runAsync(values.split(" ").filter(t => t.length > 0));

    Assert.areEqual("The dependents step takes <version> <commit>.", result.message);
  }

  @TestData("01.0.0", "\"01.0.0\" is not a version")
  @TestData("0.0.4-nightly.20261102", "0.0.4-nightly.20261102 is a nightly version; only a release version moves the repositories that pin its packages.")
  @TestMethod
  public async failsForAVersionThatIsNotAReleaseAsync(version: string, message: string): Promise<void> {
    const step = new DependentsStep(DependentsStepTests.createArchiveStep("."), new FakeUpdateHost(), new ProcessRunner(), new LockingNpm());

    const result = await step.runAsync([version, "0000000000000000000000000000000000000000"]);

    Assert.isFalse(result.isSuccessful);
    Assert.isTrue(result.message.startsWith(message), result.message);
  }

  @TestMethod
  public async failsForACommitThatIsNotAFullIdAsync(): Promise<void> {
    const step = new DependentsStep(DependentsStepTests.createArchiveStep("."), new FakeUpdateHost(), new ProcessRunner(), new LockingNpm());

    const result = await step.runAsync(["0.0.4", "main"]);

    Assert.isFalse(result.isSuccessful);
    Assert.isTrue(result.message.includes("main"), result.message);
  }

  @TestMethod
  public async failsWithWhatTheHostCannotAnswerAsync(): Promise<void> {
    using source = DependentsStepTests.createSource();
    const host = new FakeUpdateHost();
    const step = DependentsStepTests.createStep(source, host, new LockingNpm());

    host.source = StepResult.failed("no source");
    Assert.areEqual("no source", (await step.runAsync(["0.0.4", source.readHead()])).message);
    host.source = "source";
    host.listed = StepResult.failed("no list");
    Assert.areEqual("no list", (await step.runAsync(["0.0.4", source.readHead()])).message);
    host.listed = null;
    host.notes = StepResult.failed("no notes");
    Assert.areEqual("no notes", (await step.runAsync(["0.0.4", source.readHead()])).message);
  }

  @TestMethod
  public async failsForACommitThatReleasesNoPackageAsync(): Promise<void> {
    using source = GitRepositoryFixture.create();
    source.commit({ "README.md": "Read me.\n" });

    const result = await DependentsStepTests.createStep(source, new FakeUpdateHost(), new LockingNpm()).runAsync(["0.0.4", source.readHead()]);

    Assert.isFalse(result.isSuccessful);
    Assert.isTrue(result.message.includes(source.readHead()), result.message);
  }

  private static createSource(): GitRepositoryFixture {
    const source = GitRepositoryFixture.create();
    source.commit({
      "src/a/package.json": "{ \"name\": \"@noldova/a\", \"peerDependencies\": { \"@noldova/kit\": \"0.0.5\", \"@noldova/range\": \"^1.0.0\" } }\n",
      "src/a.b/package.json": "{ \"name\": \"@noldova/a.b\", \"peerDependencies\": { \"@noldova/a\": \"0.0.4\", \"@noldova/kit\": \"0.0.5\" } }\n",
      "src/b/package.json": "{ \"name\": \"@noldova/b\" }\n",
      "src/b/tests/package.json": "{ \"name\": \"@noldova/b-tests\" }\n",
      "src/private/package.json": "{ \"name\": \"@noldova/private\", \"private\": true }\n"
    });

    return source;
  }

  private static createTarget(files: Readonly<Record<string, string>>): GitRepositoryFixture {
    const target = GitRepositoryFixture.create();
    target.commit(files);

    return target;
  }

  private static createArchiveStep(directory: string): ArchiveStep {
    const processRunner = new ProcessRunner();

    return new ArchiveStep(new Git(processRunner, directory), new Tar(processRunner), new Npm(processRunner, directory));
  }

  private static createStep(source: GitRepositoryFixture, host: FakeUpdateHost, npm: Npm): DependentsStep {
    return new DependentsStep(DependentsStepTests.createArchiveStep(source.directory), host, new ProcessRunner(), npm);
  }
}
