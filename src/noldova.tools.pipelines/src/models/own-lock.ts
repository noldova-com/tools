/**
 * @license
 * Copyright (c) Noldova.
 *
 * This source code is licensed under the license found in the
 * LICENSE file in the root directory of this source tree.
 */

import type { OwnPin } from "./own-pin.js";

export class OwnLock {
  public readonly lockFilePath: string;
  public readonly pins: ReadonlyMap<string, OwnPin>;

  public constructor(lockFilePath: string, pins: ReadonlyMap<string, OwnPin>) {
    this.lockFilePath = lockFilePath;
    this.pins = pins;
  }
}
