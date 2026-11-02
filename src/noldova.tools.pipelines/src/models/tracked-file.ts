/**
 * @license
 * Copyright (c) Noldova.
 *
 * This source code is licensed under the license found in the
 * LICENSE file in the root directory of this source tree.
 */

export class TrackedFile {
  public readonly filePath: string;
  public readonly lineEndings: string;
  public readonly isText: boolean;

  public constructor(filePath: string, lineEndings: string, isText: boolean) {
    this.filePath = filePath;
    this.lineEndings = lineEndings;
    this.isText = isText;
  }
}
