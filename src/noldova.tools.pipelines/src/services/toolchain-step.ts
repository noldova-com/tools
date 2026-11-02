/**
 * @license
 * Copyright (c) Noldova.
 *
 * This source code is licensed under the license found in the
 * LICENSE file in the root directory of this source tree.
 */

import type { IStep } from "../interfaces/i-step.js";
import { StepResult } from "../models/step-result.js";
import { Resources } from "../resources.js";
import type { Npm } from "./npm.js";

export class ToolchainStep implements IStep {
  private readonly npm: Npm;
  private readonly nodeVersion: string;

  public readonly name: string = Resources.toolchainStepName;
  public readonly usage: string = Resources.toolchainStepUsage;

  public constructor(npm: Npm, nodeVersion: string) {
    this.npm = npm;
    this.nodeVersion = nodeVersion;
  }

  public async runAsync(values: readonly string[]): Promise<StepResult> {
    const [nodeVersion, npmVersion = "", ...rest] = values;
    if (nodeVersion === undefined || rest.length !== 0)
      return StepResult.failed(Resources.formatStepValuesInvalid(this.name, this.usage));

    if (!Resources.exactVersionPattern.test(nodeVersion))
      return StepResult.failed(Resources.formatExactVersionInvalid(nodeVersion));
    if (npmVersion.length > 0 && !Resources.exactVersionPattern.test(npmVersion))
      return StepResult.failed(Resources.formatExactVersionInvalid(npmVersion));

    const findings: string[] = [];
    if (this.nodeVersion !== `${Resources.nodeVersionPrefix}${nodeVersion}`)
      findings.push(Resources.formatNodeVersionDiffers(this.nodeVersion, nodeVersion));

    const foundNpmVersion = npmVersion.length === 0 ? null : await this.npm.readVersionAsync();
    if (foundNpmVersion !== null && foundNpmVersion !== npmVersion)
      findings.push(Resources.formatNpmVersionDiffers(foundNpmVersion, npmVersion));

    if (findings.length > 0)
      return StepResult.failed(findings.join(Resources.lineSeparator));

    return StepResult.succeeded(Resources.formatToolchainChecked(this.nodeVersion, foundNpmVersion));
  }
}
