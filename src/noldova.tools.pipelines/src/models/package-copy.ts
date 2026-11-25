/**
 * @license
 * Copyright (c) Noldova.
 *
 * This source code is licensed under the license found in the
 * LICENSE file in the root directory of this source tree.
 */

export class PackageCopy {
  public readonly source: string;
  public readonly filePath: string;
  public readonly isRequired: boolean;

  public constructor(source: string, filePath: string, isRequired: boolean) {
    this.source = source;
    this.filePath = filePath;
    this.isRequired = isRequired;
  }
}
