/**
 * @license
 * Copyright (c) Noldova.
 *
 * This source code is licensed under the license found in the
 * LICENSE file in the root directory of this source tree.
 */

import path from "node:path";

import { Resources } from "../resources.js";

// A folder that installs on its own: its tracked lock file, when it has one, and the tracked manifests whose nearest
// lock folder, at or above them, it is.
export class LockScope {
  public readonly folder: string;
  public readonly lockFilePaths: readonly string[];
  public readonly manifestPaths: readonly string[];

  public constructor(folder: string, lockFilePaths: readonly string[], manifestPaths: readonly string[]) {
    this.folder = folder;
    this.lockFilePaths = lockFilePaths;
    this.manifestPaths = manifestPaths;
  }

  public static read(manifestPaths: readonly string[], lockFilePaths: readonly string[]): readonly LockScope[] {
    const folders = lockFilePaths.map(t => path.posix.dirname(t));
    const grouped = new Map<string, string[]>(folders.map(t => [t, []]));
    for (const manifestPath of manifestPaths) {
      const folder = LockScope.findFolder(path.posix.dirname(manifestPath), folders);
      grouped.set(folder, [...grouped.get(folder) ?? [], manifestPath]);
    }

    return [...grouped].map(([folder, paths]) => new LockScope(folder, lockFilePaths.filter(t => path.posix.dirname(t) === folder), paths));
  }

  private static findFolder(manifestFolder: string, folders: readonly string[]): string {
    const owners = folders.filter(t => t === Resources.currentFolder || t === manifestFolder || manifestFolder.startsWith(`${t}${Resources.pathSeparator}`))
      .sort((a, b) => LockScope.depthOf(b) - LockScope.depthOf(a));

    return owners[0] ?? manifestFolder;
  }

  private static depthOf(folder: string): number {
    return folder === Resources.currentFolder ? 0 : folder.split(Resources.pathSeparator).length;
  }
}
