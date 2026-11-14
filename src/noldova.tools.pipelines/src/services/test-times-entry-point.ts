/**
 * @license
 * Copyright (c) Noldova.
 *
 * This source code is licensed under the license found in the
 * LICENSE file in the root directory of this source tree.
 */


import fs from "node:fs";

import type { ITestingModule } from "../interfaces/i-testing-module.js";
import { Resources } from "../resources.js";
import { TestingModuleLoader } from "./testing-module-loader.js";

// Reads the test times a run wrote through the checkout's @noldova/context.testing: "slowest <results file> <count>" prints the slowest tests,
// and "judge <budget> <margin> <README> <results file>..." judges each test file's median time over the runs, exiting with timesOverExitCode when one is over and timesUnreadExitCode when a results file is missing or isn't test times.
const [mode, ...values] = process.argv.slice(2);
const testing = await TestingModuleLoader.loadAsync();
if (testing === null)
  process.exitCode = Resources.timesUnreadExitCode;
else if (mode === Resources.slowestMode) {
  const runs = readRuns(testing, [String(values[0])]);
  if (runs === null)
    process.exitCode = Resources.timesUnreadExitCode;
  else {
    for (const line of testing.TestTimeRecord.formatSlowest(runs.flat(), Number(values[1])))
      process.stdout.write(`${line}${Resources.lineSeparator}`);
  }
}
else {
  const [budget, margin, readme, ...resultsFiles] = values;
  const readmePath = String(readme);
  const listed = testing.TestTimingCheck.readListed(fs.existsSync(readmePath) ? fs.readFileSync(readmePath, Resources.textEncoding) : "");
  const runs = readRuns(testing, resultsFiles);
  if (runs === null)
    process.exitCode = Resources.timesUnreadExitCode;
  else {
    const timings = new testing.TestTimingCheck(Number(budget), Number(margin), listed).judge(runs);
    for (const timing of timings.filter(t => t.isOver || t.isListed))
      process.stdout.write(`${timing.format()}${Resources.lineSeparator}`);

    process.stdout.write(`${testing.TestTimingCheck.formatSummary(timings, runs.length)}${Resources.lineSeparator}`);
    process.exitCode = timings.some(t => t.isOver) ? Resources.timesOverExitCode : Resources.successExitCode;
  }
}

// Each results file's records, or null after writing to standard error why one of them is missing or isn't test times.
function readRuns(module: ITestingModule, resultsFiles: readonly string[]): (readonly unknown[])[] | null {
  const runs: (readonly unknown[])[] = [];
  for (const resultsFile of resultsFiles) {
    if (!fs.existsSync(resultsFile)) {
      process.stderr.write(`${Resources.formatTestResultsMissing(resultsFile)}${Resources.lineSeparator}`);
      return null;
    }

    try {
      runs.push(module.TestTimeRecord.parseAll(fs.readFileSync(resultsFile, Resources.textEncoding)));
    }
    catch (error: unknown) {
      if (!(error instanceof module.TestingException))
        throw error;

      process.stderr.write(`${Resources.formatTestResultsInvalid(resultsFile, error.message)}${Resources.lineSeparator}`);
      return null;
    }
  }

  return runs;
}
