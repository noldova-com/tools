/**
 * @license
 * Copyright (c) Noldova.
 *
 * This source code is licensed under the license found in the
 * LICENSE file in the root directory of this source tree.
 */

import type { Version } from "./version.js";

export class ActionPin {
  public readonly commit: string;
  public readonly tag: string;
  public readonly version: Version;

  public constructor(commit: string, tag: string, version: Version) {
    this.commit = commit;
    this.tag = tag;
    this.version = version;
  }
}
