/**
 * @license
 * Copyright (c) Noldova.
 *
 * This source code is licensed under the license found in the
 * LICENSE file in the root directory of this source tree.
 */

import type { PackageArchive } from "./package-archive.js";
import type { StepResult } from "./step-result.js";

export class ArchiveCheck {
  public readonly result: StepResult;
  public readonly archives: readonly PackageArchive[];

  public constructor(result: StepResult, archives: readonly PackageArchive[]) {
    this.result = result;
    this.archives = archives;
  }
}
