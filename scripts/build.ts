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
 */

import path from "node:path";

import { CommandFailedException } from "./command-failed.exception.ts";
import { Config } from "./config.ts";
import type { PackageInfo } from "./package-info.ts";
import { Script } from "./script.ts";

export class Build extends Script {
  private static readonly CLEAN_INSTALL_ARGUMENTS: readonly string[] = ["ci", "--ignore-scripts", "--no-audit", "--no-fund"];
  private static readonly INSTALL_ARGUMENTS: readonly string[] = ["install", "--no-save", "--ignore-scripts", "--no-audit", "--no-fund"];
  private static readonly INSTALLING_PACKAGES: string = "Installing the locked npm packages…";
  private static readonly LICENSE_FILE_NAME: string = "LICENSE";
  private static readonly NODE_MODULES_DIRECTORY_NAME: string = "node_modules";
  private static readonly PACK_ARGUMENTS: readonly string[] = ["pack", "--silent", "--pack-destination"];
  private static readonly PACKAGE_MANIFEST_FILE_NAME: string = "package.json";
  private static readonly VERSION_FIELD: string = "version";
  private static readonly VERSION_PLACEHOLDER: string = "__VERSION__";

  public override async runAsync(): Promise<void> {
    const packagesInfo = Build.selectPackages(process.argv.slice(2));

    await this.installLockedPackagesAsync();
    const version = await this.readVersionAsync();
    await this.createDirectoryAsync(Config.BUILD_FOLDER);
    await this.createDirectoryAsync(Config.PACKAGES_FOLDER);

    for (const packageInfo of packagesInfo)
      await this.buildPackageAsync(packageInfo, version);
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

  private async buildPackageAsync(packageInfo: PackageInfo, version: string): Promise<void> {
    await this.runStepAsync(Build.buildingPackage(packageInfo.packageName), async () => {
      const buildDirectory = `${Config.BUILD_FOLDER}/${packageInfo.name}`;

      await this.removeDirectoryAsync(buildDirectory);
      await this.createDirectoryAsync(buildDirectory);
      await this.writeManifestAsync(packageInfo, buildDirectory, version);
      await this.copyFileAsync(Build.LICENSE_FILE_NAME, `${buildDirectory}/${Build.LICENSE_FILE_NAME}`);
      await this.compilePackageAsync(packageInfo);
      await this.executeNPMCommandAsync([...Build.PACK_ARGUMENTS, path.resolve(Config.PACKAGES_FOLDER)], path.resolve(buildDirectory), true);
      await this.installPackedPackagesAsync(version);
    });
  }

  private async writeManifestAsync(packageInfo: PackageInfo, buildDirectory: string, version: string): Promise<void> {
    const manifestPath = `${Build.SOURCE_DIRECTORY_NAME}/${packageInfo.name}/${Build.PACKAGE_MANIFEST_FILE_NAME}`;
    if (!await this.pathExistsAsync(manifestPath))
      throw new CommandFailedException(Build.manifestMissing(manifestPath));

    const manifest = await this.readFileAsync(manifestPath);
    await this.writeFileAsync(`${buildDirectory}/${Build.PACKAGE_MANIFEST_FILE_NAME}`, manifest.replaceAll(Build.VERSION_PLACEHOLDER, version));
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

  private static packageDuplicated(name: string): string {
    return `Package ${name} was named more than once.`;
  }

  private static packageNotFound(name: string): string {
    return `Package ${name} is not in scripts/config.ts.`;
  }
}

await new Build().runAsEntryPointAsync();
