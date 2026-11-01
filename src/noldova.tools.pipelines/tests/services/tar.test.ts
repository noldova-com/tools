/**
 * @license
 * Copyright (c) Noldova.
 *
 * This source code is licensed under the license found in the
 * LICENSE file in the root directory of this source tree.
 */

import fs from "node:fs";
import path from "node:path";

import { Assert, TestClass, TestMethod } from "@noldova/context.testing";
import { ProcessException, ProcessRunner, Tar } from "@noldova/tools.pipelines";

import { GitRepositoryFixture } from "./git-repository.fixture.js";

@TestClass
export class TarTests {
  @TestMethod
  public async readsAFileFromAnArchiveAsync(): Promise<void> {
    using repository = GitRepositoryFixture.create();
    const archivePath = repository.pack("archives/example-0.0.4.tgz", { "package/package.json": "{ \"name\": \"example\" }", "package/README.md": "# Example" });

    const result = await new Tar(new ProcessRunner()).readFileAsync(archivePath, "package/package.json");

    Assert.isTrue(result.isSuccessful);
    Assert.areEqual("{ \"name\": \"example\" }", result.output);
  }

  @TestMethod
  public async failsForAFileTheArchiveDoesNotHoldAsync(): Promise<void> {
    using repository = GitRepositoryFixture.create();
    const archivePath = repository.pack("archives/example-0.0.4.tgz", { "package/README.md": "# Example" });

    const result = await new Tar(new ProcessRunner()).readFileAsync(archivePath, "package/package.json");

    Assert.isFalse(result.isSuccessful);
    Assert.isTrue(result.errorOutput.includes("package/package.json"), result.errorOutput);
  }

  @TestMethod
  public async failsForAFileThatIsNotAnArchiveAsync(): Promise<void> {
    using repository = GitRepositoryFixture.create();
    const archivePath = path.join(repository.directory, "example-0.0.4.tgz");
    fs.writeFileSync(archivePath, "not an archive");

    const result = await new Tar(new ProcessRunner()).readFileAsync(archivePath, "package/package.json");

    Assert.isFalse(result.isSuccessful);
    Assert.isTrue(result.errorOutput.trim().length > 0);
  }

  @TestMethod
  public async rejectsWhenTheArchivesFolderDoesNotExistAsync(): Promise<void> {
    const exception = await Assert.throwsAsync(() => new Tar(new ProcessRunner()).readFileAsync("tools-pipelines-missing-directory/example-0.0.4.tgz", "package/package.json"), ProcessException);

    Assert.areEqual("tar", exception.program);
  }
}
