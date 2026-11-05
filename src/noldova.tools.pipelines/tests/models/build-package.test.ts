/**
 * @license
 * Copyright (c) Noldova.
 *
 * This source code is licensed under the license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { Assert, TestClass, TestMethod } from "@noldova/context.testing";
import { BuildPackage } from "@noldova/tools.pipelines";

@TestClass
export class BuildPackageTests {
  @TestMethod
  public namesItsPackageAndFolders(): void {
    const buildPackage = new BuildPackage("noldova.example.parsers", "parsers/noldova.example.parsers");

    Assert.areEqual("@noldova/example.parsers", buildPackage.packageName);
    Assert.areEqual("src/parsers/noldova.example.parsers", buildPackage.sourceFolder);
    Assert.areEqual("_build/packages/noldova.example.parsers", buildPackage.buildFolder);
    Assert.areEqual("_build/tests/noldova.example.parsers", buildPackage.testsFolder);
    Assert.areEqual("noldova-example.parsers-0.0.5.tgz", buildPackage.archiveName("0.0.5"));
  }

  @TestMethod
  public defaultsToItsNameAsItsPathAndToNoScripts(): void {
    const buildPackage = new BuildPackage("noldova.tools.pipelines");

    Assert.areEqual("noldova.tools.pipelines", buildPackage.path);
    Assert.isNull(buildPackage.pre);
    Assert.isNull(buildPackage.compile);
    Assert.isNull(buildPackage.post);
  }
}
