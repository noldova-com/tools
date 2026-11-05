/**
 * @license
 * Copyright (c) Noldova.
 *
 * This source code is licensed under the license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { Resources } from "../resources.js";

export class BuildPackage {
  public readonly name: string;
  public readonly path: string;
  public readonly packageName: string;
  public readonly pre: string | null;
  public readonly compile: string | null;
  public readonly post: string | null;

  public constructor(name: string, path: string = name, pre: string | null = null, compile: string | null = null, post: string | null = null) {
    this.name = name;
    this.path = path;
    this.packageName = Resources.formatPackageName(name);
    this.pre = pre;
    this.compile = compile;
    this.post = post;
  }

  public get sourceFolder(): string {
    return `${Resources.sourceFolder}/${this.path}`;
  }

  public get buildFolder(): string {
    return `${Resources.buildFolder}/${this.name}`;
  }

  public get testsFolder(): string {
    return `${Resources.testsFolder}/${this.name}`;
  }

  public archiveName(version: string): string {
    return Resources.formatArchiveName(this.packageName, version);
  }
}
