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
import { Resources } from "../resources.js";
import { BuildPackage } from "./build-package.js";

export class BuildConfig {
  public readonly packages: readonly BuildPackage[];

  public constructor(packages: readonly BuildPackage[]) {
    this.packages = packages;
  }

  public get packageNames(): readonly string[] {
    return this.packages.map(t => t.packageName);
  }

  public static read(directory: string): BuildConfig {
    const filePath = path.join(directory, Resources.buildConfigFilePath);
    if (fs.statSync(filePath, { throwIfNoEntry: false })?.isFile() !== true)
      throw new BuildException(Resources.buildConfigMissing);

    return BuildConfig.parse(fs.readFileSync(filePath, Resources.textEncoding));
  }

  public static parse(text: string): BuildConfig {
    const entries = JsonReader.parse(text, Resources.buildConfigFilePath).readObjectArray(Resources.packagesField);
    if (entries.length === 0)
      throw new BuildException(Resources.formatBuildConfigInvalid(Resources.buildConfigEmpty));

    const packages: BuildPackage[] = [];
    for (const entry of entries) {
      const buildPackage = BuildConfig.readPackage(entry);
      if (packages.some(t => t.name === buildPackage.name))
        throw new BuildException(Resources.formatBuildConfigInvalid(Resources.formatBuildPackageDuplicated(buildPackage.name)));

      packages.push(buildPackage);
    }

    return new BuildConfig(packages);
  }

  private static readPackage(entry: JsonReader): BuildPackage {
    const name = entry.readString(Resources.nameField);
    if (!Resources.buildPackageNamePattern.test(name))
      throw new BuildException(Resources.formatBuildConfigInvalid(Resources.formatBuildPackageNameInvalid(name)));

    const folder = entry.readOptionalString(Resources.pathField) ?? name;
    if (!BuildConfig.isInsideFolder(folder) || folder.split(Resources.pathSeparator).at(-1) !== name)
      throw new BuildException(Resources.formatBuildConfigInvalid(Resources.formatBuildPackagePathInvalid(name, folder)));

    const [pre = null, compile = null, post = null] = Resources.buildScriptFields.map(field => {
      const script = entry.readOptionalString(field) ?? null;
      if (script !== null && !BuildConfig.isInsideFolder(script))
        throw new BuildException(Resources.formatBuildConfigInvalid(Resources.formatBuildScriptInvalid(name, field, script)));

      return script;
    });

    return new BuildPackage(name, folder, pre, compile, post);
  }

  private static isInsideFolder(filePath: string): boolean {
    return !path.win32.isAbsolute(filePath) && !filePath.includes(Resources.windowsPathSeparator) && filePath.split(Resources.pathSeparator).every(t => !Resources.copyPathSegmentsRefused.includes(t));
  }
}
