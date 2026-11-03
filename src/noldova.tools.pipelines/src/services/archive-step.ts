/**
 * @license
 * Copyright (c) Noldova.
 *
 * This source code is licensed under the license found in the
 * LICENSE file in the root directory of this source tree.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { JsonReader } from "@noldova/context.json";

import type { IStep } from "../interfaces/i-step.js";
import { ArchiveCheck } from "../models/archive-check.js";
import { PackageArchive } from "../models/package-archive.js";
import { StepResult } from "../models/step-result.js";
import { Version } from "../models/version.js";
import { Resources } from "../resources.js";
import type { Git } from "./git.js";
import type { Npm } from "./npm.js";
import type { Tar } from "./tar.js";

export class ArchiveStep implements IStep {
  private readonly git: Git;
  private readonly tar: Tar;
  private readonly npm: Npm;

  public readonly name: string = Resources.archiveStepName;
  public readonly usage: string = Resources.archiveStepUsage;

  public constructor(git: Git, tar: Tar, npm: Npm) {
    this.git = git;
    this.tar = tar;
    this.npm = npm;
  }

  public async runAsync(values: readonly string[]): Promise<StepResult> {
    const check = await this.checkAsync(values);
    if (!check.result.isSuccessful)
      return check.result;

    const copies = await this.checkCopiesAsync(check.archives);

    return copies.isSuccessful ? StepResult.succeeded([check.result.message, copies.message].join(Resources.lineSeparator)) : copies;
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
    return (await this.readPackageManifestsAsync(commit)).map(t => t.readString(Resources.nameField)).sort();
  }

  public async readPackageManifestsAsync(commit: string): Promise<readonly JsonReader[]> {
    const manifests: JsonReader[] = [];
    for (const filePath of await this.git.listFilesAsync(commit, Resources.packagesFolderPath)) {
      const segments = filePath.split(Resources.pathSeparator);
      if (segments.at(-1) !== Resources.manifestFileName || segments.includes(Resources.testsFolderName))
        continue;

      const manifest = JsonReader.parse(await this.git.readFileAsync(commit, filePath), filePath);
      if (!ArchiveStep.isPrivate(manifest))
        manifests.push(manifest);
    }

    return manifests;
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

  private async checkCopiesAsync(archives: readonly PackageArchive[]): Promise<StepResult> {
    const listed = await this.npm.listCopiesAsync();
    if (!listed.isSuccessful)
      return StepResult.failed(Resources.formatCopiesUnlisted(listed.exitCode, listed.errorOutput));

    const lines = listed.output.split(Resources.lineBreakPattern).filter(t => t.trim().length > 0);
    if (lines.pop() !== Resources.copiesEndLine)
      return StepResult.failed(Resources.formatCopiesEndMissing());
    if (lines.length === 0)
      return StepResult.succeeded(Resources.copiesNone);

    const findings: string[] = [];
    const copies: (readonly [archive: PackageArchive, source: string, filePath: string])[] = [];
    for (const line of lines) {
      const [source, packageName, filePath, ...rest] = line.split(Resources.copyFieldSeparator);
      if (source === undefined || packageName === undefined || filePath === undefined || rest.length !== 0) {
        findings.push(Resources.formatCopyLineInvalid(line));
        continue;
      }

      const invalidPath = [source, filePath].find(t => !ArchiveStep.isInsideFolder(t));
      const archive = archives.find(t => t.packageName === packageName);
      if (invalidPath !== undefined)
        findings.push(Resources.formatCopyPathInvalid(line, invalidPath));
      else if (archive === undefined)
        findings.push(Resources.formatCopyPackageUnknown(line, packageName));
      else
        copies.push([archive, source, filePath]);
    }
    if (findings.length > 0)
      return StepResult.failed(findings.join(Resources.lineSeparator));

    const directory = fs.mkdtempSync(path.join(os.tmpdir(), Resources.copiesTemporaryPrefix));
    try {
      findings.push(...await this.compareCopiesAsync(copies, directory));
    }
    finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }

    return findings.length > 0 ? StepResult.failed(findings.join(Resources.lineSeparator)) : StepResult.succeeded(Resources.formatCopiesMatched(copies.length));
  }

  private async compareCopiesAsync(copies: readonly (readonly [archive: PackageArchive, source: string, filePath: string])[], directory: string): Promise<readonly string[]> {
    const findings: string[] = [];
    const targets = new Map<PackageArchive, string | null>();
    for (const archive of new Set(copies.map(([t]) => t))) {
      const target = path.join(directory, String(targets.size));
      const archivePath = path.join(target, path.basename(archive.filePath));
      fs.mkdirSync(target);
      fs.copyFileSync(archive.filePath, archivePath);
      const result = await this.tar.extractAsync(archivePath);
      if (!result.isSuccessful)
        findings.push(Resources.formatArchiveUnextracted(path.basename(archive.filePath), result.exitCode, result.errorOutput));
      targets.set(archive, result.isSuccessful ? target : null);
    }

    for (const [archive, source, filePath] of copies) {
      const archiveName = path.basename(archive.filePath);
      const sourceStats = fs.lstatSync(path.join(this.npm.workingDirectory, source), { throwIfNoEntry: false });
      const target = targets.get(archive) as string | null;
      if (sourceStats !== undefined && ArchiveStep.isLinked(this.npm.workingDirectory, source, sourceStats)) {
        findings.push(Resources.formatCopySourceLinked(source));
        continue;
      }
      if (sourceStats?.isFile() !== true) {
        findings.push(Resources.formatCopySourceMissing(source));
        continue;
      }
      if (target === null)
        continue;

      const packagePath = path.join(target, Resources.archivePackageFolder);
      const copyStats = fs.lstatSync(path.join(packagePath, filePath), { throwIfNoEntry: false });
      if (copyStats === undefined)
        findings.push(Resources.formatCopyMissing(archiveName, filePath, source));
      else if (ArchiveStep.isLinked(packagePath, filePath, copyStats))
        findings.push(Resources.formatCopyLinked(archiveName, filePath));
      else if (!copyStats.isFile())
        findings.push(Resources.formatCopyNotFile(archiveName, filePath, source));
      else if (!fs.readFileSync(path.join(packagePath, filePath)).equals(fs.readFileSync(path.join(this.npm.workingDirectory, source))))
        findings.push(Resources.formatCopyDiffers(archiveName, filePath, source));
    }

    return findings;
  }

  private static isLinked(folder: string, filePath: string, stats: fs.Stats): boolean {
    return stats.isSymbolicLink() || fs.realpathSync(path.join(folder, filePath)) !== path.join(fs.realpathSync(folder), filePath);
  }

  private static isInsideFolder(filePath: string): boolean {
    return !path.posix.isAbsolute(filePath)
      && !path.win32.isAbsolute(filePath)
      && !filePath.includes(Resources.windowsPathSeparator)
      && filePath.split(Resources.pathSeparator).every(t => !Resources.copyPathSegmentsRefused.includes(t));
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
