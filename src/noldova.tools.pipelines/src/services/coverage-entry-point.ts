/**
 * @license
 * Copyright (c) Noldova.
 *
 * This source code is licensed under the license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { Resources } from "../resources.js";
import { TestingModuleLoader } from "./testing-module-loader.js";

// Imports no @noldova/context package of the tool's own: the checkout's @noldova/context.testing brings its own @noldova/context.core, whose Object extensions can be defined only once in a process.
const values = process.argv.slice(2);
const projectValues = values.slice(Resources.coverageProjectValuesStart);
if (projectValues.length % Resources.coverageProjectValueCount !== 0) {
  process.stderr.write(`${Resources.coverageProjectsIncomplete}${Resources.lineSeparator}`);
  process.exitCode = Resources.coverageUnreadExitCode;
}
else {
  const testing = await TestingModuleLoader.loadAsync();
  if (testing === null)
    process.exitCode = Resources.coverageUnreadExitCode;
  else {
    const projects: unknown[] = [];
    for (let index = 0; index < projectValues.length; index += Resources.coverageProjectValueCount)
      projects.push(new testing.CoverageProject(String(projectValues[index]), String(projectValues[index + 1]), String(projectValues[index + 2])));

    const coverage = await new testing.CoverageAnalyzer().analyzeAsync(String(values[0]), projects);
    for (const line of new testing.CoverageReportWriter().formatLines(coverage, values[1] === Resources.enabledValue))
      process.stdout.write(`${line}${Resources.lineSeparator}`);

    process.exitCode = coverage.isComplete ? Resources.successExitCode : Resources.failureExitCode;
  }
}
