/**
 * @license
 * Copyright (c) Noldova.
 *
 * This source code is licensed under the license found in the
 * LICENSE file in the root directory of this source tree.
 */

export class Resources {
  public static readonly majorPartName: string = "major";
  public static readonly minorPartName: string = "minor";
  public static readonly patchPartName: string = "patch";

  public static formatVersionInvalid(text: string): string {
    return `"${text}" is not a version: a version is major.minor.patch, each a whole number without a leading zero, such as 1.4.0, or a nightly version, major.minor.patch-nightly.YYYYMMDD, such as 1.4.1-nightly.20261101.`;
  }

  public static formatVersionPartInvalid(partName: string, value: number): string {
    return `A version's ${partName} part must be a whole number from 0 to ${Number.MAX_SAFE_INTEGER}, not ${value}.`;
  }

  public static formatNightlyDateInvalid(value: string): string {
    return `A nightly version's date must be a calendar date written YYYYMMDD, from year 1000, such as 20261101, not "${value}".`;
  }
}
