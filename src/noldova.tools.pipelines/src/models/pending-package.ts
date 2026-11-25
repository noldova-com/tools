/**
 * @license
 * Copyright (c) Noldova.
 *
 * This source code is licensed under the license found in the
 * LICENSE file in the root directory of this source tree.
 */

export class PendingPackage {
  public readonly name: string;
  public readonly dependencies: readonly string[];

  public constructor(name: string, dependencies: readonly string[]) {
    this.name = name;
    this.dependencies = dependencies;
  }
}
