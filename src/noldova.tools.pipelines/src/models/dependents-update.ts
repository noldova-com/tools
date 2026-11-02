/**
 * @license
 * Copyright (c) Noldova.
 *
 * This source code is licensed under the license found in the
 * LICENSE file in the root directory of this source tree.
 */

export class DependentsUpdate {
  public readonly source: string;
  public readonly version: string;
  public readonly commit: string;
  public readonly packageNames: readonly string[];
  public readonly notes: string;

  public constructor(source: string, version: string, commit: string, packageNames: readonly string[], notes: string) {
    this.source = source;
    this.version = version;
    this.commit = commit;
    this.packageNames = packageNames;
    this.notes = notes;
  }
}
