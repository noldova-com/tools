/**
 * @license
 * Copyright (c) Noldova.
 *
 * This source code is licensed under the license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { Resources } from "../resources.js";
import { TestingModuleLoader } from "./testing-module-loader.js";

const values = process.argv.slice(2);
const testing = await TestingModuleLoader.loadAsync();
if (testing === null)
  process.exitCode = Resources.coverageUnreadExitCode;
else {
  const projects = (JSON.parse(String(values[2])) as [name: string, packageFolder: string, sourceFolder: string][])
    .map(([name, packageFolder, sourceFolder]) => new testing.CoverageProject(name, packageFolder, sourceFolder));
  const coverage = await new testing.CoverageAnalyzer().analyzeAsync(String(values[0]), projects);
  for (const line of new testing.CoverageReportWriter().formatLines(coverage, values[1] === Resources.enabledValue))
    process.stdout.write(`${line}${Resources.lineSeparator}`);

  process.exitCode = coverage.isComplete ? Resources.successExitCode : Resources.failureExitCode;
}
