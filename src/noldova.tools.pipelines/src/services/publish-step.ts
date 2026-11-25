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

import "@noldova/context.core";

import type { IStep } from "../interfaces/i-step.js";
import type { PackageArchive } from "../models/package-archive.js";
import { StepResult } from "../models/step-result.js";
import { Version } from "../models/version.js";
import { Resources } from "../resources.js";
import type { ArchiveStep } from "./archive-step.js";
import { Npm } from "./npm.js";

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
    if (Object.isUndefined(folder) || Object.isUndefined(version) || Object.isUndefined(commit) || Object.isUndefined(scope) || Object.isUndefined(registry) || Object.isUndefined(access) || rest.length !== 0)
      return StepResult.failed(Resources.formatStepValuesInvalid(this.name, this.usage));
    if (!Npm.isRegistry(registry))
      return StepResult.failed(Resources.formatRegistryInvalid());
    if (!Resources.accessLevels.includes(access))
      return StepResult.failed(Resources.formatAccessInvalid(access));

    const check = await this.archiveStep.checkAsync([folder, version, commit, scope]);
    if (!check.result.isSuccessful)
      return check.result;

    const tag = Object.isNull(Version.parse(version).nightlyDate) ? Resources.latestTag : Resources.nightlyTag;
    const comparedTags = tag === Resources.latestTag ? [tag] : [Resources.latestTag, tag];
    const reports: string[] = [];
    const findings: string[] = [];
    const pending: PackageArchive[] = [];
    for (const archive of check.archives) {
      const specifier = Resources.formatSpecifier(archive.packageName, version);
      const published = await this.npm.readFieldOrEmptyAsync(specifier, Resources.npmIntegrityField, registry);
      if (published instanceof StepResult)
        findings.push(published.message);
      else if (published === PublishStep.readIntegrity(archive.filePath))
        reports.push(Resources.formatAlreadyPublished(specifier));
      else if (published.length > 0)
        findings.push(Resources.formatPublishedOtherwise(specifier));
      else {
        const finding = await this.checkNewerAsync(archive.packageName, version, comparedTags, registry);
        if (Object.isNull(finding))
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
        findings.push(Resources.formatNpmFailed(Resources.formatSpecifier(archive.packageName, version), Resources.npmPublishValues, result.exitCode, PublishStep.removeTarballListing(result.errorOutput)));
        break;
      }

      published.push(archive);
    }

    const deadline = performance.now() + this.waitMilliseconds;
    for (const archive of published) {
      const finding = await this.waitUntilServedAsync(archive, version, registry, deadline);
      if (Object.isNull(finding))
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
      if (!Object.isNull(finding))
        return finding;
    }

    return null;
  }

  private async checkNewerThanTagAsync(packageName: string, version: string, tag: string, registry: string): Promise<string | null> {
    const tagged = await this.npm.readFieldOrEmptyAsync(packageName, Resources.formatDistTagField(tag), registry);
    if (tagged instanceof StepResult)
      return tagged.message;
    if (tagged.length === 0)
      return null;
    if (!Object.isNull(Version.validate(tagged)))
      return Resources.formatTaggedInvalid(packageName, tag, tagged);

    return Version.parse(version).compareTo(Version.parse(tagged)) > 0 ? null : Resources.formatNotNewer(Resources.formatSpecifier(packageName, version), tag, tagged);
  }

  private async waitUntilServedAsync(archive: PackageArchive, version: string, registry: string, deadline: number): Promise<string | null> {
    const specifier = Resources.formatSpecifier(archive.packageName, version);
    let served = await this.npm.readFieldOrEmptyAsync(specifier, Resources.npmIntegrityField, registry);
    while ((served instanceof StepResult || served.length === 0) && performance.now() < deadline) {
      await delayAsync(this.retryMilliseconds);
      served = await this.npm.readFieldOrEmptyAsync(specifier, Resources.npmIntegrityField, registry);
    }

    if (served instanceof StepResult || served.length === 0)
      return Resources.formatNotServed(specifier, this.waitMilliseconds);

    return served === PublishStep.readIntegrity(archive.filePath) ? null : Resources.formatPublishedOtherwise(specifier);
  }

  private static removeTarballListing(errorOutput: string): string {
    const kept: string[] = [];
    let isListing = false;
    for (const line of errorOutput.split(Resources.lineBreakPattern)) {
      const text = line.trim();
      if (text === Resources.tarballListingStart)
        isListing = true;
      else if (isListing && !text.startsWith(Resources.npmNoticePrefix))
        isListing = false;

      if (isListing)
        isListing = !Resources.tarballListingEndPattern.test(text);
      else if (text !== Resources.npmNoticeLine)
        kept.push(line);
    }

    return kept.join(Resources.lineSeparator);
  }

  private static readIntegrity(archivePath: string): string {
    const hash = crypto.createHash(Resources.integrityAlgorithm).update(fs.readFileSync(archivePath)).digest(Resources.integrityEncoding);

    return Resources.formatIntegrity(Resources.integrityAlgorithm, hash);
  }
}
