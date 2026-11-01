/**
 * @license
 * Copyright (c) Noldova.
 *
 * This source code is licensed under the license found in the
 * LICENSE file in the root directory of this source tree.
 */

import type { IStepOutput } from "@noldova/tools.pipelines";

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
 * The `pipelines` command line a GitHub Actions workflow calls: it runs the
 * source, archive, publish and nightly steps of `@noldova/tools.pipelines`
 * in the current directory, which is the clone the steps check and where a
 * folder value is.
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
