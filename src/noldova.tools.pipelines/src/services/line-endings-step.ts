/**
 * @license
 * Copyright (c) Noldova.
 *
 * This source code is licensed under the license found in the
 * LICENSE file in the root directory of this source tree.
 */

import type { IStep } from "../interfaces/i-step.js";
import { StepResult } from "../models/step-result.js";
import type { TrackedFile } from "../models/tracked-file.js";
import { Resources } from "../resources.js";
import type { Git } from "./git.js";

export class LineEndingsStep implements IStep {
  private readonly git: Git;

  public readonly name: string = Resources.lineEndingsStepName;
  public readonly usage: string = Resources.lineEndingsStepUsage;

  public constructor(git: Git) {
    this.git = git;
  }

  public async runAsync(values: readonly string[]): Promise<StepResult> {
    if (values.length !== 0)
      return StepResult.failed(Resources.formatStepValuesInvalid(this.name, this.usage));

    const files = await this.git.listTrackedFilesAsync();
    if (files.length === 0)
      return StepResult.failed(Resources.trackedFilesMissing);

    const findings: string[] = [];
    if (!await this.hasGitAttributesLineAsync())
      findings.push(Resources.formatGitAttributesLineMissing(Resources.gitAttributesFilePath, Resources.gitAttributesLine));

    const textFiles = files.filter(t => t.isText);
    for (const file of textFiles) {
      const finding = await this.checkFileAsync(file);
      if (finding !== null)
        findings.push(finding);
    }

    if (findings.length > 0)
      return StepResult.failed(findings.join(Resources.lineSeparator));

    return StepResult.succeeded(Resources.formatLineEndingsChecked(Resources.gitAttributesFilePath, Resources.gitAttributesLine, textFiles.length));
  }

  private async hasGitAttributesLineAsync(): Promise<boolean> {
    if (!await this.git.hasFileAsync(Resources.gitCheckoutRevision, Resources.gitAttributesFilePath))
      return false;

    const content = await this.git.readFileAsync(Resources.gitCheckoutRevision, Resources.gitAttributesFilePath);

    return content.split(Resources.lineSeparator).includes(Resources.gitAttributesLine);
  }

  private async checkFileAsync(file: TrackedFile): Promise<string | null> {
    if (file.lineEndings === Resources.crlfLineEndings)
      return Resources.formatCrlfLineEndings(file.filePath);
    if (file.lineEndings === Resources.mixedLineEndings)
      return Resources.formatMixedLineEndings(file.filePath);

    const end = await this.git.readCheckoutFileEndAsync(file.filePath, Resources.fileEndByteCount);
    if (end.at(-1) !== Resources.newlineByte)
      return Resources.formatFinalNewlineMissing(file.filePath);
    if (end.length === Resources.fileEndByteCount && end.at(-2) === Resources.newlineByte)
      return Resources.formatFinalBlankLine(file.filePath);

    return null;
  }
}
