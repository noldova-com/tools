/**
 * @license
 * Copyright (c) Noldova.
 *
 * This source code is licensed under the license found in the
 * LICENSE file in the root directory of this source tree.
 */

import type { ActionPin } from "./action-pin.js";
import type { Version } from "./version.js";

export class PinsUpdate {
  public readonly source: string;
  public readonly version: Version;
  public readonly tag: string;
  public readonly commit: string;
  public readonly actions: ReadonlyMap<string, ActionPin>;
  public readonly notes: string;

  public constructor(source: string, version: Version, tag: string, commit: string, actions: ReadonlyMap<string, ActionPin>, notes: string) {
    this.source = source;
    this.version = version;
    this.tag = tag;
    this.commit = commit;
    this.actions = actions;
    this.notes = notes;
  }
}
