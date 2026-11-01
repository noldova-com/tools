/**
 * @license
 * Copyright (c) Noldova.
 *
 * This source code is licensed under the license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { PassThrough } from "node:stream";

import { Assert, TestClass, TestData, TestMethod } from "@noldova/context.testing";
import { GitHubStepOutput } from "@noldova/tools.pipelines.github";

@TestClass
export class GitHubStepOutputTests {
  @TestMethod
  public writesASuccessToStandardOutputWithALineFeed(): void {
    const standardOutput = GitHubStepOutputTests.createStream();
    const standardError = GitHubStepOutputTests.createStream();

    new GitHubStepOutput(standardOutput, standardError).writeSuccess("0.0.5-nightly.20261102");

    Assert.areEqual("0.0.5-nightly.20261102\n", GitHubStepOutputTests.read(standardOutput));
    Assert.areEqual("", GitHubStepOutputTests.read(standardError));
  }

  @TestMethod
  public writesNothingForAnEmptySuccess(): void {
    const standardOutput = GitHubStepOutputTests.createStream();
    const standardError = GitHubStepOutputTests.createStream();

    new GitHubStepOutput(standardOutput, standardError).writeSuccess("");

    Assert.areEqual("", GitHubStepOutputTests.read(standardOutput));
    Assert.areEqual("", GitHubStepOutputTests.read(standardError));
  }

  @TestData("Commit 225059f… is not on origin/main.", "::error::Commit 225059f… is not on origin/main.\n")
  @TestData("archives has no a.tgz.\narchives has no b.tgz.", "::error::archives has no a.tgz.%0Aarchives has no b.tgz.\n")
  @TestData("line\r\nend\r", "::error::line%0D%0Aend%0D\n")
  @TestData("100% of %0A", "::error::100%25 of %250A\n")
  @TestData("", "::error::\n")
  @TestMethod
  public writesAFailureAsOneEscapedErrorAnnotationOnStandardError(message: string, expected: string): void {
    const standardOutput = GitHubStepOutputTests.createStream();
    const standardError = GitHubStepOutputTests.createStream();

    new GitHubStepOutput(standardOutput, standardError).writeFailure(message);

    Assert.areEqual(expected, GitHubStepOutputTests.read(standardError));
    Assert.areEqual("", GitHubStepOutputTests.read(standardOutput));
  }

  private static createStream(): PassThrough {
    const stream = new PassThrough();
    stream.setEncoding("utf8");

    return stream;
  }

  private static read(stream: PassThrough): string {
    const text: unknown = stream.read();

    return typeof text === "string" ? text : "";
  }
}
