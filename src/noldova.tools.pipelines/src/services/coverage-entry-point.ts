/**
 * @license
 * Copyright (c) Noldova.
 *
 * This source code is licensed under the license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { TestingResources } from "../testing-resources.js";
import { TestingModuleLoader } from "./testing-module-loader.js";

// Imports no @noldova/context package of the tool's own: the checkout's @noldova/context.testing brings its own @noldova/context.core, whose Object extensions can be defined only once in a process.
// So this file, test-times-entry-point.ts, testing-module-loader.ts and testing-resources.ts write their type and absence checks out, the standard's exception for code loaded beside another copy of @noldova/context.core.
const values = process.argv.slice(2);
const projectValues = values.slice(TestingResources.coverageProjectValuesStart);
if (projectValues.length % TestingResources.coverageProjectValueCount !== 0) {
  process.stderr.write(`${TestingResources.coverageProjectsIncomplete}${TestingResources.lineSeparator}`);
  process.exitCode = TestingResources.coverageUnreadExitCode;
}
else {
  const testing = await TestingModuleLoader.loadAsync();
  if (testing === null)
    process.exitCode = TestingResources.coverageUnreadExitCode;
  else {
    const projects: unknown[] = [];
    for (let index = 0; index < projectValues.length; index += TestingResources.coverageProjectValueCount)
      projects.push(new testing.CoverageProject(String(projectValues[index]), String(projectValues[index + 1]), String(projectValues[index + 2])));

    const coverage = await new testing.CoverageAnalyzer().analyzeAsync(String(values[0]), projects);
    for (const line of new testing.CoverageReportWriter().formatLines(coverage, values[1] === TestingResources.enabledValue))
      process.stdout.write(`${line}${TestingResources.lineSeparator}`);

    process.exitCode = coverage.isComplete ? TestingResources.successExitCode : TestingResources.failureExitCode;
  }
}
