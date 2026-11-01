/**
 * @license
 * Copyright (c) Noldova.
 *
 * This source code is licensed under the license found in the
 * LICENSE file in the root directory of this source tree.
 */

export class PackageInfo {
  public readonly name: string;
  public readonly packageName: string;

  public constructor(name: string, packageName: string) {
    this.name = name;
    this.packageName = packageName;
  }

  public archiveName(version: string): string {
    return `${this.packageName.replace("@", "").replace("/", "-")}-${version}.tgz`;
  }
}
