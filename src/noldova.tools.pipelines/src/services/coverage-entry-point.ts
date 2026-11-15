/**
 * @license
 * Copyright (c) Noldova.
 *
 * This source code is licensed under the license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { JsonReader } from "@noldova/context.json";

import { Resources } from "../resources.js";
import { TestingModuleLoader } from "./testing-module-loader.js";

const values = process.argv.slice(2);
const testing = await TestingModuleLoader.loadAsync();
if (testing === null)
  process.exitCode = Resources.coverageUnreadExitCode;
else {
  const projects = JsonReader.parse(String(values[2])).readObjectArray(Resources.coverageProjectsField)
    .map(t => new testing.CoverageProject(t.readString(Resources.coverageNameField), t.readString(Resources.coveragePackageFolderField), t.readString(Resources.coverageSourceFolderField)));
  const coverage = await new testing.CoverageAnalyzer().analyzeAsync(String(values[0]), projects);
  for (const line of new testing.CoverageReportWriter().formatLines(coverage, values[1] === Resources.enabledValue))
    process.stdout.write(`${line}${Resources.lineSeparator}`);

  process.exitCode = coverage.isComplete ? Resources.successExitCode : Resources.failureExitCode;
}
