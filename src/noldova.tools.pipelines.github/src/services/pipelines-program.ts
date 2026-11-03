/**
 * @license
 * Copyright (c) Noldova.
 *
 * This source code is licensed under the license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { ArchiveStep, CommandLine, DependentsStep, Git, type IStepOutput, LineEndingsStep, NightlyStep, Npm, ProcessRunner, PruneStep, PublishStep, ReproducibleStep, SourceStep, TagStep, Tar, ToolchainStep, UnchangedStep } from "@noldova/tools.pipelines";

import { Resources } from "../resources.js";
import { GitHubPackages } from "./github-packages.js";
import { GitHubTags } from "./github-tags.js";
import { GitHubUpdates } from "./github-updates.js";

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
    const steps = [new SourceStep(git), archiveStep, new PublishStep(archiveStep, npm), new NightlyStep(git, archiveStep, npm), new PruneStep(git, archiveStep, new GitHubPackages(process.env)), new TagStep(new GitHubTags(process.env)), new ToolchainStep(npm, process.version), new LineEndingsStep(git), new UnchangedStep(git), new ReproducibleStep(git, npm, process.env[Resources.runnerTemporaryVariable]), new DependentsStep(archiveStep, new GitHubUpdates(process.env, processRunner), processRunner, npm, process.env[Resources.runnerTemporaryVariable], this.output)];

    return new CommandLine(Resources.programName, steps, this.output).runAsync(values);
  }
}
