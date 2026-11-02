/**
 * @license
 * Copyright (c) Noldova.
 *
 * This source code is licensed under the license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { type IRegistryHost, StepResult } from "@noldova/tools.pipelines";

import { Resources } from "../resources.js";
import { GitHubApi } from "./github-api.js";

export class GitHubPackages implements IRegistryHost {
  private readonly environment: Readonly<Record<string, string | undefined>>;
  private readonly timeoutMilliseconds: number;
  private readonly versionIds: Map<string, Map<string, number>> = new Map();

  public readonly registry: string = Resources.packagesRegistry;

  public constructor(environment: Readonly<Record<string, string | undefined>>, timeoutMilliseconds: number = Resources.apiTimeoutMilliseconds) {
    this.environment = environment;
    this.timeoutMilliseconds = timeoutMilliseconds;
  }

  public async readVersionsAsync(packageName: string): Promise<readonly string[] | StepResult> {
    const target = this.readTarget(packageName);
    if (target instanceof StepResult)
      return target;

    const ids = await this.readIdsAsync(packageName, ...target);

    return ids instanceof StepResult ? ids : [...ids.keys()];
  }

  public async deleteVersionAsync(packageName: string, version: string): Promise<boolean | StepResult> {
    const target = this.readTarget(packageName);
    if (target instanceof StepResult)
      return target;

    const ids = this.versionIds.get(packageName) ?? await this.readIdsAsync(packageName, ...target);
    if (ids instanceof StepResult)
      return ids;

    const id = ids.get(version);
    if (id === undefined)
      return false;

    const [api, resource] = target;
    const answer = await api.requestAsync(Resources.deleteMethod, Resources.formatVersionResource(resource, id));
    if (answer.status !== Resources.deletedStatus && answer.status !== Resources.notFoundStatus)
      return answer.toFailure();

    ids.delete(version);

    return answer.status === Resources.deletedStatus;
  }

  private async readIdsAsync(packageName: string, api: GitHubApi, resource: string): Promise<Map<string, number> | StepResult> {
    const ids = new Map<string, number>();
    for (let page = 1; ; page++) {
      const answer = await api.requestAsync(Resources.readMethod, Resources.formatVersionsPage(resource, page));
      if (answer.status !== Resources.foundStatus)
        return answer.toFailure();

      const items = answer.readItems();
      for (const item of items)
        ids.set(item.readString(Resources.nameField), item.readInteger(Resources.idField));
      if (items.length < Resources.versionsPageSize)
        break;
    }

    this.versionIds.set(packageName, ids);

    return ids;
  }

  private readTarget(packageName: string): readonly [api: GitHubApi, resource: string] | StepResult {
    if (!Resources.packageNamePattern.test(packageName))
      return StepResult.failed(Resources.formatPackageNotScoped(packageName));

    const missing = [Resources.apiUrlVariable, Resources.tokenVariable].find(t => this.readVariable(t).length === 0);
    if (missing !== undefined)
      return StepResult.failed(Resources.formatPruneVariableMissing(missing));

    const api = new GitHubApi(this.readVariable(Resources.apiUrlVariable), this.readVariable(Resources.tokenVariable), this.timeoutMilliseconds);

    return [api, Resources.formatVersionsResource(packageName)];
  }

  private readVariable(name: string): string {
    return this.environment[name] ?? "";
  }
}
