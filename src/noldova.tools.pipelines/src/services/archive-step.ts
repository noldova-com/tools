/**
 * @license
 * Copyright (c) Noldova.
 *
 * This source code is licensed under the license found in the
 * LICENSE file in the root directory of this source tree.
 */

import fs from "node:fs";
import path from "node:path";

import { JsonReader } from "@noldova/context.json";

import type { IStep } from "../interfaces/i-step.js";
import { StepResult } from "../models/step-result.js";
import { Version } from "../models/version.js";
import { Resources } from "../resources.js";
import type { Git } from "./git.js";
import type { Tar } from "./tar.js";

export class ArchiveStep implements IStep {
  private readonly git: Git;
  private readonly tar: Tar;

  public readonly name: string = Resources.archiveStepName;
  public readonly usage: string = Resources.archiveStepUsage;

  public constructor(git: Git, tar: Tar) {
    this.git = git;
    this.tar = tar;
  }

  public async runAsync(values: readonly string[]): Promise<StepResult> {
    const [folder, version, commit, scope, ...rest] = values;
    if (folder === undefined || version === undefined || commit === undefined || scope === undefined || rest.length !== 0)
      return StepResult.failed(Resources.formatStepValuesInvalid(this.name, this.usage));

    const versionProblem = Version.validate(version);
    if (versionProblem !== null)
      return StepResult.failed(versionProblem);
    if (!Resources.commitPattern.test(commit))
      return StepResult.failed(Resources.formatCommitInvalid(commit));
    if (!Resources.scopePattern.test(scope))
      return StepResult.failed(Resources.formatScopeInvalid(scope));

    const head = await this.git.readHeadAsync();
    if (head !== commit)
      return StepResult.failed(Resources.formatHeadDiffers(head, commit));
    if (fs.statSync(folder, { throwIfNoEntry: false })?.isDirectory() !== true)
      return StepResult.failed(Resources.formatFolderMissing(folder));

    const packageNames = await this.readPackageNamesAsync(commit);
    if (packageNames.length === 0)
      return StepResult.failed(Resources.formatPackagesMissing(commit, Resources.packagesFolderPath));

    const archives = packageNames.map(t => ({ packageName: t, archiveName: Resources.formatArchiveName(t, version) }));
    const archiveNames = archives.map(t => t.archiveName);
    const fileNames = fs.readdirSync(folder).sort();
    const findings = [
      ...archiveNames.filter(t => !fileNames.includes(t)).map(t => Resources.formatArchiveMissing(folder, t)),
      ...fileNames.filter(t => !archiveNames.includes(t)).map(t => Resources.formatArchiveUnexpected(folder, t, version))
    ];
    for (const archive of archives.filter(t => fileNames.includes(t.archiveName)))
      findings.push(...await this.checkArchiveAsync(path.join(folder, archive.archiveName), archive.packageName, version, scope, packageNames));

    if (findings.length > 0)
      return StepResult.failed(findings.join(Resources.lineSeparator));

    return StepResult.succeeded(archives.map(t => Resources.formatArchiveChecked(t.archiveName, t.packageName, version, commit)).join(Resources.lineSeparator));
  }

  private async readPackageNamesAsync(commit: string): Promise<readonly string[]> {
    const packageNames: string[] = [];
    for (const filePath of await this.git.listFilesAsync(commit, Resources.packagesFolderPath)) {
      const segments = filePath.split(Resources.pathSeparator);
      if (segments.at(-1) !== Resources.manifestFileName || segments.includes(Resources.testsFolderName))
        continue;

      const manifest = JsonReader.parse(await this.git.readFileAsync(commit, filePath), filePath);
      if (!ArchiveStep.isPrivate(manifest))
        packageNames.push(manifest.readString(Resources.nameField));
    }

    return packageNames.sort();
  }

  private async checkArchiveAsync(archivePath: string, packageName: string, version: string, scope: string, packageNames: readonly string[]): Promise<readonly string[]> {
    const archiveName = path.basename(archivePath);
    const result = await this.tar.readFileAsync(archivePath, Resources.archiveManifestPath);
    if (!result.isSuccessful)
      return [Resources.formatArchiveUnreadable(archiveName, Resources.archiveManifestPath, result.exitCode, result.errorOutput)];

    const manifest = JsonReader.parse(result.output, Resources.formatArchiveFilePath(archiveName, Resources.archiveManifestPath));
    const findings: string[] = [];
    const name = manifest.readString(Resources.nameField);
    if (name !== packageName)
      findings.push(Resources.formatFieldDiffers(archiveName, Resources.nameField, name, packageName));
    if (!name.startsWith(Resources.formatScopeNamePrefix(scope)))
      findings.push(Resources.formatOutsideScope(archiveName, name, scope));

    const foundVersion = manifest.readString(Resources.versionField);
    if (foundVersion !== version)
      findings.push(Resources.formatFieldDiffers(archiveName, Resources.versionField, foundVersion, version));
    if (ArchiveStep.isPrivate(manifest))
      findings.push(Resources.formatArchivePrivate(archiveName));

    if (manifest.hasField(Resources.dependenciesField)) {
      const dependencies = manifest.readObject(Resources.dependenciesField);
      for (const dependency of packageNames.filter(t => dependencies.hasField(t))) {
        const range = dependencies.readString(dependency);
        if (range !== version)
          findings.push(Resources.formatDependencyDiffers(archiveName, dependency, range, version));
      }
    }

    return findings;
  }

  private static isPrivate(manifest: JsonReader): boolean {
    return manifest.hasField(Resources.privateField) && manifest.readBoolean(Resources.privateField);
  }
}
