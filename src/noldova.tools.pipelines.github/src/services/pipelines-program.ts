/**
 * @license
 * Copyright (c) Noldova.
 *
 * This source code is licensed under the license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { ArchiveStep, CommandLine, Git, type IStepOutput, NightlyStep, Npm, ProcessRunner, PublishStep, SourceStep, TagStep, Tar } from "@noldova/tools.pipelines";

import { Resources } from "../resources.js";
import { GitHubTags } from "./github-tags.js";

export class PipelinesProgram {
  private readonly output: IStepOutput;

  public constructor(output: IStepOutput) {
    this.output = output;
  }

  public async runAsync(values: readonly string[]): Promise<number> {
    const processRunner = new ProcessRunner();
    const git = new Git(processRunner, process.cwd());
    const npm = new Npm(processRunner, process.cwd());
    const archiveStep = new ArchiveStep(git, new Tar(processRunner));
    const steps = [new SourceStep(git), archiveStep, new PublishStep(archiveStep, npm), new NightlyStep(git, archiveStep, npm), new TagStep(new GitHubTags(process.env))];

    return new CommandLine(Resources.programName, steps, this.output).runAsync(values);
  }
}
