/**
 * @license
 * Copyright (c) Noldova.
 *
 * This source code is licensed under the license found in the
 * LICENSE file in the root directory of this source tree.
 */

import fs from "node:fs";
import path from "node:path";

import { Assert, TestClass, TestData, TestMethod } from "@noldova/context.testing";
import { Git, LineEndingsStep, ProcessException, ProcessRunner } from "@noldova/tools.pipelines";

import { GitRepositoryFixture } from "./git-repository.fixture.js";

@TestClass
export class LineEndingsStepTests {
  private static readonly ATTRIBUTES: string = "* text=auto eol=lf\n*.png -text\n";

  @TestMethod
  public namesItselfAndTakesNoValues(): void {
    const step = new LineEndingsStep(new Git(new ProcessRunner(), "."));

    Assert.areEqual("line-endings", step.name);
    Assert.areEqual("", step.usage);
  }

  @TestMethod
  public async succeedsSkippingWhatIsNotTextAsync(): Promise<void> {
    using repository = GitRepositoryFixture.create();
    const commit = repository.commit({
      ".gitattributes": LineEndingsStepTests.ATTRIBUTES,
      "README.md": "Read me.\n",
      "src/a.ts": "export const a = 1;\n",
      "data.bin": "a\0b",
      "image.png": "not text, without a newline"
    });
    repository.addSymbolicLink("link", "README.md");
    repository.addSubmodule("module", commit);

    const result = await LineEndingsStepTests.createStep(repository).runAsync([]);

    Assert.isTrue(result.isSuccessful, result.message);
    Assert.areEqual(".gitattributes holds \"* text=auto eol=lf\", and the 3 tracked text files use LF line endings and end with exactly one newline.", result.message);
  }

  @TestData("src")
  @TestData("src more")
  @TestMethod
  public async failsForAnyValueAsync(joinedValues: string): Promise<void> {
    const result = await new LineEndingsStep(new Git(new ProcessRunner(), ".")).runAsync(joinedValues.split(" "));

    Assert.isFalse(result.isSuccessful);
    Assert.areEqual("The line-endings step takes no values.", result.message);
  }

  @TestMethod
  public async failsWhenGitListsNoTrackedFileAsync(): Promise<void> {
    using repository = GitRepositoryFixture.create();

    const result = await LineEndingsStepTests.createStep(repository).runAsync([]);

    Assert.isFalse(result.isSuccessful);
    Assert.areEqual("Git lists no tracked file in this folder; run this step in a clone's checkout.", result.message);
  }

  @TestData("")
  @TestData("* text=auto\n")
  @TestData("* text=auto eol=lf \n")
  @TestData("# * text=auto eol=lf\n")
  @TestMethod
  public async failsForAGitAttributesFileWithoutTheLineAsync(content: string): Promise<void> {
    using repository = GitRepositoryFixture.create();
    repository.commit(content.length === 0 ? { "README.md": "Read me.\n" } : { ".gitattributes": content, "README.md": "Read me.\n" });

    const result = await LineEndingsStepTests.createStep(repository).runAsync([]);

    Assert.isFalse(result.isSuccessful);
    Assert.areEqual(".gitattributes at the checkout's root must hold the line \"* text=auto eol=lf\"; add it.", result.message);
  }

  @TestMethod
  public async failsForAGitAttributesFileThatIsNotCommittedAsync(): Promise<void> {
    using repository = GitRepositoryFixture.create();
    repository.commit({ "README.md": "Read me.\n" });
    repository.write({ ".gitattributes": LineEndingsStepTests.ATTRIBUTES });

    const result = await LineEndingsStepTests.createStep(repository).runAsync([]);

    Assert.isFalse(result.isSuccessful);
  }

  @TestData("a\r\nb\r\n", "\"crlf.txt\" has CRLF line endings; convert them to LF.")
  @TestData("a\r\nb\n", "\"crlf.txt\" mixes CRLF and LF line endings; convert them to LF.")
  @TestMethod
  public async failsForCommittedContentWithCrlfLineEndingsAsync(content: string, expected: string): Promise<void> {
    using repository = GitRepositoryFixture.create();
    repository.commit({ "crlf.txt": content });
    repository.commit({ ".gitattributes": LineEndingsStepTests.ATTRIBUTES });

    const result = await LineEndingsStepTests.createStep(repository).runAsync([]);

    Assert.isFalse(result.isSuccessful);
    Assert.areEqual(expected, result.message);
  }

  @TestData("a", "\"a b.txt\" does not end with a newline; add one.")
  @TestData("", "\"a b.txt\" does not end with a newline; add one.")
  @TestData("a\n\n", "\"a b.txt\" ends with a blank line; remove it, so the file ends with exactly one newline.")
  @TestData("\n\n", "\"a b.txt\" ends with a blank line; remove it, so the file ends with exactly one newline.")
  @TestMethod
  public async failsForAFileThatDoesNotEndWithExactlyOneNewlineAsync(content: string, expected: string): Promise<void> {
    using repository = GitRepositoryFixture.create();
    repository.commit({ ".gitattributes": LineEndingsStepTests.ATTRIBUTES, "a b.txt": content });

    const result = await LineEndingsStepTests.createStep(repository).runAsync([]);

    Assert.isFalse(result.isSuccessful);
    Assert.areEqual(expected, result.message);
  }

  @TestData("\n")
  @TestData("a\n")
  @TestMethod
  public async succeedsForAFileOfOneLineAsync(content: string): Promise<void> {
    using repository = GitRepositoryFixture.create();
    repository.commit({ ".gitattributes": LineEndingsStepTests.ATTRIBUTES, "a.txt": content });

    const result = await LineEndingsStepTests.createStep(repository).runAsync([]);

    Assert.isTrue(result.isSuccessful, result.message);
  }

  @TestMethod
  public async failsWithOneLineForEachFindingAsync(): Promise<void> {
    using repository = GitRepositoryFixture.create();
    repository.commit({ "crlf.txt": "a\r\n" });
    repository.commit({ ".gitattributes": "* text=auto\n", "a.txt": "a", "b.txt": "b\n", "c.txt": "c\n\n" });

    const result = await LineEndingsStepTests.createStep(repository).runAsync([]);

    Assert.isFalse(result.isSuccessful);
    Assert.areEqual(
      [
        ".gitattributes at the checkout's root must hold the line \"* text=auto eol=lf\"; add it.",
        "\"a.txt\" does not end with a newline; add one.",
        "\"c.txt\" ends with a blank line; remove it, so the file ends with exactly one newline.",
        "\"crlf.txt\" has CRLF line endings; convert them to LF."
      ].join("\n"),
      result.message);
  }

  @TestMethod
  public async failsForATrackedFileMissingFromTheCheckoutAsync(): Promise<void> {
    using repository = GitRepositoryFixture.create();
    repository.commit({ ".gitattributes": LineEndingsStepTests.ATTRIBUTES, "a.txt": "a\n" });
    fs.rmSync(path.join(repository.directory, "a.txt"));

    const result = await LineEndingsStepTests.createStep(repository).runAsync([]);

    Assert.isFalse(result.isSuccessful);
    Assert.areEqual("\"a.txt\" is tracked but not a file in the checkout; restore it, or remove it from git.", result.message);
  }

  @TestMethod
  public async rejectsWhenGitFailsOutsideACloneAsync(): Promise<void> {
    const directory = GitRepositoryFixture.createDirectory();
    try {
      const step = new LineEndingsStep(new Git(new ProcessRunner(), directory));

      const exception = await Assert.throwsAsync(() => step.runAsync([]), ProcessException);

      Assert.areEqual("git", exception.program);
    }
    finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  }

  private static createStep(repository: GitRepositoryFixture): LineEndingsStep {
    return new LineEndingsStep(new Git(new ProcessRunner(), repository.directory));
  }
}
