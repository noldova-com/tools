/**
 * @license
 * Copyright (c) Noldova.
 *
 * This source code is licensed under the license found in the
 * LICENSE file in the root directory of this source tree.
 */

export class OwnPin {
  public readonly field: string;
  public readonly manifestPaths: readonly string[];

  public constructor(field: string, manifestPaths: readonly string[]) {
    this.field = field;
    this.manifestPaths = manifestPaths;
  }
}
