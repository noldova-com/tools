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

export interface ITestingModule {
  readonly CoverageProject: new (name: string, packageFolder: string, sourceFolder: string) => unknown;
  readonly CoverageAnalyzer: new () => { analyzeAsync(coverageFolder: string, projects: readonly unknown[]): Promise<ICoverage> };
  readonly CoverageReportWriter: new () => { formatLines(coverage: ICoverage, skipDetails: boolean): readonly string[] };
}
