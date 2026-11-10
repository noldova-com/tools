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
import { ArchiveStep, DependentsStep, Git, Npm, ProcessResult, ProcessRunner, RelockedFiles, StepResult, Tar } from "@noldova/tools.pipelines";

import { FakeUpdateHost, RecordingOutput } from "./fake-update-host.js";
import { GitRepositoryFixture } from "./git-repository.fixture.js";

class LockingNpm extends Npm {
  public readonly directories: string[] = [];
  public readonly hiddenVariables: string[] = [];
  public readonly givenLocks: string[] = [];
  public readonly givenManifests: string[] = [];
  public readonly views: Map<string, ProcessResult> = new Map();
  public readonly viewed: string[] = [];
  public result: ProcessResult = new ProcessResult(0, "", "");
  public locked: object | null = null;

  public constructor() {
    super(new ProcessRunner(), ".");
  }

  public override async lockAsync(directory: string, hiddenVariables: readonly string[] = []): Promise<ProcessResult> {
    this.directories.push(path.basename(directory));
    this.hiddenVariables.push(...hiddenVariables);
    this.givenLocks.push(fs.readFileSync(path.join(directory, "package-lock.json"), "utf8"));
    this.givenManifests.push(fs.readFileSync(path.join(directory, "package.json"), "utf8"));
    const locked = this.locked ?? { lockedFrom: fs.readFileSync(path.join(directory, "package.json"), "utf8") };
    fs.writeFileSync(path.join(directory, "package-lock.json"), `${JSON.stringify(locked)}\n`);

    return this.result;
  }

  public override async viewInAsync(directory: string, specifier: string, field: string, hiddenVariables: readonly string[] = []): Promise<ProcessResult> {
    this.viewed.push(`${path.basename(directory)} ${specifier} ${field} ${hiddenVariables.join(",")}`);

    return this.views.get(`${specifier} ${field}`) ?? new ProcessResult(1, "", "npm error code E404\n");
  }

  public answer(specifier: string, field: string, value: unknown): void {
    this.views.set(`${specifier} ${field}`, new ProcessResult(0, `${JSON.stringify(value)}\n`, ""));
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
    Assert.areEqual("{}\n|{}\n", npm.givenLocks.join("|"));
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
          "- `package-lock.json`: the moved packages, the entries nested under them and the entries that depend on them resolved again with `npm install --package-lock-only --ignore-scripts --no-audit --no-fund`; every other entry kept unless a resolved package needs it to change",
          "- `src/package-lock.json`: the moved packages, the entries nested under them and the entries that depend on them resolved again with `npm install --package-lock-only --ignore-scripts --no-audit --no-fund`; every other entry kept unless a resolved package needs it to change",
          "",
          "## Release notes for 0.0.4",
          "",
          "- Adds a thing."
        ].join("\n")
      ].join("\n---\n"),
      host.proposals.join("\n===\n"));
  }

  @TestMethod
  public async unlocksOnlyTheMovedPackagesAndWhatDependsOnThemBeforeNpmResolvesAsync(): Promise<void> {
    using source = DependentsStepTests.createSource();
    const lock = {
      name: "pinned",
      lockfileVersion: 3,
      packages: {
        "": { name: "pinned", dependencies: { "@noldova/a": "0.0.3", "@noldova/kit": "0.0.4", "@noldova/c": "0.0.1" } },
        "node_modules/@noldova/a": { version: "0.0.3", peerDependencies: { "@noldova/kit": "0.0.4" } },
        "node_modules/@noldova/kit": { version: "0.0.4" },
        "node_modules/@noldova/kit/node_modules/@noldova/inner": { version: "1.0.0" },
        "node_modules/@noldova/cdk": { version: "2.0.0", peerDependencies: { "@noldova/kit": "^0.0.4" } },
        "node_modules/@noldova/user": { version: "3.0.0", dependencies: { "@noldova/a": "^0.0.3" } },
        "node_modules/@noldova/optional": { version: "4.0.0", optionalDependencies: { "@noldova/kit": "^0.0.4" } },
        "node_modules/@noldova/a.b": { version: "0.0.2" },
        "node_modules/@noldova/c": { version: "0.0.1", dependencies: { "@noldova/plain": "^2.0.0" } },
        "node_modules/@noldova/plain": { version: "2.0.0" },
        "src/window": { name: "@noldova/local", peerDependencies: { "@noldova/a": "^0.0.3" } }
      }
    };
    using pinned = DependentsStepTests.createTarget({
      "package.json": "{ \"dependencies\": { \"@noldova/a\": \"0.0.3\", \"@noldova/kit\": \"0.0.4\", \"@noldova/c\": \"0.0.1\" } }\n",
      "package-lock.json": `${JSON.stringify(lock, null, 2)}\n`
    });
    const host = new FakeUpdateHost();
    host.repositories.set("noldova-com/pinned", pinned);
    const npm = new LockingNpm();

    const result = await DependentsStepTests.createStep(source, host, npm).runAsync(["0.0.4", source.readHead()]);

    Assert.isTrue(result.isSuccessful, result.message);
    const kept = {
      name: "pinned",
      lockfileVersion: 3,
      packages: {
        "": lock.packages[""],
        "node_modules/@noldova/a.b": { version: "0.0.2" },
        "node_modules/@noldova/c": lock.packages["node_modules/@noldova/c"],
        "node_modules/@noldova/plain": { version: "2.0.0" },
        "src/window": lock.packages["src/window"]
      }
    };
    Assert.areEqual(`${JSON.stringify(kept, null, 2)}\n`, npm.givenLocks.join("|"));
  }

  @TestMethod
  public async movesTheExactPinsTheMovedPackagesNeedAsPeersUntilNothingMoreMovesAsync(): Promise<void> {
    using source = DependentsStepTests.createSource();
    using pinned = DependentsStepTests.createTarget({
      "package.json": "{ \"dependencies\": { \"@noldova/a\": \"0.0.3\", \"@noldova/kit\": \"0.0.4\", \"@noldova/x\": \"1.0.0\", \"@noldova/r\": \"^1.0.0\", \"@noldova/own\": \"0.0.1\" } }\n",
      "package-lock.json": "{ \"packages\": { \"node_modules/@noldova/own\": { \"version\": \"0.0.1\" } } }\n",
      "src/package.json": "{ \"devDependencies\": { \"@noldova/y\": \"2.0.0\", \"@noldova/z\": \"3.0.0\", \"@noldova/w\": \"1.0.0\" } }\n",
      "src/own/package.json": "{ \"name\": \"@noldova/own\", \"version\": \"0.0.1\" }\n"
    });
    const host = new FakeUpdateHost();
    host.repositories.set("noldova-com/pinned", pinned);
    const npm = new LockingNpm();
    npm.answer("@noldova/kit@0.0.5", "peerDependencies", { "@noldova/x": "1.0.5", "@noldova/r": "^2.0.0", "@noldova/n": 1, "@noldova/absent": "4.0.0", "@noldova/own": "0.0.2" });
    npm.answer("@noldova/x@1.0.5", "peerDependencies", { "@noldova/y": "2.0.5", "@noldova/z": "3.0.0" });
    npm.views.set("@noldova/y@2.0.5 peerDependencies", new ProcessResult(1, "{ \"error\": { \"code\": \"E404\" } }\n", ""));
    npm.answer("@noldova/z@3.0.0", "peerDependencies", "3.0.0");
    npm.answer("@noldova/w@1.0.0", "peerDependencies", []);
    npm.views.set("@noldova/a@0.0.4 peerDependencies", new ProcessResult(0, "\n", ""));

    const result = await DependentsStepTests.createStep(source, host, npm).runAsync(["0.0.4", source.readHead()]);

    Assert.isTrue(result.isSuccessful, result.message);
    Assert.areEqual("noldova-com/pinned: moved 4 pins in https://example.test/noldova-com/pinned/pull/1", result.message.split("\n")[1]);
    Assert.areEqual(
      [
        "- `package.json`: `@noldova/a` from 0.0.3 to 0.0.4",
        "- `package.json`: `@noldova/kit` from 0.0.4 to 0.0.5, which `@noldova/a.b` 0.0.4 needs as a peer",
        "- `package.json`: `@noldova/x` from 1.0.0 to 1.0.5, which `@noldova/kit` 0.0.5 needs as a peer",
        "- `src/package.json`: `@noldova/y` from 2.0.0 to 2.0.5, which `@noldova/x` 1.0.5 needs as a peer"
      ].join("\n"),
      host.proposals.join("").split("\n").filter(t => t.startsWith("- `") && t.includes(" from ")).join("\n"));
    Assert.areEqual(
      [
        "0 @noldova/a@0.0.4 peerDependencies SECRET_TOKEN",
        "0 @noldova/kit@0.0.5 peerDependencies SECRET_TOKEN",
        "0 @noldova/x@1.0.5 peerDependencies SECRET_TOKEN",
        "0 @noldova/y@2.0.5 peerDependencies SECRET_TOKEN",
        "0 @noldova/z@3.0.0 peerDependencies SECRET_TOKEN",
        "0 @noldova/w@1.0.0 peerDependencies SECRET_TOKEN"
      ].join("\n"),
      npm.viewed.join("\n"));
  }

  @TestMethod
  public async leavesARepositoryWhosePinIsNewerThanTheExactPeerAMovedPackageNeedsAsync(): Promise<void> {
    using source = DependentsStepTests.createSource();
    using pinned = DependentsStepTests.createTarget({
      "package.json": "{ \"dependencies\": { \"@noldova/a\": \"0.0.3\", \"@noldova/kit\": \"0.0.4\" }, \"devDependencies\": { \"@noldova/z\": \"3.0.0\" } }\n",
      "package-lock.json": "{}\n"
    });
    const host = new FakeUpdateHost();
    host.repositories.set("noldova-com/pinned", pinned);
    const npm = new LockingNpm();
    npm.answer("@noldova/kit@0.0.5", "peerDependencies", { "@noldova/z": "2.0.0" });

    const result = await DependentsStepTests.createStep(source, host, npm).runAsync(["0.0.4", source.readHead()]);

    Assert.isTrue(result.isSuccessful, result.message);
    Assert.areEqual(
      "noldova-com/pinned: left at its pins, which can't take what 0.0.4 moves: @noldova/z 3.0.0 is newer than the 2.0.0 that @noldova/kit 0.0.5 needs.",
      result.message.split("\n")[1]);
    Assert.areEqual(0, npm.directories.length);
    Assert.isFalse(host.pushed.has("noldova-com/pinned"));
  }

  @TestMethod
  public async leavesARepositoryWhoseMovedPackagesNeedAnotherAtTwoExactVersionsAsync(): Promise<void> {
    using source = DependentsStepTests.createSource();
    using pinned = DependentsStepTests.createTarget({
      "package.json": "{ \"dependencies\": { \"@noldova/a\": \"0.0.3\", \"@noldova/kit\": \"0.0.4\", \"@noldova/q\": \"1.0.0\" } }\n",
      "package-lock.json": "{}\n"
    });
    const host = new FakeUpdateHost();
    host.repositories.set("noldova-com/pinned", pinned);
    const npm = new LockingNpm();
    npm.answer("@noldova/a@0.0.4", "peerDependencies", { "@noldova/q": "1.0.4" });
    npm.answer("@noldova/kit@0.0.5", "peerDependencies", { "@noldova/q": "1.0.5" });

    const result = await DependentsStepTests.createStep(source, host, npm).runAsync(["0.0.4", source.readHead()]);

    Assert.isTrue(result.isSuccessful, result.message);
    Assert.areEqual(
      "noldova-com/pinned: left at its pins, which can't take what 0.0.4 moves: @noldova/q moves to 1.0.4, but @noldova/kit 0.0.5 needs 1.0.5.",
      result.message.split("\n")[1]);
    Assert.areEqual(0, npm.directories.length);
    Assert.isFalse(host.pushed.has("noldova-com/pinned"));
  }

  @TestMethod
  public async movesAnExactPinThatNeedsAMovedPackageAtAnotherVersionToTheFirstVersionThatNeedsTheMovedOneAsync(): Promise<void> {
    using source = DependentsStepTests.createSource();
    using pinned = DependentsStepTests.createTarget({
      "package.json": "{ \"dependencies\": { \"@noldova/a\": \"0.0.3\", \"@noldova/kit\": \"0.0.4\", \"@noldova/c\": \"0.0.1\" } }\n",
      "package-lock.json": "{}\n",
      "src/package.json": "{ \"devDependencies\": { \"@noldova/cli\": \"1.0.0\" } }\n"
    });
    const host = new FakeUpdateHost();
    host.repositories.set("noldova-com/pinned", pinned);
    const npm = new LockingNpm();
    npm.answer("@noldova/cli@1.0.0", "peerDependencies", { "@noldova/kit": "0.0.4" });
    npm.answer("@noldova/cli", "versions", ["0.9.0", "1.0.0", "1.0.1", "2.0.0", "1.0.3", "1.0.2", "1.0.3-nightly.20261101"]);
    npm.answer("@noldova/cli@1.0.1", "peerDependencies", { "@noldova/kit": "0.0.4" });
    npm.answer("@noldova/cli@1.0.2", "peerDependencies", { "@noldova/kit": "0.0.5", "@noldova/a": "0.0.3" });
    npm.answer("@noldova/cli@1.0.3", "peerDependencies", { "@noldova/kit": "0.0.5", "@noldova/a": "0.0.4" });

    const result = await DependentsStepTests.createStep(source, host, npm).runAsync(["0.0.4", source.readHead()]);

    Assert.isTrue(result.isSuccessful, result.message);
    Assert.areEqual(
      "- `src/package.json`: `@noldova/cli` from 1.0.0 to 1.0.3, the first version that needs `@noldova/kit` 0.0.5 as a peer",
      host.proposals.join("").split("\n").filter(t => t.includes("@noldova/cli")).join("\n"));
    Assert.areEqual("{ \"devDependencies\": { \"@noldova/cli\": \"1.0.3\" } }\n", host.pushed.get("noldova-com/pinned")?.["src/package.json"]);
    Assert.areEqual(
      "@noldova/c@0.0.1 peerDependencies,@noldova/cli@1.0.0 peerDependencies,@noldova/cli versions,@noldova/cli@1.0.1 peerDependencies,@noldova/cli@1.0.2 peerDependencies,@noldova/cli@1.0.3 peerDependencies",
      npm.viewed.filter(t => t.includes("/c")).map(t => t.split(" ").slice(1, 3).join(" ")).join(","));
  }

  @TestData("[\"1.0.1\", \"1.0.2\"]")
  @TestData("\"1.0.1\"")
  @TestData("{}")
  @TestData("")
  @TestMethod
  public async leavesARepositoryWhosePinnedPackageHasNoVersionThatNeedsTheMovedOneAsync(versions: string): Promise<void> {
    using source = DependentsStepTests.createSource();
    using pinned = DependentsStepTests.createTarget({
      "package.json": "{ \"dependencies\": { \"@noldova/a\": \"0.0.3\", \"@noldova/kit\": \"0.0.4\" }, \"devDependencies\": { \"@noldova/cli\": \"1.0.0\" } }\n",
      "package-lock.json": "{}\n"
    });
    const host = new FakeUpdateHost();
    host.repositories.set("noldova-com/pinned", pinned);
    const npm = new LockingNpm();
    npm.answer("@noldova/cli@1.0.0", "peerDependencies", { "@noldova/kit": "0.0.4" });
    npm.views.set("@noldova/cli versions", new ProcessResult(0, `${versions}\n`, ""));
    npm.answer("@noldova/cli@1.0.1", "peerDependencies", { "@noldova/a": "0.0.4" });
    npm.answer("@noldova/cli@1.0.2", "peerDependencies", { "@noldova/kit": "0.0.6" });
    npm.answer("@noldova/cli@1.0.3", "peerDependencies", { "@noldova/kit": "0.0.5" });

    const result = await DependentsStepTests.createStep(source, host, npm).runAsync(["0.0.4", source.readHead()]);

    Assert.isTrue(result.isSuccessful, result.message);
    Assert.areEqual(
      "noldova-com/pinned: left at its pins, which can't take what 0.0.4 moves: @noldova/cli 1.0.0 needs @noldova/kit 0.0.4, and no later version of it needs @noldova/kit 0.0.5.",
      result.message.split("\n")[1]);
    Assert.areEqual(0, npm.directories.length);
    Assert.isFalse(host.pushed.has("noldova-com/pinned"));
  }

  @TestMethod
  public async failsARepositoryWhenNpmCannotReadAPeerFromTheRegistryAsync(): Promise<void> {
    using source = DependentsStepTests.createSource();
    using pinned = DependentsStepTests.createTarget(DependentsStepTests.PINNED);
    const host = new FakeUpdateHost();
    host.repositories.set("noldova-com/pinned", pinned);
    const npm = new LockingNpm();
    npm.views.set("@noldova/a@0.0.4 peerDependencies", new ProcessResult(1, "", "npm error code E500\n"));

    const result = await DependentsStepTests.createStep(source, host, npm).runAsync(["0.0.4", source.readHead()]);

    Assert.isFalse(result.isSuccessful);
    Assert.areEqual("noldova-com/pinned: @noldova/a@0.0.4: npm view exited with code 1: npm error code E500", result.message.split("\n")[1]);
    Assert.areEqual(0, npm.directories.length);
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
      "noldova-com/pinned: left at its pins, since the lock files relocked for 0.0.4 still hold packages whose exact peers differ from what they lock: package-lock.json locks @noldova/kit 0.0.5, which needs @noldova/z 2.0.0.",
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
        "check out noldova-com/unpinned",
        "failure: noldova-com/failed: rejected",
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
      "noldova-com/pinned: Relocking package-lock.json, npm install --package-lock-only --ignore-scripts --no-audit --no-fund, exited with code 1: npm error code E401; npm error Unable to authenticate",
      result.message.split("\n")[1]);
    Assert.isFalse(host.pushed.has("noldova-com/pinned"));
  }

  @TestMethod
  public async failsARepositoryWhoseLockFileDoesNotRefreshFromItsOwnPackagesAsync(): Promise<void> {
    using source = DependentsStepTests.createSource();
    using pinned = DependentsStepTests.createTarget({
      "package.json": "{ \"dependencies\": { \"@noldova/a\": \"0.0.3\", \"@noldova/own\": \"0.0.2\", \"@noldova/own-core\": \"0.0.2\" } }\n",
      "package-lock.json": "{}\n",
      "src/own/package.json": "{ \"name\": \"@noldova/own\", \"version\": \"__VERSION__\", \"dependencies\": { \"@noldova/own-core\": \"__VERSION__\", \"@noldova/r\": \"^1.0.0\" } }\n",
      "src/own-core/package.json": "{ \"name\": \"@noldova/own-core\", \"version\": \"__VERSION__\" }\n"
    });
    const host = new FakeUpdateHost();
    host.repositories.set("noldova-com/pinned", pinned);
    const npm = new LockingNpm();
    npm.result = new ProcessResult(1, "", "npm error code ETARGET\n");

    const result = await DependentsStepTests.createStep(source, host, npm).runAsync(["0.0.4", source.readHead()]);

    Assert.isFalse(result.isSuccessful);
    Assert.areEqual(
      "noldova-com/pinned: Relocking package-lock.json, npm install --package-lock-only --ignore-scripts --no-audit --no-fund, exited with code 1: npm error code ETARGET",
      result.message.split("\n")[1]);
    Assert.areEqual(JSON.stringify({ "@noldova/a": "0.0.4", "@noldova/own": "file:../0-own/1.tgz", "@noldova/own-core": "file:../0-own/0.tgz" }),
      JSON.stringify(JSON.parse(npm.givenManifests.join("")).dependencies));
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

  @TestMethod
  public async proposesWhatTheRepositoryRelockedItselfAsync(): Promise<void> {
    using source = DependentsStepTests.createSource();
    using pinned = DependentsStepTests.createTarget(DependentsStepTests.PINNED);
    const host = new FakeUpdateHost();
    host.repositories.set("noldova-com/pinned", pinned);
    const files = { "package.json": "{ \"moved\": true }\n", "src/package-lock.json": "{ \"relocked\": true }\n" };
    host.relocks.set("noldova-com/pinned", RelockedFiles.format(new RelockedFiles(pinned.readHead(), ["`package.json`: `@noldova/a` from 0.0.3 to 0.0.4"], ["`src/package-lock.json`: relocked by the repository"], files)));
    const npm = new LockingNpm();

    const result = await DependentsStepTests.createStep(source, host, npm).runAsync(["0.0.4", source.readHead()]);

    Assert.isTrue(result.isSuccessful, result.message);
    Assert.areEqual("noldova-com/pinned: moved 1 pins in https://example.test/noldova-com/pinned/pull/1", result.message.split("\n")[1]);
    const request = {
      source: "source",
      version: "0.0.4",
      commit: source.readHead(),
      packageNames: ["@noldova/a", "@noldova/a.b", "@noldova/b"],
      peerPins: [{ packageName: "@noldova/kit", version: "0.0.5", reason: ", which `@noldova/a.b` 0.0.4 needs as a peer" }]
    };
    Assert.areEqual(`noldova-com/pinned ${pinned.readHead()} ${JSON.stringify(request)}`, host.relockRequests.join("\n"));
    const pushed = host.pushed.get("noldova-com/pinned");
    Assert.areEqual(files["package.json"], pushed?.["package.json"]);
    Assert.areEqual(files["src/package-lock.json"], pushed?.["src/package-lock.json"]);
    Assert.areEqual(DependentsStepTests.PINNED["src/package.json"], pushed?.["src/package.json"]);
    Assert.areEqual(DependentsStepTests.PINNED["package-lock.json"], pushed?.["package-lock.json"]);
    Assert.areEqual(0, npm.directories.length + npm.viewed.length);
    const body = host.proposals[0] ?? "";
    Assert.isTrue(body.includes("\n- `package.json`: `@noldova/a` from 0.0.3 to 0.0.4\n- `src/package-lock.json`: relocked by the repository\n"), body);
  }

  @TestData(true)
  @TestData(false)
  @TestMethod
  public async takesTheLineTheRepositoryWroteForItselfAsync(isSuccessful: boolean): Promise<void> {
    using source = DependentsStepTests.createSource();
    using pinned = DependentsStepTests.createTarget(DependentsStepTests.PINNED);
    const host = new FakeUpdateHost();
    host.repositories.set("noldova-com/pinned", pinned);
    const line = "noldova-com/pinned: left at its pins, which can't take what 0.0.4 moves: a reason.";
    host.relocks.set("noldova-com/pinned", RelockedFiles.format(isSuccessful ? StepResult.succeeded(line) : StepResult.failed(line)));

    const result = await DependentsStepTests.createStep(source, host, new LockingNpm()).runAsync(["0.0.4", source.readHead()]);

    Assert.areEqual(isSuccessful, result.isSuccessful);
    Assert.areEqual(line, result.message.split("\n")[1]);
    Assert.isFalse(host.pushed.has("noldova-com/pinned"));
  }

  @TestMethod
  public async failsARepositoryWhoseRelockTheHostCouldntGetAsync(): Promise<void> {
    using source = DependentsStepTests.createSource();
    using pinned = DependentsStepTests.createTarget(DependentsStepTests.PINNED);
    const host = new FakeUpdateHost();
    host.repositories.set("noldova-com/pinned", pinned);
    host.relocks.set("noldova-com/pinned", StepResult.failed("The relock run ended failure."));

    const result = await DependentsStepTests.createStep(source, host, new LockingNpm()).runAsync(["0.0.4", source.readHead()]);

    Assert.isFalse(result.isSuccessful);
    Assert.areEqual("noldova-com/pinned: The relock run ended failure.", result.message.split("\n")[1]);
    Assert.isFalse(host.pushed.has("noldova-com/pinned"));
  }

  @TestMethod
  public async failsARepositoryWhoseRelockChangedOtherFilesAsync(): Promise<void> {
    using source = DependentsStepTests.createSource();
    using pinned = DependentsStepTests.createTarget(DependentsStepTests.PINNED);
    const host = new FakeUpdateHost();
    host.repositories.set("noldova-com/pinned", pinned);
    host.relocks.set("noldova-com/pinned", RelockedFiles.format(new RelockedFiles(pinned.readHead(), ["a move"], [], { "package.json": "{}\n", "README.md": "Changed.\n", "other/package.json": "{}\n" })));

    const result = await DependentsStepTests.createStep(source, host, new LockingNpm()).runAsync(["0.0.4", source.readHead()]);

    Assert.isFalse(result.isSuccessful);
    Assert.areEqual(
      "noldova-com/pinned: The repository's relock changed files that aren't its tracked package.json or package-lock.json files, so none are taken: README.md, other/package.json.",
      result.message.split("\n")[1]);
    Assert.isFalse(host.pushed.has("noldova-com/pinned"));
  }

  @TestMethod
  public async startsEveryRepositorysRelockBeforeReadingTheFirstAsync(): Promise<void> {
    using source = DependentsStepTests.createSource();
    using first = DependentsStepTests.createTarget(DependentsStepTests.PINNED);
    using second = DependentsStepTests.createTarget(DependentsStepTests.PINNED);
    const host = new FakeUpdateHost();
    host.repositories.set("noldova-com/first", first);
    host.repositories.set("noldova-com/second", second);
    host.relocks.set("noldova-com/first", RelockedFiles.format(StepResult.succeeded("noldova-com/first: pins none of them below 0.0.4.")));
    host.relocks.set("noldova-com/second", RelockedFiles.format(StepResult.succeeded("noldova-com/second: pins none of them below 0.0.4.")));

    const result = await DependentsStepTests.createStep(source, host, new LockingNpm()).runAsync(["0.0.4", source.readHead()]);

    Assert.isTrue(result.isSuccessful, result.message);
    Assert.areEqual(
      [
        "check out noldova-com/first",
        "start relock noldova-com/first",
        "check out noldova-com/second",
        "start relock noldova-com/second",
        "read relock noldova-com/first run of noldova-com/first",
        "read relock noldova-com/second run of noldova-com/second"
      ].join("\n"),
      host.events.join("\n"));
    Assert.areEqual("noldova-com/first: pins none of them below 0.0.4.|noldova-com/second: pins none of them below 0.0.4.", result.message.split("\n").slice(1).join("|"));
  }

  @TestMethod
  public async failsARepositoryWhoseRelockTheHostCouldntStartAsync(): Promise<void> {
    using source = DependentsStepTests.createSource();
    using pinned = DependentsStepTests.createTarget(DependentsStepTests.PINNED);
    const host = new FakeUpdateHost();
    host.repositories.set("noldova-com/pinned", pinned);
    host.starts.set("noldova-com/pinned", StepResult.failed("GitHub answered POST with 403: Refused"));

    const result = await DependentsStepTests.createStep(source, host, new LockingNpm()).runAsync(["0.0.4", source.readHead()]);

    Assert.isFalse(result.isSuccessful);
    Assert.areEqual("noldova-com/pinned: GitHub answered POST with 403: Refused", result.message.split("\n")[1]);
    Assert.isFalse(host.events.some(t => t.startsWith("read relock")));
  }

  @TestMethod
  public async failsARepositoryThatRelockedAnotherCommitAsync(): Promise<void> {
    using source = DependentsStepTests.createSource();
    using pinned = DependentsStepTests.createTarget(DependentsStepTests.PINNED);
    const host = new FakeUpdateHost();
    host.repositories.set("noldova-com/pinned", pinned);
    const other = "0123456789abcdef0123456789abcdef01234567";
    host.relocks.set("noldova-com/pinned", RelockedFiles.format(new RelockedFiles(other, ["a move"], [], { "package.json": "{}\n" })));

    const result = await DependentsStepTests.createStep(source, host, new LockingNpm()).runAsync(["0.0.4", source.readHead()]);

    Assert.isFalse(result.isSuccessful);
    Assert.areEqual(
      `noldova-com/pinned: The repository's relock ran at ${other}, not at ${pinned.readHead()}, the commit the step checked out and sent, so none of its files are taken.`,
      result.message.split("\n")[1]);
    Assert.isFalse(host.pushed.has("noldova-com/pinned"));
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
