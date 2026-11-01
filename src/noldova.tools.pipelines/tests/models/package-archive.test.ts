/**
 * @license
 * Copyright (c) Noldova.
 *
 * This source code is licensed under the license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { Assert, TestClass, TestMethod } from "@noldova/context.testing";
import { PackageArchive } from "@noldova/tools.pipelines";

@TestClass
export class PackageArchiveTests {
  @TestMethod
  public keepsThePackageAndItsArchive(): void {
    const archive = new PackageArchive("@noldova/a", "archives/noldova-a-0.0.4.tgz");

    Assert.areEqual("@noldova/a", archive.packageName);
    Assert.areEqual("archives/noldova-a-0.0.4.tgz", archive.filePath);
  }
}
