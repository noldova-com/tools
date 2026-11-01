/**
 * @license
 * Copyright (c) Noldova.
 *
 * This source code is licensed under the license found in the
 * LICENSE file in the root directory of this source tree.
 */

import type { BinaryToTextEncoding } from "node:crypto";

export class Resources {
  public static readonly accessLevels: readonly string[] = ["public", "restricted"];
  public static readonly archiveManifestPath: string = "package/package.json";
  public static readonly archiveStepName: string = "archive";
  public static readonly archiveStepUsage: string = "<folder> <version> <commit> <scope>";
  public static readonly commitPattern: RegExp = /^[0-9a-f]{40}$/;
  public static readonly dependenciesField: string = "dependencies";
  public static readonly failureExitCode: number = 1;
  public static readonly gitFileSeparator: string = "\0";
  public static readonly gitFileType: string = "blob";
  public static readonly gitHeadField: string = "gitHead";
  public static readonly gitHeadRevision: string = "HEAD^{commit}";
  public static readonly gitIsAncestorValues: readonly string[] = ["merge-base", "--is-ancestor", "--end-of-options"];
  public static readonly gitListFilesValues: readonly string[] = ["ls-tree", "-r", "-z", "--name-only", "--full-tree", "--end-of-options"];
  public static readonly gitNotFoundExitCode: number = 1;
  public static readonly gitProgram: string = "git";
  public static readonly gitReadFileValues: readonly string[] = ["cat-file", "blob", "--end-of-options"];
  public static readonly gitReadHeadValues: readonly string[] = ["rev-parse", "--verify", "--end-of-options"];
  public static readonly gitReadTypeValues: readonly string[] = ["cat-file", "-t", "--end-of-options"];
  public static readonly gitVerifyValues: readonly string[] = ["rev-parse", "--verify", "--quiet", "--end-of-options"];
  public static readonly integrityAlgorithm: string = "sha512";
  public static readonly integrityEncoding: BinaryToTextEncoding = "base64";
  public static readonly latestTag: string = "latest";
  public static readonly lineBreakPattern: RegExp = /\r?\n/;
  public static readonly lineSeparator: string = "\n";
  public static readonly mainBranch: string = "origin/main";
  public static readonly mainReference: string = "refs/remotes/origin/main";
  public static readonly majorPartName: string = "major";
  public static readonly manifestFileName: string = "package.json";
  public static readonly messagePartSeparator: string = "; ";
  public static readonly minorPartName: string = "minor";
  public static readonly nameField: string = "name";
  public static readonly nightlyDatePattern: RegExp = /^([1-9][0-9]{3})([0-9]{2})([0-9]{2})$/;
  public static readonly nightlySeparator: string = "-nightly.";
  public static readonly nightlyStepName: string = "nightly";
  public static readonly nightlyStepUsage: string = "<commit> <registry>";
  public static readonly nightlyTag: string = "nightly";
  public static readonly npmAccessValues: readonly string[] = ["--access"];
  public static readonly npmIntegrityField: string = "dist.integrity";
  public static readonly npmNotFoundCode: string = "E404";
  public static readonly npmPreferOnlineValues: readonly string[] = ["--prefer-online"];
  public static readonly npmProgram: string = "npm";
  public static readonly npmPublishValues: readonly string[] = ["publish"];
  public static readonly npmRegistryValues: readonly string[] = ["--registry"];
  public static readonly npmTagValues: readonly string[] = ["--tag"];
  public static readonly npmViewValues: readonly string[] = ["view"];
  public static readonly packagesFolderPath: string = "src";
  public static readonly patchPartName: string = "patch";
  public static readonly pathSeparator: string = "/";
  public static readonly privateField: string = "private";
  public static readonly processReleaseDelayMilliseconds: number = 0;
  public static readonly publishRetryMilliseconds: number = 10_000;
  public static readonly publishStepName: string = "publish";
  public static readonly publishStepUsage: string = "<folder> <version> <commit> <scope> <registry> <access>";
  public static readonly publishWaitMilliseconds: number = 600_000;
  public static readonly registryProtocol: string = "https:";
  public static readonly scopePattern: RegExp = /^@[a-z0-9][a-z0-9._~-]*$/;
  public static readonly sourceStepName: string = "source";
  public static readonly sourceStepUsage: string = "<version> <commit>";
  public static readonly successExitCode: number = 0;
  public static readonly tarProgram: string = "tar";
  public static readonly tarReadFileValues: readonly string[] = ["-xzOf"];
  public static readonly testsFolderName: string = "tests";
  public static readonly textEncoding: BufferEncoding = "utf8";
  public static readonly urlCredentialsPattern: RegExp = /\b([a-z][a-z0-9+.-]*:\/\/)[^\s/@]+@/gi;
  public static readonly urlQueryPattern: RegExp = /\b([a-z][a-z0-9+.-]*:\/\/[^\s?#]*)[?#]\S*/gi;
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

  public static formatVersionNotRelease(commit: string, filePath: string, found: string): string {
    return `${filePath} at commit ${commit} holds ${found}, not a release version.`;
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
    return Resources.formatFailureLine(`${archiveName}: ${Resources.tarProgram} could not read its ${filePath} and exited with code ${exitCode}`, errorOutput);
  }

  public static formatFieldDiffers(archiveName: string, field: string, found: string, expected: string): string {
    return `${archiveName}: its ${field} is ${found}, not ${expected}.`;
  }

  public static formatOutsideScope(archiveName: string, packageName: string, scope: string): string {
    return `${archiveName}: ${packageName} is outside the scope ${scope}.`;
  }

  public static formatFieldMissing(archiveName: string, field: string, expected: string): string {
    return `${archiveName}: it has no ${field}, which should be ${expected}.`;
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

  public static formatRegistryInvalid(): string {
    return "The registry is not an https URL without credentials, a query or a fragment, such as https://registry.npmjs.org/.";
  }

  public static formatAccessInvalid(text: string): string {
    return `"${text}" is not an access: the access is ${Resources.accessLevels.join(" or ")}.`;
  }

  public static formatSpecifier(packageName: string, version: string): string {
    return `${packageName}@${version}`;
  }

  public static formatIntegrity(algorithm: string, hash: string): string {
    return `${algorithm}-${hash}`;
  }

  public static formatAlreadyPublished(specifier: string): string {
    return `${specifier} is already published from this archive.`;
  }

  public static formatPublishedOtherwise(specifier: string): string {
    return `${specifier} is already published from another archive.`;
  }

  public static formatDistTagField(tag: string): string {
    return `dist-tags.${tag}`;
  }

  public static formatTaggedInvalid(packageName: string, tag: string, tagged: string): string {
    return `${packageName}'s ${tag} version, ${tagged}, is not a version.`;
  }

  public static formatNotNewer(specifier: string, tag: string, tagged: string): string {
    return `${specifier} is not newer than ${tagged}, the package's ${tag} version.`;
  }

  public static formatNpmFailed(specifier: string, commandValues: readonly string[], exitCode: number | null, errorOutput: string): string {
    return Resources.formatFailureLine(`${specifier}: ${Resources.npmProgram} ${commandValues.join(Resources.valueSeparator)} exited with code ${exitCode}`, errorOutput);
  }

  public static formatNotServed(specifier: string, waitMilliseconds: number): string {
    return `${specifier} was published, but the registry did not serve it within ${waitMilliseconds / 1_000} seconds.`;
  }

  public static formatPublished(specifier: string): string {
    return `${specifier} published.`;
  }

  public static formatNightlyDate(date: Date): string {
    return `${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, "0")}${String(date.getUTCDate()).padStart(2, "0")}`;
  }

  public static formatNightlyPartlyPublished(specifiers: readonly string[], date: string): string {
    return `Only some packages' last nightly is from ${date}, UTC, so the publish step would refuse a new one for them: ${specifiers.join(", ")}.`;
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

  private static formatFailureLine(failure: string, errorOutput: string): string {
    const detail = errorOutput.split(Resources.lineBreakPattern).map(t => t.trim()).filter(t => t.length > 0).join(Resources.messagePartSeparator);

    return detail.length === 0 ? `${failure}.` : `${failure}: ${Resources.removeCredentials(detail)}`;
  }

  private static removeCredentials(text: string): string {
    return text.replace(Resources.urlCredentialsPattern, "$1").replace(Resources.urlQueryPattern, "$1");
  }
}
