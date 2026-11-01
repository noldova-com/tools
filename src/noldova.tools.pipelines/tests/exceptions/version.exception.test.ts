/**
 * @license
 * Copyright (c) Noldova.
 *
 * This source code is licensed under the license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { ExceptionOptions } from "@noldova/context.exceptions";
import { Assert, TestClass, TestMethod } from "@noldova/context.testing";
import { PipelineException, VersionException } from "@noldova/tools.pipelines";

@TestClass
export class VersionExceptionTests {
  @TestMethod
  public keepsTheMessageAndNamesItsClass(): void {
    const exception = new VersionException("\"1.4\" is not a version.");

    Assert.areEqual("\"1.4\" is not a version.", exception.message);
    Assert.areEqual("VersionException", exception.name);
    Assert.isInstanceOf(exception, PipelineException);
  }

  @TestMethod
  public hasADefaultMessage(): void {
    Assert.areEqual("The text is not a version.", new VersionException().message);
  }

  @TestMethod
  public keepsItsCause(): void {
    const cause = new Error("parse failed");

    Assert.areEqual(cause, new VersionException("\"1.4\" is not a version.", new ExceptionOptions(cause)).cause);
  }
}
