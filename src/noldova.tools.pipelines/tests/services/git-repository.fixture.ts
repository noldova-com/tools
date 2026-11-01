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

export class GitRepositoryFixture implements Disposable {
  private static readonly DIRECTORY_PREFIX: string = "tools-pipelines-";
  private static readonly MAIN_REFERENCE: string = "refs/remotes/origin/main";
  private static readonly PROGRAM: string = "git";
  private static readonly STAGING_FOLDER: string = ".staging";
  private static readonly TAR_PROGRAM: string = "tar";
  private static readonly TEXT_ENCODING: BufferEncoding = "utf8";

  public readonly directory: string;

  private constructor(directory: string) {
    this.directory = directory;
  }

  public static create(): GitRepositoryFixture {
    const fixture = new GitRepositoryFixture(GitRepositoryFixture.createDirectory());
    fixture.run("init", "--quiet", "--initial-branch=main");
    fixture.run("config", "user.name", "Pipelines Tests");
    fixture.run("config", "user.email", "pipelines-tests@example.com");
    fixture.run("config", "commit.gpgsign", "false");
    fixture.run("config", "core.autocrlf", "false");

    return fixture;
  }

  public static createDirectory(): string {
    return fs.mkdtempSync(path.join(os.tmpdir(), GitRepositoryFixture.DIRECTORY_PREFIX));
  }

  public commit(files: Readonly<Record<string, string>>): string {
    for (const [filePath, content] of Object.entries(files)) {
      fs.mkdirSync(path.dirname(path.join(this.directory, filePath)), { recursive: true });
      fs.writeFileSync(path.join(this.directory, filePath), content);
    }

    this.run("add", "--all");
    this.run("commit", "--quiet", "--no-verify", "--allow-empty", "--message", "Commit");

    return this.readHead();
  }

  public readHead(): string {
    return this.run("rev-parse", "HEAD").trim();
  }

  public pack(archivePath: string, files: Readonly<Record<string, string>>): string {
    const stagingPath = path.join(this.directory, GitRepositoryFixture.STAGING_FOLDER);
    for (const [filePath, content] of Object.entries(files)) {
      fs.mkdirSync(path.dirname(path.join(stagingPath, filePath)), { recursive: true });
      fs.writeFileSync(path.join(stagingPath, filePath), content);
    }

    fs.mkdirSync(path.dirname(path.join(this.directory, archivePath)), { recursive: true });
    execFileSync(GitRepositoryFixture.TAR_PROGRAM, ["-czf", archivePath, "-C", GitRepositoryFixture.STAGING_FOLDER, ...fs.readdirSync(stagingPath)], { cwd: this.directory });
    fs.rmSync(stagingPath, { recursive: true, force: true });

    return path.join(this.directory, archivePath);
  }

  public setMain(commit: string): void {
    this.run("update-ref", GitRepositoryFixture.MAIN_REFERENCE, commit);
  }

  public [Symbol.dispose](): void {
    fs.rmSync(this.directory, { recursive: true, force: true });
  }

  private run(...values: string[]): string {
    return execFileSync(GitRepositoryFixture.PROGRAM, values, { cwd: this.directory, encoding: GitRepositoryFixture.TEXT_ENCODING });
  }
}
