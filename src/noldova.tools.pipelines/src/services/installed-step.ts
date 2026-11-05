/**
 * @license
 * Copyright (c) Noldova.
 *
 * This source code is licensed under the license found in the
 * LICENSE file in the root directory of this source tree.
 */

import fs from "node:fs";
import path from "node:path";

import { JsonReader, type JsonObject, type JsonValue } from "@noldova/context.json";

import { PipelineException } from "../exceptions/pipeline.exception.js";
import type { IStep } from "../interfaces/i-step.js";
import type { IStepOutput } from "../interfaces/i-step-output.js";
import { BuildConfig } from "../models/build-config.js";
import { StepResult } from "../models/step-result.js";
import { Resources } from "../resources.js";

export class InstalledStep implements IStep {
  private readonly workingDirectory: string;
  private readonly output: IStepOutput;

  public readonly name: string = Resources.installedStepName;
  public readonly usage: string = Resources.installedStepUsage;

  public constructor(workingDirectory: string, output: IStepOutput) {
    this.workingDirectory = workingDirectory;
    this.output = output;
  }

  public async runAsync(values: readonly string[]): Promise<StepResult> {
    const [folder = Resources.currentFolder, ...rest] = values;
    if (rest.length !== 0 || folder.length === 0 || folder.startsWith(Resources.optionPrefix))
      return StepResult.failed(Resources.formatStepValuesInvalid(this.name, this.usage));

    try {
      const directory = path.resolve(this.workingDirectory, folder);
      const ownNames = new Set(InstalledStep.hasFile(path.join(directory, Resources.buildConfigFilePath)) ? BuildConfig.read(directory).packageNames : []);
      const lockFilePath = path.posix.join(folder, Resources.lockFilePath);
      const locked = InstalledStep.readPackages(directory, Resources.lockFilePath);
      if (locked === null)
        return StepResult.failed(Resources.formatLockFileMissing(lockFilePath));

      const installed = InstalledStep.readPackages(directory, Resources.installedLockFilePath);
      if (installed === null)
        return this.differ(Resources.formatPackagesNotInstalled(path.posix.join(folder, Resources.nodeModulesFolder)));

      const differences = InstalledStep.compare(locked, installed, ownNames);

      return differences.length === 0 ? StepResult.succeeded("") : this.differ(Resources.formatInstalledDiffers(lockFilePath, differences, Resources.formatCleanInstallCommand(folder)));
    }
    catch (error) {
      if (error instanceof PipelineException)
        return StepResult.failed(error.message);

      throw error;
    }
  }

  private differ(message: string): StepResult {
    this.output.writeProgress(message);

    return StepResult.failed("");
  }

  private static hasFile(fullPath: string): boolean {
    return fs.statSync(fullPath, { throwIfNoEntry: false })?.isFile() === true;
  }

  private static readPackages(directory: string, filePath: string): JsonObject | null {
    const fullPath = path.join(directory, filePath);
    if (!InstalledStep.hasFile(fullPath))
      return null;

    return JsonReader.parse(fs.readFileSync(fullPath, Resources.textEncoding), filePath).readObject(Resources.packagesField).toJson();
  }

  private static compare(locked: JsonObject, installed: JsonObject, ownNames: ReadonlySet<string>): readonly string[] {
    const differences: string[] = [];
    for (const [entryPath, entry] of Object.entries(locked)) {
      if (entryPath.length === 0 || ownNames.has(InstalledStep.readPackageName(entryPath)))
        continue;

      const found = installed[entryPath];
      if (found === undefined) {
        if (InstalledStep.readField(entry, Resources.optionalField) !== true)
          differences.push(entryPath);
      }
      else if (Resources.installedComparedFields.some(t => InstalledStep.readField(entry, t) !== InstalledStep.readField(found, t)))
        differences.push(entryPath);
    }

    for (const entryPath of Object.keys(installed)) {
      if (!(entryPath in locked) && !ownNames.has(InstalledStep.readPackageName(entryPath)))
        differences.push(entryPath);
    }

    return differences;
  }

  private static readPackageName(entryPath: string): string {
    const index = entryPath.lastIndexOf(Resources.nodeModulesPathPrefix);

    return index < 0 ? entryPath : entryPath.slice(index + Resources.nodeModulesPathPrefix.length);
  }

  private static readField(entry: JsonValue, field: string): JsonValue | undefined {
    return entry !== null && typeof entry === "object" && !Array.isArray(entry) ? (entry as JsonObject)[field] : undefined;
  }
}
