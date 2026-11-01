/**
 * @license
 * Copyright (c) Noldova.
 *
 * This source code is licensed under the license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { Assert, TestClass, TestMethod } from "@noldova/context.testing";
import { Version, VersionException } from "@noldova/tools.pipelines";

@TestClass
export class ResourcesTests {
  @TestMethod
  public namesEachPartInItsMessage(): void {
    const major = Assert.throws(() => new Version(-1, 0, 0), VersionException);
    const minor = Assert.throws(() => new Version(0, -1, 0), VersionException);
    const patch = Assert.throws(() => new Version(0, 0, -1), VersionException);

    Assert.areEqual("A version's major part must be a whole number from 0 to 9007199254740991, not -1.", major.message);
    Assert.areEqual("A version's minor part must be a whole number from 0 to 9007199254740991, not -1.", minor.message);
    Assert.areEqual("A version's patch part must be a whole number from 0 to 9007199254740991, not -1.", patch.message);
  }

  @TestMethod
  public quotesTheTextThatIsNotAVersion(): void {
    const failure = Assert.throws(() => Version.parse("1.4"), VersionException);

    Assert.areEqual(
      "\"1.4\" is not a version: a version is major.minor.patch, each a whole number without a leading zero, such as 1.4.0, or a nightly version, major.minor.patch-nightly.YYYYMMDD, such as 1.4.1-nightly.20261101.",
      failure.message);
  }

  @TestMethod
  public quotesTheNightlyDateThatIsNotACalendarDate(): void {
    const failure = Assert.throws(() => new Version(1, 4, 1, "20261131"), VersionException);

    Assert.areEqual("A nightly version's date must be a calendar date written YYYYMMDD, from year 1000, such as 20261101, not \"20261131\".", failure.message);
  }
}
