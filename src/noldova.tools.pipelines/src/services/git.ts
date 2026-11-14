/**
 * @license
 * Copyright (c) Noldova.
 *
 * This source code is licensed under the license found in the
 * LICENSE file in the root directory of this source tree.
 */

import fs from "node:fs";
import path from "node:path";

import { ProcessException } from "../exceptions/process.exception.js";
import type { ProcessResult } from "../models/process-result.js";
import { TrackedFile } from "../models/tracked-file.js";
import { Resources } from "../resources.js";
import type { ProcessRunner } from "./process-runner.js";

export class Git {
  private readonly processRunner: ProcessRunner;

  public readonly workingDirectory: string;

  public constructor(processRunner: ProcessRunner, workingDirectory: string) {
    this.processRunner = processRunner;
    this.workingDirectory = workingDirectory;
  }

  public async addWorktreeAsync(directory: string, commit: string): Promise<void> {
    await this.readAsync([...Resources.gitAddWorktreeValues, directory, commit]);
  }

  public async removeWorktreeAsync(directory: string): Promise<void> {
    await this.readAsync([...Resources.gitRemoveWorktreeValues, directory]);
  }

  public async commitAllAsync(message: string): Promise<void> {
    await this.readAsync([...Resources.gitCommitAllValues, message]);
  }

  public async hasCommitAsync(revision: string): Promise<boolean> {
    return await this.verifyAsync(Resources.formatGitCommitRevision(revision));
  }

  public async hasFileAsync(commit: string, filePath: string): Promise<boolean> {
    const revision = Resources.formatGitFileRevision(commit, filePath);

    return await this.verifyAsync(revision) && (await this.readAsync([...Resources.gitReadTypeValues, revision])).trim() === Resources.gitFileType;
  }

  public async isAncestorAsync(commit: string, descendant: string): Promise<boolean> {
    return await this.testAsync([...Resources.gitIsAncestorValues, commit, descendant]);
  }

  public async listFilesAsync(commit: string, folderPath: string): Promise<readonly string[]> {
    const output = await this.readAsync([...Resources.gitListFilesValues, commit, folderPath]);

    return output.split(Resources.gitFileSeparator).filter(t => t.length > 0);
  }

  public async listChangesAsync(): Promise<readonly string[]> {
    const output = await this.readAsync(Resources.gitListChangesValues);

    return output.split(Resources.lineSeparator).filter(t => t.length > 0);
  }

  public async listTrackedFilesAsync(): Promise<readonly TrackedFile[]> {
    const output = await this.readAsync(Resources.gitListTrackedFilesValues);

    return output.split(Resources.gitFileSeparator).filter(t => t.length > 0).map(t => Git.readTrackedFile(t));
  }

  public async readCheckoutFileEndAsync(filePath: string, byteCount: number): Promise<Buffer | null> {
    const fullPath = path.join(this.workingDirectory, filePath);
    if (fs.statSync(fullPath, { throwIfNoEntry: false })?.isFile() !== true)
      return null;

    const file = await fs.promises.open(fullPath);
    try {
      const { size } = await file.stat();
      const length = Math.min(size, byteCount);
      const { buffer } = await file.read(Buffer.alloc(length), 0, length, size - length);

      return buffer;
    }
    finally {
      await file.close();
    }
  }

  public async readFileAsync(commit: string, filePath: string): Promise<string> {
    return await this.readAsync([...Resources.gitReadFileValues, Resources.formatGitFileRevision(commit, filePath)]);
  }

  public async readHeadAsync(): Promise<string> {
    return (await this.readAsync([...Resources.gitReadHeadValues, Resources.gitHeadRevision])).trim();
  }

  public async readPrefixAsync(): Promise<string> {
    return (await this.readAsync(Resources.gitReadPrefixValues)).trim();
  }

  public async readCommitterAsync(revision: string): Promise<string> {
    return (await this.readAsync([...Resources.gitReadCommitterValues, revision])).trim();
  }

  public async readSubjectAsync(revision: string): Promise<string> {
    return (await this.readAsync([...Resources.gitReadSubjectValues, revision])).trim();
  }

  private async readAsync(values: readonly string[]): Promise<string> {
    const result = await this.runAsync(values);
    if (!result.isSuccessful)
      throw Git.failed(values, result);

    return result.output;
  }

  private async verifyAsync(revision: string): Promise<boolean> {
    return await this.testAsync([...Resources.gitVerifyValues, revision]);
  }

  private async testAsync(values: readonly string[]): Promise<boolean> {
    const result = await this.runAsync(values);
    if (!result.isSuccessful && result.exitCode !== Resources.gitNotFoundExitCode)
      throw Git.failed(values, result);

    return result.isSuccessful;
  }

  private async runAsync(values: readonly string[]): Promise<ProcessResult> {
    return await this.processRunner.runAsync(Resources.gitProgram, values, this.workingDirectory);
  }

  private static readTrackedFile(entry: string): TrackedFile {
    const infoStart = entry.indexOf(Resources.gitEntrySeparator) + Resources.gitEntrySeparator.length;
    const pathStart = entry.indexOf(Resources.gitEntrySeparator, infoStart) + Resources.gitEntrySeparator.length;
    const [mode] = entry.slice(0, infoStart).split(Resources.gitModeSeparator);
    const [indexInfo = "", ...otherInfo] = entry.slice(infoStart, pathStart).trim().split(Resources.gitLineEndingsSeparator);
    const lineEndings = indexInfo.slice(Resources.gitLineEndingsPrefix.length);
    const isText = mode !== Resources.gitSymbolicLinkMode && lineEndings.length > 0 && lineEndings !== Resources.gitNotTextLineEndings && !otherInfo.includes(Resources.gitNotTextAttribute);

    return new TrackedFile(entry.slice(pathStart), lineEndings, isText);
  }

  private static failed(values: readonly string[], result: ProcessResult): ProcessException {
    const command = [Resources.gitProgram, ...values].join(Resources.valueSeparator);

    return new ProcessException(Resources.gitProgram, Resources.formatProcessFailed(command, result.exitCode, result.errorOutput));
  }
}
