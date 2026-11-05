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
import { BuildConfig } from "../models/build-config.js";
import { StepResult } from "../models/step-result.js";
import { Resources } from "../resources.js";

export class InstalledStep implements IStep {
  private readonly workingDirectory: string;

  public readonly name: string = Resources.installedStepName;
  public readonly usage: string = Resources.installedStepUsage;

  public constructor(workingDirectory: string) {
    this.workingDirectory = workingDirectory;
  }

  public async runAsync(values: readonly string[]): Promise<StepResult> {
    if (values.length !== 0)
      return StepResult.failed(Resources.formatStepValuesInvalid(this.name, this.usage));

    try {
      const ownNames = new Set(BuildConfig.read(this.workingDirectory).packageNames);
      const locked = this.readPackages(Resources.lockFilePath);
      if (locked === null)
        return StepResult.failed(Resources.lockFileMissing);

      const installed = this.readPackages(Resources.installedLockFilePath);
      if (installed === null)
        return StepResult.failed(Resources.packagesNotInstalled);

      const differences = InstalledStep.compare(locked, installed, ownNames);

      return differences.length === 0 ? StepResult.succeeded("") : StepResult.failed(Resources.formatInstalledDiffers(differences));
    }
    catch (error) {
      if (error instanceof PipelineException)
        return StepResult.failed(error.message);

      throw error;
    }
  }

  private readPackages(filePath: string): JsonObject | null {
    const fullPath = path.join(this.workingDirectory, filePath);
    if (fs.statSync(fullPath, { throwIfNoEntry: false })?.isFile() !== true)
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
