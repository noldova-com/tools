/**
 * @license
 * Copyright (c) Noldova.
 *
 * This source code is licensed under the license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { JsonReader } from "@noldova/context.json";
import { Assert, TestClass, TestMethod } from "@noldova/context.testing";

@TestClass
export class PackageManifestTests {
  private static readonly CONTEXT_PREFIX: string = "@noldova/context.";

  @TestMethod
  public pinsEachContextPackageThePipelinesPackagePinsAtTheSameVersion(): void {
    const github = PackageManifestTests.readDependencies("@noldova/tools.pipelines.github");
    const pipelines = PackageManifestTests.readDependencies("@noldova/tools.pipelines");
    const context = Object.entries(pipelines).filter(([name]) => name.startsWith(PackageManifestTests.CONTEXT_PREFIX));

    Assert.isTrue(context.some(([name]) => name === "@noldova/context.core"), JSON.stringify(pipelines));
    for (const [name, version] of context)
      Assert.areEqual(version, github[name], name);
  }

  private static readDependencies(name: string): Readonly<Record<string, string>> {
    const text = readFileSync(fileURLToPath(import.meta.resolve(`${name}/package.json`)), "utf8");
    return Object.fromEntries(Object.entries(JsonReader.parse(text).readObject("dependencies").toJson()).map(([key, value]) => [key, String(value)]));
  }
}
