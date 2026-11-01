/**
 * @license
 * Copyright (c) Noldova.
 *
 * This source code is licensed under the license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { Assert, TestClass, TestData, TestMethod } from "@noldova/context.testing";
import { ProcessResult } from "@noldova/tools.pipelines";

@TestClass
export class ProcessResultTests {
  @TestMethod
  public keepsTheExitCodeAndTheOutput(): void {
    const result = new ProcessResult(0, "git version 2.55.0\n", "warning\n");

    Assert.areEqual(0, result.exitCode);
    Assert.areEqual("git version 2.55.0\n", result.output);
    Assert.areEqual("warning\n", result.errorOutput);
  }

  @TestData(0, true)
  @TestData(1, false)
  @TestData(128, false)
  @TestData(-1, false)
  @TestData(null, false)
  @TestMethod
  public succeedsOnlyWithExitCodeZero(exitCode: number | null, expected: boolean): void {
    Assert.areEqual(expected, new ProcessResult(exitCode, "", "").isSuccessful);
  }
}
