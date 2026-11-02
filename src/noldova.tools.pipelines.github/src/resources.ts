/**
 * @license
 * Copyright (c) Noldova.
 *
 * This source code is licensed under the license found in the
 * LICENSE file in the root directory of this source tree.
 */

export class Resources {
  public static readonly acceptHeader: string = "Accept";
  public static readonly annotatedTagType: string = "tag";
  public static readonly annotationEscapes: readonly (readonly [string, string])[] = [["%", "%25"], ["\r", "%0D"], ["\n", "%0A"]];
  public static readonly answerNotJson: string = "GitHub's answer is not JSON.";
  public static readonly apiMediaType: string = "application/vnd.github+json";
  public static readonly apiTimeoutMilliseconds: number = 60_000;
  public static readonly apiUrlVariable: string = "GITHUB_API_URL";
  public static readonly apiVersion: string = "2022-11-28";
  public static readonly apiVersionHeader: string = "X-GitHub-Api-Version";
  public static readonly authorizationHeader: string = "Authorization";
  public static readonly commitType: string = "commit";
  public static readonly contentTypeHeader: string = "Content-Type";
  public static readonly createdStatus: number = 201;
  public static readonly createMethod: string = "POST";
  public static readonly deletedStatus: number = 204;
  public static readonly deleteMethod: string = "DELETE";
  public static readonly foundStatus: number = 200;
  public static readonly idField: string = "id";
  public static readonly itemsField: string = "items";
  public static readonly jsonContentType: string = "application/json";
  public static readonly jsonContentTypePattern: RegExp = /^application\/(?:[a-z0-9.-]+\+)?json\b/i;
  public static readonly jsonObjectStart: string = "{";
  public static readonly lineSeparator: string = "\n";
  public static readonly messageField: string = "message";
  public static readonly nameField: string = "name";
  public static readonly notFoundStatus: number = 404;
  public static readonly objectField: string = "object";
  public static readonly packageNamePattern: RegExp = /^@([^/]+)\/([^/]+)$/;
  public static readonly packagesRegistry: string = "https://npm.pkg.github.com/";
  public static readonly programName: string = "pipelines";
  public static readonly readMethod: string = "GET";
  public static readonly referencesPath: string = "git/refs";
  public static readonly repositoryVariable: string = "GITHUB_REPOSITORY";
  public static readonly shaField: string = "sha";
  public static readonly tokenVariable: string = "GITHUB_TOKEN";
  public static readonly typeField: string = "type";
  public static readonly unprocessableStatus: number = 422;
  public static readonly versionsPageSize: number = 100;

  public static formatErrorAnnotation(message: string): string {
    const escaped = Resources.annotationEscapes.reduce((text, [character, escape]) => text.replaceAll(character, escape), message);

    return `::error::${escaped}${Resources.lineSeparator}`;
  }

  public static formatVariableMissing(name: string): string {
    return `The environment variable ${name} is not set; the tag step needs it to reach GitHub.`;
  }

  public static formatPruneVariableMissing(name: string): string {
    return `The environment variable ${name} is not set; the prune step needs it to reach GitHub.`;
  }

  public static formatPackageNotScoped(packageName: string): string {
    return `${packageName} has no scope; a package on GitHub Packages is named @<owner>/<name>.`;
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

  public static formatTagTargetInvalid(tag: string, type: string): string {
    return `${tag} points to a ${type}, not a commit.`;
  }
}
