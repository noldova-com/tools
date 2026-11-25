/**
 * @license
 * Copyright (c) Noldova.
 *
 * This source code is licensed under the license found in the
 * LICENSE file in the root directory of this source tree.
 */

export class PinMove {
  public readonly packageName: string;
  public readonly line: string;

  public constructor(packageName: string, line: string) {
    this.packageName = packageName;
    this.line = line;
  }
}
