/**
 * @license
 * Copyright (c) Noldova.
 *
 * This source code is licensed under the license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { Exception, type ExceptionOptions } from "@noldova/context.exceptions";

/**
 * The abstract base of this package's exceptions; catch it to handle any of
 * them. A check that finds something wrong returns a failed
 * {@link StepResult} instead.
 */
export declare abstract class PipelineException extends Exception {
  /**
   * Initializes the message and the cause for a derived exception.
   *
   * @param message The complete explanation, kept as given.
   * @param options The failure that caused this one, as its `cause`.
   * Omitted, the exception has no cause.
   * @example
   * ```ts
   * import type { ExceptionOptions } from "@noldova/context.exceptions";
   * import { PipelineException } from "@noldova/tools.pipelines";
   *
   * class StepException extends PipelineException {
   *   public constructor(message: string, options?: ExceptionOptions) {
   *     super(message, options);
   *   }
   * }
   * const exception = new StepException("The step could not run.");
   * exception.name; // "StepException"
   * exception instanceof PipelineException; // true
   * ```
   */
  protected constructor(message: string, options?: ExceptionOptions);
}

/**
 * The exception that is thrown when a program cannot start, or when it ends
 * in a way that no check expects, such as git failing to read a file it
 * reported as present.
 */
export declare class ProcessException extends PipelineException {
  /**
   * The program that could not start or that failed, such as `"git"`.
   */
  public readonly program: string;

  /**
   * Creates the exception for a program.
   *
   * @param program The program that could not start or that failed.
   * @param message The complete explanation, kept as given, such as the
   * command that failed and what it wrote to its error output. Omitted, it is
   * `The program "<program>" failed.`
   * @param options The failure that caused this one, such as the error a
   * program that cannot start reports. Omitted, the exception has no cause.
   * @example
   * ```ts
   * import { ExceptionOptions } from "@noldova/context.exceptions";
   * import { PipelineException, ProcessException } from "@noldova/tools.pipelines";
   *
   * const exception = new ProcessException("git", "\"git\" could not start: spawn git ENOENT", new ExceptionOptions(new Error("spawn git ENOENT")));
   * exception.program; // "git"
   * exception.name; // "ProcessException"
   * exception instanceof PipelineException; // true
   * new ProcessException("git").message; // "The program \"git\" failed."
   * ```
   */
  public constructor(program: string, message?: string, options?: ExceptionOptions);
}

/**
 * The exception that is thrown when a text is not a version, when a
 * version's part is not a whole number from 0 to `Number.MAX_SAFE_INTEGER`,
 * or when a nightly version's date is not a calendar date.
 */
export declare class VersionException extends PipelineException {
  /**
   * Creates the exception with the explanation it reports.
   *
   * @param message The complete explanation, kept as given, such as which
   * text was not a version and the form a version takes. Omitted, it is
   * `The text is not a version.`
   * @param options The failure that caused this one, as its `cause`.
   * Omitted, the exception has no cause.
   * @example
   * ```ts
   * import { PipelineException, VersionException } from "@noldova/tools.pipelines";
   *
   * const exception = new VersionException("\"1.4\" is not a version.");
   * exception.name; // "VersionException"
   * exception instanceof PipelineException; // true
   * new VersionException().message; // "The text is not a version."
   * ```
   */
  public constructor(message?: string, options?: ExceptionOptions);
}

/**
 * A version of the form `major.minor.patch`, each part a whole number from 0
 * to `Number.MAX_SAFE_INTEGER`, or a nightly version of the form
 * `major.minor.patch-nightly.YYYYMMDD`, which adds the date it was built. A
 * version never changes after it is created; versions compare part by part,
 * major first, and a nightly version comes before the release with the same
 * three parts.
 */
export declare class Version {
  /**
   * The major part, the first of the three.
   */
  public readonly major: number;

  /**
   * The minor part, the second of the three.
   */
  public readonly minor: number;

  /**
   * The patch part, the last of the three.
   */
  public readonly patch: number;

  /**
   * A nightly version's date, written `YYYYMMDD`, such as `20261101`; `null`
   * for a release.
   */
  public readonly nightlyDate: string | null;

  /**
   * Creates a version from its three parts and, for a nightly version, its
   * date.
   *
   * @param major The major part: a whole number from 0 to
   * `Number.MAX_SAFE_INTEGER`.
   * @param minor The minor part, in the same range.
   * @param patch The patch part, in the same range.
   * @param nightlyDate A nightly version's date: a calendar date written
   * `YYYYMMDD`, from year 1000, such as `20261101`. Omitted or `null`, the
   * version is a release.
   * @throws VersionException, synchronously, if a part is negative, not a
   * whole number, or greater than `Number.MAX_SAFE_INTEGER`, or if the date
   * is not a calendar date written that way.
   * @example
   * ```ts
   * import { Version } from "@noldova/tools.pipelines";
   *
   * new Version(1, 4, 0).toString(); // "1.4.0"
   * new Version(1, 4, 1, "20261101").toString(); // "1.4.1-nightly.20261101"
   * // new Version(1, -1, 0) and new Version(1, 4, 1, "20261131") throw VersionException.
   * ```
   */
  public constructor(major: number, minor: number, patch: number, nightlyDate?: string | null);

  /**
   * Reads a version from its text.
   *
   * @param text The version's text: exactly three whole numbers joined by
   * dots, each without a sign or a leading zero, such as `1.4.0`, optionally
   * followed by `-nightly.` and a calendar date written `YYYYMMDD`, such as
   * `1.4.1-nightly.20261101`, with nothing before or after them.
   * @returns A new version with the text's parts and, for a nightly version,
   * its date.
   * @throws VersionException, synchronously, if the text is not of that form,
   * if a part is greater than `Number.MAX_SAFE_INTEGER`, or if the date is
   * not a calendar date.
   * @example
   * ```ts
   * import { Version } from "@noldova/tools.pipelines";
   *
   * Version.parse("1.4.0").minor; // 4
   * Version.parse("1.4.1-nightly.20261101").nightlyDate; // "20261101"
   * // Version.parse("1.04.0"), Version.parse("v1.4.0") and
   * // Version.parse("1.4.0-beta.1") throw VersionException.
   * ```
   */
  public static parse(text: string): Version;

  /**
   * Tells why a text is not a version, without throwing, for a text that
   * comes from outside the program, such as a command-line value.
   *
   * @param text The text to check, of the form {@link Version.parse} reads.
   * @returns `null` if {@link Version.parse} reads the text, otherwise the
   * message its `VersionException` would carry: that the text is not of the
   * form, that a part is greater than `Number.MAX_SAFE_INTEGER`, or that the
   * date is not a calendar date.
   * @example
   * ```ts
   * import { Version } from "@noldova/tools.pipelines";
   *
   * Version.validate("1.4.0"); // null
   * Version.validate("1.4"); // "\"1.4\" is not a version: a version is major.minor.patch, …"
   * Version.validate("1.4.1-nightly.20261131"); // "A nightly version's date must be a calendar date …"
   * ```
   */
  public static validate(text: string): string | null;

  /**
   * Compares this version with another, major part first, then minor, then
   * patch; with the same three parts, a nightly version comes before the
   * release, and nightly versions come in the order of their dates.
   *
   * @param other The version to compare with.
   * @returns -1 if this version comes before the other, 0 if both are the
   * same version, and 1 if this version comes after it.
   * @example
   * ```ts
   * import { Version } from "@noldova/tools.pipelines";
   *
   * Version.parse("1.4.0").compareTo(Version.parse("1.10.0")); // -1
   * Version.parse("2.0.0").compareTo(Version.parse("1.99.99")); // 1
   * Version.parse("1.4.1-nightly.20261101").compareTo(Version.parse("1.4.1")); // -1
   * Version.parse("1.4.1-nightly.20261102").compareTo(Version.parse("1.4.1-nightly.20261101")); // 1
   * ```
   */
  public compareTo(other: Version): number;

  /**
   * Tells whether another version has the same three parts and the same
   * nightly date, or is a release as this one is.
   *
   * @param other The version to compare with.
   * @returns `true` if both are the same version, otherwise `false`.
   * @example
   * ```ts
   * import { Version } from "@noldova/tools.pipelines";
   *
   * Version.parse("1.4.0").equals(new Version(1, 4, 0)); // true
   * Version.parse("1.4.1").equals(Version.parse("1.4.1-nightly.20261101")); // false
   * ```
   */
  public equals(other: Version): boolean;

  /**
   * Writes the version as its text.
   *
   * @returns The three parts joined by dots, such as `1.4.0`, followed for a
   * nightly version by `-nightly.` and its date, such as
   * `1.4.1-nightly.20261101`; reading it with {@link Version.parse} gives an
   * equal version.
   * @example
   * ```ts
   * import { Version } from "@noldova/tools.pipelines";
   *
   * new Version(1, 4, 0).toString(); // "1.4.0"
   * `${new Version(0, 0, 4, "20261101")}`; // "0.0.4-nightly.20261101"
   * ```
   */
  public toString(): string;
}

/**
 * What a program wrote and how it ended.
 */
export declare class ProcessResult {
  /**
   * The program's exit code, `0` when it succeeded; `null` when it ended
   * through a signal instead.
   */
  public readonly exitCode: number | null;

  /**
   * Everything the program wrote to its standard output, as UTF-8 text.
   */
  public readonly output: string;

  /**
   * Everything the program wrote to its error output, as UTF-8 text.
   */
  public readonly errorOutput: string;

  /**
   * Creates the result of a program's run.
   *
   * @param exitCode The exit code, or `null` when the program ended through
   * a signal.
   * @param output What the program wrote to its standard output.
   * @param errorOutput What the program wrote to its error output.
   * @example
   * ```ts
   * import { ProcessResult } from "@noldova/tools.pipelines";
   *
   * const result = new ProcessResult(0, "git version 2.55.0\n", "");
   * result.isSuccessful; // true
   * ```
   */
  public constructor(exitCode: number | null, output: string, errorOutput: string);

  /**
   * Whether the program succeeded, its exit code `0`.
   *
   * @example
   * ```ts
   * import { ProcessResult } from "@noldova/tools.pipelines";
   *
   * new ProcessResult(1, "", "").isSuccessful; // false
   * new ProcessResult(null, "", "").isSuccessful; // false, the program ended through a signal
   * ```
   */
  public get isSuccessful(): boolean;
}

/**
 * What a step found: that it succeeded, or that it failed, each with the
 * message a pipeline's log shows. A failed check is a result, not an
 * exception; a result never changes after it is created.
 */
export declare class StepResult {
  /**
   * Whether the step succeeded.
   */
  public readonly isSuccessful: boolean;

  /**
   * The message for the log: what the step did, or what is wrong.
   */
  public readonly message: string;

  private constructor();

  /**
   * Creates the result of a step that succeeded.
   *
   * @param message What the step did, such as what it checked.
   * @returns A result whose `isSuccessful` is `true`.
   * @example
   * ```ts
   * import { StepResult } from "@noldova/tools.pipelines";
   *
   * StepResult.succeeded("The archives hold 0.0.4.").isSuccessful; // true
   * ```
   */
  public static succeeded(message: string): StepResult;

  /**
   * Creates the result of a step that failed.
   *
   * @param message What is wrong, written so the reader can fix it.
   * @returns A result whose `isSuccessful` is `false`.
   * @example
   * ```ts
   * import { StepResult } from "@noldova/tools.pipelines";
   *
   * StepResult.failed("Commit 225059f… is not on origin/main.").isSuccessful; // false
   * ```
   */
  public static failed(message: string): StepResult;
}

/**
 * A package and the path of its archive, as {@link ArchiveStep} checked it.
 */
export declare class PackageArchive {
  /**
   * The package's name, such as `@noldova/tools.pipelines`.
   */
  public readonly packageName: string;

  /**
   * The archive's path, such as
   * `archives/noldova-tools.pipelines-0.0.4.tgz`.
   */
  public readonly filePath: string;

  /**
   * Creates the pair.
   *
   * @param packageName The package's name.
   * @param filePath The archive's path.
   * @example
   * ```ts
   * import { PackageArchive } from "@noldova/tools.pipelines";
   *
   * const archive = new PackageArchive("@noldova/tools.pipelines", "archives/noldova-tools.pipelines-0.0.4.tgz");
   * ```
   */
  public constructor(packageName: string, filePath: string);
}

/**
 * What {@link ArchiveStep.checkAsync} found: its result, and the archives it
 * checked when it succeeded.
 */
export declare class ArchiveCheck {
  /**
   * The archive step's result.
   */
  public readonly result: StepResult;

  /**
   * Each expected package with its archive, by package name, when the result
   * succeeded; none when it failed.
   */
  public readonly archives: readonly PackageArchive[];

  /**
   * Creates the check.
   *
   * @param result The archive step's result.
   * @param archives The archives it checked.
   * @example
   * ```ts
   * import { ArchiveCheck, StepResult } from "@noldova/tools.pipelines";
   *
   * const check = new ArchiveCheck(StepResult.failed("There is no folder archives."), []);
   * ```
   */
  public constructor(result: StepResult, archives: readonly PackageArchive[]);
}

/**
 * A step of a pipeline that a {@link CommandLine} runs by its name, such as
 * {@link SourceStep}.
 */
export declare interface IStep {
  /**
   * The name a command line gives to run the step, such as `"source"`.
   */
  readonly name: string;

  /**
   * The values the step takes, as a usage line shows them, such as
   * `"<version> <commit>"`.
   */
  readonly usage: string;

  /**
   * Runs the step.
   *
   * @param values The values given after the step's name, in order. The step
   * checks them itself, so a wrong number or form fails the step instead of
   * throwing.
   * @returns A promise of what the step found. It never rejects for a failed
   * check, only when something else goes wrong, such as with a
   * {@link PipelineException}.
   * @example
   * ```ts
   * import { type IStep, StepResult } from "@noldova/tools.pipelines";
   *
   * const step: IStep = {
   *   name: "greet",
   *   usage: "<name>",
   *   runAsync: async values => StepResult.succeeded(`Hello, ${values.join(" ")}.`)
   * };
   * (await step.runAsync(["world"])).message; // "Hello, world."
   * ```
   */
  runAsync(values: readonly string[]): Promise<StepResult>;
}

/**
 * Where a {@link CommandLine} writes a step's message; each pipeline host
 * implements it, such as by writing a failure as the host's error annotation.
 */
export declare interface IStepOutput {
  /**
   * Writes the message of a step that succeeded.
   *
   * @param message The step's message.
   * @example
   * ```ts
   * import type { IStepOutput } from "@noldova/tools.pipelines";
   *
   * const output: IStepOutput = {
   *   writeSuccess: message => console.log(message),
   *   writeFailure: message => console.error(message)
   * };
   * output.writeSuccess("Commit 225059f… is on origin/main, and its version.json holds 0.0.4.");
   * ```
   */
  writeSuccess(message: string): void;

  /**
   * Writes the message of a step that failed, or the usage line when the
   * command line names no step it has.
   *
   * @param message What is wrong.
   * @example
   * ```ts
   * import type { IStepOutput } from "@noldova/tools.pipelines";
   *
   * const output: IStepOutput = {
   *   writeSuccess: message => console.log(message),
   *   writeFailure: message => console.error(message)
   * };
   * output.writeFailure("Commit 225059f… is not on origin/main.");
   * ```
   */
  writeFailure(message: string): void;
}

/**
 * The command-line base a pipeline host builds its command line on: it runs
 * the step its first value names with the values after it, writes the step's
 * message, and gives the exit code.
 */
export declare class CommandLine {
  /**
   * Creates a command line over its steps.
   *
   * @param programName The name the usage line shows, such as the command a
   * workflow calls.
   * @param steps The steps it can run, each with its own name; the usage
   * line lists them in this order.
   * @param output Where it writes each message.
   * @example
   * ```ts
   * import { CommandLine, Git, ProcessRunner, SourceStep } from "@noldova/tools.pipelines";
   *
   * const git = new Git(new ProcessRunner(), process.cwd());
   * const commandLine = new CommandLine("pipelines", [new SourceStep(git)], {
   *   writeSuccess: message => console.log(message),
   *   writeFailure: message => console.error(message)
   * });
   * ```
   */
  public constructor(programName: string, steps: readonly IStep[], output: IStepOutput);

  /**
   * Runs the step the first value names.
   *
   * @param values The command line's values after the program, such as
   * `["source", "0.0.4", "<commit>"]`.
   * @returns A promise of the exit code: `0` after a step that succeeded,
   * whose message it wrote with {@link IStepOutput.writeSuccess}; `1` after a
   * step that failed, whose message it wrote with
   * {@link IStepOutput.writeFailure}, or when no step has the first value's
   * name, after writing the usage line, such as
   * `Usage: pipelines source <version> <commit>`. It rejects with what the
   * step rejects with, such as a {@link PipelineException}.
   * @example
   * ```ts
   * import { CommandLine, Git, ProcessRunner, SourceStep } from "@noldova/tools.pipelines";
   *
   * const git = new Git(new ProcessRunner(), process.cwd());
   * const commandLine = new CommandLine("pipelines", [new SourceStep(git)], {
   *   writeSuccess: message => console.log(message),
   *   writeFailure: message => console.error(message)
   * });
   * process.exitCode = await commandLine.runAsync(process.argv.slice(2));
   * ```
   */
  public runAsync(values: readonly string[]): Promise<number>;
}

/**
 * Runs a program without a shell and collects what it writes.
 */
export declare class ProcessRunner {
  /**
   * Runs a program to its end.
   *
   * @param program The program, found on the `PATH` as the operating system
   * finds it, or a path to it.
   * @param values The values passed to the program, each as one argument,
   * never read by a shell.
   * @param workingDirectory The directory the program runs in.
   * @returns A promise of the program's exit code and of what it wrote. A
   * program that fails still resolves, with its exit code; the promise
   * rejects with {@link ProcessException} only when the program cannot
   * start, such as when it is not installed or the directory does not exist.
   * @example
   * ```ts
   * import { ProcessRunner } from "@noldova/tools.pipelines";
   *
   * const result = await new ProcessRunner().runAsync("git", ["--version"], process.cwd());
   * result.isSuccessful; // true where git is installed
   * ```
   */
  public runAsync(program: string, values: readonly string[], workingDirectory: string): Promise<ProcessResult>;
}

/**
 * Reads what a step needs from a clone of a git repository, through the
 * `git` program.
 */
export declare class Git {
  /**
   * Creates a reader of one clone.
   *
   * @param processRunner What runs `git`.
   * @param workingDirectory The clone's directory, or any directory inside
   * it.
   * @example
   * ```ts
   * import { Git, ProcessRunner } from "@noldova/tools.pipelines";
   *
   * const git = new Git(new ProcessRunner(), process.cwd());
   * ```
   */
  public constructor(processRunner: ProcessRunner, workingDirectory: string);

  /**
   * Tells whether a revision names a commit in the clone.
   *
   * @param revision A commit id, or a reference such as
   * `refs/remotes/origin/main`.
   * @returns A promise of `true` if the revision names a commit, otherwise
   * `false`. It rejects with {@link ProcessException} if git cannot start or
   * fails otherwise, such as outside a clone.
   * @example
   * ```ts
   * import { Git, ProcessRunner } from "@noldova/tools.pipelines";
   *
   * const git = new Git(new ProcessRunner(), process.cwd());
   * await git.hasCommitAsync("refs/remotes/origin/main"); // true in a clone that fetched main
   * ```
   */
  public hasCommitAsync(revision: string): Promise<boolean>;

  /**
   * Tells whether a commit holds a file.
   *
   * @param commit The commit, which the clone holds.
   * @param filePath The file's path from the repository's root, with `/`
   * between folders, such as `version.json`.
   * @returns A promise of `true` if the commit holds a file at the path,
   * otherwise `false`, also when the path is a folder. It rejects with {@link ProcessException} if git cannot start or
   * fails otherwise.
   * @example
   * ```ts
   * import { Git, ProcessRunner } from "@noldova/tools.pipelines";
   *
   * const git = new Git(new ProcessRunner(), process.cwd());
   * await git.hasFileAsync("refs/remotes/origin/main", "version.json"); // true where main holds the file
   * ```
   */
  public hasFileAsync(commit: string, filePath: string): Promise<boolean>;

  /**
   * Tells whether a commit is in another commit's history, such as on a
   * branch.
   *
   * @param commit The commit to look for, which the clone holds.
   * @param descendant The commit or reference whose history is searched; a
   * commit is in its own history.
   * @returns A promise of `true` if the commit is in the descendant's
   * history, otherwise `false`. It rejects with {@link ProcessException} if
   * git cannot start or fails otherwise, such as when the clone holds
   * neither commit.
   * @example
   * ```ts
   * import { Git, ProcessRunner } from "@noldova/tools.pipelines";
   *
   * const git = new Git(new ProcessRunner(), process.cwd());
   * await git.isAncestorAsync("HEAD", "refs/remotes/origin/main"); // true when HEAD is on main
   * ```
   */
  public isAncestorAsync(commit: string, descendant: string): Promise<boolean>;

  /**
   * Lists the files a commit holds in a folder and the folders inside it.
   *
   * @param commit The commit, which the clone holds.
   * @param folderPath The folder's path from the repository's root, with `/`
   * between folders, such as `src`.
   * @returns A promise of each file's path from the repository's root, with
   * `/` between folders, in git's order; none when the commit has no such
   * folder. It rejects with {@link ProcessException} if git cannot start or
   * fails otherwise, such as when the clone does not hold the commit.
   * @example
   * ```ts
   * import { Git, ProcessRunner } from "@noldova/tools.pipelines";
   *
   * const git = new Git(new ProcessRunner(), process.cwd());
   * await git.listFilesAsync("refs/remotes/origin/main", "src"); // ["src/noldova.tools.pipelines/package.json", …]
   * ```
   */
  public listFilesAsync(commit: string, folderPath: string): Promise<readonly string[]>;

  /**
   * Reads a file as a commit holds it.
   *
   * @param commit The commit, which holds the file.
   * @param filePath The file's path from the repository's root, with `/`
   * between folders.
   * @returns A promise of the file's content as UTF-8 text. It rejects with
   * {@link ProcessException} if git cannot start or cannot read the file,
   * such as when the commit does not hold it.
   * @example
   * ```ts
   * import { Git, ProcessRunner } from "@noldova/tools.pipelines";
   *
   * const git = new Git(new ProcessRunner(), process.cwd());
   * await git.readFileAsync("refs/remotes/origin/main", "version.json"); // "{\n  \"version\": \"0.0.4\"\n}\n"
   * ```
   */
  public readFileAsync(commit: string, filePath: string): Promise<string>;

  /**
   * Reads the commit the checkout is at.
   *
   * @returns A promise of the commit's full id. It rejects with
   * {@link ProcessException} if git cannot start or fails otherwise, such as
   * in a clone without commits.
   * @example
   * ```ts
   * import { Git, ProcessRunner } from "@noldova/tools.pipelines";
   *
   * const git = new Git(new ProcessRunner(), process.cwd());
   * await git.readHeadAsync(); // "225059f4c1e6a3b2d8f7e9a0b1c2d3e4f5a6b7c8"
   * ```
   */
  public readHeadAsync(): Promise<string>;
}

/**
 * Reads files from `.tgz` archives through the `tar` program.
 */
export declare class Tar {
  /**
   * Creates the reader.
   *
   * @param processRunner The runner that starts `tar`.
   * @example
   * ```ts
   * import { ProcessRunner, Tar } from "@noldova/tools.pipelines";
   *
   * const tar = new Tar(new ProcessRunner());
   * ```
   */
  public constructor(processRunner: ProcessRunner);

  /**
   * Reads one file from an archive.
   *
   * @param archivePath The archive's path, such as
   * `archives/noldova-tools.pipelines-0.0.4.tgz`.
   * @param filePath The file's path inside the archive, such as
   * `package/package.json`.
   * @returns A promise of how `tar` ended: on success, its output is the
   * file's content as UTF-8 text; when the archive is not a `.tgz` or lacks
   * the file, it failed, with `tar`'s message. It rejects with
   * {@link ProcessException} if `tar` cannot start, such as when it is not
   * installed or the archive's folder does not exist.
   * @example
   * ```ts
   * import { ProcessRunner, Tar } from "@noldova/tools.pipelines";
   *
   * const result = await new Tar(new ProcessRunner()).readFileAsync("archives/noldova-tools.pipelines-0.0.4.tgz", "package/package.json");
   * result.isSuccessful; // true when the archive holds the file
   * ```
   */
  public readFileAsync(archivePath: string, filePath: string): Promise<ProcessResult>;
}

/**
 * Runs the `npm` program's registry commands. It passes no credentials;
 * `npm` takes them from its own configuration, such as the environment a
 * pipeline sets up.
 */
export declare class Npm {
  /**
   * Creates the runner.
   *
   * @param processRunner The runner that starts `npm`.
   * @param workingDirectory The directory `npm` runs in, whose configuration
   * it reads.
   * @example
   * ```ts
   * import { Npm, ProcessRunner } from "@noldova/tools.pipelines";
   *
   * const npm = new Npm(new ProcessRunner(), process.cwd());
   * ```
   */
  public constructor(processRunner: ProcessRunner, workingDirectory: string);

  /**
   * Reads a field of a package or a version from the registry, asking the
   * registry rather than `npm`'s cache.
   *
   * @param specifier The package, such as `@noldova/tools.pipelines`, or one
   * of its versions, such as `@noldova/tools.pipelines@0.0.4`.
   * @param field The field, such as `dist.integrity` or `dist-tags.latest`.
   * @param registry The registry's URL.
   * @returns A promise of how `npm view` ended: on success, its output is the
   * field's value, empty when the version or the field doesn't exist. It
   * rejects with {@link ProcessException} if `npm` cannot start.
   * @example
   * ```ts
   * import { Npm, ProcessRunner } from "@noldova/tools.pipelines";
   *
   * const npm = new Npm(new ProcessRunner(), process.cwd());
   * const result = await npm.viewAsync("@noldova/tools.pipelines", "dist-tags.latest", "https://registry.npmjs.org/");
   * result.output; // "0.0.4\n" once 0.0.4 is the latest version
   * ```
   */
  public viewAsync(specifier: string, field: string, registry: string): Promise<ProcessResult>;

  /**
   * Reads a field of a package or a version from the registry, as
   * {@link Npm.viewAsync} does, and gives its value.
   *
   * @param specifier The package, such as `@noldova/tools.pipelines`, or one
   * of its versions, such as `@noldova/tools.pipelines@0.0.4`.
   * @param field The field, such as `gitHead` or `dist-tags.nightly`.
   * @param registry The registry's URL.
   * @returns A promise of the field's value without surrounding white space,
   * empty when the registry has no such package, version or field, or of a
   * failed {@link StepResult} with one line, such as
   * `@noldova/tools.pipelines: npm view exited with code 1: …`, when `npm`
   * fails otherwise. It rejects with {@link ProcessException} if `npm`
   * cannot start.
   * @example
   * ```ts
   * import { Npm, ProcessRunner } from "@noldova/tools.pipelines";
   *
   * const npm = new Npm(new ProcessRunner(), process.cwd());
   * const latest = await npm.readFieldOrEmptyAsync("@noldova/tools.pipelines", "dist-tags.latest", "https://registry.npmjs.org/");
   * latest; // "0.0.4" once 0.0.4 is the latest version
   * ```
   */
  public readFieldOrEmptyAsync(specifier: string, field: string, registry: string): Promise<string | StepResult>;

  /**
   * Publishes an archive to the registry under a dist-tag.
   *
   * @param archivePath The archive's path, relative to the current folder or
   * full.
   * @param tag The dist-tag the version gets, such as `latest` or `nightly`.
   * @param access `public` or `restricted`.
   * @param registry The registry's URL.
   * @returns A promise of how `npm publish` ended. It rejects with
   * {@link ProcessException} if `npm` cannot start.
   * @example
   * ```ts
   * import { Npm, ProcessRunner } from "@noldova/tools.pipelines";
   *
   * const npm = new Npm(new ProcessRunner(), process.cwd());
   * const result = await npm.publishAsync("archives/noldova-tools.pipelines-0.0.4.tgz", "latest", "public", "https://registry.npmjs.org/");
   * result.isSuccessful; // true when the registry took the archive
   * ```
   */
  public publishAsync(archivePath: string, tag: string, access: string, registry: string): Promise<ProcessResult>;

  /**
   * Tells whether a text is a registry the steps take: an `https` URL
   * without credentials, a query or a fragment.
   *
   * @param text The text, such as a step's value.
   * @returns `true` when the text is such a URL.
   * @example
   * ```ts
   * import { Npm } from "@noldova/tools.pipelines";
   *
   * Npm.isRegistry("https://registry.npmjs.org/"); // true
   * Npm.isRegistry("https://registry.npmjs.org/?token=x"); // false
   * ```
   */
  public static isRegistry(text: string): boolean;
}

/**
 * The step that checks a release's source before anything is built or
 * published: `source <version> <commit>`. It succeeds only when the version
 * is a version, the commit is a full commit id that the clone holds, the
 * commit is on `origin/main`, and the `version.json` at the commit's root is
 * a JSON object whose `version` is that version.
 */
export declare class SourceStep implements IStep {
  /**
   * The step's name, `"source"`.
   */
  public readonly name: string;

  /**
   * The values the step takes, `"<version> <commit>"`.
   */
  public readonly usage: string;

  /**
   * Creates the step over a clone.
   *
   * @param git The reader of the clone, which has fetched `origin/main` with
   * its history.
   * @example
   * ```ts
   * import { Git, ProcessRunner, SourceStep } from "@noldova/tools.pipelines";
   *
   * const step = new SourceStep(new Git(new ProcessRunner(), process.cwd()));
   * step.name; // "source"
   * ```
   */
  public constructor(git: Git);

  /**
   * Checks the release's source.
   *
   * @param values The version, such as `0.0.4`, and the commit's full id,
   * 40 lowercase hexadecimal digits.
   * @returns A promise of the result: succeeded, such as
   * `Commit 225059f… is on origin/main, and its version.json holds 0.0.4.`,
   * or failed with the first thing that is wrong, checked in this order: not
   * two values, a version that is not a version, a commit that is not a full
   * id, a commit the clone does not hold, a clone without `origin/main`, a
   * commit not on it, a commit without `version.json`, and a `version` other
   * than the one given. It rejects with `JsonException`, from
   * `@noldova/context.json`, if `version.json` is not a JSON object with a
   * `version` text, and with {@link ProcessException} if git cannot start or
   * fails otherwise.
   * @example
   * ```ts
   * import { Git, ProcessRunner, SourceStep } from "@noldova/tools.pipelines";
   *
   * const step = new SourceStep(new Git(new ProcessRunner(), process.cwd()));
   * const result = await step.runAsync(["0.0.4", "225059f4c1e6a3b2d8f7e9a0b1c2d3e4f5a6b7c8"]);
   * result.isSuccessful; // true when that commit is on main and holds 0.0.4
   * (await step.runAsync(["0.0.4"])).message; // "The source step takes <version> <commit>."
   * ```
   */
  public runAsync(values: readonly string[]): Promise<StepResult>;
}

/**
 * The step that checks a release's archives before anything is published:
 * `archive <folder> <version> <commit> <scope>`. The packages it expects are
 * the commit's `package.json` files under `src/`, outside `tests/` folders,
 * that are not `"private": true`. It succeeds only when the checkout is at
 * the commit, and the folder holds exactly one archive for each package at
 * the version, named as `npm pack` names it, whose `package/package.json`
 * has the package's name, inside the scope, the version, and the commit as
 * its `gitHead`, is not `"private": true`, and lists any expected package under `dependencies` at
 * exactly the version.
 */
export declare class ArchiveStep implements IStep {
  /**
   * The step's name, `"archive"`.
   */
  public readonly name: string;

  /**
   * The values the step takes, `"<folder> <version> <commit> <scope>"`.
   */
  public readonly usage: string;

  /**
   * Creates the step over a clone and an archive reader.
   *
   * @param git The reader of the clone whose checkout the archives were
   * packed from.
   * @param tar The reader of the archives.
   * @example
   * ```ts
   * import { ArchiveStep, Git, ProcessRunner, Tar } from "@noldova/tools.pipelines";
   *
   * const processRunner = new ProcessRunner();
   * const step = new ArchiveStep(new Git(processRunner, process.cwd()), new Tar(processRunner));
   * step.name; // "archive"
   * ```
   */
  public constructor(git: Git, tar: Tar);

  /**
   * Checks the release's archives.
   *
   * @param values The folder of archives, such as `archives`; the version,
   * such as `0.0.4`; the commit's full id, 40 lowercase hexadecimal digits;
   * and the scope, such as `@noldova`.
   * @returns A promise of the result. It succeeds with one line for each
   * archive, such as
   * `noldova-tools.pipelines-0.0.4.tgz: @noldova/tools.pipelines@0.0.4 from commit 225059f…`.
   * It fails with the first of these that is wrong: not four values, a
   * version that is not a version, a commit that is not a full id, a scope
   * that is not `@` and a lowercase name, a checkout at another commit, a
   * folder that does not exist, and a commit without a package to publish.
   * Otherwise it fails with one line for each problem with the archives: an
   * archive missing, a file that is not an expected archive, an archive
   * `tar` cannot read the manifest of, with `tar`'s exit code and message,
   * and a manifest with another name, a name outside the scope, another
   * version, no `gitHead` or another one, `"private": true`, or an expected package under `dependencies`
   * at anything but exactly the version. It rejects with `JsonException`,
   * from `@noldova/context.json`, if a `package.json` the step reads is not
   * a JSON object, lacks a `name` or `version` text where it needs one, has
   * a `gitHead` that is not a text, or
   * has a `private` that is not `true` or `false` or `dependencies` that are
   * not an object of texts, and with {@link ProcessException} if git or
   * `tar` cannot start or git fails otherwise.
   * @example
   * ```ts
   * import { ArchiveStep, Git, ProcessRunner, Tar } from "@noldova/tools.pipelines";
   *
   * const processRunner = new ProcessRunner();
   * const step = new ArchiveStep(new Git(processRunner, process.cwd()), new Tar(processRunner));
   * const result = await step.runAsync(["archives", "0.0.4", "225059f4c1e6a3b2d8f7e9a0b1c2d3e4f5a6b7c8", "@noldova"]);
   * result.isSuccessful; // true when the folder holds exactly the packages at 0.0.4
   * (await step.runAsync(["archives"])).message; // "The archive step takes <folder> <version> <commit> <scope>."
   * ```
   */
  public runAsync(values: readonly string[]): Promise<StepResult>;

  /**
   * Checks the release's archives as {@link ArchiveStep.runAsync} does, and
   * gives the archives it checked with the result, for a step that goes on
   * to use them.
   *
   * @param values The same values as {@link ArchiveStep.runAsync}.
   * @returns A promise of the check: the result, and when it succeeded, each
   * expected package with its archive, by package name. It rejects as
   * {@link ArchiveStep.runAsync} does.
   * @example
   * ```ts
   * import { ArchiveStep, Git, ProcessRunner, Tar } from "@noldova/tools.pipelines";
   *
   * const processRunner = new ProcessRunner();
   * const step = new ArchiveStep(new Git(processRunner, process.cwd()), new Tar(processRunner));
   * const check = await step.checkAsync(["archives", "0.0.4", "225059f4c1e6a3b2d8f7e9a0b1c2d3e4f5a6b7c8", "@noldova"]);
   * check.archives.map(t => t.packageName); // ["@noldova/tools.pipelines"] when the check succeeded
   * ```
   */
  public checkAsync(values: readonly string[]): Promise<ArchiveCheck>;

  /**
   * Reads the names of the packages the step expects at a commit: those of
   * its `package.json` files under `src/`, outside `tests/` folders, that are
   * not `"private": true`.
   *
   * @param commit The commit's full id.
   * @returns A promise of the names, sorted, and empty when there is none. It
   * rejects with `JsonException` and {@link ProcessException} as
   * {@link ArchiveStep.runAsync} does.
   * @example
   * ```ts
   * import { ArchiveStep, Git, ProcessRunner, Tar } from "@noldova/tools.pipelines";
   *
   * const processRunner = new ProcessRunner();
   * const step = new ArchiveStep(new Git(processRunner, process.cwd()), new Tar(processRunner));
   * const names = await step.readPackageNamesAsync("225059f4c1e6a3b2d8f7e9a0b1c2d3e4f5a6b7c8");
   * names; // ["@noldova/tools.pipelines"]
   * ```
   */
  public readPackageNamesAsync(commit: string): Promise<readonly string[]>;
}

/**
 * The step that publishes a release's archives:
 * `publish <folder> <version> <commit> <scope> <registry> <access>`. It runs
 * {@link ArchiveStep}'s checks first, then publishes each package whose
 * version the registry doesn't have and waits until the registry serves each
 * version it published with the same archive.
 */
export declare class PublishStep implements IStep {
  /**
   * The step's name, `"publish"`.
   */
  public readonly name: string;

  /**
   * The values the step takes,
   * `"<folder> <version> <commit> <scope> <registry> <access>"`.
   */
  public readonly usage: string;

  /**
   * Creates the step.
   *
   * @param archiveStep The step that checks the archives first.
   * @param npm The runner of `npm`, which publishes and reads the registry.
   * @param waitMilliseconds How long the step waits, after its last publish,
   * for the registry to serve every version it published; 10 minutes by
   * default.
   * @param retryMilliseconds How long the step waits between two reads of
   * the registry while it waits; 10 seconds by default.
   * @example
   * ```ts
   * import { ArchiveStep, Git, Npm, ProcessRunner, PublishStep, Tar } from "@noldova/tools.pipelines";
   *
   * const processRunner = new ProcessRunner();
   * const archiveStep = new ArchiveStep(new Git(processRunner, process.cwd()), new Tar(processRunner));
   * const step = new PublishStep(archiveStep, new Npm(processRunner, process.cwd()));
   * step.name; // "publish"
   * ```
   */
  public constructor(archiveStep: ArchiveStep, npm: Npm, waitMilliseconds?: number, retryMilliseconds?: number);

  /**
   * Publishes the release's archives.
   *
   * @param values The archive step's four values, then the registry, an
   * `https` URL without credentials, a query or a fragment, such as
   * `https://registry.npmjs.org/`, and the access, `public` or `restricted`.
   * A release is published under the `latest` dist-tag, and a nightly
   * version under `nightly`; a nightly version must be newer than both.
   * @returns A promise of the result. It succeeds with one line for each
   * package, such as `@noldova/tools.pipelines@0.0.4 published.` or
   * `@noldova/tools.pipelines@0.0.4 is already published from this archive.`
   * It fails with the first of these that is wrong, publishing nothing: not
   * six values, a registry or an access that is not one, or the archive
   * step's failure. Otherwise, before it publishes anything, it fails with
   * one line for each version the registry already has from another
   * archive, each version not newer than the version a tag it must pass
   * points to, and each
   * read of the registry that fails, with `npm`'s exit code and message.
   * After that, it publishes the archives in turn and stops at the first
   * publish that fails; it still waits for the versions it published before
   * it, and fails with a line for that publish, with `npm`'s exit code and
   * message, and for each version the registry does not serve in time or
   * serves from another archive. A URL's credentials, query and fragment in
   * `npm`'s message are left out of the line. It rejects as {@link ArchiveStep.runAsync} does,
   * and with {@link ProcessException} if `npm` cannot start.
   * @example
   * ```ts
   * import { ArchiveStep, Git, Npm, ProcessRunner, PublishStep, Tar } from "@noldova/tools.pipelines";
   *
   * const processRunner = new ProcessRunner();
   * const archiveStep = new ArchiveStep(new Git(processRunner, process.cwd()), new Tar(processRunner));
   * const step = new PublishStep(archiveStep, new Npm(processRunner, process.cwd()));
   * const result = await step.runAsync(["archives", "0.0.4", "225059f4c1e6a3b2d8f7e9a0b1c2d3e4f5a6b7c8", "@noldova", "https://registry.npmjs.org/", "public"]);
   * result.isSuccessful; // true when every package's 0.0.4 is published and served
   * ```
   */
  public runAsync(values: readonly string[]): Promise<StepResult>;
}

/**
 * The step that works out a nightly build's version: `nightly <commit> <registry>`.
 * It prints the version when `main` has changed since the packages' last
 * nightly versions, and nothing otherwise, so a pipeline publishes a nightly
 * build only when there is something new.
 */
export declare class NightlyStep implements IStep {
  /**
   * The step's name, `"nightly"`.
   */
  public readonly name: string;

  /**
   * The values the step takes, `"<commit> <registry>"`.
   */
  public readonly usage: string;

  /**
   * Creates the step.
   *
   * @param git The reader of the clone that holds the commit.
   * @param archiveStep The step whose expected packages the step looks up.
   * @param npm The runner of `npm`, which reads the registry.
   * @param readNow The clock the step takes the date from; the current time
   * by default.
   * @example
   * ```ts
   * import { ArchiveStep, Git, NightlyStep, Npm, ProcessRunner, Tar } from "@noldova/tools.pipelines";
   *
   * const processRunner = new ProcessRunner();
   * const git = new Git(processRunner, process.cwd());
   * const step = new NightlyStep(git, new ArchiveStep(git, new Tar(processRunner)), new Npm(processRunner, process.cwd()));
   * step.name; // "nightly"
   * ```
   */
  public constructor(git: Git, archiveStep: ArchiveStep, npm: Npm, readNow?: () => Date);

  /**
   * Works out the nightly version.
   *
   * @param values The commit's full id, 40 lowercase hexadecimal digits, and
   * the registry, an `https` URL without credentials, a query or a fragment,
   * such as `https://registry.npmjs.org/`.
   * @returns A promise of the result. It succeeds with the version alone,
   * the release in `version.json` at the commit with one more patch and the
   * UTC date, such as `0.0.5-nightly.20261102` for `0.0.4` on November 2,
   * 2026. It succeeds with an empty message when the last nightly version of
   * every package the archive step expects has the commit as its `gitHead`,
   * or is from the same UTC date. It fails with the first of these that is
   * wrong: not two values, a commit that is not a full id, a registry that is
   * not one, a commit the clone does not hold, a clone without `origin/main`,
   * a commit not on it, a commit without `version.json`, a `version` that is
   * not a release version, and a commit without a package to publish.
   * Otherwise it fails with one line for each read of the registry that
   * fails, with `npm`'s exit code and message, and for each `nightly`
   * dist-tag that is not a version, or with one line naming the packages
   * whose last nightly version is from the same UTC date when only some are.
   * It rejects with `JsonException`, from `@noldova/context.json`, if
   * `version.json` is not a JSON object with a `version` text, and as
   * {@link ArchiveStep.readPackageNamesAsync} does.
   * @example
   * ```ts
   * import { ArchiveStep, Git, NightlyStep, Npm, ProcessRunner, Tar } from "@noldova/tools.pipelines";
   *
   * const processRunner = new ProcessRunner();
   * const git = new Git(processRunner, process.cwd());
   * const step = new NightlyStep(git, new ArchiveStep(git, new Tar(processRunner)), new Npm(processRunner, process.cwd()));
   * const result = await step.runAsync(["225059f4c1e6a3b2d8f7e9a0b1c2d3e4f5a6b7c8", "https://registry.npmjs.org/"]);
   * result.message; // "0.0.5-nightly.20261102", or "" when nothing changed
   * ```
   */
  public runAsync(values: readonly string[]): Promise<StepResult>;
}
