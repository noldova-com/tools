/**
 * @license
 * Copyright (c) Noldova.
 *
 * This source code is licensed under the license found in the
 * LICENSE file in the root directory of this source tree.
 */

import type { ExceptionOptions } from "@noldova/context.exceptions";

import { Resources } from "../resources.js";
import { PipelineException } from "./pipeline.exception.js";

export class ProcessException extends PipelineException {
  public readonly program: string;

  public constructor(program: string, message: string = Resources.formatProgramFailed(program), options?: ExceptionOptions) {
    super(message, options);

    this.program = program;
  }
}
