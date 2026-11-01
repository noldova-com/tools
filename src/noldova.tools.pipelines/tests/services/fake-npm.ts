/**
 * @license
 * Copyright (c) Noldova.
 *
 * This source code is licensed under the license found in the
 * LICENSE file in the root directory of this source tree.
 */

import path from "node:path";

import { Npm, ProcessResult, ProcessRunner } from "@noldova/tools.pipelines";

export class FakeNpm extends Npm {
  public static readonly NOT_FOUND: ProcessResult = new ProcessResult(1, "", "npm error code E404\nnpm error 404 Not Found - GET https://registry.example/@noldova%2fa - Not found\n");

  public readonly calls: string[] = [];
  private readonly views: Map<string, ProcessResult[]>;
  private readonly publishes: ReadonlyMap<string, ProcessResult>;

  public constructor(views: Readonly<Record<string, readonly ProcessResult[]>>, publishes: Readonly<Record<string, ProcessResult>> = {}) {
    super(new ProcessRunner(), ".");

    this.views = new Map(Object.entries(views).map(([key, results]) => [key, [...results]]));
    this.publishes = new Map(Object.entries(publishes));
  }

  public static found(output: string): ProcessResult {
    return new ProcessResult(0, output, "");
  }

  public override async viewAsync(specifier: string, field: string, registry: string): Promise<ProcessResult> {
    this.calls.push(`view ${specifier} ${field} ${registry}`);
    const results = this.views.get(`${specifier} ${field}`) ?? [FakeNpm.NOT_FOUND];

    return (results.length > 1 ? results.shift() : results[0]) ?? FakeNpm.NOT_FOUND;
  }

  public override async publishAsync(archivePath: string, tag: string, access: string, registry: string): Promise<ProcessResult> {
    this.calls.push(`publish ${path.basename(archivePath)} ${tag} ${access} ${registry}`);

    return this.publishes.get(path.basename(archivePath)) ?? new ProcessResult(0, "", "");
  }
}
