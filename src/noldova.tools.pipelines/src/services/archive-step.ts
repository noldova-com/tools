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
import { ArchiveCheck } from "../models/archive-check.js";
import { PackageArchive } from "../models/package-archive.js";
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
    return (await this.checkAsync(values)).result;
  }

  public async checkAsync(values: readonly string[]): Promise<ArchiveCheck> {
    const [folder, version, commit, scope, ...rest] = values;
    if (folder === undefined || version === undefined || commit === undefined || scope === undefined || rest.length !== 0)
      return ArchiveStep.failed(Resources.formatStepValuesInvalid(this.name, this.usage));

    const versionProblem = Version.validate(version);
    if (versionProblem !== null)
      return ArchiveStep.failed(versionProblem);
    if (!Resources.commitPattern.test(commit))
      return ArchiveStep.failed(Resources.formatCommitInvalid(commit));
    if (!Resources.scopePattern.test(scope))
      return ArchiveStep.failed(Resources.formatScopeInvalid(scope));

    const head = await this.git.readHeadAsync();
    if (head !== commit)
      return ArchiveStep.failed(Resources.formatHeadDiffers(head, commit));
    if (fs.statSync(folder, { throwIfNoEntry: false })?.isDirectory() !== true)
      return ArchiveStep.failed(Resources.formatFolderMissing(folder));

    const packageNames = await this.readPackageNamesAsync(commit);
    if (packageNames.length === 0)
      return ArchiveStep.failed(Resources.formatPackagesMissing(commit, Resources.packagesFolderPath));

    const archives = packageNames.map(t => new PackageArchive(t, path.join(folder, Resources.formatArchiveName(t, version))));
    const archiveNames = archives.map(t => path.basename(t.filePath));
    const fileNames = fs.readdirSync(folder).sort();
    const findings = [
      ...archiveNames.filter(t => !fileNames.includes(t)).map(t => Resources.formatArchiveMissing(folder, t)),
      ...fileNames.filter(t => !archiveNames.includes(t)).map(t => Resources.formatArchiveUnexpected(folder, t, version))
    ];
    for (const archive of archives.filter(t => fileNames.includes(path.basename(t.filePath))))
      findings.push(...await this.checkArchiveAsync(archive.filePath, archive.packageName, version, commit, scope, packageNames));

    if (findings.length > 0)
      return ArchiveStep.failed(findings.join(Resources.lineSeparator));

    const checked = archives.map(t => Resources.formatArchiveChecked(path.basename(t.filePath), t.packageName, version, commit));

    return new ArchiveCheck(StepResult.succeeded(checked.join(Resources.lineSeparator)), archives);
  }

  public async readPackageNamesAsync(commit: string): Promise<readonly string[]> {
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

  private async checkArchiveAsync(archivePath: string, packageName: string, version: string, commit: string, scope: string, packageNames: readonly string[]): Promise<readonly string[]> {
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
    if (!manifest.hasField(Resources.gitHeadField))
      findings.push(Resources.formatFieldMissing(archiveName, Resources.gitHeadField, commit));
    else {
      const gitHead = manifest.readString(Resources.gitHeadField);
      if (gitHead !== commit)
        findings.push(Resources.formatFieldDiffers(archiveName, Resources.gitHeadField, gitHead, commit));
    }
    if (ArchiveStep.isPrivate(manifest))
      findings.push(Resources.formatArchivePrivate(archiveName));
    if (!manifest.hasField(Resources.licenseField) || manifest.readString(Resources.licenseField).length === 0)
      findings.push(Resources.formatLicenseMissing(archiveName));

    if (manifest.hasField(Resources.dependenciesField)) {
      const dependencies = manifest.readObject(Resources.dependenciesField);
      for (const dependency of packageNames.filter(t => dependencies.hasField(t))) {
        const range = dependencies.readString(dependency);
        if (range !== version)
          findings.push(Resources.formatDependencyDiffers(archiveName, dependency, range, version));
      }
    }

    findings.push(...await this.checkFilesAsync(archivePath));

    return findings;
  }

  private async checkFilesAsync(archivePath: string): Promise<readonly string[]> {
    const archiveName = path.basename(archivePath);
    const result = await this.tar.listFilesAsync(archivePath);
    if (!result.isSuccessful)
      return [Resources.formatArchiveListUnreadable(archiveName, result.exitCode, result.errorOutput)];

    const filePaths = result.output.split(Resources.lineBreakPattern).filter(t => t.length > 0);
    const findings = filePaths
      .filter(t => Resources.credentialFilePattern.test(t))
      .map(t => Resources.formatArchiveCredentialFile(archiveName, t));
    if (!filePaths.includes(Resources.archiveLicensePath))
      findings.push(Resources.formatArchiveLicenseMissing(archiveName));

    return findings;
  }

  private static failed(message: string): ArchiveCheck {
    return new ArchiveCheck(StepResult.failed(message), []);
  }

  private static isPrivate(manifest: JsonReader): boolean {
    return manifest.hasField(Resources.privateField) && manifest.readBoolean(Resources.privateField);
  }
}
