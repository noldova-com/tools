/**
 * @license
 * Copyright (c) Noldova.
 *
 * This source code is licensed under the license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { Assert, TestClass, TestData, TestMethod } from "@noldova/context.testing";
import { type ITagHost, StepResult, TagStep } from "@noldova/tools.pipelines";

class FakeTagHost implements ITagHost {
  private readonly reads: (string | StepResult)[];
  private readonly creates: (boolean | StepResult)[];

  public readonly calls: string[] = [];

  public constructor(reads: readonly (string | StepResult)[], creates: readonly (boolean | StepResult)[] = []) {
    this.reads = [...reads];
    this.creates = [...creates];
  }

  public async readTagAsync(tag: string): Promise<string | StepResult> {
    this.calls.push(`read ${tag}`);
    return this.reads.shift() ?? "";
  }

  public async createTagAsync(tag: string, commit: string): Promise<boolean | StepResult> {
    this.calls.push(`create ${tag} ${commit}`);
    return this.creates.shift() ?? true;
  }
}

@TestClass
export class TagStepTests {
  private static readonly COMMIT: string = "225059f4c1e6a3b2d8f7e9a0b1c2d3e4f5a6b7c8";
  private static readonly OTHER_COMMIT: string = "b7c8225059f4c1e6a3b2d8f7e9a0b1c2d3e4f5a6";

  @TestMethod
  public namesItselfAndItsValues(): void {
    const step = new TagStep(new FakeTagHost([]));

    Assert.areEqual("tag", step.name);
    Assert.areEqual("<version> <commit>", step.usage);
  }

  @TestData("", "The tag step takes <version> <commit>.")
  @TestData("0.0.4", "The tag step takes <version> <commit>.")
  @TestData("0.0.4 225059f4c1e6a3b2d8f7e9a0b1c2d3e4f5a6b7c8 more", "The tag step takes <version> <commit>.")
  @TestData("1.4 225059f4c1e6a3b2d8f7e9a0b1c2d3e4f5a6b7c8", "\"1.4\" is not a version: a version is major.minor.patch, each a whole number without a leading zero, such as 1.4.0, or a nightly version, major.minor.patch-nightly.YYYYMMDD, such as 1.4.1-nightly.20261101.")
  @TestData("0.0.5-nightly.20261102 225059f4c1e6a3b2d8f7e9a0b1c2d3e4f5a6b7c8", "0.0.5-nightly.20261102 is a nightly version; only a release version is tagged.")
  @TestData("0.0.4 225059f", "\"225059f\" is not a commit: a commit is given by its full id, 40 lowercase hexadecimal digits.")
  @TestMethod
  public async failsForWrongValuesWithoutAskingTheHostAsync(joinedValues: string, expected: string): Promise<void> {
    const host = new FakeTagHost([]);
    const values = joinedValues.length === 0 ? [] : joinedValues.split(" ");

    const result = await new TagStep(host).runAsync(values);

    Assert.isFalse(result.isSuccessful);
    Assert.areEqual(expected, result.message);
    Assert.areEqual(0, host.calls.length);
  }

  @TestMethod
  public async createsTheTagWhenTheHostHasNoneAsync(): Promise<void> {
    const host = new FakeTagHost([""], [true]);

    const result = await new TagStep(host).runAsync(["0.0.4", TagStepTests.COMMIT]);

    Assert.isTrue(result.isSuccessful);
    Assert.areEqual(`Tagged commit ${TagStepTests.COMMIT} as v0.0.4.`, result.message);
    Assert.areEqual(JSON.stringify(["read v0.0.4", `create v0.0.4 ${TagStepTests.COMMIT}`]), JSON.stringify(host.calls));
  }

  @TestMethod
  public async succeedsWithoutCreatingWhenTheTagPointsToTheCommitAsync(): Promise<void> {
    const host = new FakeTagHost([TagStepTests.COMMIT]);

    const result = await new TagStep(host).runAsync(["0.0.4", TagStepTests.COMMIT]);

    Assert.isTrue(result.isSuccessful);
    Assert.areEqual(`v0.0.4 already points to commit ${TagStepTests.COMMIT}.`, result.message);
    Assert.areEqual(JSON.stringify(["read v0.0.4"]), JSON.stringify(host.calls));
  }

  @TestMethod
  public async failsWithoutMovingATagThatPointsToAnotherCommitAsync(): Promise<void> {
    const host = new FakeTagHost([TagStepTests.OTHER_COMMIT]);

    const result = await new TagStep(host).runAsync(["0.0.4", TagStepTests.COMMIT]);

    Assert.isFalse(result.isSuccessful);
    Assert.areEqual(`v0.0.4 points to commit ${TagStepTests.OTHER_COMMIT}, not ${TagStepTests.COMMIT}; a tag is never moved.`, result.message);
    Assert.areEqual(JSON.stringify(["read v0.0.4"]), JSON.stringify(host.calls));
  }

  @TestData(true)
  @TestData(false)
  @TestMethod
  public async readsTheTagAgainWhenAnotherRunCreatedItFirstAsync(isSameCommit: boolean): Promise<void> {
    const found = isSameCommit ? TagStepTests.COMMIT : TagStepTests.OTHER_COMMIT;
    const host = new FakeTagHost(["", found], [false]);

    const result = await new TagStep(host).runAsync(["0.0.4", TagStepTests.COMMIT]);

    Assert.areEqual(isSameCommit, result.isSuccessful);
    Assert.areEqual(
      isSameCommit
        ? `v0.0.4 already points to commit ${TagStepTests.COMMIT}.`
        : `v0.0.4 points to commit ${TagStepTests.OTHER_COMMIT}, not ${TagStepTests.COMMIT}; a tag is never moved.`,
      result.message);
    Assert.areEqual(JSON.stringify(["read v0.0.4", `create v0.0.4 ${TagStepTests.COMMIT}`, "read v0.0.4"]), JSON.stringify(host.calls));
  }

  @TestMethod
  public async failsWhenTheTagExistsButReadingItFindsNoneAsync(): Promise<void> {
    const host = new FakeTagHost(["", ""], [false]);

    const result = await new TagStep(host).runAsync(["0.0.4", TagStepTests.COMMIT]);

    Assert.isFalse(result.isSuccessful);
    Assert.areEqual("v0.0.4 exists, so it could not be created, but reading it found no tag.", result.message);
  }

  @TestData(0)
  @TestData(1)
  @TestData(2)
  @TestMethod
  public async failsWithTheHostsAnswerWhenTheHostFailsAsync(failingCall: number): Promise<void> {
    const failure = StepResult.failed("GitHub answered GET repos/a/b/git/ref/tags/v0.0.4 with 403: Resource not accessible by integration");
    const reads = failingCall === 0 ? [failure] : failingCall === 1 ? [""] : ["", failure];
    const host = new FakeTagHost(reads, [failingCall === 1 ? failure : false]);

    const result = await new TagStep(host).runAsync(["0.0.4", TagStepTests.COMMIT]);

    Assert.areEqual(failure, result);
    Assert.areEqual(failingCall + 1, host.calls.length);
  }
}
