/**
 * @license
 * Copyright (c) Noldova.
 *
 * This source code is licensed under the license found in the
 * LICENSE file in the root directory of this source tree.
 */

export class Resources {
  public static readonly archiveManifestPath: string = "package/package.json";
  public static readonly archiveStepName: string = "archive";
  public static readonly archiveStepUsage: string = "<folder> <version> <commit> <scope>";
  public static readonly commitPattern: RegExp = /^[0-9a-f]{40}$/;
  public static readonly dependenciesField: string = "dependencies";
  public static readonly failureExitCode: number = 1;
  public static readonly gitFileSeparator: string = "\0";
  public static readonly gitFileType: string = "blob";
  public static readonly gitHeadRevision: string = "HEAD^{commit}";
  public static readonly gitIsAncestorValues: readonly string[] = ["merge-base", "--is-ancestor", "--end-of-options"];
  public static readonly gitListFilesValues: readonly string[] = ["ls-tree", "-r", "-z", "--name-only", "--full-tree", "--end-of-options"];
  public static readonly gitNotFoundExitCode: number = 1;
  public static readonly gitPathsSeparator: string = "--";
  public static readonly gitProgram: string = "git";
  public static readonly gitReadFileValues: readonly string[] = ["cat-file", "blob", "--end-of-options"];
  public static readonly gitReadHeadValues: readonly string[] = ["rev-parse", "--verify", "--end-of-options"];
  public static readonly gitReadTypeValues: readonly string[] = ["cat-file", "-t", "--end-of-options"];
  public static readonly gitVerifyValues: readonly string[] = ["rev-parse", "--verify", "--quiet", "--end-of-options"];
  public static readonly lineSeparator: string = "\n";
  public static readonly mainBranch: string = "origin/main";
  public static readonly mainReference: string = "refs/remotes/origin/main";
  public static readonly majorPartName: string = "major";
  public static readonly manifestFileName: string = "package.json";
  public static readonly minorPartName: string = "minor";
  public static readonly nameField: string = "name";
  public static readonly nightlyDatePattern: RegExp = /^([1-9][0-9]{3})([0-9]{2})([0-9]{2})$/;
  public static readonly nightlySeparator: string = "-nightly.";
  public static readonly packagesFolderPath: string = "src";
  public static readonly patchPartName: string = "patch";
  public static readonly pathSeparator: string = "/";
  public static readonly privateField: string = "private";
  public static readonly processReleaseDelayMilliseconds: number = 0;
  public static readonly scopePattern: RegExp = /^@[a-z0-9][a-z0-9._~-]*$/;
  public static readonly sourceStepName: string = "source";
  public static readonly sourceStepUsage: string = "<version> <commit>";
  public static readonly successExitCode: number = 0;
  public static readonly tarProgram: string = "tar";
  public static readonly tarReadFileValues: readonly string[] = ["-xzOf"];
  public static readonly testsFolderName: string = "tests";
  public static readonly textEncoding: BufferEncoding = "utf8";
  public static readonly usageSeparator: string = " | ";
  public static readonly valueSeparator: string = " ";
  public static readonly versionField: string = "version";
  public static readonly versionFilePath: string = "version.json";
  public static readonly versionInvalid: string = "The text is not a version.";
  public static readonly versionPartSeparator: string = ".";
  public static readonly versionPattern: RegExp = /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(?:-nightly\.([0-9]{8}))?$/;

  public static formatVersionInvalid(text: string): string {
    return `"${text}" is not a version: a version is major.minor.patch, each a whole number without a leading zero, such as 1.4.0, or a nightly version, major.minor.patch-nightly.YYYYMMDD, such as 1.4.1-nightly.20261101.`;
  }

  public static formatVersionPartInvalid(partName: string, value: string): string {
    return `A version's ${partName} part must be a whole number from 0 to ${Number.MAX_SAFE_INTEGER}, not ${value}.`;
  }

  public static formatNightlyDateInvalid(value: string): string {
    return `A nightly version's date must be a calendar date written YYYYMMDD, from year 1000, such as 20261101, not "${value}".`;
  }

  public static formatUsage(programName: string, stepUsages: readonly string[]): string {
    return `Usage: ${programName} ${stepUsages.join(Resources.usageSeparator)}`;
  }

  public static formatStepUsage(stepName: string, usage: string): string {
    return `${stepName}${Resources.valueSeparator}${usage}`;
  }

  public static formatStepValuesInvalid(stepName: string, usage: string): string {
    return `The ${stepName} step takes ${usage}.`;
  }

  public static formatCommitInvalid(text: string): string {
    return `"${text}" is not a commit: a commit is given by its full id, 40 lowercase hexadecimal digits.`;
  }

  public static formatCommitMissing(commit: string): string {
    return `Commit ${commit} is not in this repository.`;
  }

  public static formatBranchMissing(branch: string): string {
    return `This clone has no ${branch}; fetch it with its history before this step.`;
  }

  public static formatCommitNotOnBranch(commit: string, branch: string): string {
    return `Commit ${commit} is not on ${branch}.`;
  }

  public static formatVersionFileMissing(commit: string, filePath: string): string {
    return `Commit ${commit} has no ${filePath} at its root.`;
  }

  public static formatVersionDiffers(commit: string, filePath: string, found: string, expected: string): string {
    return `${filePath} at commit ${commit} holds ${found}, not ${expected}.`;
  }

  public static formatSourceChecked(commit: string, branch: string, filePath: string, version: string): string {
    return `Commit ${commit} is on ${branch}, and its ${filePath} holds ${version}.`;
  }

  public static formatScopeInvalid(text: string): string {
    return `"${text}" is not a scope: a scope is @ and a lowercase name, such as @noldova.`;
  }

  public static formatHeadDiffers(head: string, commit: string): string {
    return `The checkout is at commit ${head}, not at ${commit}.`;
  }

  public static formatFolderMissing(folder: string): string {
    return `There is no folder ${folder}.`;
  }

  public static formatPackagesMissing(commit: string, folderPath: string): string {
    return `Commit ${commit} has no package to publish under ${folderPath}/.`;
  }

  public static formatArchiveName(packageName: string, version: string): string {
    return `${packageName.replace(/^@/, "").replace("/", "-")}-${version}.tgz`;
  }

  public static formatArchiveFilePath(archiveName: string, filePath: string): string {
    return `${archiveName}/${filePath}`;
  }

  public static formatArchiveMissing(folder: string, archiveName: string): string {
    return `${folder} has no ${archiveName}.`;
  }

  public static formatArchiveUnexpected(folder: string, fileName: string, version: string): string {
    return `${folder} holds ${fileName}, which is not one of the packages' archives at ${version}.`;
  }

  public static formatArchiveUnreadable(archiveName: string, filePath: string, exitCode: number | null, errorOutput: string): string {
    const detail = errorOutput.trim();

    return detail.length === 0 ? `${archiveName}: ${Resources.tarProgram} could not read its ${filePath} and exited with code ${exitCode}.` : `${archiveName}: ${Resources.tarProgram} could not read its ${filePath}: ${detail}`;
  }

  public static formatFieldDiffers(archiveName: string, field: string, found: string, expected: string): string {
    return `${archiveName}: its ${field} is ${found}, not ${expected}.`;
  }

  public static formatOutsideScope(archiveName: string, packageName: string, scope: string): string {
    return `${archiveName}: ${packageName} is outside the scope ${scope}.`;
  }

  public static formatArchivePrivate(archiveName: string): string {
    return `${archiveName}: it is marked private.`;
  }

  public static formatDependencyDiffers(archiveName: string, dependency: string, found: string, version: string): string {
    return `${archiveName}: its dependency ${dependency} is ${found}, not exactly ${version}.`;
  }

  public static formatArchiveChecked(archiveName: string, packageName: string, version: string, commit: string): string {
    return `${archiveName}: ${packageName}@${version} from commit ${commit}`;
  }

  public static formatScopeNamePrefix(scope: string): string {
    return `${scope}/`;
  }

  public static formatGitCommitRevision(revision: string): string {
    return `${revision}^{commit}`;
  }

  public static formatGitFileRevision(commit: string, filePath: string): string {
    return `${commit}:${filePath}`;
  }

  public static formatProgramFailed(program: string): string {
    return `The program "${program}" failed.`;
  }

  public static formatProcessNotStarted(program: string, reason: string): string {
    return `"${program}" could not start: ${reason}`;
  }

  public static formatProcessFailed(command: string, exitCode: number | null, errorOutput: string): string {
    const detail = errorOutput.trim();

    return detail.length === 0 ? `"${command}" failed with exit code ${exitCode}.` : `"${command}" failed with exit code ${exitCode}: ${detail}`;
  }
}
