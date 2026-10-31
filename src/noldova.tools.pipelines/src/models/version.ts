/**
 * @license
 * Copyright (c) Noldova.
 *
 * This source code is licensed under the license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { VersionException } from "../exceptions/version.exception.js";
import { Resources } from "../resources.js";

export class Version {
  private static readonly PATTERN: RegExp = /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(?:-nightly\.([0-9]{8}))?$/;
  private static readonly NIGHTLY_DATE_PATTERN: RegExp = /^([1-9][0-9]{3})([0-9]{2})([0-9]{2})$/;

  public readonly major: number;
  public readonly minor: number;
  public readonly patch: number;
  public readonly nightlyDate: string | null;

  public constructor(major: number, minor: number, patch: number, nightlyDate: string | null = null) {
    Version.checkPart(Resources.majorPartName, major);
    Version.checkPart(Resources.minorPartName, minor);
    Version.checkPart(Resources.patchPartName, patch);
    if (nightlyDate !== null)
      Version.checkNightlyDate(nightlyDate);

    this.major = major;
    this.minor = minor;
    this.patch = patch;
    this.nightlyDate = nightlyDate;
  }

  public static parse(text: string): Version {
    const match = Version.PATTERN.exec(text);
    if (match === null)
      throw new VersionException(Resources.formatVersionInvalid(text));

    return new Version(Number(match[1]), Number(match[2]), Number(match[3]), match[4] ?? null);
  }

  public compareTo(other: Version): number {
    const order = Math.sign(this.major - other.major || this.minor - other.minor || this.patch - other.patch);
    if (order !== 0 || this.nightlyDate === other.nightlyDate)
      return order;
    if (this.nightlyDate === null)
      return 1;
    if (other.nightlyDate === null)
      return -1;

    return this.nightlyDate < other.nightlyDate ? -1 : 1;
  }

  public equals(other: Version): boolean {
    return this.compareTo(other) === 0;
  }

  public toString(): string {
    const release = `${this.major}.${this.minor}.${this.patch}`;

    return this.nightlyDate === null ? release : `${release}-nightly.${this.nightlyDate}`;
  }

  private static checkPart(partName: string, value: number): void {
    if (!Number.isSafeInteger(value) || value < 0)
      throw new VersionException(Resources.formatVersionPartInvalid(partName, value));
  }

  private static checkNightlyDate(value: string): void {
    const match = Version.NIGHTLY_DATE_PATTERN.exec(value);
    if (match === null || !Version.isCalendarDate(Number(match[1]), Number(match[2]), Number(match[3])))
      throw new VersionException(Resources.formatNightlyDateInvalid(value));
  }

  private static isCalendarDate(year: number, month: number, day: number): boolean {
    const date = new Date(Date.UTC(year, month - 1, day));

    return date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
  }
}
