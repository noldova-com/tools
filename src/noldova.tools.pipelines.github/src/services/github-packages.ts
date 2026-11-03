/**
 * @license
 * Copyright (c) Noldova.
 *
 * This source code is licensed under the license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { setTimeout as delayAsync } from "node:timers/promises";

import { type IRegistryHost, StepResult } from "@noldova/tools.pipelines";

import { Resources } from "../resources.js";
import { GitHubApi } from "./github-api.js";

export class GitHubPackages implements IRegistryHost {
  private readonly environment: Readonly<Record<string, string | undefined>>;
  private readonly timeoutMilliseconds: number;
  private readonly waitAsync: (milliseconds: number) => Promise<void>;
  private readonly createSignal: (timeoutMilliseconds: number) => AbortSignal;
  private readonly versionIds: Map<string, Map<string, number>> = new Map();

  public readonly registry: string = Resources.packagesRegistry;

  public constructor(environment: Readonly<Record<string, string | undefined>>, timeoutMilliseconds: number = Resources.apiTimeoutMilliseconds, waitAsync: (milliseconds: number) => Promise<void> = delayAsync, createSignal: (timeoutMilliseconds: number) => AbortSignal = GitHubApi.createTimeoutSignal) {
    this.environment = environment;
    this.timeoutMilliseconds = timeoutMilliseconds;
    this.waitAsync = waitAsync;
    this.createSignal = createSignal;
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
    if (answer instanceof StepResult)
      return answer;
    if (answer.status === Resources.deletedStatus) {
      ids.delete(version);

      return true;
    }
    if (answer.status !== Resources.notFoundStatus)
      return answer.toFailure();

    const listed = await this.readIdsAsync(packageName, api, resource);
    if (listed instanceof StepResult)
      return listed;

    return listed.has(version) ? StepResult.failed(Resources.formatVersionStillListed(packageName, version)) : false;
  }

  public async readLockFilesAsync(): Promise<ReadonlyMap<string, string> | StepResult> {
    const missing = [Resources.apiUrlVariable, Resources.repositoriesTokenVariable].find(t => this.readVariable(t).length === 0);
    if (missing !== undefined)
      return StepResult.failed(Resources.formatPruneVariableMissing(missing));

    const api = new GitHubApi(this.readVariable(Resources.apiUrlVariable), this.readVariable(Resources.repositoriesTokenVariable), this.timeoutMilliseconds, this.waitAsync, this.createSignal);
    const repositories = await GitHubPackages.listRepositoriesAsync(api);
    if (repositories instanceof StepResult)
      return repositories;

    const lockFiles = new Map<string, string>();
    for (const [repository, branch] of repositories) {
      const read = await GitHubPackages.readRepositoryLockFilesAsync(api, repository, branch, lockFiles);
      if (read !== null)
        return read;
    }

    const relisted = await GitHubPackages.listRepositoriesAsync(api);
    if (relisted instanceof StepResult)
      return relisted;
    if (JSON.stringify(relisted) !== JSON.stringify(repositories))
      return StepResult.failed(Resources.repositoriesChanged);

    return lockFiles;
  }

  private static async listRepositoriesAsync(api: GitHubApi): Promise<readonly (readonly [repository: string, branch: string])[] | StepResult> {
    const repositories: (readonly [repository: string, branch: string])[] = [];
    let totalCount = 0;
    for (let page = 1; ; page++) {
      const answer = await api.requestAsync(Resources.readMethod, Resources.formatInstallationRepositoriesPage(page));
      if (answer instanceof StepResult)
        return answer;
      if (answer.status !== Resources.foundStatus)
        return answer.toFailure();

      const body = answer.readBody();
      const items = body.readObjectArray(Resources.repositoriesField);
      totalCount = body.readInteger(Resources.totalCountField);
      repositories.push(...items.map(t => [t.readString(Resources.fullNameField), t.readString(Resources.defaultBranchField)] as const));
      if (items.length < Resources.repositoriesPageSize)
        break;
    }

    if (repositories.length !== totalCount)
      return StepResult.failed(Resources.formatRepositoriesMiscounted(repositories.length, totalCount));

    return repositories.sort(([t], [u]) => t.localeCompare(u));
  }

  private static async readRepositoryLockFilesAsync(api: GitHubApi, repository: string, branch: string, lockFiles: Map<string, string>): Promise<StepResult | null> {
    const tree = await api.requestAsync(Resources.readMethod, Resources.formatTreeResource(repository, branch));
    if (tree instanceof StepResult)
      return tree;
    if (tree.status === Resources.conflictStatus)
      return null;
    if (tree.status !== Resources.foundStatus)
      return tree.toFailure();

    const body = tree.readBody();
    if (body.readBoolean(Resources.truncatedField))
      return StepResult.failed(Resources.formatTreeTruncated(repository, branch));

    for (const entry of body.readObjectArray(Resources.treeField)) {
      const filePath = entry.readString(Resources.pathField);
      const segments = filePath.split(Resources.pathSeparator);
      if (entry.readString(Resources.typeField) !== Resources.blobType || segments.at(-1) !== Resources.lockFileName || segments.includes(Resources.vendorFolderName))
        continue;

      const blob = await api.requestAsync(Resources.readMethod, Resources.formatBlobResource(repository, entry.readString(Resources.shaField)));
      if (blob instanceof StepResult)
        return blob;
      if (blob.status !== Resources.foundStatus)
        return blob.toFailure();

      lockFiles.set(Resources.formatLockFilePath(repository, filePath), Buffer.from(blob.readBody().readString(Resources.contentField), Resources.blobEncoding).toString(Resources.textEncoding));
    }

    return null;
  }

  private async readIdsAsync(packageName: string, api: GitHubApi, resource: string): Promise<Map<string, number> | StepResult> {
    const ids = new Map<string, number>();
    for (let page = 1; ; page++) {
      const answer = await api.requestAsync(Resources.readMethod, Resources.formatVersionsPage(resource, page));
      if (answer instanceof StepResult)
        return answer;
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

    const api = new GitHubApi(this.readVariable(Resources.apiUrlVariable), this.readVariable(Resources.tokenVariable), this.timeoutMilliseconds, this.waitAsync, this.createSignal);

    return [api, Resources.formatVersionsResource(packageName)];
  }

  private readVariable(name: string): string {
    return this.environment[name] ?? "";
  }
}
