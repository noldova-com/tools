/**
 * @license
 * Copyright (c) Noldova.
 *
 * This source code is licensed under the license found in the
 * LICENSE file in the root directory of this source tree.
 */

export class PackageArchive {
  public readonly packageName: string;
  public readonly filePath: string;

  public constructor(packageName: string, filePath: string) {
    this.packageName = packageName;
    this.filePath = filePath;
  }
}
