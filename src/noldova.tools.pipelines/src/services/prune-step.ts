/**
 * @license
 * Copyright (c) Noldova.
 *
 * This source code is licensed under the license found in the
 * LICENSE file in the root directory of this source tree.
 */

import type { IRegistryHost } from "../interfaces/i-registry-host.js";
import type { IStep } from "../interfaces/i-step.js";
import { HandledFailure } from "../models/handled-failure.js";
import { StepResult } from "../models/step-result.js";
import { Version } from "../models/version.js";
import { Resources } from "../resources.js";
import type { ArchiveStep } from "./archive-step.js";
import type { Git } from "./git.js";
import { Npm } from "./npm.js";

export class PruneStep implements IStep {
  private readonly git: Git;
  private readonly archiveStep: ArchiveStep;
  private readonly registryHost: IRegistryHost;

  public readonly name: string = Resources.pruneStepName;
  public readonly usage: string = Resources.pruneStepUsage;

  public constructor(git: Git, archiveStep: ArchiveStep, registryHost: IRegistryHost) {
    this.git = git;
    this.archiveStep = archiveStep;
    this.registryHost = registryHost;
  }

  public async runAsync(values: readonly string[]): Promise<StepResult> {
    const [version, commit, scope, registry, keepText, ...rest] = values;
    if (version === undefined || commit === undefined || scope === undefined || registry === undefined || keepText === undefined || rest.length !== 0)
      return StepResult.failed(Resources.formatStepValuesInvalid(this.name, this.usage));

    const versionProblem = Version.validate(version);
    if (versionProblem !== null)
      return StepResult.failed(versionProblem);

    const release = Version.parse(version);
    if (release.nightlyDate !== null)
      return StepResult.failed(Resources.formatPruneVersionNotRelease(version));
    if (!Resources.commitPattern.test(commit))
      return StepResult.failed(Resources.formatCommitInvalid(commit));
    if (!Resources.scopePattern.test(scope))
      return StepResult.failed(Resources.formatScopeInvalid(scope));
    if (!Npm.isRegistry(registry))
      return StepResult.failed(Resources.formatRegistryInvalid());
    if (new URL(registry).hostname === Resources.npmRegistryHostName)
      return StepResult.failed(Resources.formatPruneRegistryNpm(registry));
    if (new URL(registry).href !== new URL(this.registryHost.registry).href)
      return StepResult.failed(Resources.formatPruneRegistryUnsupported(registry, this.registryHost.registry));

    const keepVersions = Number(keepText);
    if (!Resources.keepVersionsPattern.test(keepText) || !Number.isSafeInteger(keepVersions))
      return StepResult.failed(Resources.formatKeepVersionsInvalid(keepText));
    if (!await this.git.hasCommitAsync(commit))
      return StepResult.failed(Resources.formatCommitMissing(commit));

    const packageNames = await this.archiveStep.readPackageNamesAsync(commit);
    if (packageNames.length === 0)
      return StepResult.failed(Resources.formatPackagesMissing(commit, Resources.packagesFolderPath));

    const outside = packageNames.filter(t => !t.startsWith(Resources.formatScopeNamePrefix(scope)));
    if (outside.length > 0)
      return StepResult.failed(outside.map(t => Resources.formatPackageOutsideScope(t, scope)).join(Resources.lineSeparator));

    const findings: string[] = [];
    const deletions: (readonly [packageName: string, version: string])[] = [];
    for (const packageName of packageNames) {
      const found = await this.registryHost.readVersionsAsync(packageName);
      if (found instanceof StepResult) {
        findings.push(found.message);
        continue;
      }

      const releases = PruneStep.sortReleases(found);
      const newest = releases[0];
      if (newest === undefined || !newest.equals(release)) {
        findings.push(Resources.formatPruneNotNewest(packageName, version, newest?.toString() ?? null));
        continue;
      }

      deletions.push(...releases.slice(keepVersions).map(t => [packageName, t.toString()] as const));
    }

    if (findings.length > 0)
      return StepResult.failed(findings.join(Resources.lineSeparator));
    if (deletions.length === 0)
      return StepResult.succeeded(Resources.formatPruneNothing(keepVersions));

    const lockFiles = await this.registryHost.readLockFilesAsync();
    if (lockFiles instanceof StepResult)
      return StepResult.failed(Resources.formatPruneLocksUnread(lockFiles.message));

    const locked = PruneStep.findLocked(lockFiles, packageNames);
    if (locked instanceof StepResult)
      return locked;

    const lines: string[] = [];
    for (const [packageName, old] of deletions) {
      const specifier = Resources.formatSpecifier(packageName, old);
      const lockFilePaths = locked.get(specifier);
      if (lockFilePaths !== undefined) {
        lines.push(Resources.formatVersionKept(specifier, lockFilePaths));
        continue;
      }

      const deleted = await this.deleteVersionAsync(packageName, old);
      if (deleted instanceof StepResult)
        return StepResult.failed([...lines, deleted.message].join(Resources.lineSeparator));

      lines.push(deleted ? Resources.formatVersionDeleted(specifier) : Resources.formatVersionAlreadyDeleted(specifier));
    }

    return StepResult.succeeded(lines.join(Resources.lineSeparator));
  }

  private async deleteVersionAsync(packageName: string, version: string): Promise<boolean | StepResult> {
    try {
      return await this.registryHost.deleteVersionAsync(packageName, version);
    }
    catch (error: unknown) {
      if (!HandledFailure.isHandled(error))
        throw error;

      return StepResult.failed(Resources.formatPruneDeleteRejected(Resources.formatSpecifier(packageName, version), error.message));
    }
  }

  private static findLocked(lockFiles: ReadonlyMap<string, string>, packageNames: readonly string[]): ReadonlyMap<string, readonly string[]> | StepResult {
    const locked = new Map<string, string[]>();
    for (const [filePath, text] of lockFiles) {
      const packages = PruneStep.readLockedPackages(text);
      if (packages === null)
        return StepResult.failed(Resources.formatPruneLockInvalid(filePath));

      for (const [key, entry] of Object.entries(packages)) {
        const index = key.lastIndexOf(Resources.nodeModulesSegment);
        const fields = PruneStep.isObject(entry) ? entry : {};
        const version = fields[Resources.versionField];
        const alias = fields[Resources.nameField];
        const name = typeof alias === "string" ? alias : key.slice(index + Resources.nodeModulesSegment.length);
        if (index === -1 || typeof version !== "string" || !packageNames.includes(name))
          continue;

        const specifier = Resources.formatSpecifier(name, version);
        const filePaths = locked.get(specifier) ?? [];
        if (!filePaths.includes(filePath))
          locked.set(specifier, [...filePaths, filePath]);
      }
    }

    return locked;
  }

  private static readLockedPackages(text: string): Readonly<Record<string, unknown>> | null {
    let lock: unknown;
    try {
      lock = JSON.parse(text);
    }
    catch {
      return null;
    }

    const packages: unknown = PruneStep.isObject(lock) ? lock[Resources.lockPackagesField] : undefined;

    return PruneStep.isObject(packages) ? packages : null;
  }

  private static isObject(value: unknown): value is Readonly<Record<string, unknown>> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }

  private static sortReleases(versions: readonly string[]): readonly Version[] {
    return versions
      .filter(t => Version.validate(t) === null)
      .map(t => Version.parse(t))
      .filter(t => t.nightlyDate === null)
      .sort((t, u) => u.compareTo(t));
  }
}
