/**
 * @license
 * Copyright (c) Noldova.
 *
 * This source code is licensed under the license found in the
 * LICENSE file in the root directory of this source tree.
 */

export interface ICoverage {
  readonly isComplete: boolean;
}

export interface ITestFileTiming {
  readonly isOver: boolean;
  readonly isListed: boolean;
  format(): string;
}

export interface ITestingModule {
  readonly TestingException: abstract new (...values: never[]) => Error;
  readonly CoverageProject: new (name: string, packageFolder: string, sourceFolder: string) => unknown;
  readonly CoverageAnalyzer: new () => { analyzeAsync(coverageFolder: string, projects: readonly unknown[]): Promise<ICoverage> };
  readonly CoverageReportWriter: new () => { formatLines(coverage: ICoverage, skipDetails: boolean): readonly string[] };
  readonly TestTimeRecord: {
    parseAll(text: string): readonly unknown[];
    formatSlowest(records: readonly unknown[], count: number): readonly string[];
  };
  readonly TestTimingCheck: {
    new (budgetMilliseconds: number, margin: number, listed: ReadonlyMap<string, number>): { judge(runs: readonly (readonly unknown[])[]): readonly ITestFileTiming[] };
    readListed(markdown: string): ReadonlyMap<string, number>;
    formatSummary(timings: readonly ITestFileTiming[], runs: number): string;
  };
}
