/**
 * @license
 * Copyright (c) Noldova.
 *
 * This source code is licensed under the license found in the
 * LICENSE file in the root directory of this source tree.
 */

export class ExactPin {
  public readonly packageName: string;
  public readonly version: string;

  public constructor(packageName: string, version: string) {
    this.packageName = packageName;
    this.version = version;
  }
}
