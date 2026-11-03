/**
 * @license
 * Copyright (c) Noldova.
 *
 * This source code is licensed under the license found in the
 * LICENSE file in the root directory of this source tree.
 */

export interface PinTarget {
  readonly packageName: string;
  readonly version: string;
  readonly reason: string | null;
}

export class DependentsUpdate {
  public readonly source: string;
  public readonly version: string;
  public readonly commit: string;
  public readonly packageNames: readonly string[];
  public readonly peerPins: readonly PinTarget[];
  public readonly notes: string;

  public constructor(source: string, version: string, commit: string, packageNames: readonly string[], peerPins: readonly PinTarget[], notes: string) {
    this.source = source;
    this.version = version;
    this.commit = commit;
    this.packageNames = packageNames;
    this.peerPins = peerPins;
    this.notes = notes;
  }
}
