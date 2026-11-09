/**
 * @license
 * Copyright (c) Noldova.
 *
 * This source code is licensed under the license found in the
 * LICENSE file in the root directory of this source tree.
 */

import path from "node:path";

import { Assert, TestClass, TestMethod } from "@noldova/context.testing";
import { ArchiveStep, DependentsStep, Git, Npm, ProcessRunner, type StepResult, Tar } from "@noldova/tools.pipelines";

import { FakeUpdateHost } from "./fake-update-host.js";
import { GitRepositoryFixture } from "./git-repository.fixture.js";
import { LocalRegistryFixture } from "./local-registry.fixture.js";

interface LockedVersion {
  readonly version?: string;
}

interface DependentsRun {
  readonly result: StepResult;
  readonly host: FakeUpdateHost;
}

// The dependents step with the real npm, against a local registry: a dependent's lock file holds the released
// package's previous version, whose exact peers name the older versions of packages the release moves, as when npm
// failed with ERESOLVE refreshing such a lock file.
@TestClass
export class DependentsStepNpmTests {
  private static readonly CACHE_FOLDER: string = ".npm-cache";
  private static readonly COMPILE_CACHE_OFF: string = "NODE_DISABLE_COMPILE_CACHE";
  private static readonly DEPENDENT: string = "noldova-com/dependent";
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

    Assert.isTrue(result.isSuccessful, result.message);
    Assert.areEqual(
      `${DependentsStepNpmTests.DEPENDENT}: left at its pins, since no version of these pinned packages accepts what 0.0.71 moves: `
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

    Assert.isTrue(result.isSuccessful, result.message);
    Assert.areEqual(
      `${DependentsStepNpmTests.DEPENDENT}: left at its pins, since no version of these pinned packages accepts what 0.0.71 moves: `
      + "@noldova/compiler 1.0.6 is newer than the 1.0.5 that @noldova/core 1.0.5 needs.",
      result.message.split("\n")[1]);
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
    devDependencies: Readonly<Record<string, string>> = {}): Promise<GitRepositoryFixture> {
    const dependent = GitRepositoryFixture.create();
    dependent.write({
      ".gitignore": `${DependentsStepNpmTests.CACHE_FOLDER}/\n`,
      ".npmrc": [
        `registry=${registry.url}`,
        `@noldova:registry=${registry.url}`,
        `cache=${path.join(dependent.directory, DependentsStepNpmTests.CACHE_FOLDER)}`,
        "update-notifier=false",
        ""
      ].join("\n"),
      "package.json": `${JSON.stringify({ name: "dependent", version: "1.0.0", dependencies, devDependencies }, null, 2)}\n`
    });
    const locked = await new Npm(new ProcessRunner(), dependent.directory).lockAsync(dependent.directory);
    Assert.isTrue(locked.isSuccessful, locked.errorOutput);
    dependent.commit({});

    return dependent;
  }

  private static async releaseWindowAsync(dependent: GitRepositoryFixture, peerDependencies: Readonly<Record<string, string>>): Promise<DependentsRun> {
    using source = GitRepositoryFixture.create();
    source.commit({ "src/window/package.json": `${JSON.stringify({ name: "@noldova/window", peerDependencies })}\n` });
    const host = new FakeUpdateHost();
    host.repositories.set(DependentsStepNpmTests.DEPENDENT, dependent);
    const processRunner = new ProcessRunner();
    const step = new DependentsStep(new ArchiveStep(new Git(processRunner, source.directory), new Tar(processRunner), new Npm(processRunner, source.directory)), host, processRunner,
      new Npm(processRunner, source.directory));

    return { result: await step.runAsync(["0.0.71", source.readHead()]), host };
  }

  private static readLocked(host: FakeUpdateHost): string {
    const lock: { readonly packages: Readonly<Record<string, LockedVersion>> } = JSON.parse(host.pushed.get(DependentsStepNpmTests.DEPENDENT)?.["package-lock.json"] ?? "{}");

    return Object.entries(lock.packages).filter(([key]) => key.length > 0).map(([key, entry]) => `${key.slice("node_modules/".length)} ${entry.version}`).sort().join(", ");
  }

  // npm keeps Node's compile cache in the shared temporary folder unless the environment turns it off.
  private static turnOffCompileCache(): Disposable {
    const before = process.env[DependentsStepNpmTests.COMPILE_CACHE_OFF];
    process.env[DependentsStepNpmTests.COMPILE_CACHE_OFF] = "1";

    return {
      [Symbol.dispose]: (): void => {
        if (before === undefined)
          delete process.env[DependentsStepNpmTests.COMPILE_CACHE_OFF];
        else
          process.env[DependentsStepNpmTests.COMPILE_CACHE_OFF] = before;
      }
    };
  }
}
