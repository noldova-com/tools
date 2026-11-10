/**
 * @license
 * Copyright (c) Noldova.
 *
 * This source code is licensed under the license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { JsonReader } from "@noldova/context.json";

import { Resources } from "../resources.js";

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

  public static parseRequest(text: string): DependentsUpdate {
    const reader = JsonReader.parse(text);
    const peerPins = reader.readObjectArray(Resources.relockPeerPinsField).map(t => ({
      packageName: t.readString(Resources.relockPackageNameField),
      version: t.readString(Resources.relockVersionField),
      reason: t.readNullableString(Resources.relockReasonField)
    }));

    return new DependentsUpdate(reader.readString(Resources.relockSourceField), reader.readString(Resources.relockVersionField), reader.readString(Resources.relockCommitField),
      reader.readStringArray(Resources.relockPackageNamesField), peerPins, "");
  }

  public formatRequest(): string {
    return JSON.stringify({
      [Resources.relockSourceField]: this.source,
      [Resources.relockVersionField]: this.version,
      [Resources.relockCommitField]: this.commit,
      [Resources.relockPackageNamesField]: this.packageNames,
      [Resources.relockPeerPinsField]: this.peerPins.map(t => ({ [Resources.relockPackageNameField]: t.packageName, [Resources.relockVersionField]: t.version, [Resources.relockReasonField]: t.reason }))
    });
  }
}
