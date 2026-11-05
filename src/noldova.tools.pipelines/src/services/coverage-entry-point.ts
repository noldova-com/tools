/**
 * @license
 * Copyright (c) Noldova.
 *
 * This source code is licensed under the license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";

import type { ITestingModule } from "../interfaces/i-testing-module.js";
import { Resources } from "../resources.js";

const values = process.argv.slice(2);
let modulePath: string | null = null;
try {
  modulePath = createRequire(path.resolve(Resources.packageManifestFileName)).resolve(Resources.testingPackageName);
}
catch {
  process.stderr.write(`${Resources.testingMissing}${Resources.lineSeparator}`);
  process.exitCode = Resources.coverageUnreadExitCode;
}

if (modulePath !== null) {
  const testing = await import(pathToFileURL(modulePath).href) as ITestingModule;
  const projects = (JSON.parse(String(values[2])) as [name: string, packageFolder: string, sourceFolder: string][])
    .map(([name, packageFolder, sourceFolder]) => new testing.CoverageProject(name, packageFolder, sourceFolder));
  const coverage = await new testing.CoverageAnalyzer().analyzeAsync(String(values[0]), projects);
  for (const line of new testing.CoverageReportWriter().formatLines(coverage, values[1] === Resources.enabledValue))
    process.stdout.write(`${line}${Resources.lineSeparator}`);

  process.exitCode = coverage.isComplete ? Resources.successExitCode : Resources.failureExitCode;
}
