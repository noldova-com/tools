/**
 * @license
 * Copyright (c) Noldova.
 *
 * This source code is licensed under the license found in the
 * LICENSE file in the root directory of this source tree.
 */

import type { IStepOutput, ITagHost, StepResult } from "@noldova/tools.pipelines";

/**
 * Writes a step's messages as a GitHub Actions job reads them: a success to
 * standard output as it is, and a failure as an error annotation, which the
 * run's summary shows.
 */
export declare class GitHubStepOutput implements IStepOutput {
  /**
   * Creates the output over two streams.
   *
   * @param standardOutput Where a success goes, such as `process.stdout`.
   * @param standardError Where a failure goes, such as `process.stderr`;
   * GitHub Actions reads workflow commands from it as it does from standard
   * output, so a workflow that keeps a step's standard output, such as the
   * nightly version, still shows the failure.
   * @example
   * ```ts
   * import { GitHubStepOutput } from "@noldova/tools.pipelines.github";
   *
   * const output = new GitHubStepOutput(process.stdout, process.stderr);
   * ```
   */
  public constructor(standardOutput: NodeJS.WritableStream, standardError: NodeJS.WritableStream);

  /**
   * Writes the message of a step that succeeded, and a line feed, to standard
   * output; an empty message writes nothing.
   *
   * @param message The step's message.
   * @example
   * ```ts
   * import { GitHubStepOutput } from "@noldova/tools.pipelines.github";
   *
   * const output = new GitHubStepOutput(process.stdout, process.stderr);
   * output.writeSuccess("0.0.5-nightly.20261102"); // writes "0.0.5-nightly.20261102\n"
   * output.writeSuccess(""); // writes nothing
   * ```
   */
  public writeSuccess(message: string): void;

  /**
   * Writes the message of a step that failed to standard error as one
   * `::error::` workflow command, with `%`, carriage returns and line feeds
   * escaped as `%25`, `%0D` and `%0A`, so a message of several lines is one
   * annotation.
   *
   * @param message What is wrong.
   * @example
   * ```ts
   * import { GitHubStepOutput } from "@noldova/tools.pipelines.github";
   *
   * const output = new GitHubStepOutput(process.stdout, process.stderr);
   * output.writeFailure("archives has no noldova-tools.pipelines-0.0.4.tgz.\n100% of nothing");
   * // writes "::error::archives has no noldova-tools.pipelines-0.0.4.tgz.%0A100%25 of nothing\n"
   * ```
   */
  public writeFailure(message: string): void;
}

/**
 * GitHub's tags, through its REST API, as the tag step of
 * `@noldova/tools.pipelines` reads and creates them.
 *
 * It reaches the API with three environment variables, which GitHub Actions
 * sets in a job, but for the token, which the workflow passes in:
 * `GITHUB_API_URL`, such as `https://api.github.com`; `GITHUB_REPOSITORY`,
 * such as `noldova-com/tools`; and `GITHUB_TOKEN`, a token that may write
 * the repository's contents, such as the job's own. It sends the token only
 * to that API and never writes it anywhere.
 */
export declare class GitHubTags implements ITagHost {
  /**
   * Creates the tags over an environment, which it reads at each call.
   *
   * @param environment The environment variables, such as `process.env`.
   * @example
   * ```ts
   * import { GitHubTags } from "@noldova/tools.pipelines.github";
   *
   * const tags = new GitHubTags(process.env);
   * ```
   */
  public constructor(environment: Readonly<Record<string, string | undefined>>);

  /**
   * Reads the commit a tag points to, following an annotated tag to its
   * commit.
   *
   * @param tag The tag's name, such as `v0.0.4`.
   * @returns A promise of the commit's full id, `""` when the repository has
   * no such tag, or a failed {@link StepResult}: when one of the three
   * environment variables is missing or empty, naming it; when the tag points
   * to something other than a commit, such as a tree; or when GitHub answers
   * with another status, with the request, the status and GitHub's message,
   * such as `GitHub answered GET repos/noldova-com/tools/git/ref/tags/v0.0.4
   * with 403: Resource not accessible by integration`. It rejects with
   * `JsonException`, from `@noldova/context.json`, for an answer that is not
   * the JSON GitHub documents, and with the error `fetch` gives when GitHub
   * can't be reached or doesn't answer within a minute.
   * @example
   * ```ts
   * import { GitHubTags } from "@noldova/tools.pipelines.github";
   *
   * const commit = await new GitHubTags(process.env).readTagAsync("v0.0.4");
   * ```
   */
  public readTagAsync(tag: string): Promise<string | StepResult>;

  /**
   * Creates a lightweight tag at a commit, unless the repository already has
   * a tag of that name; it never moves a tag.
   *
   * @param tag The tag's name, such as `v0.0.4`.
   * @param commit The commit's full id.
   * @returns A promise of `true` when GitHub created the tag, `false` when it
   * answers that the reference already exists, or a failed
   * {@link StepResult}, as {@link GitHubTags.readTagAsync} gives one. It
   * rejects as {@link GitHubTags.readTagAsync} does.
   * @example
   * ```ts
   * import { GitHubTags } from "@noldova/tools.pipelines.github";
   *
   * const created = await new GitHubTags(process.env).createTagAsync("v0.0.4", "225059f4c1e6a3b2d8f7e9a0b1c2d3e4f5a6b7c8");
   * ```
   */
  public createTagAsync(tag: string, commit: string): Promise<boolean | StepResult>;
}

/**
 * The `pipelines` command line a GitHub Actions workflow calls: it runs the
 * source, archive, publish, nightly and tag steps of `@noldova/tools.pipelines`
 * in the current directory, which is the clone the steps check and where a
 * folder value is. The tag step reaches GitHub through {@link GitHubTags},
 * with the process's environment.
 */
export declare class PipelinesProgram {
  /**
   * Creates the program.
   *
   * @param output Where each message goes, such as a {@link GitHubStepOutput}.
   * @example
   * ```ts
   * import { GitHubStepOutput, PipelinesProgram } from "@noldova/tools.pipelines.github";
   *
   * const program = new PipelinesProgram(new GitHubStepOutput(process.stdout, process.stderr));
   * ```
   */
  public constructor(output: IStepOutput);

  /**
   * Runs the step the first value names with the values after it.
   *
   * @param values The command line's values after the program, such as
   * `["source", "0.0.4", "<commit>"]`.
   * @returns A promise of the exit code: `0` after a step that succeeded,
   * `1` after a step that failed, or when no step has the first value's name,
   * after writing the usage line of every step.
   * @throws `ProcessException`, from `@noldova/tools.pipelines`, when git,
   * tar or npm can't start, and the other exceptions of the step that runs;
   * a check that fails is a failed step, never an exception.
   * @example
   * ```ts
   * import { GitHubStepOutput, PipelinesProgram } from "@noldova/tools.pipelines.github";
   *
   * const program = new PipelinesProgram(new GitHubStepOutput(process.stdout, process.stderr));
   * process.exitCode = await program.runAsync(["source", "0.0.4", "225059f4c1e6a3b2d8f7e9a0b1c2d3e4f5a6b7c8"]);
   * ```
   */
  public runAsync(values: readonly string[]): Promise<number>;
}
