/**
 * @license
 * Copyright (c) Noldova.
 *
 * This source code is licensed under the license found in the
 * LICENSE file in the root directory of this source tree.
 */

export class Resources {
  public static readonly acceptHeader: string = "Accept";
  public static readonly archivedField: string = "archived";
  public static readonly blobEncoding: BufferEncoding = "base64";
  public static readonly blobType: string = "blob";
  public static readonly bodyField: string = "body";
  public static readonly contentField: string = "content";
  public static readonly defaultBranchField: string = "default_branch";
  public static readonly fullNameField: string = "full_name";
  public static readonly gitCloneValues: readonly string[] = ["clone", "--quiet", "--depth", "1", "--no-tags", "--"];
  public static readonly gitConfigCount: string = "1";
  public static readonly gitConfigCountVariable: string = "GIT_CONFIG_COUNT";
  public static readonly gitConfigKeyVariable: string = "GIT_CONFIG_KEY_0";
  public static readonly gitConfigValueVariable: string = "GIT_CONFIG_VALUE_0";
  public static readonly gitProgram: string = "git";
  public static readonly gitFetchValues: readonly string[] = ["fetch", "--quiet", "--depth", "1", "--no-tags"];
  public static readonly gitListRemoteValues: readonly string[] = ["ls-remote", "--exit-code", "--heads"];
  public static readonly gitNoMatchExitCode: number = 2;
  public static readonly gitOptionsEnd: string = "--";
  public static readonly gitPushValues: readonly string[] = ["push", "--quiet"];
  public static readonly gitReferenceSeparatorPattern: RegExp = /\s/;
  public static readonly gitTerminalPromptOff: string = "0";
  public static readonly gitTerminalPromptVariable: string = "GIT_TERMINAL_PROMPT";
  public static readonly headingPattern: RegExp = /^#{1,6}\s/;
  public static readonly htmlUrlField: string = "html_url";
  public static readonly lineBreakPattern: RegExp = /\r?\n/;
  public static readonly linkedIssuePattern: RegExp = /^Closes #([0-9]+)$/m;
  public static readonly mergeCommitField: string = "merge_commit_sha";
  public static readonly notHashPattern: RegExp = /[^#]/;
  public static readonly numberField: string = "number";
  public static readonly repositoriesField: string = "repositories";
  public static readonly repositoriesPageSize: number = 100;
  public static readonly repositorySeparator: string = "/";
  public static readonly serverUrlVariable: string = "GITHUB_SERVER_URL";
  public static readonly updateMethod: string = "PATCH";
  public static readonly annotatedTagType: string = "tag";
  public static readonly annotationEscapes: readonly (readonly [string, string])[] = [["%", "%25"], ["\r", "%0D"], ["\n", "%0A"]];
  public static readonly answerNotJson: string = "GitHub's answer is not JSON.";
  public static readonly apiMediaType: string = "application/vnd.github+json";
  public static readonly apiRetryMilliseconds: readonly number[] = [5_000, 15_000];
  public static readonly apiTimeoutMilliseconds: number = 60_000;
  public static readonly apiUrlVariable: string = "GITHUB_API_URL";
  public static readonly apiVersion: string = "2022-11-28";
  public static readonly apiVersionHeader: string = "X-GitHub-Api-Version";
  public static readonly authorizationHeader: string = "Authorization";
  public static readonly commitType: string = "commit";
  public static readonly conflictStatus: number = 409;
  public static readonly contentTypeHeader: string = "Content-Type";
  public static readonly createdStatus: number = 201;
  public static readonly createMethod: string = "POST";
  public static readonly deletedStatus: number = 204;
  public static readonly deleteMethod: string = "DELETE";
  public static readonly firstFailureStatus: number = 400;
  public static readonly foundStatus: number = 200;
  public static readonly idField: string = "id";
  public static readonly itemsField: string = "items";
  public static readonly lockFileName: string = "package-lock.json";
  public static readonly jsonContentType: string = "application/json";
  public static readonly jsonContentTypePattern: RegExp = /^application\/(?:[a-z0-9.-]+\+)?json\b/i;
  public static readonly jsonObjectStart: string = "{";
  public static readonly lineSeparator: string = "\n";
  public static readonly messageField: string = "message";
  public static readonly millisecondsPerSecond: number = 1_000;
  public static readonly nameField: string = "name";
  public static readonly notFoundStatus: number = 404;
  public static readonly objectField: string = "object";
  public static readonly privateField: string = "private";
  public static readonly packageNamePattern: RegExp = /^@([^/]+)\/([^/]+)$/;
  public static readonly packagesRegistry: string = "https://npm.pkg.github.com/";
  public static readonly programName: string = "pipelines";
  public static readonly readMethod: string = "GET";
  public static readonly referencesPath: string = "git/refs";
  public static readonly repositoryVariable: string = "GITHUB_REPOSITORY";
  public static readonly retryAfterHeader: string = "Retry-After";
  public static readonly retryAfterMaxSeconds: number = 60;
  public static readonly retryAfterPattern: RegExp = /^[0-9]+$/;
  public static readonly runnerTemporaryVariable: string = "RUNNER_TEMP";
  public static readonly pathField: string = "path";
  public static readonly pathSeparator: string = "/";
  public static readonly repositoriesChanged: string = "The installation's repositories changed while their lock files were read, so the lock files could not all be found.";
  public static readonly repositoriesTokenVariable: string = "REPOSITORIES_TOKEN";
  public static readonly shaField: string = "sha";
  public static readonly textEncoding: BufferEncoding = "utf8";
  public static readonly timeoutErrorName: string = "TimeoutError";
  public static readonly tokenVariable: string = "GITHUB_TOKEN";
  public static readonly totalCountField: string = "total_count";
  public static readonly treeField: string = "tree";
  public static readonly truncatedField: string = "truncated";
  public static readonly typeField: string = "type";
  public static readonly unavailableStatuses: readonly number[] = [502, 503, 504];
  public static readonly unprocessableStatus: number = 422;
  public static readonly vendorFolderName: string = "node_modules";
  public static readonly versionsPageSize: number = 100;

  public static formatErrorAnnotation(message: string): string {
    const escaped = Resources.annotationEscapes.reduce((text, [character, escape]) => text.replaceAll(character, escape), message);

    return `::error::${escaped}${Resources.lineSeparator}`;
  }

  public static formatVariableMissing(name: string): string {
    return `The environment variable ${name} is not set; the tag step needs it to reach GitHub.`;
  }

  public static formatDependentsVariableMissing(name: string): string {
    return `The environment variable ${name} is not set; the dependents step needs it to reach GitHub.`;
  }

  public static formatInstallationRepositoriesPage(page: number): string {
    return `installation/repositories?per_page=${Resources.repositoriesPageSize}&page=${page}`;
  }

  public static formatCommitPullsResource(repository: string, commit: string): string {
    return Resources.formatResource(repository, `commits/${commit}/pulls`);
  }

  public static formatOpenPullsResource(repository: string, owner: string, branch: string): string {
    return Resources.formatResource(repository, `pulls?state=open&head=${encodeURIComponent(`${owner}:${branch}`)}`);
  }

  public static formatPullsResource(repository: string): string {
    return Resources.formatResource(repository, "pulls");
  }

  public static formatPullResource(repository: string, number: string): string {
    return Resources.formatResource(repository, `pulls/${number}`);
  }

  public static formatIssuesResource(repository: string): string {
    return Resources.formatResource(repository, "issues");
  }

  public static formatIssueResource(repository: string, number: string): string {
    return Resources.formatResource(repository, `issues/${number}`);
  }

  public static formatRepositoryResource(repository: string): string {
    return `repos/${repository}`;
  }

  public static formatIssueBody(branch: string): string {
    return `A release moved packages this repository pins exactly; the pull request from \`${branch}\` moves the pins.`;
  }

  public static formatProposalBody(body: string, issue: string | undefined): string {
    return issue === undefined ? body : [body, "", "## Linked issue", "", `Closes #${issue}`].join(Resources.lineSeparator);
  }

  public static formatCloneUrl(serverUrl: string, repository: string): string {
    return `${serverUrl}/${repository}.git`;
  }

  public static formatPushReference(branch: string): string {
    return `HEAD:${Resources.formatBranchReference(branch)}`;
  }

  public static formatBranchReference(branch: string): string {
    return `refs/heads/${branch}`;
  }

  public static formatForceWithLease(branch: string, commit: string): string {
    return `--force-with-lease=${Resources.formatBranchReference(branch)}:${commit}`;
  }

  public static formatExtraHeaderKey(serverUrl: string): string {
    return `http.${serverUrl}/.extraheader`;
  }

  public static formatBasicAuthorization(token: string): string {
    return `AUTHORIZATION: basic ${Buffer.from(`x-access-token:${token}`).toString("base64")}`;
  }

  public static formatGitFailed(values: readonly string[], exitCode: number | null, errorOutput: string): string {
    const detail = errorOutput.split(Resources.lineBreakPattern).map(t => t.trim()).filter(t => t.length > 0).join(" ");

    return `git ${values[0]} exited with code ${exitCode}${detail.length === 0 ? "." : `: ${detail}`}`;
  }

  public static createNotesHeadingPattern(version: string): RegExp {
    return new RegExp(`^#{1,6}\\s+Release notes for ${version.replaceAll(".", "\\.")}\\s*$`, "i");
  }

  public static formatPruneSourcePublic(repository: string): string {
    return `${repository} is public, so the prune step reads no lock file and deletes nothing: its log would name the private repositories that lock a version, and leaving them out could delete a version they lock.`;
  }

  public static formatPruneSourceUnread(repository: string, reason: string): string {
    return `Could not read ${repository}, so the prune step can't tell that it is private, and reads no lock file and deletes nothing: ${reason}`;
  }

  public static formatPruneVariableMissing(name: string): string {
    return `The environment variable ${name} is not set; the prune step needs it to reach GitHub.`;
  }

  public static formatPackageNotScoped(packageName: string): string {
    return `${packageName} has no scope; a package on GitHub Packages is named @<owner>/<name>.`;
  }

  public static formatVersionStillListed(packageName: string, version: string): string {
    return `GitHub answered 404 to deleting ${packageName}@${version} but still lists it, so it is not deleted; the token may not be allowed to delete it.`;
  }

  public static formatTreeResource(repository: string, branch: string): string {
    return `repos/${repository}/git/trees/${branch.split(Resources.pathSeparator).map(t => encodeURIComponent(t)).join(Resources.pathSeparator)}?recursive=1`;
  }

  public static formatBlobResource(repository: string, sha: string): string {
    return `repos/${repository}/git/blobs/${sha}`;
  }

  public static formatRepositoriesMiscounted(listed: number, totalCount: number): string {
    return `GitHub listed ${listed} of the installation's ${totalCount} repositories, so the lock files could not all be found.`;
  }

  public static formatTreeTruncated(repository: string, branch: string): string {
    return `GitHub listed only part of ${repository}'s files on ${branch}, so its lock files could not all be found.`;
  }

  public static formatLockFilePath(repository: string, filePath: string): string {
    return `${repository}/${filePath}`;
  }

  public static formatVersionsResource(packageName: string): string {
    return packageName.replace(Resources.packageNamePattern, (_, owner: string, name: string) => `orgs/${owner}/packages/npm/${encodeURIComponent(name)}/versions`);
  }

  public static formatVersionsPage(resource: string, page: number): string {
    return `${resource}?per_page=${Resources.versionsPageSize}&page=${page}`;
  }

  public static formatVersionResource(resource: string, id: number): string {
    return `${resource}/${id}`;
  }

  public static formatResource(repository: string, path: string): string {
    return `repos/${repository}/${path}`;
  }

  public static formatTagReferencePath(tag: string): string {
    return `git/ref/tags/${tag}`;
  }

  public static formatTagObjectPath(sha: string): string {
    return `git/tags/${sha}`;
  }

  public static formatTagReference(tag: string): string {
    return `refs/tags/${tag}`;
  }

  public static formatAuthorization(token: string): string {
    return `Bearer ${token}`;
  }

  public static formatApiFailed(method: string, resource: string, status: number, message: string): string {
    return `GitHub answered ${method} ${resource} with ${status}: ${message}`;
  }

  public static formatApiUnanswered(method: string, resource: string, reason: string): string {
    return `GitHub gave no answer to ${method} ${resource}: ${reason}`;
  }

  public static formatTagTargetInvalid(tag: string, type: string): string {
    return `${tag} points to a ${type}, not a commit.`;
  }
}
