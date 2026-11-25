/**
 * @license
 * Copyright (c) Noldova.
 *
 * This source code is licensed under the license found in the
 * LICENSE file in the root directory of this source tree.
 */

import type { PackageArchive } from "./package-archive.js";

export class ArchiveCopy {
  public readonly archive: PackageArchive;
  public readonly source: string;
  public readonly filePath: string;

  public constructor(archive: PackageArchive, source: string, filePath: string) {
    this.archive = archive;
    this.source = source;
    this.filePath = filePath;
  }
}
