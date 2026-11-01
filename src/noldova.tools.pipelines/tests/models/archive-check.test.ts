/**
 * @license
 * Copyright (c) Noldova.
 *
 * This source code is licensed under the license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { Assert, TestClass, TestMethod } from "@noldova/context.testing";
import { ArchiveCheck, PackageArchive, StepResult } from "@noldova/tools.pipelines";

@TestClass
export class ArchiveCheckTests {
  @TestMethod
  public keepsTheResultAndTheArchives(): void {
    const result = StepResult.succeeded("noldova-a-0.0.4.tgz: @noldova/a@0.0.4 from commit 225059f…");
    const archives = [new PackageArchive("@noldova/a", "archives/noldova-a-0.0.4.tgz")];

    const check = new ArchiveCheck(result, archives);

    Assert.areEqual(result, check.result);
    Assert.areEqual(archives, check.archives);
  }
}
