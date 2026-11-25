/**
 * @license
 * Copyright (c) Noldova.
 *
 * This source code is licensed under the license found in the
 * LICENSE file in the root directory of this source tree.
 */

export class DependencyOrder {
  public readonly order: readonly string[];
  public readonly unordered: readonly string[];

  public constructor(order: readonly string[], unordered: readonly string[]) {
    this.order = order;
    this.unordered = unordered;
  }
}
