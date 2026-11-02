/**
 * @license
 * Copyright (c) Noldova.
 *
 * This source code is licensed under the license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export class GitCloneFixture implements Disposable {
  private static readonly DIRECTORY_PREFIX: string = "tools-pipelines-github-";
  private static readonly PROGRAM: string = "git";
  private static readonly TEXT_ENCODING: BufferEncoding = "utf8";

  public readonly directory: string;
  public readonly commit: string;

  private constructor(directory: string, commit: string) {
    this.directory = directory;
    this.commit = commit;
  }

  public static create(files: Readonly<Record<string, string>>): GitCloneFixture {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), GitCloneFixture.DIRECTORY_PREFIX));
    for (const [filePath, content] of Object.entries(files)) {
      fs.mkdirSync(path.dirname(path.join(directory, filePath)), { recursive: true });
      fs.writeFileSync(path.join(directory, filePath), content);
    }

    GitCloneFixture.run(directory, "init", "--quiet", "--initial-branch=main");
    GitCloneFixture.run(directory, "add", "--all");
    GitCloneFixture.run(directory, "-c", "user.name=Pipelines Tests", "-c", "user.email=pipelines-tests@example.com", "-c", "commit.gpgsign=false", "commit", "--quiet", "--no-verify", "--message", "Commit");

    return new GitCloneFixture(directory, GitCloneFixture.run(directory, "rev-parse", "HEAD").trim());
  }

  public [Symbol.dispose](): void {
    fs.rmSync(this.directory, { recursive: true, force: true });
  }

  private static run(directory: string, ...values: readonly string[]): string {
    return execFileSync(GitCloneFixture.PROGRAM, values, { cwd: directory, encoding: GitCloneFixture.TEXT_ENCODING });
  }
}
