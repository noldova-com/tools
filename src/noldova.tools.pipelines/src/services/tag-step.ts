/**
 * @license
 * Copyright (c) Noldova.
 *
 * This source code is licensed under the license found in the
 * LICENSE file in the root directory of this source tree.
 */

import type { IStep } from "../interfaces/i-step.js";
import type { ITagHost } from "../interfaces/i-tag-host.js";
import { StepResult } from "../models/step-result.js";
import { Version } from "../models/version.js";
import { Resources } from "../resources.js";

export class TagStep implements IStep {
  private readonly tagHost: ITagHost;

  public readonly name: string = Resources.tagStepName;
  public readonly usage: string = Resources.tagStepUsage;

  public constructor(tagHost: ITagHost) {
    this.tagHost = tagHost;
  }

  public async runAsync(values: readonly string[]): Promise<StepResult> {
    const [version, commit, ...rest] = values;
    if (version === undefined || commit === undefined || rest.length !== 0)
      return StepResult.failed(Resources.formatStepValuesInvalid(this.name, this.usage));

    const versionProblem = Version.validate(version);
    if (versionProblem !== null)
      return StepResult.failed(versionProblem);
    if (Version.parse(version).nightlyDate !== null)
      return StepResult.failed(Resources.formatTagVersionNotRelease(version));
    if (!Resources.commitPattern.test(commit))
      return StepResult.failed(Resources.formatCommitInvalid(commit));

    const tag = Resources.formatTagName(version);
    let found = await this.tagHost.readTagAsync(tag);
    if (found === "") {
      const created = await this.tagHost.createTagAsync(tag, commit);
      if (created === true)
        return StepResult.succeeded(Resources.formatTagCreated(tag, commit));
      if (created instanceof StepResult)
        return created;

      found = await this.tagHost.readTagAsync(tag);
      if (found === "")
        return StepResult.failed(Resources.formatTagUnreadable(tag));
    }

    if (found instanceof StepResult)
      return found;
    if (found !== commit)
      return StepResult.failed(Resources.formatTagElsewhere(tag, found, commit));

    return StepResult.succeeded(Resources.formatTagFound(tag, commit));
  }
}
