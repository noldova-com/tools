/**
 * @license
 * Copyright (c) Noldova.
 *
 * This source code is licensed under the license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * This script installs the locked third-party packages, then builds, packs and
 * installs every package of this repository.
 *
 * @example
 * npm run build - builds every package.
 * npm run build <package...> - builds the named packages, such as noldova.tools.pipelines.
 * npm run build -- --version <version> [package...] - builds at that version instead of version.json's, such as 0.0.5-nightly.20261102.
 */

import path from "node:path";

import { CommandFailedException } from "./command-failed.exception.ts";
import { Config } from "./config.ts";
import type { PackageInfo } from "./package-info.ts";
import { Script } from "./script.ts";

export class Build extends Script {
  private static readonly CLEAN_INSTALL_ARGUMENTS: readonly string[] = ["ci", "--ignore-scripts", "--no-audit", "--no-fund"];
  private static readonly GIT_HEAD_ARGUMENTS: readonly string[] = ["rev-parse", "--verify", "HEAD"];
  private static readonly GIT_HEAD_FIELD: string = "gitHead";
  private static readonly GIT_PREFIX_ARGUMENTS: readonly string[] = ["rev-parse", "--show-prefix"];
  private static readonly GIT_PROGRAM: string = "git";
  private static readonly INSTALL_ARGUMENTS: readonly string[] = ["install", "--no-save", "--ignore-scripts", "--no-audit", "--no-fund"];
  private static readonly INSTALLING_PACKAGES: string = "Installing the locked npm packages…";
  private static readonly LICENSE_FILE_NAME: string = "LICENSE";
  private static readonly MANIFEST_INDENTATION: number = 2;
  private static readonly NODE_MODULES_DIRECTORY_NAME: string = "node_modules";
  private static readonly PACK_ARGUMENTS: readonly string[] = ["pack", "--silent", "--pack-destination"];
  private static readonly PACKAGE_MANIFEST_FILE_NAME: string = "package.json";
  private static readonly VERSION_FIELD: string = "version";
  private static readonly VERSION_OPTION: string = "--version";
  private static readonly VERSION_OPTION_VALUE_SEPARATOR: string = "=";
  private static readonly VERSION_PLACEHOLDER: string = "__VERSION__";

  public override async runAsync(): Promise<void> {
    const arguments_ = process.argv.slice(2);
    const versionOption = Build.readVersionOption(arguments_);
    const packagesInfo = Build.selectPackages(Build.removeVersionOption(arguments_));
    const commit = await this.readHeadCommitAsync();

    await this.installLockedPackagesAsync();
    if (versionOption !== undefined)
      await Build.checkVersionAsync(versionOption);

    const version = versionOption ?? await this.readVersionAsync();
    await this.createDirectoryAsync(Config.BUILD_FOLDER);
    await this.createDirectoryAsync(Config.PACKAGES_FOLDER);

    for (const packageInfo of packagesInfo)
      await this.buildPackageAsync(packageInfo, version, commit);
  }

  private async readHeadCommitAsync(): Promise<string> {
    const prefix = (await this.readProcessOutputAsync(Build.GIT_PROGRAM, Build.GIT_PREFIX_ARGUMENTS, process.cwd())).trim();
    if (prefix.length !== 0)
      throw new CommandFailedException(Build.checkoutRootMissing(process.cwd()));

    return (await this.readProcessOutputAsync(Build.GIT_PROGRAM, Build.GIT_HEAD_ARGUMENTS, process.cwd())).trim();
  }

  private async installLockedPackagesAsync(): Promise<void> {
    if (await this.pathExistsAsync(Build.NODE_MODULES_DIRECTORY_NAME))
      return;

    await this.writeLogAsync(Build.INSTALLING_PACKAGES);
    await this.executeNPMCommandAsync(Build.CLEAN_INSTALL_ARGUMENTS, process.cwd());
  }

  private async readVersionAsync(): Promise<string> {
    const json = await import("@noldova/context.json");
    return json.JsonReader.parse(await this.readFileAsync(Config.VERSION_FILE_PATH), Config.VERSION_FILE_PATH).readString(Build.VERSION_FIELD);
  }

  private async buildPackageAsync(packageInfo: PackageInfo, version: string, commit: string): Promise<void> {
    await this.runStepAsync(Build.buildingPackage(packageInfo.packageName), async () => {
      const buildDirectory = `${Config.BUILD_FOLDER}/${packageInfo.name}`;

      await this.removeDirectoryAsync(buildDirectory);
      await this.createDirectoryAsync(buildDirectory);
      await this.writeManifestAsync(packageInfo, buildDirectory, version, commit);
      await this.copyFileAsync(Build.LICENSE_FILE_NAME, `${buildDirectory}/${Build.LICENSE_FILE_NAME}`);
      await this.compilePackageAsync(packageInfo);
      await this.executeNPMCommandAsync([...Build.PACK_ARGUMENTS, path.resolve(Config.PACKAGES_FOLDER)], path.resolve(buildDirectory), true);
      await this.installPackedPackagesAsync(version);
    });
  }

  private async writeManifestAsync(packageInfo: PackageInfo, buildDirectory: string, version: string, commit: string): Promise<void> {
    const manifestPath = `${Build.SOURCE_DIRECTORY_NAME}/${packageInfo.name}/${Build.PACKAGE_MANIFEST_FILE_NAME}`;
    if (!await this.pathExistsAsync(manifestPath))
      throw new CommandFailedException(Build.manifestMissing(manifestPath));

    const json = await import("@noldova/context.json");
    const manifest = json.JsonReader.parse((await this.readFileAsync(manifestPath)).replaceAll(Build.VERSION_PLACEHOLDER, version), manifestPath);
    const content = { ...manifest.toJson(), [Build.GIT_HEAD_FIELD]: commit };
    await this.writeFileAsync(`${buildDirectory}/${Build.PACKAGE_MANIFEST_FILE_NAME}`, `${JSON.stringify(content, null, Build.MANIFEST_INDENTATION)}\n`);
  }

  private async installPackedPackagesAsync(version: string): Promise<void> {
    const archives: string[] = [];
    for (const packageInfo of Config.PACKAGES_INFO) {
      const archive = `./${Config.PACKAGES_FOLDER}/${packageInfo.archiveName(version)}`;
      if (await this.pathExistsAsync(archive))
        archives.push(archive);
    }

    await this.executeNPMCommandAsync([...Build.INSTALL_ARGUMENTS, ...archives], process.cwd(), true);
  }

  private static readVersionOption(arguments_: readonly string[]): string | undefined {
    if (arguments_.some(t => t.startsWith(`${Build.VERSION_OPTION}${Build.VERSION_OPTION_VALUE_SEPARATOR}`)))
      throw new CommandFailedException(Build.versionMissing(Build.VERSION_OPTION));

    const index = arguments_.indexOf(Build.VERSION_OPTION);
    if (index < 0)
      return undefined;
    if (arguments_.lastIndexOf(Build.VERSION_OPTION) !== index)
      throw new CommandFailedException(Build.optionDuplicated(Build.VERSION_OPTION));

    const version = arguments_[index + 1];
    if (version === undefined)
      throw new CommandFailedException(Build.versionMissing(Build.VERSION_OPTION));

    return version;
  }

  private static async checkVersionAsync(version: string): Promise<void> {
    const pipelines = await import("tools.pipelines.published");
    const problem = pipelines.Version.validate(version);
    if (problem !== null)
      throw new CommandFailedException(problem);
  }

  private static removeVersionOption(arguments_: readonly string[]): readonly string[] {
    const index = arguments_.indexOf(Build.VERSION_OPTION);

    return index < 0 ? arguments_ : arguments_.filter((_, t) => t !== index && t !== index + 1);
  }

  private static selectPackages(names: readonly string[]): readonly PackageInfo[] {
    if (names.length === 0)
      return Config.PACKAGES_INFO;

    const selected = new Set<string>();
    for (const name of names) {
      if (selected.has(name))
        throw new CommandFailedException(Build.packageDuplicated(name));

      if (!Config.PACKAGES_INFO.some(t => t.name === name))
        throw new CommandFailedException(Build.packageNotFound(name));

      selected.add(name);
    }

    return Config.PACKAGES_INFO.filter(t => selected.has(t.name));
  }

  private static buildingPackage(packageName: string): string {
    return `Building "${packageName}"...`;
  }

  private static manifestMissing(manifestPath: string): string {
    return `No ${Build.PACKAGE_MANIFEST_FILE_NAME} at "${manifestPath}".`;
  }

  private static checkoutRootMissing(directory: string): string {
    return `${directory} is not the root of a git checkout.`;
  }

  private static optionDuplicated(option: string): string {
    return `Option ${option} was given more than once.`;
  }

  private static versionMissing(option: string): string {
    return `Option ${option} takes a version as its next value, such as ${option} 0.0.5 or ${option} 0.0.5-nightly.20261102.`;
  }

  private static packageDuplicated(name: string): string {
    return `Package ${name} was named more than once.`;
  }

  private static packageNotFound(name: string): string {
    return `Package ${name} is not in scripts/config.ts.`;
  }
}

await new Build().runAsEntryPointAsync();
