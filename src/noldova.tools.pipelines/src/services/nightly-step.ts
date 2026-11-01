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
import type { ArchiveStep } from "./archive-step.js";
import type { Git } from "./git.js";
import { Npm } from "./npm.js";

export class NightlyStep implements IStep {
  private readonly git: Git;
  private readonly archiveStep: ArchiveStep;
  private readonly npm: Npm;
  private readonly readNow: () => Date;

  public readonly name: string = Resources.nightlyStepName;
  public readonly usage: string = Resources.nightlyStepUsage;

  public constructor(git: Git, archiveStep: ArchiveStep, npm: Npm, readNow: () => Date = () => new Date()) {
    this.git = git;
    this.archiveStep = archiveStep;
    this.npm = npm;
    this.readNow = readNow;
  }

  public async runAsync(values: readonly string[]): Promise<StepResult> {
    const [commit, registry, ...rest] = values;
    if (commit === undefined || registry === undefined || rest.length !== 0)
      return StepResult.failed(Resources.formatStepValuesInvalid(this.name, this.usage));
    if (!Resources.commitPattern.test(commit))
      return StepResult.failed(Resources.formatCommitInvalid(commit));
    if (!Npm.isRegistry(registry))
      return StepResult.failed(Resources.formatRegistryInvalid());
    if (!await this.git.hasCommitAsync(commit))
      return StepResult.failed(Resources.formatCommitMissing(commit));
    if (!await this.git.hasCommitAsync(Resources.mainReference))
      return StepResult.failed(Resources.formatBranchMissing(Resources.mainBranch));
    if (!await this.git.isAncestorAsync(commit, Resources.mainReference))
      return StepResult.failed(Resources.formatCommitNotOnBranch(commit, Resources.mainBranch));
    if (!await this.git.hasFileAsync(commit, Resources.versionFilePath))
      return StepResult.failed(Resources.formatVersionFileMissing(commit, Resources.versionFilePath));

    const found = JsonReader.parse(await this.git.readFileAsync(commit, Resources.versionFilePath), Resources.versionFilePath).readString(Resources.versionField);
    const versionProblem = Version.validate(found);
    if (versionProblem !== null)
      return StepResult.failed(versionProblem);

    const release = Version.parse(found);
    if (release.nightlyDate !== null)
      return StepResult.failed(Resources.formatVersionNotRelease(commit, Resources.versionFilePath, found));

    const packageNames = await this.archiveStep.readPackageNamesAsync(commit);
    if (packageNames.length === 0)
      return StepResult.failed(Resources.formatPackagesMissing(commit, Resources.packagesFolderPath));

    const today = Resources.formatNightlyDate(this.readNow());
    const findings: string[] = [];
    const unchanged: string[] = [];
    const publishedToday: string[] = [];
    for (const packageName of packageNames) {
      const nightly = await this.npm.readFieldOrEmptyAsync(packageName, Resources.formatDistTagField(Resources.nightlyTag), registry);
      if (nightly instanceof StepResult)
        findings.push(nightly.message);
      else if (nightly.length > 0 && Version.validate(nightly) !== null)
        findings.push(Resources.formatTaggedInvalid(packageName, Resources.nightlyTag, nightly));
      else if (nightly.length > 0) {
        const specifier = Resources.formatSpecifier(packageName, nightly);
        const gitHead = await this.npm.readFieldOrEmptyAsync(specifier, Resources.gitHeadField, registry);
        if (gitHead instanceof StepResult)
          findings.push(gitHead.message);
        else if (gitHead === commit)
          unchanged.push(packageName);
        if (Version.parse(nightly).nightlyDate === today)
          publishedToday.push(specifier);
      }
    }

    if (findings.length > 0)
      return StepResult.failed(findings.join(Resources.lineSeparator));
    if (unchanged.length === packageNames.length || publishedToday.length === packageNames.length)
      return StepResult.succeeded("");
    if (publishedToday.length > 0)
      return StepResult.failed(Resources.formatNightlyPartlyPublished(publishedToday, today));

    return StepResult.succeeded(new Version(release.major, release.minor, release.patch + 1, today).toString());
  }
}
