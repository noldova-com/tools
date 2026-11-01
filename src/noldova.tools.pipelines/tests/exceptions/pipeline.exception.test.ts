/**
 * @license
 * Copyright (c) Noldova.
 *
 * This source code is licensed under the license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { Exception, ExceptionOptions } from "@noldova/context.exceptions";
import { Assert, TestClass, TestMethod } from "@noldova/context.testing";
import { PipelineException } from "@noldova/tools.pipelines";

class StepException extends PipelineException {
  public constructor(message: string, options?: ExceptionOptions) {
    super(message, options);
  }
}

@TestClass
export class PipelineExceptionTests {
  @TestMethod
  public keepsTheMessageAndNamesTheDerivedClass(): void {
    const exception = new StepException("The step could not run.");

    Assert.areEqual("The step could not run.", exception.message);
    Assert.areEqual("StepException", exception.name);
    Assert.isUndefined(exception.cause);
    Assert.isInstanceOf(exception, PipelineException);
    Assert.isInstanceOf(exception, Exception);
  }

  @TestMethod
  public keepsItsCause(): void {
    const cause = new Error("timed out");
    const exception = new StepException("The step could not run.", new ExceptionOptions(cause));

    Assert.areEqual(cause, exception.cause);
  }
}
