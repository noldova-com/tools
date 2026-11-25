/**
 * @license
 * Copyright (c) Noldova.
 *
 * This source code is licensed under the license found in the
 * LICENSE file in the root directory of this source tree.
 */

export class BuildValues {
  public readonly version: string | null;
  public readonly names: readonly string[];

  public constructor(version: string | null, names: readonly string[]) {
    this.version = version;
    this.names = names;
  }
}
