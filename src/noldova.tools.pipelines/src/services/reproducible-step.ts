/**
 * @license
 * Copyright (c) Noldova.
 *
 * This source code is licensed under the license found in the
 * LICENSE file in the root directory of this source tree.
 */

import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import type { IStep } from "../interfaces/i-step.js";
import { StepResult } from "../models/step-result.js";
import { Resources } from "../resources.js";
import type { Git } from "./git.js";
import type { Npm } from "./npm.js";

export class ReproducibleStep implements IStep {
  private readonly git: Git;
  private readonly npm: Npm;
  private readonly temporaryRoot: string;

  public readonly name: string = Resources.reproducibleStepName;
  public readonly usage: string = Resources.reproducibleStepUsage;

  public constructor(git: Git, npm: Npm, temporaryRoot?: string) {
    this.git = git;
    this.npm = npm;
    this.temporaryRoot = temporaryRoot === undefined || temporaryRoot.length === 0 ? os.tmpdir() : temporaryRoot;
  }

  public async runAsync(values: readonly string[]): Promise<StepResult> {
    const [folder, ...rest] = values;
    if (folder === undefined || rest.length !== 0)
      return StepResult.failed(Resources.formatStepValuesInvalid(this.name, this.usage));

    const folderPath = path.join(this.git.workingDirectory, folder);
    const fromCheckout = path.relative(path.resolve(this.git.workingDirectory), path.resolve(folderPath));
    if (path.isAbsolute(folder) || fromCheckout.length === 0 || fromCheckout.split(path.sep)[0] === Resources.parentFolderName)
      return StepResult.failed(Resources.formatFolderOutsideCheckout(folder));
    if (fs.statSync(folderPath, { throwIfNoEntry: false })?.isDirectory() !== true)
      return StepResult.failed(Resources.formatFolderMissing(folder));

    const first = ReproducibleStep.readArchives(folderPath);
    if (first.size === 0)
      return StepResult.failed(Resources.formatArchivesMissing(folder));

    const commit = await this.git.readHeadAsync();
    const directory = fs.mkdtempSync(path.join(this.temporaryRoot, Resources.reproducibleFolderPrefix));
    try {
      await this.git.addWorktreeAsync(directory, commit);
      try {
        const build = await this.npm.buildAsync(directory);
        if (!build.isSuccessful)
          return StepResult.failed(Resources.formatSecondBuildFailed(build.exitCode, build.errorOutput));

        return ReproducibleStep.compare(commit, first, ReproducibleStep.readArchives(path.join(directory, folder)));
      }
      finally {
        await this.git.removeWorktreeAsync(directory);
      }
    }
    finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  }

  private static compare(commit: string, first: ReadonlyMap<string, string>, second: ReadonlyMap<string, string>): StepResult {
    const findings: string[] = [];
    for (const [name, integrity] of first) {
      const other = second.get(name);
      if (other === undefined)
        findings.push(Resources.formatArchiveOnlyInFirstBuild(name));
      else if (other !== integrity)
        findings.push(Resources.formatArchiveDiffers(name, integrity, other));
    }
    for (const name of second.keys()) {
      if (!first.has(name))
        findings.push(Resources.formatArchiveOnlyInSecondBuild(name));
    }

    if (findings.length > 0)
      return StepResult.failed(Resources.formatBuildsDiffer(findings));

    return StepResult.succeeded(Resources.formatBuildsIdentical(commit, [...first].map(([name, integrity]) => Resources.formatArchiveIntegrity(name, integrity))));
  }

  private static readArchives(folderPath: string): ReadonlyMap<string, string> {
    const archives = new Map<string, string>();
    if (fs.statSync(folderPath, { throwIfNoEntry: false })?.isDirectory() !== true)
      return archives;

    for (const name of fs.readdirSync(folderPath).filter(t => t.endsWith(Resources.archiveFileExtension)).sort()) {
      const digest = crypto.createHash(Resources.integrityAlgorithm).update(fs.readFileSync(path.join(folderPath, name))).digest(Resources.integrityEncoding);
      archives.set(name, `${Resources.integrityPrefix}${digest}`);
    }

    return archives;
  }
}
