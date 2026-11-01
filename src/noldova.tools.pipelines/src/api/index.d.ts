/**
 * @license
 * Copyright (c) Noldova.
 *
 * This source code is licensed under the license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * The exception that is thrown when a text is not a version, when a
 * version's part is not a whole number from 0 to `Number.MAX_SAFE_INTEGER`,
 * or when a nightly version's date is not a calendar date.
 */
export declare class VersionException extends Error {
  /**
   * The exception's class name, `"VersionException"`.
   */
  public override readonly name: string;

  /**
   * Creates the exception with the explanation it reports.
   *
   * @param message The complete explanation, kept as given, such as which
   * text was not a version and the form a version takes.
   * @example
   * ```ts
   * import { VersionException } from "@noldova/tools.pipelines";
   *
   * const exception = new VersionException("\"1.4\" is not a version.");
   * exception.name; // "VersionException"
   * exception instanceof Error; // true
   * ```
   */
  public constructor(message: string);
}

/**
 * A version of the form `major.minor.patch`, each part a whole number from 0
 * to `Number.MAX_SAFE_INTEGER`, or a nightly version of the form
 * `major.minor.patch-nightly.YYYYMMDD`, which adds the date it was built. A
 * version never changes after it is created; versions compare part by part,
 * major first, and a nightly version comes before the release with the same
 * three parts.
 */
export declare class Version {
  /**
   * The major part, the first of the three.
   */
  public readonly major: number;

  /**
   * The minor part, the second of the three.
   */
  public readonly minor: number;

  /**
   * The patch part, the last of the three.
   */
  public readonly patch: number;

  /**
   * A nightly version's date, written `YYYYMMDD`, such as `20261101`; `null`
   * for a release.
   */
  public readonly nightlyDate: string | null;

  /**
   * Creates a version from its three parts and, for a nightly version, its
   * date.
   *
   * @param major The major part: a whole number from 0 to
   * `Number.MAX_SAFE_INTEGER`.
   * @param minor The minor part, in the same range.
   * @param patch The patch part, in the same range.
   * @param nightlyDate A nightly version's date: a calendar date written
   * `YYYYMMDD`, from year 1000, such as `20261101`. Omitted or `null`, the
   * version is a release.
   * @throws VersionException, synchronously, if a part is negative, not a
   * whole number, or greater than `Number.MAX_SAFE_INTEGER`, or if the date
   * is not a calendar date written that way.
   * @example
   * ```ts
   * import { Version } from "@noldova/tools.pipelines";
   *
   * new Version(1, 4, 0).toString(); // "1.4.0"
   * new Version(1, 4, 1, "20261101").toString(); // "1.4.1-nightly.20261101"
   * // new Version(1, -1, 0) and new Version(1, 4, 1, "20261131") throw VersionException.
   * ```
   */
  public constructor(major: number, minor: number, patch: number, nightlyDate?: string | null);

  /**
   * Reads a version from its text.
   *
   * @param text The version's text: exactly three whole numbers joined by
   * dots, each without a sign or a leading zero, such as `1.4.0`, optionally
   * followed by `-nightly.` and a calendar date written `YYYYMMDD`, such as
   * `1.4.1-nightly.20261101`, with nothing before or after them.
   * @returns A new version with the text's parts and, for a nightly version,
   * its date.
   * @throws VersionException, synchronously, if the text is not of that form,
   * if a part is greater than `Number.MAX_SAFE_INTEGER`, or if the date is
   * not a calendar date.
   * @example
   * ```ts
   * import { Version } from "@noldova/tools.pipelines";
   *
   * Version.parse("1.4.0").minor; // 4
   * Version.parse("1.4.1-nightly.20261101").nightlyDate; // "20261101"
   * // Version.parse("1.04.0"), Version.parse("v1.4.0") and
   * // Version.parse("1.4.0-beta.1") throw VersionException.
   * ```
   */
  public static parse(text: string): Version;

  /**
   * Compares this version with another, major part first, then minor, then
   * patch; with the same three parts, a nightly version comes before the
   * release, and nightly versions come in the order of their dates.
   *
   * @param other The version to compare with.
   * @returns -1 if this version comes before the other, 0 if both are the
   * same version, and 1 if this version comes after it.
   * @example
   * ```ts
   * import { Version } from "@noldova/tools.pipelines";
   *
   * Version.parse("1.4.0").compareTo(Version.parse("1.10.0")); // -1
   * Version.parse("2.0.0").compareTo(Version.parse("1.99.99")); // 1
   * Version.parse("1.4.1-nightly.20261101").compareTo(Version.parse("1.4.1")); // -1
   * Version.parse("1.4.1-nightly.20261102").compareTo(Version.parse("1.4.1-nightly.20261101")); // 1
   * ```
   */
  public compareTo(other: Version): number;

  /**
   * Tells whether another version has the same three parts and the same
   * nightly date, or is a release as this one is.
   *
   * @param other The version to compare with.
   * @returns `true` if both are the same version, otherwise `false`.
   * @example
   * ```ts
   * import { Version } from "@noldova/tools.pipelines";
   *
   * Version.parse("1.4.0").equals(new Version(1, 4, 0)); // true
   * Version.parse("1.4.1").equals(Version.parse("1.4.1-nightly.20261101")); // false
   * ```
   */
  public equals(other: Version): boolean;

  /**
   * Writes the version as its text.
   *
   * @returns The three parts joined by dots, such as `1.4.0`, followed for a
   * nightly version by `-nightly.` and its date, such as
   * `1.4.1-nightly.20261101`; reading it with {@link Version.parse} gives an
   * equal version.
   * @example
   * ```ts
   * import { Version } from "@noldova/tools.pipelines";
   *
   * new Version(1, 4, 0).toString(); // "1.4.0"
   * `${new Version(0, 0, 4, "20261101")}`; // "0.0.4-nightly.20261101"
   * ```
   */
  public toString(): string;
}
