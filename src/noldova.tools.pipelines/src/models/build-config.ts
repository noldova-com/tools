/**
 * @license
 * Copyright (c) Noldova.
 *
 * This source code is licensed under the license found in the
 * LICENSE file in the root directory of this source tree.
 */

import fs from "node:fs";
import path from "node:path";

import "@noldova/context.core";
import { JsonReader } from "@noldova/context.json";

import { BuildException } from "../exceptions/build.exception.js";
import { Resources } from "../resources.js";
import { BuildPackage } from "./build-package.js";

export class BuildConfig {
  public readonly scope: string;
  public readonly packages: readonly BuildPackage[];
  public readonly testTimeoutMilliseconds: number | undefined;

  public constructor(scope: string, packages: readonly BuildPackage[], testTimeoutMilliseconds?: number) {
    this.scope = scope;
    this.packages = packages;
    this.testTimeoutMilliseconds = testTimeoutMilliseconds;
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
    const reader = JsonReader.parse(text, Resources.buildConfigFilePath);
    const scope = reader.readOptionalString(Resources.scopeField) ?? Resources.defaultPackageScope;
    if (!Resources.packageScopePattern.test(scope))
      throw new BuildException(Resources.formatBuildConfigInvalid(Resources.formatBuildScopeInvalid(scope)));

    const entries = reader.readObjectArray(Resources.packagesField);
    if (entries.length === 0)
      throw new BuildException(Resources.formatBuildConfigInvalid(Resources.buildConfigEmpty));

    const packages: BuildPackage[] = [];
    for (const entry of entries) {
      const buildPackage = BuildConfig.readPackage(entry, scope);
      if (packages.some(t => t.name === buildPackage.name))
        throw new BuildException(Resources.formatBuildConfigInvalid(Resources.formatBuildPackageDuplicated(buildPackage.name)));

      packages.push(buildPackage);
    }

    const testTimeoutMilliseconds = reader.hasField(Resources.testTimeoutField) ? reader.readInteger(Resources.testTimeoutField) : undefined;
    if (!Object.isUndefined(testTimeoutMilliseconds) && testTimeoutMilliseconds <= 0)
      throw new BuildException(Resources.formatBuildConfigInvalid(Resources.formatTestTimeoutInvalid(testTimeoutMilliseconds)));

    return Object.isUndefined(testTimeoutMilliseconds) ? new BuildConfig(scope, packages) : new BuildConfig(scope, packages, testTimeoutMilliseconds);
  }

  private static readPackage(entry: JsonReader, scope: string): BuildPackage {
    const name = entry.readString(Resources.nameField);
    if (!Resources.buildPackageNamePattern.test(name))
      throw new BuildException(Resources.formatBuildConfigInvalid(Resources.formatBuildPackageNameInvalid(name)));

    const folder = entry.readOptionalString(Resources.pathField) ?? name;
    if (!BuildConfig.isInsideFolder(folder) || folder.split(Resources.pathSeparator).at(-1) !== name)
      throw new BuildException(Resources.formatBuildConfigInvalid(Resources.formatBuildPackagePathInvalid(name, folder)));

    const [pre = null, compile = null, post = null] = Resources.buildScriptFields.map(field => {
      const script = entry.readOptionalString(field) ?? null;
      if (!Object.isNull(script) && !BuildConfig.isInsideFolder(script))
        throw new BuildException(Resources.formatBuildConfigInvalid(Resources.formatBuildScriptInvalid(name, field, script)));

      return script;
    });

    return new BuildPackage(name, folder, pre, compile, post, scope);
  }

  private static isInsideFolder(filePath: string): boolean {
    return !path.win32.isAbsolute(filePath) && !filePath.includes(Resources.windowsPathSeparator) && filePath.split(Resources.pathSeparator).every(t => !Resources.copyPathSegmentsRefused.includes(t));
  }
}
