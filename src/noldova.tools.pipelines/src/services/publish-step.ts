/**
 * @license
 * Copyright (c) Noldova.
 *
 * This source code is licensed under the license found in the
 * LICENSE file in the root directory of this source tree.
 */

import crypto from "node:crypto";
import fs from "node:fs";
import { setTimeout as delayAsync } from "node:timers/promises";

import type { IStep } from "../interfaces/i-step.js";
import type { PackageArchive } from "../models/package-archive.js";
import { StepResult } from "../models/step-result.js";
import { Version } from "../models/version.js";
import { Resources } from "../resources.js";
import type { ArchiveStep } from "./archive-step.js";
import type { Npm } from "./npm.js";

export class PublishStep implements IStep {
  private readonly archiveStep: ArchiveStep;
  private readonly npm: Npm;
  private readonly waitMilliseconds: number;
  private readonly retryMilliseconds: number;

  public readonly name: string = Resources.publishStepName;
  public readonly usage: string = Resources.publishStepUsage;

  public constructor(archiveStep: ArchiveStep, npm: Npm, waitMilliseconds: number = Resources.publishWaitMilliseconds, retryMilliseconds: number = Resources.publishRetryMilliseconds) {
    this.archiveStep = archiveStep;
    this.npm = npm;
    this.waitMilliseconds = waitMilliseconds;
    this.retryMilliseconds = retryMilliseconds;
  }

  public async runAsync(values: readonly string[]): Promise<StepResult> {
    const [folder, version, commit, scope, registry, access, ...rest] = values;
    if (folder === undefined || version === undefined || commit === undefined || scope === undefined || registry === undefined || access === undefined || rest.length !== 0)
      return StepResult.failed(Resources.formatStepValuesInvalid(this.name, this.usage));
    if (!PublishStep.isRegistry(registry))
      return StepResult.failed(Resources.formatRegistryInvalid());
    if (!Resources.accessLevels.includes(access))
      return StepResult.failed(Resources.formatAccessInvalid(access));

    const check = await this.archiveStep.checkAsync([folder, version, commit, scope]);
    if (!check.result.isSuccessful)
      return check.result;

    const tag = Version.parse(version).nightlyDate === null ? Resources.latestTag : Resources.nightlyTag;
    const comparedTags = tag === Resources.latestTag ? [tag] : [Resources.latestTag, tag];
    const reports: string[] = [];
    const findings: string[] = [];
    const pending: PackageArchive[] = [];
    for (const archive of check.archives) {
      const specifier = Resources.formatSpecifier(archive.packageName, version);
      const published = await this.readFieldOrEmptyAsync(specifier, Resources.npmIntegrityField, registry);
      if (published instanceof StepResult)
        findings.push(published.message);
      else if (published === PublishStep.readIntegrity(archive.filePath))
        reports.push(Resources.formatAlreadyPublished(specifier));
      else if (published.length > 0)
        findings.push(Resources.formatPublishedOtherwise(specifier));
      else {
        const finding = await this.checkNewerAsync(archive.packageName, version, comparedTags, registry);
        if (finding === null)
          pending.push(archive);
        else
          findings.push(finding);
      }
    }

    if (findings.length > 0)
      return StepResult.failed(findings.join(Resources.lineSeparator));

    const published: PackageArchive[] = [];
    for (const archive of pending) {
      const result = await this.npm.publishAsync(archive.filePath, tag, access, registry);
      if (!result.isSuccessful) {
        findings.push(Resources.formatNpmFailed(Resources.formatSpecifier(archive.packageName, version), Resources.npmPublishValues, result.exitCode, result.errorOutput));
        break;
      }

      published.push(archive);
    }

    const deadline = performance.now() + this.waitMilliseconds;
    for (const archive of published) {
      const finding = await this.waitUntilServedAsync(archive, version, registry, deadline);
      if (finding === null)
        reports.push(Resources.formatPublished(Resources.formatSpecifier(archive.packageName, version)));
      else
        findings.push(finding);
    }

    const message = [...reports, ...findings].join(Resources.lineSeparator);

    return findings.length > 0 ? StepResult.failed(message) : StepResult.succeeded(message);
  }

  private async checkNewerAsync(packageName: string, version: string, tags: readonly string[], registry: string): Promise<string | null> {
    for (const tag of tags) {
      const finding = await this.checkNewerThanTagAsync(packageName, version, tag, registry);
      if (finding !== null)
        return finding;
    }

    return null;
  }

  private async checkNewerThanTagAsync(packageName: string, version: string, tag: string, registry: string): Promise<string | null> {
    const tagged = await this.readFieldOrEmptyAsync(packageName, Resources.formatDistTagField(tag), registry);
    if (tagged instanceof StepResult)
      return tagged.message;
    if (tagged.length === 0)
      return null;
    if (Version.validate(tagged) !== null)
      return Resources.formatTaggedInvalid(packageName, tag, tagged);

    return Version.parse(version).compareTo(Version.parse(tagged)) > 0 ? null : Resources.formatNotNewer(Resources.formatSpecifier(packageName, version), tag, tagged);
  }

  private async waitUntilServedAsync(archive: PackageArchive, version: string, registry: string, deadline: number): Promise<string | null> {
    const specifier = Resources.formatSpecifier(archive.packageName, version);
    let served = await this.readFieldOrEmptyAsync(specifier, Resources.npmIntegrityField, registry);
    while ((served instanceof StepResult || served.length === 0) && performance.now() < deadline) {
      await delayAsync(this.retryMilliseconds);
      served = await this.readFieldOrEmptyAsync(specifier, Resources.npmIntegrityField, registry);
    }

    if (served instanceof StepResult || served.length === 0)
      return Resources.formatNotServed(specifier, this.waitMilliseconds);

    return served === PublishStep.readIntegrity(archive.filePath) ? null : Resources.formatPublishedOtherwise(specifier);
  }

  private async readFieldOrEmptyAsync(specifier: string, field: string, registry: string): Promise<string | StepResult> {
    const result = await this.npm.viewAsync(specifier, field, registry);
    if (result.isSuccessful)
      return result.output.trim();
    if (result.output.includes(Resources.npmNotFoundCode) || result.errorOutput.includes(Resources.npmNotFoundCode))
      return "";

    return StepResult.failed(Resources.formatNpmFailed(specifier, Resources.npmViewValues, result.exitCode, result.errorOutput));
  }

  private static isRegistry(text: string): boolean {
    if (!URL.canParse(text))
      return false;

    const url = new URL(text);

    return url.protocol === Resources.registryProtocol && url.username.length === 0 && url.password.length === 0 && url.search.length === 0 && url.hash.length === 0;
  }

  private static readIntegrity(archivePath: string): string {
    const hash = crypto.createHash(Resources.integrityAlgorithm).update(fs.readFileSync(archivePath)).digest(Resources.integrityEncoding);

    return Resources.formatIntegrity(Resources.integrityAlgorithm, hash);
  }
}
