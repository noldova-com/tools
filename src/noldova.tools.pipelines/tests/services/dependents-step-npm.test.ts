/**
 * @license
 * Copyright (c) Noldova.
 *
 * This source code is licensed under the license found in the
 * LICENSE file in the root directory of this source tree.
 */

import fs from "node:fs";
import path from "node:path";

import { JsonReader } from "@noldova/context.json";
import { Assert, TestClass, TestMethod } from "@noldova/context.testing";
import { ArchiveStep, DependentsStep, Git, Npm, ProcessResult, ProcessRunner, type StepResult, Tar } from "@noldova/tools.pipelines";

import { FakeUpdateHost } from "./fake-update-host.js";
import { GitRepositoryFixture } from "./git-repository.fixture.js";
import { LocalRegistryFixture } from "./local-registry.fixture.js";

class DependentsRun {
  public readonly result: StepResult;
  public readonly host: FakeUpdateHost;

  public constructor(result: StepResult, host: FakeUpdateHost) {
    this.result = result;
    this.host = host;
  }
}

class EnvironmentValue implements Disposable {
  private readonly name: string;
  private readonly before: string | undefined;

  public constructor(name: string, value: string) {
    this.name = name;
    this.before = process.env[name];
    process.env[name] = value;
  }

  public [Symbol.dispose](): void {
    if (Object.isUndefined(this.before))
      delete process.env[this.name];
    else
      process.env[this.name] = this.before;
  }
}

class ReleasedManifestNpm extends Npm {
  private readonly manifest: object;

  public constructor(processRunner: ProcessRunner, workingDirectory: string, manifest: object) {
    super(processRunner, workingDirectory);
    this.manifest = manifest;
  }

  public override viewManifestAsync(): Promise<ProcessResult> {
    return Promise.resolve(new ProcessResult(0, JSON.stringify(this.manifest), ""));
  }
}

// The dependents step with the real npm, against a local registry: a dependent's lock file holds the released
// package's previous version, whose exact peers name the older versions of packages the release moves, as when npm
// failed with ERESOLVE refreshing such a lock file.
@TestClass
export class DependentsStepNpmTests {
  private static readonly CACHE_FOLDER: string = ".npm-cache";
  private static readonly COMPILE_CACHE_OFF: string = "NODE_DISABLE_COMPILE_CACHE";
  private static readonly DEPENDENT: string = "noldova-com/dependent";
  private static readonly APP_LOCK: string = "app/package-lock.json";
  private static readonly OWN: string = "@noldova/own";
  private static readonly OPTIONAL_COMPILER: Readonly<Record<string, { readonly optional: boolean }>> = { "@noldova/compiler": { optional: true } };

  @TestMethod
  public async relocksALockWhosePreviousReleaseNeedsTheOlderPeersAsync(): Promise<void> {
    using _ = DependentsStepNpmTests.turnOffCompileCache();
    await using registry = await LocalRegistryFixture.startAsync();
    registry.publish("@noldova/core", "1.0.1");
    registry.publish("@noldova/forms", "1.0.1", { peerDependencies: { "@noldova/core": "1.0.1" } });
    registry.publish("@noldova/window", "0.0.70", { peerDependencies: { "@noldova/core": "1.0.1", "@noldova/forms": "1.0.1" } });
    registry.publish("@noldova/ui", "3.0.0", { peerDependencies: { "@noldova/core": "^1.0.0" } });
    registry.publish("@noldova/unrelated", "2.0.0");
    using dependent = await DependentsStepNpmTests.createDependentAsync(registry,
      { "@noldova/core": "1.0.1", "@noldova/forms": "1.0.1", "@noldova/ui": "3.0.0", "@noldova/unrelated": "^2.0.0", "@noldova/window": "0.0.70" });
    registry.publish("@noldova/core", "1.0.5");
    registry.publish("@noldova/forms", "1.0.5", { peerDependencies: { "@noldova/core": "1.0.5" } });
    registry.publish("@noldova/window", "0.0.71", { peerDependencies: { "@noldova/core": "1.0.5", "@noldova/forms": "1.0.5" } });
    registry.publish("@noldova/unrelated", "2.1.0");

    const { result, host } = await DependentsStepNpmTests.releaseWindowAsync(dependent, { "@noldova/core": "1.0.5", "@noldova/forms": "1.0.5" });

    Assert.isTrue(result.isSuccessful, result.message);
    Assert.areEqual("@noldova/core 1.0.5, @noldova/forms 1.0.5, @noldova/ui 3.0.0, @noldova/unrelated 2.0.0, @noldova/window 0.0.71", DependentsStepNpmTests.readLocked(host));
  }

  // The dependent's workspace part takes the window package it pins as a peer from that pin on, so npm locks the part's
  // peer range in its workspace entry too.
  @TestMethod
  public async raisesAWorkspacesPeerRangeThatStartsAtTheOldPinAndRelocksItsCopyAsync(): Promise<void> {
    using _ = DependentsStepNpmTests.turnOffCompileCache();
    await using registry = await LocalRegistryFixture.startAsync();
    registry.publish("@noldova/core", "1.0.1");
    registry.publish("@noldova/window", "0.0.70", { peerDependencies: { "@noldova/core": "1.0.1" } });
    using dependent = await DependentsStepNpmTests.createDependentAsync(registry, { "@noldova/core": "1.0.1", "@noldova/window": "0.0.70" }, {},
      { "src/part/package.json": `${JSON.stringify({ name: "@noldova/local.part", version: "1.0.0", peerDependencies: { "@noldova/window": ">=0.0.70 <0.1.0" } }, null, 2)}\n` });
    registry.publish("@noldova/core", "1.0.5");
    registry.publish("@noldova/window", "0.0.71", { peerDependencies: { "@noldova/core": "1.0.5" } });

    const { result, host } = await DependentsStepNpmTests.releaseWindowAsync(dependent, { "@noldova/core": "1.0.5" });

    Assert.isTrue(result.isSuccessful, result.message);
    const pushed = host.pushed.get(DependentsStepNpmTests.DEPENDENT);
    const lock: { readonly packages: Readonly<Record<string, { readonly peerDependencies?: unknown }>> } = JSON.parse(pushed?.["package-lock.json"] ?? "{}");
    Assert.areEqual(JSON.stringify({ "@noldova/window": ">=0.0.71 <0.1.0" }), JSON.stringify(JSON.parse(pushed?.["src/part/package.json"] ?? "{}").peerDependencies));
    Assert.areEqual(JSON.stringify({ "@noldova/window": ">=0.0.71 <0.1.0" }), JSON.stringify(lock.packages["src/part"]?.peerDependencies));
  }

  // core's new version needs the new compiler as an optional peer, which the dependent pins at the old one.
  @TestMethod
  public async movesThePinThatAMovedPackageNeedsAsAnExactPeerAsync(): Promise<void> {
    using _ = DependentsStepNpmTests.turnOffCompileCache();
    await using registry = await LocalRegistryFixture.startAsync();
    DependentsStepNpmTests.publishCore(registry, "1.0.1", "0.0.70");
    using dependent = await DependentsStepNpmTests.createDependentAsync(registry, { "@noldova/compiler": "1.0.1", "@noldova/core": "1.0.1", "@noldova/window": "0.0.70" });
    DependentsStepNpmTests.publishCore(registry, "1.0.5", "0.0.71");

    const { result, host } = await DependentsStepNpmTests.releaseWindowAsync(dependent, { "@noldova/core": "1.0.5" });

    Assert.isTrue(result.isSuccessful, result.message);
    Assert.areEqual("@noldova/compiler 1.0.5, @noldova/core 1.0.5, @noldova/window 0.0.71", DependentsStepNpmTests.readLocked(host));
    Assert.isTrue(host.proposals.join("").includes("- `package.json`: `@noldova/compiler` from 1.0.1 to 1.0.5, which `@noldova/core` 1.0.5 needs as a peer\n"), host.proposals.join(""));
  }

  // The dependent also pins compiler-cli, whose pinned version needs the old compiler; its next version needs another.
  @TestMethod
  public async movesAPinThatNeedsTheOldVersionOfAMovedPackageToTheVersionThatNeedsTheNewOneAsync(): Promise<void> {
    using _ = DependentsStepNpmTests.turnOffCompileCache();
    await using registry = await LocalRegistryFixture.startAsync();
    DependentsStepNpmTests.publishCore(registry, "1.0.1", "0.0.70");
    registry.publish("@noldova/compiler-cli", "1.0.1", { peerDependencies: { "@noldova/compiler": "1.0.1" } });
    using dependent = await DependentsStepNpmTests.createDependentAsync(registry, { "@noldova/compiler": "1.0.1", "@noldova/core": "1.0.1", "@noldova/window": "0.0.70" },
      { "@noldova/compiler-cli": "1.0.1" });
    DependentsStepNpmTests.publishCore(registry, "1.0.5", "0.0.71");
    registry.publish("@noldova/compiler-cli", "1.0.4", { peerDependencies: { "@noldova/compiler": "1.0.4" } });
    registry.publish("@noldova/compiler-cli", "1.0.5", { peerDependencies: { "@noldova/compiler": "1.0.5" } });
    registry.publish("@noldova/compiler-cli", "1.0.6", { peerDependencies: { "@noldova/compiler": "1.0.6" } });

    const { result, host } = await DependentsStepNpmTests.releaseWindowAsync(dependent, { "@noldova/core": "1.0.5" });

    Assert.isTrue(result.isSuccessful, result.message);
    Assert.areEqual("@noldova/compiler 1.0.5, @noldova/compiler-cli 1.0.5, @noldova/core 1.0.5, @noldova/window 0.0.71", DependentsStepNpmTests.readLocked(host));
    Assert.isTrue(host.proposals.join("").includes("- `package.json`: `@noldova/compiler-cli` from 1.0.1 to 1.0.5, the first version that needs `@noldova/compiler` 1.0.5 as a peer\n"),
      host.proposals.join(""));
  }

  @TestMethod
  public async leavesTheDependentAtItsPinsWhenNoVersionOfAPinnedPackageNeedsTheMovedOneAsync(): Promise<void> {
    using _ = DependentsStepNpmTests.turnOffCompileCache();
    await using registry = await LocalRegistryFixture.startAsync();
    DependentsStepNpmTests.publishCore(registry, "1.0.1", "0.0.70");
    registry.publish("@noldova/compiler-cli", "1.0.1", { peerDependencies: { "@noldova/compiler": "1.0.1" } });
    using dependent = await DependentsStepNpmTests.createDependentAsync(registry, { "@noldova/compiler": "1.0.1", "@noldova/core": "1.0.1", "@noldova/window": "0.0.70" },
      { "@noldova/compiler-cli": "1.0.1" });
    DependentsStepNpmTests.publishCore(registry, "1.0.5", "0.0.71");
    registry.publish("@noldova/compiler-cli", "1.0.6", { peerDependencies: { "@noldova/compiler": "1.0.6" } });

    const { result, host } = await DependentsStepNpmTests.releaseWindowAsync(dependent, { "@noldova/core": "1.0.5" });

    Assert.isFalse(result.isSuccessful, result.message);
    Assert.areEqual(
      `${DependentsStepNpmTests.DEPENDENT}: left at its pins, which can't take what 0.0.71 moves: `
      + "@noldova/compiler-cli 1.0.1 needs @noldova/compiler 1.0.1, and no later version of it needs @noldova/compiler 1.0.5.",
      result.message.split("\n")[1]);
    Assert.isFalse(host.pushed.has(DependentsStepNpmTests.DEPENDENT));
  }

  // The dependent pins a compiler newer than the exact peer core's new version needs.
  @TestMethod
  public async leavesTheDependentAtItsPinsWhenItPinsANewerVersionThanAMovedPackageNeedsAsync(): Promise<void> {
    using _ = DependentsStepNpmTests.turnOffCompileCache();
    await using registry = await LocalRegistryFixture.startAsync();
    registry.publish("@noldova/compiler", "1.0.6");
    registry.publish("@noldova/core", "1.0.1");
    registry.publish("@noldova/window", "0.0.70", { peerDependencies: { "@noldova/core": "1.0.1" } });
    using dependent = await DependentsStepNpmTests.createDependentAsync(registry, { "@noldova/compiler": "1.0.6", "@noldova/core": "1.0.1", "@noldova/window": "0.0.70" });
    DependentsStepNpmTests.publishCore(registry, "1.0.5", "0.0.71");

    const { result, host } = await DependentsStepNpmTests.releaseWindowAsync(dependent, { "@noldova/core": "1.0.5" });

    Assert.isFalse(result.isSuccessful, result.message);
    Assert.areEqual(
      `${DependentsStepNpmTests.DEPENDENT}: left at its pins, which can't take what 0.0.71 moves: `
      + "@noldova/compiler 1.0.6 is newer than the 1.0.5 that @noldova/core 1.0.5 needs.",
      result.message.split("\n")[1]);
    Assert.isFalse(host.pushed.has(DependentsStepNpmTests.DEPENDENT));
  }

  // The app folder pins the dependent's own package, which no registry holds: the dependent packs its own archives to
  // lock it with --legacy-peer-deps, and its lock keeps only the pin, in the root entry. The own package's optional
  // dependency is locked, as optional; its peer, which nothing else brings in, isn't.
  @TestMethod
  public async relocksAFolderThatPinsTheDependentsOwnUnpublishedPackageAsync(): Promise<void> {
    using _ = DependentsStepNpmTests.turnOffCompileCache();
    await using registry = await LocalRegistryFixture.startAsync();
    using dependent = await DependentsStepNpmTests.createOwnDependentAsync(registry, {});

    const { result, host } = await DependentsStepNpmTests.releaseWindowAsync(dependent, { "@noldova/core": "1.0.5" });

    Assert.isTrue(result.isSuccessful, result.message);
    Assert.areEqual("@noldova/core 1.0.5, @noldova/extra 1.0.0, @noldova/optional 1.0.0, @noldova/unrelated 2.0.0, @noldova/window 0.0.71",
      DependentsStepNpmTests.readLocked(host, DependentsStepNpmTests.APP_LOCK));
    const lock: { readonly packages: Readonly<Record<string, { readonly dependencies?: unknown; readonly optional?: boolean }>> } =
      JSON.parse(host.pushed.get(DependentsStepNpmTests.DEPENDENT)?.[DependentsStepNpmTests.APP_LOCK] ?? "{}");
    Assert.areEqual(JSON.stringify({ "@noldova/core": "1.0.5", "@noldova/window": "0.0.71", [DependentsStepNpmTests.OWN]: "0.0.2" }), JSON.stringify(lock.packages[""]?.dependencies));
    Assert.isTrue(lock.packages["node_modules/@noldova/optional"]?.optional === true, JSON.stringify(lock.packages["node_modules/@noldova/optional"]));
    Assert.areEqual(JSON.stringify({ "@noldova/core": "1.0.5", "@noldova/window": "0.0.71", [DependentsStepNpmTests.OWN]: "0.0.2" }),
      JSON.stringify(JSON.parse(host.pushed.get(DependentsStepNpmTests.DEPENDENT)?.["app/package.json"] ?? "{}").dependencies));
    Assert.isTrue(host.proposals.join("").includes("- `app/package-lock.json`: the repository's own `@noldova/own`, `@noldova/own-core` locked from their tracked manifests, "
      + "without asking the registry; their entries left out, and the root entry keeps the folder's pins\n"), host.proposals.join(""));
  }

  @TestMethod
  public async leavesTheDependentAtItsPinsWhenTwoTrackedManifestsNameAnOwnPackageItLocksAsync(): Promise<void> {
    using _ = DependentsStepNpmTests.turnOffCompileCache();
    await using registry = await LocalRegistryFixture.startAsync();
    using dependent = await DependentsStepNpmTests.createOwnDependentAsync(registry,
      { "fixtures/own/package.json": `${JSON.stringify({ name: "@noldova/own-core", version: "1.0.0" })}\n` });

    const { result, host } = await DependentsStepNpmTests.releaseWindowAsync(dependent, { "@noldova/core": "1.0.5" });

    Assert.isFalse(result.isSuccessful, result.message);
    Assert.areEqual(`${DependentsStepNpmTests.DEPENDENT}: left at its pins for 0.0.71, since a lock folder pins its own unpublished packages and more than one tracked manifest `
      + "names the same one: @noldova/own-core in fixtures/own/package.json, src/own-core/package.json.", result.message.split("\n")[1]);
    Assert.isFalse(host.pushed.has(DependentsStepNpmTests.DEPENDENT));
  }

  // The dependent locks its own packages with their peers, so its old lock holds the own package's peer, which the
  // relock, installing no peer for an own package, would drop.
  @TestMethod
  public async leavesTheDependentAtItsPinsWhenTheOwnRelockWouldDropALockedPeerAsync(): Promise<void> {
    using _ = DependentsStepNpmTests.turnOffCompileCache();
    await using registry = await LocalRegistryFixture.startAsync();
    using dependent = await DependentsStepNpmTests.createOwnDependentAsync(registry, {}, { "node_modules/@noldova/peer": { version: "1.0.0", peer: true } });

    const { result, host } = await DependentsStepNpmTests.releaseWindowAsync(dependent, { "@noldova/core": "1.0.5" });

    Assert.isFalse(result.isSuccessful, result.message);
    Assert.areEqual(`${DependentsStepNpmTests.DEPENDENT}: left at its pins for 0.0.71, since relocking app/package-lock.json, which installs no peer for the repository's own `
      + "packages, would drop the peers it locks that no moved package names: node_modules/@noldova/peer.", result.message.split("\n")[1]);
    Assert.isFalse(host.pushed.has(DependentsStepNpmTests.DEPENDENT));
  }

  private static publishCore(registry: LocalRegistryFixture, version: string, windowVersion: string): void {
    registry.publish("@noldova/compiler", version);
    registry.publish("@noldova/core", version, { peerDependencies: { "@noldova/compiler": version }, peerDependenciesMeta: DependentsStepNpmTests.OPTIONAL_COMPILER });
    registry.publish("@noldova/window", windowVersion, { peerDependencies: { "@noldova/core": version } });
  }

  // A dependent whose npm reads only the local registry and keeps its cache in the checkout, locked against what the
  // registry holds now.
  private static async createDependentAsync(registry: LocalRegistryFixture, dependencies: Readonly<Record<string, string>>,
    devDependencies: Readonly<Record<string, string>> = {}, workspaces: Readonly<Record<string, string>> = {}): Promise<GitRepositoryFixture> {
    const dependent = GitRepositoryFixture.create();
    dependent.write({
      ...workspaces,
      ".gitignore": `${DependentsStepNpmTests.CACHE_FOLDER}/\n`,
      ".npmrc": [
        `registry=${registry.url}`,
        `@noldova:registry=${registry.url}`,
        `cache=${path.join(dependent.directory, DependentsStepNpmTests.CACHE_FOLDER)}`,
        "update-notifier=false",
        ""
      ].join("\n"),
      "package.json": `${JSON.stringify({ name: "dependent", version: "1.0.0", ...Object.keys(workspaces).length > 0 ? { workspaces: Object.keys(workspaces).map(t => path.posix.dirname(t)) } : {}, dependencies, devDependencies }, null, 2)}\n`
    });
    const locked = await new Npm(new ProcessRunner(), dependent.directory).lockAsync(dependent.directory);
    Assert.isTrue(locked.isSuccessful, locked.errorOutput);
    dependent.commit({});

    return dependent;
  }

  // A dependent with two own packages, the first depending on the second, and an app folder that pins the first. The app
  // folder's lock is made before the pin, which npm can't resolve, and then takes it only in its root entry.
  private static async createOwnDependentAsync(registry: LocalRegistryFixture, files: Readonly<Record<string, string>>,
    lockedPeers: Readonly<Record<string, object>> = {}): Promise<GitRepositoryFixture> {
    registry.publish("@noldova/core", "1.0.1");
    registry.publish("@noldova/window", "0.0.70", { peerDependencies: { "@noldova/core": "1.0.1" } });
    registry.publish("@noldova/unrelated", "2.0.0");
    registry.publish("@noldova/extra", "1.0.0");
    registry.publish("@noldova/optional", "1.0.0");
    registry.publish("@noldova/peer", "1.0.0");
    const dependent = await DependentsStepNpmTests.createDependentAsync(registry, { "@noldova/core": "1.0.1" });
    const pins = { "@noldova/core": "1.0.1", "@noldova/window": "0.0.70" };
    dependent.write({
      ...files,
      "app/.npmrc": fs.readFileSync(path.join(dependent.directory, ".npmrc"), "utf8"),
      "app/package.json": `${JSON.stringify({ name: "app", version: "1.0.0", dependencies: pins }, null, 2)}\n`,
      "src/own/package.json": `${JSON.stringify({ name: DependentsStepNpmTests.OWN, version: "__VERSION__", dependencies: { "@noldova/own-core": "__VERSION__", "@noldova/unrelated": "^2.0.0" },
        optionalDependencies: { "@noldova/optional": "1.0.0" }, peerDependencies: { "@noldova/peer": "1.0.0" } })}\n`,
      "src/own-core/package.json": `${JSON.stringify({ name: "@noldova/own-core", version: "__VERSION__", dependencies: { "@noldova/extra": "1.0.0" } })}\n`
    });
    const locked = await new Npm(new ProcessRunner(), dependent.directory).lockAsync(path.join(dependent.directory, "app"));
    Assert.isTrue(locked.isSuccessful, locked.errorOutput);
    const lockPath = path.join(dependent.directory, DependentsStepNpmTests.APP_LOCK);
    const lock: { readonly packages: Readonly<Record<string, object>> } = JSON.parse(fs.readFileSync(lockPath, "utf8"));
    const pinned = { ...pins, [DependentsStepNpmTests.OWN]: "0.0.2" };
    dependent.commit({
      "app/package.json": `${JSON.stringify({ name: "app", version: "1.0.0", dependencies: pinned }, null, 2)}\n`,
      [DependentsStepNpmTests.APP_LOCK]: `${JSON.stringify({ ...lock, packages: { ...lock.packages, "": { ...lock.packages[""], dependencies: pinned }, ...lockedPeers } }, null, 2)}\n`
    });
    registry.publish("@noldova/core", "1.0.5");
    registry.publish("@noldova/window", "0.0.71", { peerDependencies: { "@noldova/core": "1.0.5" } });

    return dependent;
  }

  private static async releaseWindowAsync(dependent: GitRepositoryFixture, peerDependencies: Readonly<Record<string, string>>): Promise<DependentsRun> {
    using source = GitRepositoryFixture.create();
    source.commit({ "src/window/package.json": `${JSON.stringify({ name: "@noldova/window", peerDependencies })}\n` });
    const host = new FakeUpdateHost();
    host.repositories.set(DependentsStepNpmTests.DEPENDENT, dependent);
    const processRunner = new ProcessRunner();
    const step = new DependentsStep(new ArchiveStep(new Git(processRunner, source.directory), new Tar(processRunner), new Npm(processRunner, source.directory)), host, processRunner,
      new ReleasedManifestNpm(processRunner, source.directory, { name: "@noldova/window", version: "0.0.71", peerDependencies }));

    return new DependentsRun(await step.runAsync(["0.0.71", source.readHead()]), host);
  }

  private static readLocked(host: FakeUpdateHost, lockFilePath: string = "package-lock.json"): string {
    const packages = JsonReader.parse(host.pushed.get(DependentsStepNpmTests.DEPENDENT)?.[lockFilePath] ?? "{}", lockFilePath).readObject("packages");

    return Object.keys(packages.toJson()).filter(t => t.length > 0).map(t => `${t.slice("node_modules/".length)} ${packages.readObject(t).readString("version")}`).sort().join(", ");
  }

  // npm keeps Node's compile cache in the shared temporary folder unless the environment turns it off.
  private static turnOffCompileCache(): Disposable {
    return new EnvironmentValue(DependentsStepNpmTests.COMPILE_CACHE_OFF, "1");
  }
}
