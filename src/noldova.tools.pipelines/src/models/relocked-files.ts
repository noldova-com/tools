/**
 * @license
 * Copyright (c) Noldova.
 *
 * This source code is licensed under the license found in the
 * LICENSE file in the root directory of this source tree.
 */


import { JsonReader } from "@noldova/context.json";

import { Resources } from "../resources.js";
import { StepResult } from "./step-result.js";

export class RelockedFiles {
  public readonly moves: readonly string[];
  public readonly lockLines: readonly string[];
  public readonly files: Readonly<Record<string, string>>;

  public constructor(moves: readonly string[], lockLines: readonly string[], files: Readonly<Record<string, string>>) {
    this.moves = moves;
    this.lockLines = lockLines;
    this.files = files;
  }

  public static format(relocked: StepResult | RelockedFiles): string {
    return JSON.stringify(relocked instanceof StepResult
      ? { [Resources.relockSucceededField]: relocked.isSuccessful, [Resources.relockMessageField]: relocked.message }
      : { [Resources.relockMovesField]: relocked.moves, [Resources.relockLockLinesField]: relocked.lockLines, [Resources.relockFilesField]: relocked.files });
  }

  public static parse(text: string): StepResult | RelockedFiles {
    const reader = JsonReader.parse(text);
    if (reader.hasField(Resources.relockMessageField)) {
      const message = reader.readString(Resources.relockMessageField);

      return reader.readBoolean(Resources.relockSucceededField) ? StepResult.succeeded(message) : StepResult.failed(message);
    }

    const files = reader.readObject(Resources.relockFilesField);

    return new RelockedFiles(reader.readStringArray(Resources.relockMovesField), reader.readStringArray(Resources.relockLockLinesField),
      Object.fromEntries(Object.keys(files.toJson()).map(t => [t, files.readString(t)])));
  }
}
