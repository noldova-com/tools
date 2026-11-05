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
      for (const buildPackage of packages)
        await this.buildPackageAsync(config, buildPackage, version, commit);

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

  private async buildPackageAsync(config: BuildConfig, buildPackage: BuildPackage, version: string, commit: string): Promise<void> {
    this.output.writeProgress(Resources.formatBuildingPackage(buildPackage.packageName));
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

    const archives = config.packages.map(t => `${Resources.packagesFolder}/${t.archiveName(version)}`).filter(t => this.isFile(t));
    const installed = await this.npm.installArchivesAsync(archives.map(t => `${Resources.currentFolderPrefix}${t}`));
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
