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
import { BuildConfig, BuildException, BuildPackage } from "@noldova/tools.pipelines";

@TestClass
export class BuildConfigTests {
  @TestMethod
  public readsEachPackageInOrderWithItsDefaults(): void {
    const config = BuildConfig.parse(JSON.stringify({
      packages: [
        { name: "noldova.example" },
        { name: "noldova.example.parsers-regex", path: "parsers/noldova.example.parsers-regex", pre: "scripts/verify.ts", compile: "scripts/compile.ts", post: "scripts/check.ts" }
      ]
    }));

    Assert.areEqual(2, config.packages.length);
    Assert.areEqual("@noldova/example,@noldova/example.parsers-regex", config.packageNames.join(","));
    Assert.areEqual(JSON.stringify(["noldova.example", "noldova.example", null, null, null]), BuildConfigTests.describe(config.packages[0]));
    Assert.areEqual(
      JSON.stringify(["noldova.example.parsers-regex", "parsers/noldova.example.parsers-regex", "scripts/verify.ts", "scripts/compile.ts", "scripts/check.ts"]),
      BuildConfigTests.describe(config.packages[1]));
  }

  @TestMethod
  public keepsThePackagesItIsGiven(): void {
    const buildPackage = new BuildPackage("noldova.example");

    Assert.areEqual(buildPackage, new BuildConfig([buildPackage]).packages[0]);
  }

  @TestMethod
  public readsTheBuildFileOfACheckout(): void {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "tools-pipelines-"));
    try {
      fs.writeFileSync(path.join(directory, "build.json"), "{\"packages\":[{\"name\":\"noldova.example\"}]}");

      Assert.areEqual("@noldova/example", BuildConfig.read(directory).packageNames.join(","));
    }
    finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  }

  @TestMethod
  public failsForACheckoutWithoutABuildFile(): void {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "tools-pipelines-"));
    try {
      const exception = Assert.throws(() => BuildConfig.read(directory), BuildException);

      Assert.areEqual("The checkout has no build.json, which names the packages to build.", exception.message);
    }
    finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  }

  @TestMethod
  public throwsForABuildFileThatIsNotJson(): void {
    Assert.throws(() => BuildConfig.parse("{"), JsonException);
    Assert.throws(() => BuildConfig.parse("{}"), JsonException);
  }

  @TestData("{\"packages\":[]}", "it names no package")
  @TestData("{\"packages\":[{\"name\":\"noldova.example\"},{\"name\":\"noldova.example\"}]}", "it names noldova.example more than once")
  @TestData("{\"packages\":[{\"name\":\"example\"}]}", "\"example\" is not a package folder name, such as noldova.tools.pipelines")
  @TestData("{\"packages\":[{\"name\":\"noldova.Example\"}]}", "\"noldova.Example\" is not a package folder name, such as noldova.tools.pipelines")
  @TestData("{\"packages\":[{\"name\":\"noldova.example\",\"path\":\"other\"}]}", "the path of noldova.example, \"other\", is not a folder under src/ whose last segment is noldova.example")
  @TestData("{\"packages\":[{\"name\":\"noldova.example\",\"path\":\"../noldova.example\"}]}", "the path of noldova.example, \"../noldova.example\", is not a folder under src/ whose last segment is noldova.example")
  @TestData("{\"packages\":[{\"name\":\"noldova.example\",\"path\":\"/noldova.example\"}]}", "the path of noldova.example, \"/noldova.example\", is not a folder under src/ whose last segment is noldova.example")
  @TestData("{\"packages\":[{\"name\":\"noldova.example\",\"path\":\"C:/noldova.example\"}]}", "the path of noldova.example, \"C:/noldova.example\", is not a folder under src/ whose last segment is noldova.example")
  @TestData("{\"packages\":[{\"name\":\"noldova.example\",\"path\":\"parsers\\\\noldova.example\"}]}", "the path of noldova.example, \"parsers\\noldova.example\", is not a folder under src/ whose last segment is noldova.example")
  @TestData("{\"packages\":[{\"name\":\"noldova.example\",\"pre\":\"../verify.ts\"}]}", "the pre script of noldova.example, \"../verify.ts\", is not a path inside the checkout")
  @TestData("{\"packages\":[{\"name\":\"noldova.example\",\"compile\":\"scripts//compile.ts\"}]}", "the compile script of noldova.example, \"scripts//compile.ts\", is not a path inside the checkout")
  @TestData("{\"packages\":[{\"name\":\"noldova.example\",\"post\":\"./check.ts\"}]}", "the post script of noldova.example, \"./check.ts\", is not a path inside the checkout")
  @TestMethod
  public failsForAConfigurationItCannotBuild(text: string, problem: string): void {
    const exception = Assert.throws(() => BuildConfig.parse(text), BuildException);

    Assert.areEqual(`build.json is invalid: ${problem}.`, exception.message);
  }

  private static describe(buildPackage: BuildPackage | undefined): string {
    return JSON.stringify(buildPackage === undefined ? null : [buildPackage.name, buildPackage.path, buildPackage.pre, buildPackage.compile, buildPackage.post]);
  }
}
