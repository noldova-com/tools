/**
 * @license
 * Copyright (c) Noldova.
 *
 * This source code is licensed under the license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { ArchiveStep, BuildStep, CommandLine, DependentsStep, Git, InstalledStep, type IStepOutput, LineEndingsStep, NightlyStep, Npm, PinsStep, ProcessRunner, PruneStep, PublishStep, ReproducibleStep, SourceStep, TagStep, Tar, TestStep, ToolchainStep, TypeScript, UnchangedStep } from "@noldova/tools.pipelines";

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
    const archiveStep = new ArchiveStep(git, new Tar(processRunner), npm);
    const typeScript = new TypeScript(processRunner, process.cwd());
    const steps = [new SourceStep(git), archiveStep, new PublishStep(archiveStep, npm), new NightlyStep(git, archiveStep, npm), new PruneStep(git, archiveStep, new GitHubPackages(process.env)), new TagStep(new GitHubTags(process.env)), new ToolchainStep(npm, process.version), new LineEndingsStep(git), new UnchangedStep(git), new ReproducibleStep(git, npm, process.env[Resources.runnerTemporaryVariable]), new DependentsStep(archiveStep, new GitHubUpdates(process.env, processRunner, undefined, undefined, undefined, this.output), processRunner, npm, process.env[Resources.runnerTemporaryVariable], this.output), new PinsStep(git, new GitHubUpdates(process.env, processRunner, undefined, undefined, undefined, this.output), processRunner, process.env[Resources.runnerTemporaryVariable], this.output), new InstalledStep(process.cwd()), new BuildStep(git, npm, typeScript, processRunner, this.output), new TestStep(typeScript, processRunner, this.output)];

    return new CommandLine(Resources.programName, steps, this.output).runAsync(values);
  }
}
