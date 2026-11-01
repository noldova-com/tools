/**
 * @license
 * Copyright (c) Noldova.
 *
 * This source code is licensed under the license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { Assert, TestClass, TestMethod } from "@noldova/context.testing";

class PipelinesRun {
  public readonly exitCode: number | null;
  public readonly standardOutput: string;
  public readonly standardError: string;

  public constructor(exitCode: number | null, standardOutput: string, standardError: string) {
    this.exitCode = exitCode;
    this.standardOutput = standardOutput;
    this.standardError = standardError;
  }
}

@TestClass
export class PipelinesBinTests {
  private static readonly BIN_PATH: string = fileURLToPath(import.meta.resolve("@noldova/tools.pipelines.github/bin/pipelines.js"));
  private static readonly DIRECTORY_PREFIX: string = "tools-pipelines-github-";

  @TestMethod
  public writesTheUsageAsAnErrorAnnotationWithoutAStep(): void {
    using directory = PipelinesBinTests.createDirectory();

    const run = PipelinesBinTests.run(directory.path, []);

    Assert.areEqual(1, run.exitCode);
    Assert.areEqual("", run.standardOutput);
    Assert.areEqual(
      "::error::Usage: pipelines source <version> <commit> | archive <folder> <version> <commit> <scope> | publish <folder> <version> <commit> <scope> <registry> <access> | nightly <commit> <registry>\n",
      run.standardError);
  }

  @TestMethod
  public runsAStepInTheCurrentDirectory(): void {
    using directory = PipelinesBinTests.createDirectory();
    PipelinesBinTests.git(directory.path, "init", "--quiet", "--initial-branch=main");
    fs.writeFileSync(path.join(directory.path, "version.json"), "{ \"version\": \"0.0.4\" }\n");
    PipelinesBinTests.git(directory.path, "add", "--all");
    PipelinesBinTests.git(directory.path, "-c", "user.name=Pipelines Tests", "-c", "user.email=pipelines-tests@example.com", "-c", "commit.gpgsign=false", "commit", "--quiet", "--no-verify", "--message", "Commit");
    const commit = PipelinesBinTests.git(directory.path, "rev-parse", "HEAD").trim();
    PipelinesBinTests.git(directory.path, "update-ref", "refs/remotes/origin/main", commit);

    const run = PipelinesBinTests.run(directory.path, ["source", "0.0.4", commit]);

    Assert.areEqual(0, run.exitCode);
    Assert.areEqual(`Commit ${commit} is on origin/main, and its version.json holds 0.0.4.\n`, run.standardOutput);
    Assert.areEqual("", run.standardError);
  }

  @TestMethod
  public endsAFaultWithItsStackTrace(): void {
    using directory = PipelinesBinTests.createDirectory();

    const run = PipelinesBinTests.run(directory.path, ["source", "0.0.4", "225059f4c1e6a3b2d8f7e9a0b1c2d3e4f5a6b7c8"], { PATH: "" });

    Assert.areEqual(1, run.exitCode);
    Assert.areEqual("", run.standardOutput);
    Assert.isTrue(run.standardError.includes("ProcessException"), run.standardError);
    Assert.isTrue(run.standardError.includes("    at "), run.standardError);
    Assert.isFalse(run.standardError.includes("::error::"), run.standardError);
  }

  private static createDirectory(): { readonly path: string } & Disposable {
    const directoryPath = fs.mkdtempSync(path.join(os.tmpdir(), PipelinesBinTests.DIRECTORY_PREFIX));

    return { path: directoryPath, [Symbol.dispose]: () => fs.rmSync(directoryPath, { recursive: true, force: true }) };
  }

  private static git(directory: string, ...values: string[]): string {
    return execFileSync("git", values, { cwd: directory, encoding: "utf8" });
  }

  private static run(directory: string, values: readonly string[], environment: Readonly<Record<string, string>> = {}): PipelinesRun {
    const result = spawnSync(process.execPath, [PipelinesBinTests.BIN_PATH, ...values], { cwd: directory, encoding: "utf8", env: { ...process.env, ...environment } });

    return new PipelinesRun(result.status, result.stdout, result.stderr);
  }
}
