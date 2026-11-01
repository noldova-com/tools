/**
 * @license
 * Copyright (c) Noldova.
 *
 * This source code is licensed under the license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { Assert, TestClass, TestMethod } from "@noldova/context.testing";
import { StepResult } from "@noldova/tools.pipelines";

@TestClass
export class StepResultTests {
  @TestMethod
  public keepsTheMessageOfAStepThatSucceeded(): void {
    const result = StepResult.succeeded("Commit 225059f… is on origin/main.");

    Assert.isTrue(result.isSuccessful);
    Assert.areEqual("Commit 225059f… is on origin/main.", result.message);
  }

  @TestMethod
  public keepsTheMessageOfAStepThatFailed(): void {
    const result = StepResult.failed("Commit 225059f… is not on origin/main.");

    Assert.isFalse(result.isSuccessful);
    Assert.areEqual("Commit 225059f… is not on origin/main.", result.message);
  }
}
