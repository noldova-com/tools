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

import { BuildException } from "../exceptions/build.exception.js";
import { PipelineException } from "../exceptions/pipeline.exception.js";
import type { IStep } from "../interfaces/i-step.js";
import type { IStepOutput } from "../interfaces/i-step-output.js";
import { BuildConfig } from "../models/build-config.js";
import type { BuildPackage } from "../models/build-package.js";
import { StepResult } from "../models/step-result.js";
import { Version } from "../models/version.js";
import { Resources } from "../resources.js";
import type { Git } from "./git.js";
import type { Npm } from "./npm.js";
import type { ProcessRunner } from "./process-runner.js";
import type { TypeScript } from "./type-script.js";

export class BuildStep implements IStep {
  private static readonly INSTALL_FILE_NAMES: readonly string[] = [Resources.packageManifestFileName, Resources.lockFileName];

  private readonly git: Git;
  private readonly npm: Npm;
  private readonly typeScript: TypeScript;
  private readonly processRunner: ProcessRunner;
  private readonly output: IStepOutput;

  public readonly name: string = Resources.buildStepName;
  public readonly usage: string = Resources.buildStepUsage;

  public constructor(git: Git, npm: Npm, typeScript: TypeScript, processRunner: ProcessRunner, output: IStepOutput) {
    this.git = git;
    this.npm = npm;
    this.typeScript = typeScript;
    this.processRunner = processRunner;
    this.output = output;
  }

  public async runAsync(values: readonly string[]): Promise<StepResult> {
    try {
      const config = BuildConfig.read(this.git.workingDirectory);
      if (values.includes(Resources.listCopiesOption))
        return values.length === 1 ? StepResult.succeeded(this.listCopies(config)) : StepResult.failed(Resources.formatOptionAlone(Resources.listCopiesOption));

      const [versionOption, names] = BuildStep.readValues(values);
      const packages = BuildStep.selectPackages(config, names);
      if ((await this.git.readPrefixAsync()).length !== 0)
        return StepResult.failed(Resources.formatCheckoutRootMissing(this.git.workingDirectory));

      const commit = await this.git.readHeadAsync();
      const version = versionOption ?? this.readVersion();
      fs.mkdirSync(this.resolve(Resources.buildFolder), { recursive: true });
      fs.mkdirSync(this.resolve(Resources.packagesFolder), { recursive: true });
      this.restoreInstallFiles();
      this.backUpInstallFiles();
      try {
        this.listUnbuiltArchives(config, packages, version, this.readFile(Resources.packageManifestFileName));
        for (const buildPackage of packages)
          await this.buildPackageAsync(buildPackage, version, commit);
      }
      finally {
        this.restoreInstallFiles();
      }

      return StepResult.succeeded(Resources.formatPackagesBuilt(packages.length, version));
    }
    catch (error) {
      if (error instanceof PipelineException)
        return StepResult.failed(error.message);

      throw error;
    }
  }

  private listCopies(config: BuildConfig): string {
    const lines: string[] = [];
    for (const buildPackage of config.packages) {
      const copies = BuildStep.listPackageCopies(buildPackage).filter(([source, , isRequired]) => isRequired || this.isFile(source));
      lines.push(...copies.map(([source, filePath]) => [source, buildPackage.packageName, filePath].join(Resources.copyFieldSeparator)));
    }

    return [...lines, Resources.copiesEndLine].join(Resources.lineSeparator);
  }

  private listUnbuiltArchives(config: BuildConfig, packages: readonly BuildPackage[], version: string, manifest: Buffer | null): void {
    const archives = config.packages.filter(t => !packages.includes(t)).map(t => [t.packageName, `${Resources.packagesFolder}/${t.archiveName(version)}`] as const).filter(([, archive]) => this.isFile(archive));
    if (archives.length === 0)
      return;

    const reader = JsonReader.parse(manifest === null ? Resources.emptyJsonObject : manifest.toString(Resources.textEncoding), Resources.packageManifestFileName);
    const listed = reader.hasField(Resources.dependenciesField) ? reader.readObject(Resources.dependenciesField).toJson() : {};
    const dependencies = { ...listed, ...Object.fromEntries(archives.map(([name, archive]) => [name, `${Resources.archiveSpecifierPrefix}${archive}`])) };
    fs.writeFileSync(this.resolve(Resources.packageManifestFileName), `${JSON.stringify({ ...reader.toJson(), [Resources.dependenciesField]: dependencies }, null, Resources.manifestIndentation)}${Resources.lineSeparator}`);
  }

  private async buildPackageAsync(buildPackage: BuildPackage, version: string, commit: string): Promise<void> {
    this.output.writeProgressStart(Resources.formatBuildingPackage(buildPackage.packageName));
    try {
      await this.buildPackageFilesAsync(buildPackage, version, commit);
    }
    catch (error) {
      this.output.writeProgress(Resources.progressFailed);
      throw error;
    }

    this.output.writeProgress(Resources.progressDone);
  }

  private async buildPackageFilesAsync(buildPackage: BuildPackage, version: string, commit: string): Promise<void> {
    const buildFolder = this.resolve(buildPackage.buildFolder);
    fs.rmSync(buildFolder, { recursive: true, force: true });
    fs.mkdirSync(buildFolder, { recursive: true });
    this.writeManifest(buildPackage, version, commit);
    for (const [source, filePath, isRequired] of BuildStep.listPackageCopies(buildPackage)) {
      if (!this.isFile(source)) {
        if (isRequired)
          throw new BuildException(Resources.formatBuildFileMissing(buildPackage.packageName, source));

        continue;
      }

      fs.mkdirSync(path.dirname(path.join(buildFolder, filePath)), { recursive: true });
      fs.copyFileSync(this.resolve(source), path.join(buildFolder, filePath));
    }

    await this.runScriptAsync(buildPackage, buildPackage.pre);
    if (buildPackage.compile === null)
      await this.compileAsync(buildPackage);
    else
      await this.runScriptAsync(buildPackage, buildPackage.compile);
    await this.runScriptAsync(buildPackage, buildPackage.post);

    const packed = await this.npm.packAsync(buildFolder, this.resolve(Resources.packagesFolder));
    if (!packed.isSuccessful)
      throw new BuildException(Resources.formatPackFailed(buildPackage.packageName, packed.exitCode, `${packed.output}${packed.errorOutput}`));

    const installed = await this.npm.installArchivesAsync([`${Resources.currentFolderPrefix}${Resources.packagesFolder}/${buildPackage.archiveName(version)}`]);
    if (!installed.isSuccessful)
      throw new BuildException(Resources.formatArchivesNotInstalled(installed.exitCode, `${installed.output}${installed.errorOutput}`));
  }

  private writeManifest(buildPackage: BuildPackage, version: string, commit: string): void {
    const manifestPath = `${buildPackage.sourceFolder}/${Resources.packageManifestFileName}`;
    if (!this.isFile(manifestPath))
      throw new BuildException(Resources.formatBuildFileMissing(buildPackage.packageName, manifestPath));

    const text = fs.readFileSync(this.resolve(manifestPath), Resources.textEncoding).replaceAll(Resources.versionPlaceholder, version);
    const manifest = { ...JsonReader.parse(text, manifestPath).toJson(), [Resources.gitHeadField]: commit };
    fs.writeFileSync(path.join(this.resolve(buildPackage.buildFolder), Resources.packageManifestFileName), `${JSON.stringify(manifest, null, Resources.manifestIndentation)}${Resources.lineSeparator}`);
  }

  private async compileAsync(buildPackage: BuildPackage): Promise<void> {
    const projectPath = `${buildPackage.sourceFolder}/${Resources.sourceProjectPath}`;
    const compiled = await this.typeScript.compileAsync(projectPath);
    if (!compiled.isSuccessful)
      throw new BuildException(Resources.formatCompileFailed(projectPath, compiled.exitCode, `${compiled.output}${compiled.errorOutput}`));
  }

  private async runScriptAsync(buildPackage: BuildPackage, script: string | null): Promise<void> {
    if (script === null)
      return;

    const result = await this.processRunner.runAsync(process.execPath, [script, buildPackage.sourceFolder, buildPackage.buildFolder], this.git.workingDirectory);
    if (!result.isSuccessful)
      throw new BuildException(Resources.formatBuildScriptFailed(buildPackage.packageName, script, result.exitCode, `${result.output}${result.errorOutput}`));
  }

  private readVersion(): string {
    if (!this.isFile(Resources.versionFilePath))
      throw new BuildException(Resources.versionFileMissing);

    return JsonReader.parse(fs.readFileSync(this.resolve(Resources.versionFilePath), Resources.textEncoding), Resources.versionFilePath).readString(Resources.versionField);
  }

  private readFile(filePath: string): Buffer | null {
    return this.isFile(filePath) ? fs.readFileSync(this.resolve(filePath)) : null;
  }

  private backUpInstallFiles(): void {
    const staging = this.resolve(Resources.restoreStagingFolder);
    fs.rmSync(staging, { recursive: true, force: true });
    fs.mkdirSync(staging, { recursive: true });
    for (const fileName of BuildStep.INSTALL_FILE_NAMES) {
      const content = this.readFile(fileName);
      if (content !== null)
        fs.writeFileSync(path.join(staging, fileName), content);
    }

    fs.renameSync(staging, this.resolve(Resources.restoreFolder));
  }

  private restoreInstallFiles(): void {
    const backup = this.resolve(Resources.restoreFolder);
    if (!fs.existsSync(backup))
      return;

    for (const fileName of BuildStep.INSTALL_FILE_NAMES) {
      const copy = path.join(backup, fileName);
      if (fs.existsSync(copy))
        fs.copyFileSync(copy, this.resolve(fileName));
      else
        fs.rmSync(this.resolve(fileName), { force: true });
    }

    const discard = this.resolve(Resources.restoreDiscardFolder);
    fs.rmSync(discard, { recursive: true, force: true });
    fs.renameSync(backup, discard);
    fs.rmSync(discard, { recursive: true, force: true });
  }

  private isFile(filePath: string): boolean {
    return fs.statSync(this.resolve(filePath), { throwIfNoEntry: false })?.isFile() === true;
  }

  private resolve(filePath: string): string {
    return path.join(this.git.workingDirectory, filePath);
  }

  private static listPackageCopies(buildPackage: BuildPackage): readonly (readonly [source: string, filePath: string, isRequired: boolean])[] {
    return [
      [Resources.licenseFileName, Resources.licenseFileName, true],
      [`${buildPackage.sourceFolder}/${Resources.declarationFilePath}`, Resources.packageDeclarationFilePath, false],
      [`${buildPackage.sourceFolder}/${Resources.readmeFileName}`, Resources.readmeFileName, true],
      [`${buildPackage.sourceFolder}/${Resources.noticesFileName}`, Resources.noticesFileName, false]
    ];
  }

  private static readValues(values: readonly string[]): readonly [version: string | null, names: readonly string[]] {
    const names: string[] = [];
    let version: string | null = null;
    let isVersionNext = false;
    for (const value of values) {
      if (isVersionNext) {
        const problem = Version.validate(value);
        if (problem !== null)
          throw new BuildException(problem);

        version = value;
        isVersionNext = false;
      }
      else if (value === Resources.versionOption) {
        if (version !== null)
          throw new BuildException(Resources.formatOptionDuplicated(Resources.versionOption));

        isVersionNext = true;
      }
      else if (value.startsWith(Resources.optionPrefix))
        throw new BuildException(Resources.formatOptionUnknown(value, Resources.buildStepUsage));
      else
        names.push(value);
    }

    if (isVersionNext)
      throw new BuildException(Resources.formatVersionOptionMissing(Resources.versionOption));

    return [version, names];
  }

  private static selectPackages(config: BuildConfig, names: readonly string[]): readonly BuildPackage[] {
    if (names.length === 0)
      return config.packages;

    const selected = new Set<string>();
    for (const name of names) {
      if (selected.has(name))
        throw new BuildException(Resources.formatBuildPackageNamedTwice(name));
      if (!config.packages.some(t => t.name === name))
        throw new BuildException(Resources.formatBuildPackageUnknown(name));

      selected.add(name);
    }

    return config.packages.filter(t => selected.has(t.name));
  }
}
