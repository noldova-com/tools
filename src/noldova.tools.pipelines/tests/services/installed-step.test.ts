/**
 * @license
 * Copyright (c) Noldova.
 *
 * This source code is licensed under the license found in the
 * LICENSE file in the root directory of this source tree.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { JsonException } from "@noldova/context.json";
import { Assert, TestClass, TestMethod } from "@noldova/context.testing";
import { InstalledStep } from "@noldova/tools.pipelines";

class Checkout implements Disposable {
  public readonly directory: string = fs.mkdtempSync(path.join(os.tmpdir(), "tools-pipelines-"));

  public constructor(locked: object | null, installed: object | null) {
    this.write("build.json", "{\"packages\":[{\"name\":\"noldova.example\"}]}");
    if (locked !== null)
      this.write("package-lock.json", JSON.stringify({ name: "example", lockfileVersion: 3, packages: { "": { name: "example" }, ...locked } }));
    if (installed !== null)
      this.write("node_modules/.package-lock.json", JSON.stringify({ name: "example", lockfileVersion: 3, packages: installed }));
  }

  public write(filePath: string, content: string): void {
    fs.mkdirSync(path.dirname(path.join(this.directory, filePath)), { recursive: true });
    fs.writeFileSync(path.join(this.directory, filePath), content);
  }

  public [Symbol.dispose](): void {
    fs.rmSync(this.directory, { recursive: true, force: true });
  }
}

@TestClass
export class InstalledStepTests {
  private static readonly TYPESCRIPT: object = { version: "7.0.2", resolved: "https://registry.npmjs.org/typescript/-/typescript-7.0.2.tgz", integrity: "sha512-a", dev: true };

  @TestMethod
  public namesItselfAndTakesNoValues(): void {
    const step = new InstalledStep(".");

    Assert.areEqual("installed", step.name);
    Assert.areEqual("", step.usage);
  }

  @TestMethod
  public async succeedsWithoutAMessageWhenTheInstalledPackagesAreTheLockedOnesAsync(): Promise<void> {
    using checkout = new Checkout(
      {
        "node_modules/typescript": InstalledStepTests.TYPESCRIPT,
        "node_modules/@typescript/typescript-darwin-arm64": { version: "7.0.2", optional: true },
        "node_modules/@noldova/example": { version: "0.0.4", integrity: "sha512-published" },
        "node_modules/odd": "not an object",
        "node_modules/empty": null,
        "node_modules/list": [],
        "src/linked": { version: "1.0.0", link: true }
      },
      {
        "node_modules/typescript": { ...InstalledStepTests.TYPESCRIPT, license: "Apache-2.0" },
        "node_modules/@noldova/example": { version: "0.0.5", resolved: "file:_packages/noldova-example-0.0.5.tgz" },
        "node_modules/tool/node_modules/@noldova/example": { version: "0.0.4" },
        "node_modules/odd": "not an object",
        "node_modules/empty": null,
        "node_modules/list": [],
        "src/linked": { version: "1.0.0", link: true }
      });

    const result = await new InstalledStep(checkout.directory).runAsync([]);

    Assert.isTrue(result.isSuccessful);
    Assert.areEqual("", result.message);
  }

  @TestMethod
  public async failsForAnyValueAsync(): Promise<void> {
    const result = await new InstalledStep(".").runAsync(["more"]);

    Assert.isFalse(result.isSuccessful);
    Assert.areEqual("The installed step takes no values.", result.message);
  }

  @TestMethod
  public async failsWithoutABuildFileAsync(): Promise<void> {
    using checkout = new Checkout(null, null);
    fs.rmSync(path.join(checkout.directory, "build.json"));

    const result = await new InstalledStep(checkout.directory).runAsync([]);

    Assert.areEqual("The checkout has no build.json, which names the packages to build.", result.message);
  }

  @TestMethod
  public async failsWithoutALockFileAsync(): Promise<void> {
    using checkout = new Checkout(null, {});

    const result = await new InstalledStep(checkout.directory).runAsync([]);

    Assert.isFalse(result.isSuccessful);
    Assert.areEqual("The checkout has no package-lock.json.", result.message);
  }

  @TestMethod
  public async failsWhenNpmInstalledNothingAsync(): Promise<void> {
    using checkout = new Checkout({}, null);

    const result = await new InstalledStep(checkout.directory).runAsync([]);

    Assert.isFalse(result.isSuccessful);
    Assert.areEqual("node_modules holds no packages that npm installed.", result.message);
  }

  @TestMethod
  public async namesThePackagesThatDifferAsync(): Promise<void> {
    using checkout = new Checkout(
      {
        "node_modules/typescript": InstalledStepTests.TYPESCRIPT,
        "node_modules/a": { version: "1.0.0" },
        "node_modules/b": { version: "1.0.0", resolved: "https://registry.npmjs.org/b/-/b-1.0.0.tgz" },
        "node_modules/c": { version: "1.0.0", integrity: "sha512-c" },
        "node_modules/d": { version: "1.0.0", optional: false }
      },
      {
        "node_modules/typescript": { ...InstalledStepTests.TYPESCRIPT, version: "7.0.1" },
        "node_modules/b": { version: "1.0.0", resolved: "https://registry.example/b-1.0.0.tgz" },
        "node_modules/c": { version: "1.0.0", integrity: "sha512-other" },
        "node_modules/e": { version: "1.0.0" },
        "node_modules/f": { version: "1.0.0" }
      });

    const result = await new InstalledStep(checkout.directory).runAsync([]);

    Assert.isFalse(result.isSuccessful);
    Assert.areEqual(
      "The installed packages differ from package-lock.json at node_modules/typescript; node_modules/a; node_modules/b; node_modules/c; node_modules/d and 2 more; run npm ci --ignore-scripts.",
      result.message);
  }

  @TestMethod
  public async namesASinglePackageThatDiffersAsync(): Promise<void> {
    using checkout = new Checkout({ "node_modules/typescript": InstalledStepTests.TYPESCRIPT }, {});

    const result = await new InstalledStep(checkout.directory).runAsync([]);

    Assert.areEqual("The installed packages differ from package-lock.json at node_modules/typescript; run npm ci --ignore-scripts.", result.message);
  }

  @TestMethod
  public async rejectsALockFileThatIsNotJsonAsync(): Promise<void> {
    using checkout = new Checkout(null, {});
    checkout.write("package-lock.json", "{");

    await Assert.throwsAsync(() => new InstalledStep(checkout.directory).runAsync([]), JsonException);
  }
}
