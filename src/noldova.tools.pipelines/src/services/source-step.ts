/**
 * @license
 * Copyright (c) Noldova.
 *
 * This source code is licensed under the license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { JsonReader } from "@noldova/context.json";

import type { IStep } from "../interfaces/i-step.js";
import { StepResult } from "../models/step-result.js";
import { Version } from "../models/version.js";
import { Resources } from "../resources.js";
import type { Git } from "./git.js";

export class SourceStep implements IStep {
  private readonly git: Git;

  public readonly name: string = Resources.sourceStepName;
  public readonly usage: string = Resources.sourceStepUsage;

  public constructor(git: Git) {
    this.git = git;
  }

  public async runAsync(values: readonly string[]): Promise<StepResult> {
    const [version, commit, ...rest] = values;
    if (version === undefined || commit === undefined || rest.length !== 0)
      return StepResult.failed(Resources.formatStepValuesInvalid(this.name, this.usage));

    const versionProblem = Version.validate(version);
    if (versionProblem !== null)
      return StepResult.failed(versionProblem);
    if (!Resources.commitPattern.test(commit))
      return StepResult.failed(Resources.formatCommitInvalid(commit));
    if (!await this.git.hasCommitAsync(commit))
      return StepResult.failed(Resources.formatCommitMissing(commit));
    if (!await this.git.hasCommitAsync(Resources.mainReference))
      return StepResult.failed(Resources.formatBranchMissing(Resources.mainBranch));
    if (!await this.git.isAncestorAsync(commit, Resources.mainReference))
      return StepResult.failed(Resources.formatCommitNotOnBranch(commit, Resources.mainBranch));
    if (!await this.git.hasFileAsync(commit, Resources.versionFilePath))
      return StepResult.failed(Resources.formatVersionFileMissing(commit, Resources.versionFilePath));

    const versionFile = JsonReader.parse(await this.git.readFileAsync(commit, Resources.versionFilePath), Resources.versionFilePath);
    const found = versionFile.readString(Resources.versionField);
    if (found !== version)
      return StepResult.failed(Resources.formatVersionDiffers(commit, Resources.versionFilePath, found, version));

    return StepResult.succeeded(Resources.formatSourceChecked(commit, Resources.mainBranch, Resources.versionFilePath, version));
  }
}
