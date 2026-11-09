/**
 * @license
 * Copyright (c) Noldova.
 *
 * This source code is licensed under the license found in the
 * LICENSE file in the root directory of this source tree.
 */

import path from "node:path";

import { Assert, TestClass, TestMethod } from "@noldova/context.testing";
import { ArchiveStep, DependentsStep, Git, Npm, ProcessRunner, Tar } from "@noldova/tools.pipelines";

import { FakeUpdateHost } from "./fake-update-host.js";
import { GitRepositoryFixture } from "./git-repository.fixture.js";
import { LocalRegistryFixture } from "./local-registry.fixture.js";

interface LockedVersion {
  readonly version?: string;
}

// The dependents step with the real npm, against a local registry: a dependent's lock file holds the released
// package's previous version, whose exact peers name the older versions of packages the release moves, as when npm
// failed with ERESOLVE refreshing such a lock file.
@TestClass
export class DependentsStepNpmTests {
  private static readonly CACHE_FOLDER: string = ".npm-cache";
  private static readonly COMPILE_CACHE_OFF: string = "NODE_DISABLE_COMPILE_CACHE";

  @TestMethod
  public async relocksALockWhosePreviousReleaseNeedsTheOlderPeersAsync(): Promise<void> {
    using _ = DependentsStepNpmTests.turnOffCompileCache();
    await using registry = await LocalRegistryFixture.startAsync();
    registry.publish("@noldova/core", "1.0.1");
    registry.publish("@noldova/forms", "1.0.1", { peerDependencies: { "@noldova/core": "1.0.1" } });
    registry.publish("@noldova/window", "0.0.70", { peerDependencies: { "@noldova/core": "1.0.1", "@noldova/forms": "1.0.1" } });
    registry.publish("@noldova/ui", "3.0.0", { peerDependencies: { "@noldova/core": "^1.0.0" } });
    registry.publish("@noldova/unrelated", "2.0.0");
    using dependent = GitRepositoryFixture.create();
    dependent.write({
      ".gitignore": `${DependentsStepNpmTests.CACHE_FOLDER}/\n`,
      ".npmrc": [
        `registry=${registry.url}`,
        `@noldova:registry=${registry.url}`,
        `cache=${path.join(dependent.directory, DependentsStepNpmTests.CACHE_FOLDER)}`,
        "update-notifier=false",
        ""
      ].join("\n"),
      "package.json": `${JSON.stringify({
        name: "dependent",
        version: "1.0.0",
        dependencies: { "@noldova/core": "1.0.1", "@noldova/forms": "1.0.1", "@noldova/ui": "3.0.0", "@noldova/unrelated": "^2.0.0", "@noldova/window": "0.0.70" }
      }, null, 2)}\n`
    });
    const locked = await new Npm(new ProcessRunner(), dependent.directory).lockAsync(dependent.directory);
    Assert.isTrue(locked.isSuccessful, locked.errorOutput);
    dependent.commit({});
    registry.publish("@noldova/core", "1.0.5");
    registry.publish("@noldova/forms", "1.0.5", { peerDependencies: { "@noldova/core": "1.0.5" } });
    registry.publish("@noldova/window", "0.0.71", { peerDependencies: { "@noldova/core": "1.0.5", "@noldova/forms": "1.0.5" } });
    registry.publish("@noldova/unrelated", "2.1.0");
    using source = GitRepositoryFixture.create();
    source.commit({ "src/window/package.json": "{ \"name\": \"@noldova/window\", \"peerDependencies\": { \"@noldova/core\": \"1.0.5\", \"@noldova/forms\": \"1.0.5\" } }\n" });
    const host = new FakeUpdateHost();
    host.repositories.set("noldova-com/dependent", dependent);
    const processRunner = new ProcessRunner();
    const step = new DependentsStep(new ArchiveStep(new Git(processRunner, source.directory), new Tar(processRunner), new Npm(processRunner, source.directory)), host, processRunner,
      new Npm(processRunner, source.directory));

    const result = await step.runAsync(["0.0.71", source.readHead()]);

    Assert.isTrue(result.isSuccessful, result.message);
    const lock: { readonly packages: Readonly<Record<string, LockedVersion>> } = JSON.parse(host.pushed.get("noldova-com/dependent")?.["package-lock.json"] ?? "{}");
    Assert.areEqual(
      "@noldova/core 1.0.5, @noldova/forms 1.0.5, @noldova/ui 3.0.0, @noldova/unrelated 2.0.0, @noldova/window 0.0.71",
      Object.entries(lock.packages).filter(([key]) => key.length > 0).map(([key, entry]) => `${key.slice("node_modules/".length)} ${entry.version}`).sort().join(", "));
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
