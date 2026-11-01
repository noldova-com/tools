/**
 * @license
 * Copyright (c) Noldova.
 *
 * This source code is licensed under the license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { Assert, TestClass, TestData, TestMethod } from "@noldova/context.testing";
import { Version, VersionException } from "@noldova/tools.pipelines";

@TestClass
export class VersionTests {
  @TestData("0.0.0", 0, 0, 0)
  @TestData("1.4.0", 1, 4, 0)
  @TestData("10.20.30", 10, 20, 30)
  @TestData("9007199254740991.0.1", 9007199254740991, 0, 1)
  @TestMethod
  public parsesThreeParts(text: string, major: number, minor: number, patch: number): void {
    const version = Version.parse(text);

    Assert.areEqual(major, version.major);
    Assert.areEqual(minor, version.minor);
    Assert.areEqual(patch, version.patch);
    Assert.areEqual(null, version.nightlyDate);
    Assert.areEqual(text, version.toString());
  }

  @TestData("1.4.1-nightly.20261101", 1, 4, 1, "20261101")
  @TestData("0.0.0-nightly.10000101", 0, 0, 0, "10000101")
  @TestData("0.1.1-nightly.20280229", 0, 1, 1, "20280229")
  @TestData("2.0.0-nightly.99991231", 2, 0, 0, "99991231")
  @TestMethod
  public parsesANightlyVersion(text: string, major: number, minor: number, patch: number, nightlyDate: string): void {
    const version = Version.parse(text);

    Assert.areEqual(major, version.major);
    Assert.areEqual(minor, version.minor);
    Assert.areEqual(patch, version.patch);
    Assert.areEqual(nightlyDate, version.nightlyDate);
    Assert.areEqual(text, version.toString());
  }

  @TestData("")
  @TestData("1.4")
  @TestData("1.4.0.0")
  @TestData("01.4.0")
  @TestData("1.04.0")
  @TestData("1.4.00")
  @TestData("v1.4.0")
  @TestData("1.4.0 ")
  @TestData(" 1.4.0")
  @TestData("1.4.0\n")
  @TestData("-1.4.0")
  @TestData("+1.4.0")
  @TestData("1.4.0-stage")
  @TestData("1..0")
  @TestData("1.x.0")
  @TestData("١.٤.٠")
  @TestData("1.4.0-beta.1")
  @TestData("1.4.0+20261101")
  @TestData("1.4.0-nightly")
  @TestData("1.4.0-nightly.")
  @TestData("1.4.0-nightly.2026110")
  @TestData("1.4.0-nightly.202611011")
  @TestData("1.4.0-nightly.2026-11-01")
  @TestData("1.4.0-Nightly.20261101")
  @TestData("1.4.0-nightly-20261101")
  @TestData("1.4.0-nightly.20261101 ")
  @TestData("1.4-nightly.20261101")
  @TestMethod
  public refusesATextThatIsNotAVersion(text: string): void {
    const failure = Assert.throws(() => Version.parse(text), VersionException);

    Assert.areEqual(
      `"${text}" is not a version: a version is major.minor.patch, each a whole number without a leading zero, such as 1.4.0, or a nightly version, major.minor.patch-nightly.YYYYMMDD, such as 1.4.1-nightly.20261101.`,
      failure.message);
  }

  @TestData("1.9007199254740992.0", "minor", "9007199254740992")
  @TestData("1.9007199254740993.0", "minor", "9007199254740993")
  @TestData("1234567890123456789012345.0.0", "major", "1234567890123456789012345")
  @TestData("0.0.18014398509481985", "patch", "18014398509481985")
  @TestData("0.0.9007199254740993-nightly.20261101", "patch", "9007199254740993")
  @TestMethod
  public refusesAPartBeyondTheSafeIntegersQuotingItsText(text: string, partName: string, value: string): void {
    const failure = Assert.throws(() => Version.parse(text), VersionException);

    Assert.areEqual(`A version's ${partName} part must be a whole number from 0 to 9007199254740991, not ${value}.`, failure.message);
  }

  @TestData("20261301")
  @TestData("20260001")
  @TestData("20261100")
  @TestData("20261131")
  @TestData("20270229")
  @TestData("21000229")
  @TestData("09991231")
  @TestMethod
  public refusesANightlyDateThatIsNotACalendarDate(nightlyDate: string): void {
    const failure = Assert.throws(() => Version.parse(`1.4.1-nightly.${nightlyDate}`), VersionException);

    Assert.areEqual(
      `A nightly version's date must be a calendar date written YYYYMMDD, from year 1000, such as 20261101, not "${nightlyDate}".`,
      failure.message);
  }

  @TestData(-1, 0, 0, "major", "-1")
  @TestData(0, 1.5, 0, "minor", "1.5")
  @TestData(0, 0, Number.NaN, "patch", "NaN")
  @TestData(Number.POSITIVE_INFINITY, 0, 0, "major", "Infinity")
  @TestData(0, 0, 9007199254740992, "patch", "9007199254740992")
  @TestMethod
  public refusesAnInvalidPart(major: number, minor: number, patch: number, partName: string, value: string): void {
    const failure = Assert.throws(() => new Version(major, minor, patch), VersionException);

    Assert.areEqual(`A version's ${partName} part must be a whole number from 0 to 9007199254740991, not ${value}.`, failure.message);
  }

  @TestData("")
  @TestData("2026111")
  @TestData("202611011")
  @TestData("2026-11-01")
  @TestData("abcdefgh")
  @TestData("20261131")
  @TestMethod
  public refusesAnInvalidNightlyDate(nightlyDate: string): void {
    const failure = Assert.throws(() => new Version(1, 4, 1, nightlyDate), VersionException);

    Assert.areEqual(
      `A nightly version's date must be a calendar date written YYYYMMDD, from year 1000, such as 20261101, not "${nightlyDate}".`,
      failure.message);
  }

  @TestData("0.0.0")
  @TestData("1.4.0")
  @TestData("9007199254740991.0.1")
  @TestData("1.4.1-nightly.20261101")
  @TestData("0.1.1-nightly.20280229")
  @TestMethod
  public validatesAVersionWithoutAProblem(text: string): void {
    Assert.isNull(Version.validate(text));
  }

  @TestData("")
  @TestData("1.4")
  @TestData("01.4.0")
  @TestData("v1.4.0")
  @TestData("1.4.0-beta.1")
  @TestData("1.4.0-nightly.2026110")
  @TestMethod
  public validatesATextThatIsNotAVersionWithItsProblem(text: string): void {
    Assert.areEqual(
      `"${text}" is not a version: a version is major.minor.patch, each a whole number without a leading zero, such as 1.4.0, or a nightly version, major.minor.patch-nightly.YYYYMMDD, such as 1.4.1-nightly.20261101.`,
      Version.validate(text));
  }

  @TestData("9007199254740992.0.0", "major", "9007199254740992")
  @TestData("0.9007199254740992.0", "minor", "9007199254740992")
  @TestData("0.0.9007199254740992-nightly.20261101", "patch", "9007199254740992")
  @TestMethod
  public validatesAPartBeyondTheSafeIntegersWithItsProblem(text: string, partName: string, value: string): void {
    Assert.areEqual(`A version's ${partName} part must be a whole number from 0 to 9007199254740991, not ${value}.`, Version.validate(text));
  }

  @TestData("20261131")
  @TestData("20270229")
  @TestMethod
  public validatesANightlyDateThatIsNotACalendarDateWithItsProblem(nightlyDate: string): void {
    Assert.areEqual(
      `A nightly version's date must be a calendar date written YYYYMMDD, from year 1000, such as 20261101, not "${nightlyDate}".`,
      Version.validate(`1.4.1-nightly.${nightlyDate}`));
  }

  @TestMethod
  public keepsTheConstructedParts(): void {
    const version = new Version(3, 2, 1);

    Assert.areEqual(3, version.major);
    Assert.areEqual(2, version.minor);
    Assert.areEqual(1, version.patch);
    Assert.areEqual(null, version.nightlyDate);
    Assert.areEqual("3.2.1", version.toString());
  }

  @TestMethod
  public keepsTheConstructedNightlyDate(): void {
    const nightly = new Version(3, 2, 1, "20261101");
    const release = new Version(3, 2, 1, null);

    Assert.areEqual("20261101", nightly.nightlyDate);
    Assert.areEqual("3.2.1-nightly.20261101", nightly.toString());
    Assert.areEqual(null, release.nightlyDate);
    Assert.areEqual("3.2.1", release.toString());
  }

  @TestData("1.4.0", "2.0.0", -1)
  @TestData("2.0.0", "1.99.99", 1)
  @TestData("1.4.0", "1.10.0", -1)
  @TestData("1.10.0", "1.4.0", 1)
  @TestData("1.4.2", "1.4.10", -1)
  @TestData("1.4.10", "1.4.2", 1)
  @TestData("1.4.0", "1.4.0", 0)
  @TestData("0.0.0", "9007199254740991.9007199254740991.9007199254740991", -1)
  @TestMethod
  public comparesMajorThenMinorThenPatch(left: string, right: string, expected: number): void {
    Assert.areEqual(expected, Version.parse(left).compareTo(Version.parse(right)));
  }

  @TestData("1.4.1-nightly.20261101", "1.4.1", -1)
  @TestData("1.4.1", "1.4.1-nightly.20261101", 1)
  @TestData("1.4.1-nightly.20261101", "1.4.1-nightly.20261102", -1)
  @TestData("1.4.1-nightly.20261102", "1.4.1-nightly.20261101", 1)
  @TestData("1.4.1-nightly.20261231", "1.4.1-nightly.20270101", -1)
  @TestData("1.4.1-nightly.20261101", "1.4.1-nightly.20261101", 0)
  @TestData("1.4.1-nightly.20261101", "1.4.0", 1)
  @TestData("1.4.0", "1.4.1-nightly.20261101", -1)
  @TestData("1.4.0-nightly.20261231", "1.4.1-nightly.20260101", -1)
  @TestMethod
  public comparesANightlyVersionBeforeItsReleaseAndByDate(left: string, right: string, expected: number): void {
    Assert.areEqual(expected, Version.parse(left).compareTo(Version.parse(right)));
  }

  @TestData("1.4.0", "1.4.0", true)
  @TestData("1.4.0", "1.4.1", false)
  @TestData("1.4.0", "1.5.0", false)
  @TestData("1.4.0", "2.4.0", false)
  @TestData("1.4.1-nightly.20261101", "1.4.1-nightly.20261101", true)
  @TestData("1.4.1-nightly.20261101", "1.4.1-nightly.20261102", false)
  @TestData("1.4.1-nightly.20261101", "1.4.1", false)
  @TestMethod
  public equalsTheSameVersion(left: string, right: string, expected: boolean): void {
    Assert.areEqual(expected, Version.parse(left).equals(Version.parse(right)));
  }
}
