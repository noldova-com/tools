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
    const match = Resources.versionPattern.exec(text);
    if (match === null)
      throw new VersionException(Resources.formatVersionInvalid(text));
    const problem = Version.validateMatch(match);
    if (problem !== null)
      throw new VersionException(problem);

    return new Version(Number(match[1]), Number(match[2]), Number(match[3]), match[4] ?? null);
  }

  public static validate(text: string): string | null {
    const match = Resources.versionPattern.exec(text);

    return match === null ? Resources.formatVersionInvalid(text) : Version.validateMatch(match);
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
    const release = [this.major, this.minor, this.patch].join(Resources.versionPartSeparator);

    return this.nightlyDate === null ? release : `${release}${Resources.nightlySeparator}${this.nightlyDate}`;
  }

  private static checkPart(partName: string, value: number): void {
    if (!Number.isSafeInteger(value) || value < 0)
      throw new VersionException(Resources.formatVersionPartInvalid(partName, String(value)));
  }

  private static validateMatch(match: RegExpExecArray): string | null {
    return Version.validatePart(Resources.majorPartName, match[1])
      ?? Version.validatePart(Resources.minorPartName, match[2])
      ?? Version.validatePart(Resources.patchPartName, match[3])
      ?? (match[4] === undefined ? null : Version.validateNightlyDate(match[4]));
  }

  private static validatePart(partName: string, text: string | undefined): string | null {
    return Number.isSafeInteger(Number(text)) ? null : Resources.formatVersionPartInvalid(partName, String(text));
  }

  private static checkNightlyDate(value: string): void {
    const problem = Version.validateNightlyDate(value);
    if (problem !== null)
      throw new VersionException(problem);
  }

  private static validateNightlyDate(value: string): string | null {
    const match = Resources.nightlyDatePattern.exec(value);
    if (match === null || !Version.isCalendarDate(Number(match[1]), Number(match[2]), Number(match[3])))
      return Resources.formatNightlyDateInvalid(value);

    return null;
  }

  private static isCalendarDate(year: number, month: number, day: number): boolean {
    const date = new Date(Date.UTC(year, month - 1, day));

    return date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
  }
}
