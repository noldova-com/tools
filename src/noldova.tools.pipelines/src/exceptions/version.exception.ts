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

export class VersionException extends PipelineException {
  public constructor(message: string = Resources.versionInvalid, options?: ExceptionOptions) {
    super(message, options);
  }
}
