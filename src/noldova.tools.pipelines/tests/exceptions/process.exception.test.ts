/**
 * @license
 * Copyright (c) Noldova.
 *
 * This source code is licensed under the license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { ExceptionOptions } from "@noldova/context.exceptions";
import { Assert, TestClass, TestMethod } from "@noldova/context.testing";
import { PipelineException, ProcessException } from "@noldova/tools.pipelines";

@TestClass
export class ProcessExceptionTests {
  @TestMethod
  public keepsTheProgramAndTheMessageAndNamesItsClass(): void {
    const exception = new ProcessException("git", "\"git\" could not start: spawn git ENOENT");

    Assert.areEqual("git", exception.program);
    Assert.areEqual("\"git\" could not start: spawn git ENOENT", exception.message);
    Assert.areEqual("ProcessException", exception.name);
    Assert.isUndefined(exception.cause);
    Assert.isInstanceOf(exception, PipelineException);
  }

  @TestMethod
  public namesTheProgramInItsDefaultMessage(): void {
    Assert.areEqual("The program \"git\" failed.", new ProcessException("git").message);
  }

  @TestMethod
  public keepsItsCause(): void {
    const cause = new Error("spawn git ENOENT");
    const exception = new ProcessException("git", "\"git\" could not start: spawn git ENOENT", new ExceptionOptions(cause));

    Assert.areEqual(cause, exception.cause);
  }
}
