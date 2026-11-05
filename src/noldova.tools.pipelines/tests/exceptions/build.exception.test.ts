/**
 * @license
 * Copyright (c) Noldova.
 *
 * This source code is licensed under the license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { ExceptionOptions } from "@noldova/context.exceptions";
import { Assert, TestClass, TestMethod } from "@noldova/context.testing";
import { BuildException, PipelineException } from "@noldova/tools.pipelines";

@TestClass
export class BuildExceptionTests {
  @TestMethod
  public keepsTheMessageAndNamesItsClass(): void {
    const exception = new BuildException("The checkout has no build.json, which names the packages to build.");

    Assert.areEqual("The checkout has no build.json, which names the packages to build.", exception.message);
    Assert.areEqual("BuildException", exception.name);
    Assert.isInstanceOf(exception, PipelineException);
  }

  @TestMethod
  public keepsItsCause(): void {
    const cause = new Error("cause");

    Assert.areEqual(cause, new BuildException("failed", new ExceptionOptions(cause)).cause);
  }
}
