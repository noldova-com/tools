/**
 * @license
 * Copyright (c) Noldova.
 *
 * This source code is licensed under the license found in the
 * LICENSE file in the root directory of this source tree.
 */

// The resources the test-run entry points read. coverage-entry-point.ts and test-times-entry-point.ts run beside the checkout's own
// @noldova/context.core, whose Object extensions can be defined only once in a process, so they and this file
// import no @noldova/context package of the tool's own and write their type and absence checks out; Resources takes its shared values from here.
export class TestingResources {
  public static readonly codeField: "code" = "code";
  public static readonly coverageProjectValueCount: number = 3;
  public static readonly coverageProjectValuesStart: number = 2;
  public static readonly coverageProjectsIncomplete: string = "The coverage report takes a name, a package folder and a source folder for each project.";
  public static readonly coverageUnreadExitCode: number = 2;
  public static readonly enabledValue: string = "1";
  public static readonly failureExitCode: number = 1;
  public static readonly lineSeparator: string = "\n";
  public static readonly manifestFileName: string = "package.json";
  public static readonly moduleNotFoundCode: string = "MODULE_NOT_FOUND";
  public static readonly slowestMode: string = "slowest";
  public static readonly successExitCode: number = 0;
  public static readonly testingMissing: string = "@noldova/context.testing is not installed; the repository's devDependencies name it.";
  public static readonly testingPackageName: string = "@noldova/context.testing";
  public static readonly textEncoding: BufferEncoding = "utf8";
  public static readonly timesOverExitCode: number = 3;
  public static readonly timesUnreadExitCode: number = 2;

  public static formatTestResultsMissing(filePath: string): string {
    return `${filePath} holds no test times: the test run wrote none.`;
  }

  public static formatTestResultsInvalid(filePath: string, reason: string): string {
    return `${filePath} holds no test times: ${reason}`;
  }
}
