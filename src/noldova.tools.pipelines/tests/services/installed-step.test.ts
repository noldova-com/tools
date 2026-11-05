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
import { Assert, TestClass, TestData, TestMethod } from "@noldova/context.testing";
import { InstalledStep, type StepResult } from "@noldova/tools.pipelines";

import { RecordingOutput } from "./fake-update-host.js";

class Checkout implements Disposable {
  public readonly directory: string = fs.mkdtempSync(path.join(os.tmpdir(), "tools-pipelines-"));
  public readonly lines: string[] = [];

  public constructor(locked: object | null, installed: object | null, folder: string = ".") {
    this.write("build.json", "{\"packages\":[{\"name\":\"noldova.example\"}]}");
    if (locked !== null)
      this.write(path.join(folder, "package-lock.json"), JSON.stringify({ name: "example", lockfileVersion: 3, packages: { "": { name: "example" }, ...locked } }));
    if (installed !== null)
      this.write(path.join(folder, "node_modules/.package-lock.json"), JSON.stringify({ name: "example", lockfileVersion: 3, packages: installed }));
  }

  public write(filePath: string, content: string): void {
    fs.mkdirSync(path.dirname(path.join(this.directory, filePath)), { recursive: true });
    fs.writeFileSync(path.join(this.directory, filePath), content);
  }

  public runAsync(values: readonly string[] = []): Promise<StepResult> {
    return new InstalledStep(this.directory, new RecordingOutput(this.lines)).runAsync(values);
  }

  public [Symbol.dispose](): void {
    fs.rmSync(this.directory, { recursive: true, force: true });
  }
}

@TestClass
export class InstalledStepTests {
  private static readonly TYPESCRIPT: object = { version: "7.0.2", resolved: "https://registry.npmjs.org/typescript/-/typescript-7.0.2.tgz", integrity: "sha512-a", dev: true };

  @TestMethod
  public namesItselfAndItsValues(): void {
    const step = new InstalledStep(".", new RecordingOutput([]));

    Assert.areEqual("installed", step.name);
    Assert.areEqual("[<folder>]", step.usage);
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

    const result = await checkout.runAsync();

    Assert.isTrue(result.isSuccessful);
    Assert.areEqual("", result.message);
    Assert.areEqual(0, checkout.lines.length);
  }

  @TestMethod
  public async checksAnotherFolderWithoutABuildFileAsync(): Promise<void> {
    using checkout = new Checkout({ "node_modules/@noldova/example": { version: "0.0.4" } }, {}, ".tool");

    const result = await checkout.runAsync([".tool"]);

    Assert.isFalse(result.isSuccessful);
    Assert.areEqual("", result.message);
    Assert.areEqual(
      "progress: The installed packages differ from .tool/package-lock.json at node_modules/@noldova/example; run npm ci --ignore-scripts --prefix .tool.",
      checkout.lines.join("|"));
  }

  @TestMethod
  public async succeedsForAnotherFolderThatMatchesItsLockAsync(): Promise<void> {
    using checkout = new Checkout({ "node_modules/typescript": InstalledStepTests.TYPESCRIPT }, { "node_modules/typescript": InstalledStepTests.TYPESCRIPT }, ".tool");

    const result = await checkout.runAsync([".tool"]);

    Assert.isTrue(result.isSuccessful);
  }

  @TestData("more other")
  @TestData("--folder")
  @TestData("")
  @TestMethod
  public async failsForAnOptionOrMoreThanOneValueAsync(values: string): Promise<void> {
    const result = await new InstalledStep(".", new RecordingOutput([])).runAsync(values.length === 0 ? [""] : values.split(" "));

    Assert.isFalse(result.isSuccessful);
    Assert.areEqual("The installed step takes [<folder>].", result.message);
  }

  @TestMethod
  public async failsForABuildFileThatIsNotValidAsync(): Promise<void> {
    using checkout = new Checkout({}, {});
    checkout.write("build.json", "{\"packages\":[]}");

    const result = await checkout.runAsync();

    Assert.isFalse(result.isSuccessful);
    Assert.isTrue(result.message.length > 0);
    Assert.areEqual(0, checkout.lines.length);
  }

  @TestMethod
  public async failsWithoutALockFileAsync(): Promise<void> {
    using checkout = new Checkout(null, {});

    const result = await checkout.runAsync(["missing"]);

    Assert.isFalse(result.isSuccessful);
    Assert.areEqual("There is no missing/package-lock.json.", result.message);
    Assert.areEqual(0, checkout.lines.length);
  }

  @TestMethod
  public async writesThatNpmInstalledNothingAsync(): Promise<void> {
    using checkout = new Checkout({}, null, ".tool");

    const result = await checkout.runAsync([".tool"]);

    Assert.isFalse(result.isSuccessful);
    Assert.areEqual("progress: .tool/node_modules holds no packages that npm installed.", checkout.lines.join("|"));
  }

  @TestMethod
  public async writesThePackagesThatDifferAsync(): Promise<void> {
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

    const result = await checkout.runAsync();

    Assert.isFalse(result.isSuccessful);
    Assert.areEqual("", result.message);
    Assert.areEqual(
      "progress: The installed packages differ from package-lock.json at node_modules/typescript; node_modules/a; node_modules/b; node_modules/c; node_modules/d and 2 more; run npm ci --ignore-scripts.",
      checkout.lines.join("|"));
  }

  @TestMethod
  public async writesASinglePackageThatDiffersAsync(): Promise<void> {
    using checkout = new Checkout({ "node_modules/typescript": InstalledStepTests.TYPESCRIPT }, {});

    await checkout.runAsync();

    Assert.areEqual("progress: The installed packages differ from package-lock.json at node_modules/typescript; run npm ci --ignore-scripts.", checkout.lines.join("|"));
  }

  @TestMethod
  public async rejectsALockFileThatIsNotJsonAsync(): Promise<void> {
    using checkout = new Checkout(null, {});
    checkout.write("package-lock.json", "{");

    await Assert.throwsAsync(() => checkout.runAsync(), JsonException);
  }
}
