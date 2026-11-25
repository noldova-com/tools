/**
 * @license
 * Copyright (c) Noldova.
 *
 * This source code is licensed under the license found in the
 * LICENSE file in the root directory of this source tree.
 */

export class TarHeaderField {
  public readonly offset: number;
  public readonly value: string;

  public constructor(offset: number, value: string) {
    this.offset = offset;
    this.value = value;
  }
}
