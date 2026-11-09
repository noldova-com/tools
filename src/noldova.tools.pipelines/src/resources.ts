/**
 * @license
 * Copyright (c) Noldova.
 *
 * This source code is licensed under the license found in the
 * LICENSE file in the root directory of this source tree.
 */

import type { StdioOptions } from "node:child_process";
import type { BinaryToTextEncoding } from "node:crypto";

export class Resources {
  public static readonly accessLevels: readonly string[] = ["public", "restricted"];
  public static readonly archiveLicensePath: string = "package/LICENSE";
  public static readonly archivePackageFolder: string = "package";
  public static readonly archiveSpecifierPrefix: string = "file:";
  public static readonly copiesEndLine: string = "end of copies";
  public static readonly copiesNone: string = "The build copies no file into a package.";
  public static readonly copiesTemporaryPrefix: string = "pipelines-copies-";
  public static readonly copyFieldSeparator: string = "\t";
  public static readonly copyPathSegmentsRefused: readonly string[] = ["", ".", ".."];
  public static readonly windowsPathSeparator: string = "\\";
  public static readonly archiveFileExtension: string = ".tgz";
  public static readonly archiveManifestPath: string = "package/package.json";
  public static readonly archiveStepName: string = "archive";
  public static readonly archiveStepUsage: string = "<folder> <version> <commit> <scope>";
  public static readonly checkoutUnchanged: string = "The checkout has no changed or untracked file.";
  public static readonly commitPattern: RegExp = /^[0-9a-f]{40}$/;
  public static readonly credentialFilePattern: RegExp = /(?:^|\/)(?:\.npmrc|\.netrc|\.env(?:\.[^/]+)?|id_rsa|id_dsa|id_ecdsa|id_ed25519|[^/]*\.(?:pem|key|p12|pfx))$/i;
  public static readonly crlfLineEndings: string = "crlf";
  public static readonly dependenciesField: string = "dependencies";
  public static readonly dependentsFolderPrefix: string = "pipelines-dependents-";
  public static readonly dependentsStepName: string = "dependents";
  public static readonly dependentsStepUsage: string = "<version> <commit>";
  public static readonly dependabotFilePaths: readonly string[] = [".github/dependabot.yml", ".github/dependabot.yaml"];
  public static readonly failureExitCode: number = 1;
  public static readonly exactVersionPattern: RegExp = /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/;
  public static readonly fileEndByteCount: number = 2;
  public static readonly gitAddWorktreeValues: readonly string[] = ["worktree", "add", "--quiet", "--detach", "--end-of-options"];
  public static readonly gitAttributesFilePath: string = ".gitattributes";
  public static readonly gitCommitAllValues: readonly string[] = ["commit", "--quiet", "--all", "--no-verify", "--message"];
  public static readonly gitAttributesLine: string = "* text=auto eol=lf";
  public static readonly gitCheckoutRevision: string = "HEAD";
  public static readonly gitEntrySeparator: string = "\t";
  public static readonly gitFileSeparator: string = "\0";
  public static readonly gitFileType: string = "blob";
  public static readonly gitHeadField: string = "gitHead";
  public static readonly gitHeadRevision: string = "HEAD^{commit}";
  public static readonly gitIsAncestorValues: readonly string[] = ["merge-base", "--is-ancestor", "--end-of-options"];
  public static readonly gitLineEndingsPrefix: string = "i/";
  public static readonly gitLineEndingsSeparator: RegExp = /\s+/;
  public static readonly gitListChangesValues: readonly string[] = ["status", "--porcelain"];
  public static readonly gitListFilesValues: readonly string[] = ["ls-tree", "-r", "-z", "--name-only", "--full-tree", "--end-of-options"];
  public static readonly gitListTrackedFilesValues: readonly string[] = ["ls-files", "-z", "--stage", "--eol"];
  public static readonly gitModeSeparator: string = " ";
  public static readonly gitNotTextAttribute: string = "attr/-text";
  public static readonly gitNotTextLineEndings: string = "-text";
  public static readonly gitNotFoundExitCode: number = 1;
  public static readonly gitProgram: string = "git";
  public static readonly gitReadFileValues: readonly string[] = ["cat-file", "blob", "--end-of-options"];
  public static readonly gitReadCommitterValues: readonly string[] = ["log", "-1", "--format=%ce", "--end-of-options"];
  public static readonly gitReadHeadValues: readonly string[] = ["rev-parse", "--verify", "--end-of-options"];
  public static readonly gitReadSubjectValues: readonly string[] = ["log", "-1", "--format=%s", "--end-of-options"];
  public static readonly gitReadTypeValues: readonly string[] = ["cat-file", "-t", "--end-of-options"];
  public static readonly gitRemoveWorktreeValues: readonly string[] = ["worktree", "remove", "--force", "--end-of-options"];
  public static readonly gitSymbolicLinkMode: string = "120000";
  public static readonly gitVerifyValues: readonly string[] = ["rev-parse", "--verify", "--quiet", "--end-of-options"];
  public static readonly integrityAlgorithm: string = "sha512";
  public static readonly integrityEncoding: BinaryToTextEncoding = "base64";
  public static readonly integrityPrefix: string = "sha512-";
  public static readonly keepVersionsPattern: RegExp = /^[1-9][0-9]*$/;
  public static readonly latestTag: string = "latest";
  public static readonly licenseField: string = "license";
  public static readonly lineEndingsStepName: string = "line-endings";
  public static readonly lineEndingsStepUsage: string = "";
  public static readonly lineBreakPattern: RegExp = /\r?\n/;
  public static readonly lineSeparator: string = "\n";
  public static readonly lockFileName: string = "package-lock.json";
  public static readonly pinsFolderPrefix: string = "pipelines-pins-";
  public static readonly pinsStepName: string = "pins";
  public static readonly pinsStepUsage: string = "<version> <commit>";
  public static readonly repositorySeparator: string = "/";
  public static readonly mainBranch: string = "origin/main";
  public static readonly mainReference: string = "refs/remotes/origin/main";
  public static readonly majorPartName: string = "major";
  public static readonly millisecondsPerSecond: number = 1000;
  public static readonly manifestFileName: string = "package.json";
  public static readonly messagePartSeparator: string = "; ";
  public static readonly minorPartName: string = "minor";
  public static readonly mixedLineEndings: string = "mixed";
  public static readonly nameField: string = "name";
  public static readonly newlineByte: number = 10;
  public static readonly nightlyDatePattern: RegExp = /^([1-9][0-9]{3})([0-9]{2})([0-9]{2})$/;
  public static readonly nightlySeparator: string = "-nightly.";
  public static readonly nightlyStepName: string = "nightly";
  public static readonly nightlyStepUsage: string = "<commit> <registry>";
  public static readonly nightlyTag: string = "nightly";
  public static readonly nodeVersionPrefix: string = "v";
  public static readonly npmAccessValues: readonly string[] = ["--access"];
  public static readonly npmBuildValues: readonly string[] = ["run", "build"];
  public static readonly npmListCopiesValues: readonly string[] = ["run", "build", "--silent", "--", "--list-copies"];
  public static readonly npmIntegrityField: string = "dist.integrity";
  public static readonly lockPackagesField: string = "packages";
  public static readonly nodeModulesSegment: string = "node_modules/";
  public static readonly npmLockTimeoutMilliseconds: number = 300_000;
  public static readonly npmJsonValues: readonly string[] = ["--json"];
  public static readonly npmLockValues: readonly string[] = ["install", "--package-lock-only", "--ignore-scripts", "--no-audit", "--no-fund"];
  public static readonly npmNotFoundCode: string = "E404";
  public static readonly npmPreferOnlineValues: readonly string[] = ["--prefer-online"];
  public static readonly npmProgram: string = "npm";
  public static readonly npmPublishValues: readonly string[] = ["publish"];
  public static readonly npmRegistryHostName: string = "registry.npmjs.org";
  public static readonly npmRegistryValues: readonly string[] = ["--registry"];
  public static readonly npmTagValues: readonly string[] = ["--tag"];
  public static readonly npmVersionValues: readonly string[] = ["--version"];
  public static readonly npmViewValues: readonly string[] = ["view"];
  public static readonly npmVersionsField: string = "versions";
  public static readonly packagesFolderPath: string = "src";
  public static readonly parentFolderName: string = "..";
  public static readonly patchPartName: string = "patch";
  public static readonly pathSeparator: string = "/";
  public static readonly peerDependenciesField: string = "peerDependencies";
  public static readonly privateField: string = "private";
  public static readonly processKillSignal: NodeJS.Signals = "SIGKILL";
  public static readonly processReleaseDelayMilliseconds: number = 0;
  public static readonly progressDone: string = " Done.";
  public static readonly progressFailed: string = " Failed.";
  public static readonly pruneStepName: string = "prune";
  public static readonly pruneStepUsage: string = "<version> <commit> <scope> <registry> <keep-versions>";
  public static readonly publishRetryMilliseconds: number = 10_000;
  public static readonly publishStepName: string = "publish";
  public static readonly publishStepUsage: string = "<folder> <version> <commit> <scope> <registry> <access>";
  public static readonly publishWaitMilliseconds: number = 600_000;
  public static readonly registryProtocol: string = "https:";
  public static readonly reproducibleFolderPrefix: string = "pipelines-reproducible-";
  public static readonly reproducibleStepName: string = "reproducible";
  public static readonly reproducibleStepUsage: string = "<folder>";
  public static readonly scopePattern: RegExp = /^@[a-z0-9][a-z0-9._~-]*$/;
  public static readonly sourceStepName: string = "source";
  public static readonly sourceStepUsage: string = "<version> <commit>";
  public static readonly successExitCode: number = 0;
  public static readonly tagPrefix: string = "v";
  public static readonly tagStepName: string = "tag";
  public static readonly tagStepUsage: string = "<version> <commit>";
  public static readonly tarProgram: string = "tar";
  public static readonly tarExtractValues: readonly string[] = ["-xzf"];
  public static readonly tarListFilesValues: readonly string[] = ["-tzf"];
  public static readonly tarReadFileValues: readonly string[] = ["-xzOf"];
  public static readonly testsFolderName: string = "tests";
  public static readonly trackedFilesMissing: string = "Git lists no tracked file in this folder; run this step in a clone's checkout.";
  public static readonly unchangedStepName: string = "unchanged";
  public static readonly unchangedStepUsage: string = "";
  public static readonly updateIssueSummary: string = "A release moved packages this repository pins exactly";
  public static readonly textEncoding: BufferEncoding = "utf8";
  public static readonly usesPattern: RegExp = /^([ \t]*(?:-[ \t]+)?uses:[ \t]*)([^@\s#]+)@([0-9a-f]{40})(?:[ \t]+#[ \t]*(\S+))?/gm;
  public static readonly workflowExtensions: readonly string[] = [".yml", ".yaml"];
  public static readonly workflowsFolderPath: string = ".github/workflows";
  public static readonly toolchainStepName: string = "toolchain";
  public static readonly toolchainStepUsage: string = "<node-version> [<npm-version>]";
  public static readonly urlCredentialsPattern: RegExp = /\b([a-z][a-z0-9+.-]*:\/\/)[^\s/@]+@/gi;
  public static readonly urlQueryPattern: RegExp = /\b([a-z][a-z0-9+.-]*:\/\/[^\s?#]*)[?#]\S*/gi;
  public static readonly usageSeparator: string = " | ";
  public static readonly valueSeparator: string = " ";
  public static readonly versionField: string = "version";
  public static readonly versionFilePath: string = "version.json";
  public static readonly buildConfigEmpty: string = "it names no package";
  public static readonly buildConfigFilePath: string = "build.json";
  public static readonly buildConfigMissing: string = "The checkout has no build.json, which names the packages to build.";
  public static readonly buildFolder: string = "_build/packages";
  public static readonly buildPackageNamePattern: RegExp = /^noldova(?:\.[a-z0-9]+)+$/;
  public static readonly buildScriptFields: readonly string[] = ["pre", "compile", "post"];
  public static readonly buildStepName: string = "build";
  public static readonly buildStepUsage: string = "[--version <version>] [<package>...], or --list-copies";
  public static readonly coverageFolder: string = "_build/coverage";
  public static readonly coverageEntryPointPath: string = "./coverage-entry-point.js";
  public static readonly coverageIncomplete: string = "Coverage is incomplete.";
  public static readonly coverageUnreadExitCode: number = 2;
  public static readonly coverageVariable: string = "NODE_V8_COVERAGE";
  public static readonly currentFolder: string = ".";
  public static readonly currentFolderPrefix: string = "./";
  public static readonly declarationFilePath: string = "src/api/index.d.ts";
  public static readonly emptyJsonObject: string = "{}";
  public static readonly enabledValue: string = "1";
  public static readonly filteredCoverageSkipped: string = "The coverage gate is skipped for a filtered run.";
  public static readonly gitReadPrefixValues: readonly string[] = ["rev-parse", "--show-prefix"];
  public static readonly installedComparedFields: readonly string[] = ["version", "resolved", "integrity"];
  public static readonly installedDifferencesShown: number = 5;
  public static readonly installedLockFilePath: string = "node_modules/.package-lock.json";
  public static readonly installedStepName: string = "installed";
  public static readonly installedStepUsage: string = "[<folder>]";
  public static readonly licenseFileName: string = "LICENSE";
  public static readonly listCopiesOption: string = "--list-copies";
  public static readonly lockFilePath: string = "package-lock.json";
  public static readonly manifestIndentation: number = 2;
  public static readonly nodeModulesFolder: string = "node_modules";
  public static readonly nodeModulesPathPrefix: string = "node_modules/";
  public static readonly noticesFileName: string = "THIRD-PARTY-NOTICES.txt";
  public static readonly npmCommandLineMissing: string = "npm_execpath is not set; run the step through an npm script, such as npm run build.";
  public static readonly npmCommandLineVariable: string = "npm_execpath";
  public static readonly npmCleanInstallCommand: string = "npm ci --ignore-scripts";
  public static readonly npmPrefixOption: string = "--prefix";
  public static readonly npmInstallArchivesValues: readonly string[] = ["install", "--ignore-scripts", "--no-audit", "--no-fund"];
  public static readonly npmPackValues: readonly string[] = ["pack", "--silent", "--pack-destination"];
  public static readonly optionPrefix: string = "--";
  public static readonly optionalField: string = "optional";
  public static readonly packageDeclarationFilePath: string = "api/index.d.ts";
  public static readonly packageManifestFileName: string = "package.json";
  public static readonly packageNamePrefix: string = "noldova.";
  public static readonly defaultPackageScope: string = "@noldova";
  public static readonly packageScopePattern: RegExp = /^@[a-z0-9][a-z0-9._-]*$/;
  public static readonly scopeField: string = "scope";
  public static readonly packagesField: string = "packages";
  public static readonly packagesFolder: string = "_packages";
  public static readonly pathField: string = "path";
  public static readonly readmeFileName: string = "README.md";
  public static readonly restoreDiscardFolder: string = "_build/restore.discard";
  public static readonly restoreFolder: string = "_build/restore";
  public static readonly restoreStagingFolder: string = "_build/restore.partial";
  public static readonly skipCoverageDetailsOption: string = "--skip-coverage-details";
  public static readonly skipTestDetailsOption: string = "--skip-test-details";
  public static readonly skipTestDetailsVariable: string = "CONTEXT_SKIP_TEST_DETAILS";
  public static readonly sourceFolder: string = "src";
  public static readonly sourceMapsOption: string = "--enable-source-maps";
  public static readonly sourceProjectPath: string = "src/tsconfig.json";
  public static readonly testEntryPath: string = "node_modules/@noldova/context.testing/services/execution/test-run-entry-point.js";
  public static readonly testFiltersVariable: string = "CONTEXT_TEST_FILTERS";
  public static readonly testOptions: readonly string[] = ["--skip-test-details", "--skip-coverage-details"];
  public static readonly testStepName: string = "test";
  public static readonly testStepUsage: string = "[--skip-test-details] [--skip-coverage-details] [<filter>...]";
  public static readonly testingMissing: string = "@noldova/context.testing is not installed; the repository's devDependencies name it.";
  public static readonly testingPackageName: string = "@noldova/context.testing";
  public static readonly testsFolder: string = "_build/tests";
  public static readonly testsMissing: string = "No package has tests.";
  public static readonly testsPassed: string = "The tests passed, and coverage is complete.";
  public static readonly testsProjectPath: string = "tests/tsconfig.json";
  public static readonly typeScriptCompileValues: readonly string[] = ["--pretty", "--project"];
  public static readonly typeScriptCompilerPath: string = "bin/tsc";
  public static readonly typeScriptManifestPath: string = "typescript/package.json";
  public static readonly typeScriptMissing: string = "typescript is not installed; the repository's devDependencies name it.";
  public static readonly versionFileMissing: string = "The checkout has no version.json, which holds the version to build.";
  public static readonly versionOption: string = "--version";
  public static readonly versionPlaceholder: string = "__VERSION__";
  public static readonly visibleProcessStreams: StdioOptions = "inherit";
  public static readonly versionInvalid: string = "The text is not a version.";
  public static readonly versionPartSeparator: string = ".";
  public static readonly versionPattern: RegExp = /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(?:-nightly\.([0-9]{8}))?$/;
  public static readonly windowsNpmBuildValues: readonly string[] = ["/d", "/s", "/c", "npm.cmd run build"];
  public static readonly windowsNpmListCopiesValues: readonly string[] = ["/d", "/s", "/c", "npm.cmd run build --silent -- --list-copies"];
  public static readonly windowsNpmLockValues: readonly string[] = ["/d", "/s", "/c", "npm.cmd install --package-lock-only --ignore-scripts --no-audit --no-fund"];
  public static readonly windowsNpmProgram: string = "npm.cmd";
  public static readonly windowsShellValues: readonly string[] = ["/d", "/s", "/c"];
  public static readonly windowsNpmVersionValues: readonly string[] = ["/d", "/s", "/c", "npm.cmd --version"];
  public static readonly windowsPlatform: string = "win32";
  public static readonly windowsShellProgram: string = "cmd.exe";

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
    return usage.length === 0 ? stepName : `${stepName}${Resources.valueSeparator}${usage}`;
  }

  public static formatStepValuesInvalid(stepName: string, usage: string): string {
    return usage.length === 0 ? `The ${stepName} step takes no values.` : `The ${stepName} step takes ${usage}.`;
  }

  public static formatCheckoutChanged(changes: readonly string[]): string {
    return [
      "The checkout has changed or untracked files:",
      ...changes,
      "What runs before this step must leave every tracked file as committed and write only to ignored paths: undo the change, or ignore the output in .gitignore."
    ].join(Resources.lineSeparator);
  }

  public static formatGitAttributesLineMissing(filePath: string, line: string): string {
    return `${filePath} at the checkout's root must hold the line "${line}"; add it.`;
  }

  public static formatCrlfLineEndings(filePath: string): string {
    return `${JSON.stringify(filePath)} has CRLF line endings; convert them to LF.`;
  }

  public static formatMixedLineEndings(filePath: string): string {
    return `${JSON.stringify(filePath)} mixes CRLF and LF line endings; convert them to LF.`;
  }

  public static formatCheckoutFileMissing(filePath: string): string {
    return `${JSON.stringify(filePath)} is tracked but not a file in the checkout; restore it, or remove it from git.`;
  }

  public static formatFinalNewlineMissing(filePath: string): string {
    return `${JSON.stringify(filePath)} does not end with a newline; add one.`;
  }

  public static formatFinalBlankLine(filePath: string): string {
    return `${JSON.stringify(filePath)} ends with a blank line; remove it, so the file ends with exactly one newline.`;
  }

  public static formatLineEndingsChecked(filePath: string, line: string, fileCount: number): string {
    return `${filePath} holds "${line}", and the ${fileCount} tracked text files use LF line endings and end with exactly one newline.`;
  }

  public static formatExactVersionInvalid(text: string): string {
    return `"${text}" is not an exact version: write major.minor.patch, such as 24.21.0.`;
  }

  public static formatNodeVersionDiffers(found: string, expected: string): string {
    return `Node.js ${found} runs this step, not ${Resources.nodeVersionPrefix}${expected}; set up Node.js ${expected} before it.`;
  }

  public static formatNpmVersionDiffers(found: string, expected: string): string {
    return `npm ${found} runs this step, not ${expected}; install npm ${expected} before it.`;
  }

  public static formatFolderOutsideCheckout(folder: string): string {
    return `The folder ${folder} must be a folder inside the checkout, given from its root, such as _packages.`;
  }

  public static formatArchivesMissing(folder: string): string {
    return `${folder} holds no ${Resources.archiveFileExtension} archive to compare; build and pack the packages before this step.`;
  }

  public static formatSecondBuildFailed(exitCode: number | null, errorOutput: string): string {
    return Resources.formatFailureLine(`The second build, npm ${Resources.npmBuildValues.join(Resources.valueSeparator)} in a worktree of the same commit, exited with code ${exitCode}`, errorOutput);
  }

  public static formatArchiveDiffers(name: string, first: string, second: string): string {
    return `${name} differs between the two builds: ${first} and ${second}.`;
  }

  public static formatArchiveOnlyInFirstBuild(name: string): string {
    return `${name} is only in the first build.`;
  }

  public static formatArchiveOnlyInSecondBuild(name: string): string {
    return `${name} is only in the second build.`;
  }

  public static formatBuildsDiffer(findings: readonly string[]): string {
    return [...findings, "A second build of the same commit, in another folder, must pack byte-identical archives, so that rerunning a release publishes nothing new: make the build depend on neither its folder nor the time."].join(Resources.lineSeparator);
  }

  public static formatBuildsIdentical(commit: string, archives: readonly string[]): string {
    return [`A second build of commit ${commit}, in another folder, packed the same ${archives.length} archives byte for byte:`, ...archives].join(Resources.lineSeparator);
  }

  public static formatArchiveIntegrity(name: string, integrity: string): string {
    return `${name} ${integrity}`;
  }

  public static formatToolchainChecked(nodeVersion: string, npmVersion: string | null): string {
    return npmVersion === null ? `Node.js ${nodeVersion} runs this step; npm is not checked.` : `Node.js ${nodeVersion} and npm ${npmVersion} run this step.`;
  }

  public static formatNpmVersionFailed(exitCode: number | null, errorOutput: string): string {
    return Resources.formatProcessFailed(`${Resources.npmProgram}${Resources.valueSeparator}${Resources.npmVersionValues.join(Resources.valueSeparator)}`, exitCode, errorOutput);
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

  public static formatArchiveListUnreadable(archiveName: string, exitCode: number | null, errorOutput: string): string {
    return Resources.formatFailureLine(`${archiveName}: ${Resources.tarProgram} could not list its files and exited with code ${exitCode}`, errorOutput);
  }

  public static formatArchiveCredentialFile(archiveName: string, filePath: string): string {
    return `${archiveName}: it holds ${filePath}, a file of a kind that holds credentials, which is never published.`;
  }

  public static formatCopiesUnlisted(exitCode: number | null, errorOutput: string): string {
    return Resources.formatFailureLine(`The build could not list the files it copies in: npm ${Resources.npmListCopiesValues.join(Resources.valueSeparator)} exited with code ${exitCode}`, errorOutput);
  }

  public static formatCopiesEndMissing(): string {
    return `The build did not end its list of copies with the line "${Resources.copiesEndLine}": its build script must take --list-copies, print each file it copies into a package, and end with that line.`;
  }

  public static formatCopyLineInvalid(line: string): string {
    return `"${line}" is not a copy the build lists: a source path from the repository's root, a package's name and a path inside the package, separated by tabs.`;
  }

  public static formatCopyPathInvalid(line: string, filePath: string): string {
    return `"${line}": "${filePath}" is not a path inside its folder, with / between its parts.`;
  }

  public static formatCopyPackageUnknown(line: string, packageName: string): string {
    return `"${line}": ${packageName} has no archive to check.`;
  }

  public static formatCopySourceMissing(source: string): string {
    return `${source}, which the build lists as a copy, is not a file.`;
  }

  public static formatCopySourceLinked(source: string): string {
    return `${source}, which the build lists as a copy, is a symbolic link or lies under one.`;
  }

  public static formatCopyLinked(archiveName: string, filePath: string): string {
    return `${archiveName}: its ${Resources.archivePackageFolder}/${filePath} is a symbolic link or lies under one.`;
  }

  public static formatCopyNotFile(archiveName: string, filePath: string, source: string): string {
    return `${archiveName}: its ${Resources.archivePackageFolder}/${filePath}, the copy of ${source}, is not a file.`;
  }

  public static formatArchiveUnextracted(archiveName: string, exitCode: number | null, errorOutput: string): string {
    return Resources.formatFailureLine(`${archiveName}: ${Resources.tarProgram} could not extract it and exited with code ${exitCode}`, errorOutput);
  }

  public static formatCopyMissing(archiveName: string, filePath: string, source: string): string {
    return `${archiveName}: it has no ${Resources.archivePackageFolder}/${filePath}, the copy of ${source}.`;
  }

  public static formatCopyDiffers(archiveName: string, filePath: string, source: string): string {
    return `${archiveName}: its ${Resources.archivePackageFolder}/${filePath} differs from ${source}.`;
  }

  public static formatCopiesMatched(count: number): string {
    return count === 1 ? "The file the build copies in matches its source." : `Each of the ${count} files the build copies in matches its source.`;
  }

  public static formatArchiveLicenseMissing(archiveName: string): string {
    return `${archiveName}: it has no ${Resources.archiveLicensePath}.`;
  }

  public static formatLicenseMissing(archiveName: string): string {
    return `${archiveName}: its package.json has no ${Resources.licenseField}.`;
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

  public static formatTagName(version: string): string {
    return `${Resources.tagPrefix}${version}`;
  }

  public static formatDependentsVersionNotRelease(version: string): string {
    return `${version} is a nightly version; only a release version moves the repositories that pin its packages.`;
  }

  public static formatDependentsSummary(packageNames: readonly string[], version: string, repositoryCount: number): string {
    return `Looked for exact pins of ${packageNames.join(", ")} older than ${version} in ${repositoryCount} repositories:`;
  }

  public static formatDependentsWritten(packageNames: readonly string[], version: string, repositoryCount: number): string {
    return `Looked for exact pins of ${packageNames.join(", ")} older than ${version} in ${repositoryCount} repositories; each one's line is above.`;
  }

  public static formatRepositoryUnpinned(repository: string, version: string): string {
    return `${repository}: pins none of them below ${version}.`;
  }

  public static formatRepositoryProposed(repository: string, url: string, moveCount: number): string {
    return `${repository}: moved ${moveCount} pins in ${url}`;
  }

  public static formatRepositoryBlocked(repository: string, version: string, blockers: readonly string[]): string {
    return `${repository}: left at its pins until these accept ${version}: ${blockers.join("; ")}.`;
  }

  public static formatRepositoryConflicted(repository: string, version: string, conflicts: readonly string[]): string {
    return `${repository}: left at its pins, since the lock files relocked for ${version} still hold packages whose exact peers differ from what they lock: ${conflicts.join("; ")}.`;
  }

  public static formatPeerBlocker(filePath: string, packageName: string, version: string, peerName: string, peerVersion: string): string {
    return `${filePath} locks ${packageName} ${version}, which needs ${peerName} ${peerVersion}`;
  }

  public static formatPeerReason(packageName: string, version: string): string {
    return `, which \`${packageName}\` ${version} needs as a peer`;
  }

  public static formatPeerMatchReason(peerName: string, peerVersion: string): string {
    return `, the first version that needs \`${peerName}\` ${peerVersion} as a peer`;
  }

  public static formatPeerNewer(packageName: string, version: string, peerVersion: string, neededBy: string, neededByVersion: string): string {
    return `${packageName} ${version} is newer than the ${peerVersion} that ${neededBy} ${neededByVersion} needs`;
  }

  public static formatPeerMovedElsewhere(packageName: string, movedVersion: string, peerVersion: string, neededBy: string, neededByVersion: string): string {
    return `${packageName} moves to ${movedVersion}, but ${neededBy} ${neededByVersion} needs ${peerVersion}`;
  }

  public static formatPeerUnmatched(packageName: string, version: string, peerName: string, peerVersion: string, movedVersion: string): string {
    return `${packageName} ${version} needs ${peerName} ${peerVersion}, and no later version of it needs ${peerName} ${movedVersion}`;
  }

  public static formatRepositoryUnmatched(repository: string, version: string, misses: readonly string[]): string {
    return `${repository}: left at its pins, which can't take what ${version} moves: ${misses.join("; ")}.`;
  }

  public static formatRepositoryFailed(repository: string, message: string): string {
    return `${repository}: ${message}`;
  }

  public static formatLockFailed(lockFilePath: string, exitCode: number | null, errorOutput: string): string {
    return Resources.formatFailureLine(`Relocking ${lockFilePath}, npm ${Resources.npmLockValues.join(Resources.valueSeparator)}, exited with code ${exitCode}`, errorOutput);
  }

  public static formatPinMoved(filePath: string, packageName: string, from: string, to: string): string {
    return `\`${filePath}\`: \`${packageName}\` from ${from} to ${to}`;
  }

  public static formatUpdateTitle(source: string, version: string): string {
    return `${Resources.formatUpdateTitlePrefix(source)}${version}`;
  }

  public static formatUpdateTitlePrefix(source: string): string {
    return `Move the pins of ${source}'s packages to `;
  }

  public static formatBranchNotOwn(branch: string, commit: string): string {
    return `${branch} is at ${commit}, a commit this step didn't make, so it is left as it is; merge or close its pull request, or move its changes elsewhere.`;
  }

  public static formatUpdateBranch(source: string): string {
    return `pipelines/update-${source}`;
  }

  public static formatUpdateBody(source: string, version: string, commit: string, moves: readonly string[], lockFilePaths: readonly string[], notes: string): string {
    return [
      "## Summary",
      "",
      `${source} released ${version} from commit ${commit}; this moves every exact pin of its packages that was older.`,
      "",
      ...moves.map(t => `- ${t}`),
      ...lockFilePaths.map(t => `- \`${t}\`: the moved packages, the entries nested under them and the entries that depend on them resolved again with \`npm ${Resources.npmLockValues.join(Resources.valueSeparator)}\`; every other entry kept unless a resolved package needs it to change`),
      "",
      notes.length === 0 ? `The pull request that merged ${commit} has no "Release notes" section.` : notes
    ].join(Resources.lineSeparator);
  }

  public static formatPinsVersionNotRelease(version: string): string {
    return `${version} is a nightly version; only a release version moves the pins on the shared workflows.`;
  }

  public static formatPinsSummary(source: string, tag: string, repositoryCount: number): string {
    return `Looked for pins on ${source}'s workflows older than ${tag} in ${repositoryCount} repositories:`;
  }

  public static formatPinsWritten(source: string, tag: string, repositoryCount: number): string {
    return `Looked for pins on ${source}'s workflows older than ${tag} in ${repositoryCount} repositories; each one's line is above.`;
  }

  public static formatRepositoryPinsCurrent(repository: string, tag: string): string {
    return `${repository}: pins nothing older than ${tag}.`;
  }

  public static formatRepositoryPinsLeft(repository: string, tag: string, left: readonly string[]): string {
    return `${repository}: moves nothing to ${tag}; left as they are: ${left.join("; ")}.`;
  }

  public static formatWorkflowPinMoved(filePath: string, action: string, from: string, to: string): string {
    return `\`${filePath}\`: \`${action}\` from ${from} to ${to}`;
  }

  public static formatWorkflowPinLeft(filePath: string, action: string, from: string, to: string): string {
    return `\`${filePath}\`: \`${action}\` at ${from}, a major version behind ${to}`;
  }

  public static formatWorkflowPinNotTagged(filePath: string, action: string, from: string, to: string): string {
    return `\`${filePath}\`: \`${action}\` at ${from}, a commit ${to} doesn't hold`;
  }

  public static formatPinsIssueSummary(source: string, tag: string): string {
    return `${source} tagged ${tag}, a new version of the shared workflows this repository pins`;
  }

  public static formatPinsTitle(source: string, tag: string): string {
    return `${Resources.formatPinsTitlePrefix(source)}${tag}`;
  }

  public static formatPinsTitlePrefix(source: string): string {
    return `Move the pins on ${source}'s workflows to `;
  }

  public static formatPinsBranch(source: string): string {
    return `pipelines/pins-${source}`;
  }

  public static formatPinsBody(source: string, tag: string, commit: string, moves: readonly string[], majors: readonly string[], left: readonly string[], notes: string): string {
    const sections = [
      [`${source} tagged ${tag} at commit ${commit}; this moves every older pin on its workflows within the same major version, and every outside action older than the one ${source} uses.`],
      moves.map(t => `- ${t}`),
      majors.length === 0 ? [] : ["Outside actions moved to a new major version, which may need changes here; read their release notes before merging:", "", ...majors.map(t => `- ${t}`)],
      left.length === 0 ? [] : ["Left as they are, to move by hand:", "", ...left.map(t => `- ${t}`)],
      [notes.length === 0 ? `The pull request that merged ${commit} has no "Release notes" section.` : notes]
    ];

    return ["## Summary", ...sections.filter(t => t.length > 0).flatMap(t => ["", ...t])].join(Resources.lineSeparator);
  }

  public static createPinPattern(packageName: string): RegExp {
    return new RegExp(`("${packageName.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")}"\\s*:\\s*")([^"]*)(")`, "g");
  }

  public static formatTagVersionNotRelease(version: string): string {
    return `${version} is a nightly version; only a release version is tagged.`;
  }

  public static formatTagCreated(tag: string, commit: string): string {
    return `Tagged commit ${commit} as ${tag}.`;
  }

  public static formatTagFound(tag: string, commit: string): string {
    return `${tag} already points to commit ${commit}.`;
  }

  public static formatTagElsewhere(tag: string, found: string, commit: string): string {
    return `${tag} points to commit ${found}, not ${commit}; a tag is never moved.`;
  }

  public static formatTagUnreadable(tag: string): string {
    return `${tag} exists, so it could not be created, but reading it found no tag.`;
  }

  public static formatPruneVersionNotRelease(version: string): string {
    return `${version} is a nightly version; the prune step runs after a release, with its version.`;
  }

  public static formatKeepVersionsInvalid(text: string): string {
    return `"${text}" is not a number of versions to keep: it is a whole number above 0 without a leading zero, such as 5.`;
  }

  public static formatPruneRegistryNpm(registry: string): string {
    return `The prune step never deletes a version on npm's registry, ${registry}.`;
  }

  public static formatPruneRegistryUnsupported(registry: string, hostRegistry: string): string {
    return `The prune step deletes versions only on ${hostRegistry}, not on ${registry}.`;
  }

  public static formatPackageOutsideScope(packageName: string, scope: string): string {
    return `${packageName} is outside the scope ${scope}.`;
  }

  public static formatPruneNotNewest(packageName: string, version: string, newest: string | null): string {
    return newest === null
      ? `${packageName} has no release version on the registry, not even ${version}, so nothing is deleted.`
      : `${packageName}'s newest release version on the registry is ${newest}, not ${version}, so nothing is deleted.`;
  }

  public static formatPruneNothing(keepVersions: number): string {
    return `No package has more than ${keepVersions} release versions on the registry, so nothing is deleted.`;
  }

  public static formatPruneDeleteRejected(specifier: string, message: string): string {
    return `Deleting ${specifier} failed: ${message}`;
  }

  public static formatVersionDeleted(specifier: string): string {
    return `${specifier} deleted.`;
  }

  public static formatPruneLocksUnread(message: string): string {
    return `The lock files could not all be read, so nothing is deleted: ${message}`;
  }

  public static formatPruneLockInvalid(filePath: string): string {
    return `${filePath} is not a lock file with a packages field, so nothing is deleted.`;
  }

  public static formatVersionKept(specifier: string, lockFilePaths: readonly string[]): string {
    return `${specifier} kept, since ${lockFilePaths.join(", ")} lock${lockFilePaths.length === 1 ? "s" : ""} it.`;
  }

  public static formatVersionAlreadyDeleted(specifier: string): string {
    return `${specifier} was already deleted.`;
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

  public static formatProcessTimedOut(program: string, timeoutMilliseconds: number): string {
    return `"${program}" ran longer than ${timeoutMilliseconds / Resources.millisecondsPerSecond} seconds, so it was stopped.`;
  }

  public static formatProcessNotStarted(program: string, reason: string): string {
    return `"${program}" could not start: ${reason}`;
  }

  public static formatPackageName(scope: string, name: string): string {
    return `${scope}/${name.slice(Resources.packageNamePrefix.length)}`;
  }

  public static formatBuildScopeInvalid(scope: string): string {
    return `"${scope}" is not an npm scope, such as @noldova`;
  }

  public static formatBuildConfigInvalid(problem: string): string {
    return `build.json is invalid: ${problem}.`;
  }

  public static formatBuildPackageDuplicated(name: string): string {
    return `it names ${name} more than once`;
  }

  public static formatBuildPackageNameInvalid(name: string): string {
    return `"${name}" is not a package folder name, such as noldova.tools.pipelines`;
  }

  public static formatBuildPackagePathInvalid(name: string, folder: string): string {
    return `the path of ${name}, "${folder}", is not a folder under src/ whose last segment is ${name}`;
  }

  public static formatBuildScriptInvalid(name: string, field: string, script: string): string {
    return `the ${field} script of ${name}, "${script}", is not a path inside the checkout`;
  }

  public static formatOptionAlone(option: string): string {
    return `The option ${option} takes no other value.`;
  }

  public static formatOptionUnknown(option: string, usage: string): string {
    return `Unknown option ${option}; the step takes ${usage}.`;
  }

  public static formatOptionDuplicated(option: string): string {
    return `The option ${option} is given more than once.`;
  }

  public static formatVersionOptionMissing(option: string): string {
    return `The option ${option} takes a version as its next value, such as ${option} 0.0.5 or ${option} 0.0.5-nightly.20261102.`;
  }

  public static formatBuildPackageNamedTwice(name: string): string {
    return `The package ${name} is named more than once.`;
  }

  public static formatBuildPackageUnknown(name: string): string {
    return `build.json names no package ${name}.`;
  }

  public static formatCheckoutRootMissing(directory: string): string {
    return `${directory} is not the root of a git checkout.`;
  }

  public static formatPackagesBuilt(count: number, version: string): string {
    return `Built ${count} ${count === 1 ? "package" : "packages"} at version ${version}.`;
  }

  public static formatBuildingPackage(packageName: string): string {
    return `Building ${packageName}...`;
  }

  public static formatBuildFileMissing(packageName: string, filePath: string): string {
    return `${packageName} needs ${filePath}, which is missing.`;
  }

  public static formatCompileFailed(projectPath: string, exitCode: number | null, output: string): string {
    return Resources.formatOutputFailure(`The TypeScript compiler exited with code ${exitCode} for ${projectPath}`, output);
  }

  public static formatBuildScriptFailed(packageName: string, script: string, exitCode: number | null, output: string): string {
    return Resources.formatOutputFailure(`The script ${script} of ${packageName} exited with code ${exitCode}`, output);
  }

  public static formatPackFailed(packageName: string, exitCode: number | null, output: string): string {
    return Resources.formatOutputFailure(`npm pack exited with code ${exitCode} for ${packageName}`, output);
  }

  public static formatArchivesNotInstalled(exitCode: number | null, output: string): string {
    return Resources.formatOutputFailure(`npm install exited with code ${exitCode} for the built packages`, output);
  }

  public static formatLockFileMissing(lockFilePath: string): string {
    return `There is no ${lockFilePath}.`;
  }

  public static formatPackagesNotInstalled(nodeModulesPath: string): string {
    return `${nodeModulesPath} holds no packages that npm installed.`;
  }

  public static formatCleanInstallCommand(folder: string): string {
    return folder === Resources.currentFolder ? Resources.npmCleanInstallCommand : `${Resources.npmCleanInstallCommand} ${Resources.npmPrefixOption} ${folder}`;
  }

  public static formatInstalledDiffers(lockFilePath: string, entryPaths: readonly string[], command: string): string {
    const shown = entryPaths.slice(0, Resources.installedDifferencesShown).join(Resources.messagePartSeparator);
    const more = entryPaths.length > Resources.installedDifferencesShown ? ` and ${entryPaths.length - Resources.installedDifferencesShown} more` : "";

    return `The installed packages differ from ${lockFilePath} at ${shown}${more}; run ${command}.`;
  }

  public static formatCompilingTests(name: string): string {
    return `Compiling the tests of ${name}...`;
  }

  public static formatCoverageUnread(exitCode: number | null): string {
    return `The coverage report exited with code ${exitCode}.`;
  }

  public static formatTestsFailed(exitCode: number | null): string {
    return `The tests failed with exit code ${exitCode}.`;
  }

  public static formatProcessFailed(command: string, exitCode: number | null, errorOutput: string): string {
    const detail = errorOutput.trim();

    return detail.length === 0 ? `"${command}" failed with exit code ${exitCode}.` : `"${command}" failed with exit code ${exitCode}: ${detail}`;
  }

  private static formatOutputFailure(failure: string, output: string): string {
    const detail = output.trimEnd();

    return detail.trim().length === 0 ? `${failure}.` : `${failure}:${Resources.lineSeparator}${detail}`;
  }

  private static formatFailureLine(failure: string, errorOutput: string): string {
    const detail = errorOutput.split(Resources.lineBreakPattern).map(t => t.trim()).filter(t => t.length > 0).join(Resources.messagePartSeparator);

    return detail.length === 0 ? `${failure}.` : `${failure}: ${Resources.removeCredentials(detail)}`;
  }

  private static removeCredentials(text: string): string {
    return text.replace(Resources.urlCredentialsPattern, "$1").replace(Resources.urlQueryPattern, "$1");
  }
}
