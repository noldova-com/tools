/**
 * @license
 * Copyright (c) Noldova.
 *
 * This source code is licensed under the license found in the
 * LICENSE file in the root directory of this source tree.
 */

// An outside package the released packages pin, with the released packages that name it, directly or through another
// released package; a target that names none applies wherever its package is pinned.
export class PinTarget {
  public readonly packageName: string;
  public readonly version: string;
  public readonly reason: string | null;
  public readonly range: string | null;
  public readonly requiredBy: readonly string[];

  public constructor(packageName: string, version: string, reason: string | null, range: string | null, requiredBy: readonly string[]) {
    this.packageName = packageName;
    this.version = version;
    this.reason = reason;
    this.range = range;
    this.requiredBy = requiredBy;
  }

  public appliesTo(installed: ReadonlySet<string>): boolean {
    return this.requiredBy.length === 0 || this.requiredBy.some(t => installed.has(t));
  }
}
