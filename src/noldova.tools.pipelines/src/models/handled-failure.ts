/**
 * @license
 * Copyright (c) Noldova.
 *
 * This source code is licensed under the license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { JsonException } from "@noldova/context.json";

import { PipelineException } from "../exceptions/pipeline.exception.js";

// The failures a step reports as one repository's or one version's failed line and then goes on: a program it runs, such
// as git or npm, failing, and malformed JSON from another repository or a registry. Anything else, such as a bug in the
// step, ends the run with its stack trace.
export class HandledFailure {
  public static isHandled(error: unknown): error is Error {
    return error instanceof PipelineException || error instanceof JsonException || error instanceof SyntaxError;
  }
}
