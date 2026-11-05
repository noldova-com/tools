/**
 * @license
 * Copyright (c) Noldova.
 *
 * This source code is licensed under the license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import { type IStepOutput, type IUpdateHost, StepResult } from "@noldova/tools.pipelines";

import type { GitRepositoryFixture } from "./git-repository.fixture.js";

export class FakeUpdateHost implements IUpdateHost {
  public readonly credentialVariables: readonly string[] = ["SECRET_TOKEN"];
  public readonly branches: Map<string, readonly [string, string]> = new Map();
  public readonly thrown: Map<string, unknown> = new Map();
  public readonly repositories: Map<string, GitRepositoryFixture> = new Map();
  public readonly failures: Map<string, StepResult> = new Map();
  public readonly pushed: Map<string, Readonly<Record<string, string>>> = new Map();
  public readonly proposals: string[] = [];
  public readonly events: string[] = [];
  public source: string | StepResult = "source";
  public listed: StepResult | null = null;
  public notes: string | StepResult = "## Release notes for 0.0.4\n\n- Adds a thing.";

  public readSourceName(): string | StepResult {
    return this.source;
  }

  public async listRepositoriesAsync(): Promise<readonly string[] | StepResult> {
    return this.listed ?? [...this.repositories.keys()];
  }

  public async readReleaseNotesAsync(): Promise<string | StepResult> {
    return this.notes;
  }

  public async checkOutAsync(repository: string, directory: string): Promise<StepResult | null> {
    this.events.push(`check out ${repository}`);
    const failure = this.failures.get(`checkOut ${repository}`);
    if (failure !== undefined)
      return failure;

    execFileSync("git", ["-c", "core.autocrlf=false", "clone", "--quiet", "--", this.repositories.get(repository)?.directory ?? "", directory]);
    execFileSync("git", ["config", "user.name", "Pipelines Tests"], { cwd: directory });
    execFileSync("git", ["config", "user.email", "pipelines-tests@example.com"], { cwd: directory });
    execFileSync("git", ["config", "commit.gpgsign", "false"], { cwd: directory });

    return null;
  }

  public async fetchBranchAsync(repository: string, directory: string): Promise<string | null | StepResult> {
    if (this.thrown.has(repository))
      throw this.thrown.get(repository);
    const failure = this.failures.get(`fetch ${repository}`);
    if (failure !== undefined)
      return failure;

    const branch = this.branches.get(repository);
    if (branch === undefined)
      return null;

    const [committer, subject] = branch;
    const tree = execFileSync("git", ["rev-parse", "HEAD~1^{tree}"], { cwd: directory, encoding: "utf8" }).trim();

    return execFileSync("git", ["commit-tree", tree, "-p", "HEAD~1", "-m", subject], { cwd: directory, encoding: "utf8", env: { ...process.env, GIT_COMMITTER_EMAIL: committer } }).trim();
  }

  public async pushAsync(repository: string, directory: string, branch: string, replaced: string | null): Promise<StepResult | null> {
    const failure = this.failures.get(`push ${repository}`);
    if (failure !== undefined)
      return failure;

    const files: Record<string, string> = { branch, replaced: String(replaced), message: execFileSync("git", ["log", "-1", "--format=%s"], { cwd: directory, encoding: "utf8" }).trim() };
    for (const filePath of execFileSync("git", ["ls-files"], { cwd: directory, encoding: "utf8" }).split("\n").filter(t => t.length > 0))
      files[filePath] = fs.readFileSync(path.join(directory, filePath), "utf8");
    this.pushed.set(repository, files);

    return null;
  }

  public async proposeAsync(repository: string, branch: string, title: string, body: string, summary: string): Promise<string | StepResult> {
    const failure = this.failures.get(`propose ${repository}`);
    if (failure !== undefined)
      return failure;

    this.proposals.push([repository, branch, title, summary, body].join("\n---\n"));

    return `https://example.test/${repository}/pull/1`;
  }
}

export class RecordingOutput implements IStepOutput {
  public readonly lines: string[];

  public constructor(lines: string[]) {
    this.lines = lines;
  }

  public writeProgress(message: string): void {
    this.lines.push(`progress: ${message}`);
  }

  public writeProgressStart(message: string): void {
    this.lines.push(`progress start: ${message}`);
  }

  public writeSuccess(message: string): void {
    this.lines.push(`success: ${message}`);
  }

  public writeFailure(message: string): void {
    this.lines.push(`failure: ${message}`);
  }
}
