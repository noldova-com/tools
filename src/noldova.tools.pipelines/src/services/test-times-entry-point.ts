/**
 * @license
 * Copyright (c) Noldova.
 *
 * This source code is licensed under the license found in the
 * LICENSE file in the root directory of this source tree.
 */


import fs from "node:fs";

import { Resources } from "../resources.js";
import { TestingModuleLoader } from "./testing-module-loader.js";

// Reads the test times a run wrote through the checkout's @noldova/context.testing: "slowest <results file> <count>" prints the slowest tests,
// and "judge <budget> <margin> <README> <results file>..." judges each test file's median time over the runs, failing when one is over.
const [mode, ...values] = process.argv.slice(2);
const testing = await TestingModuleLoader.loadAsync();
if (testing === null)
  process.exitCode = Resources.timesUnreadExitCode;
else if (mode === Resources.slowestMode) {
  const resultsFile = String(values[0]);
  if (!fs.existsSync(resultsFile)) {
    process.stderr.write(`${Resources.formatTestResultsMissing(resultsFile)}${Resources.lineSeparator}`);
    process.exitCode = Resources.timesUnreadExitCode;
  }
  else {
    for (const line of testing.TestTimeRecord.formatSlowest(testing.TestTimeRecord.parseAll(fs.readFileSync(resultsFile, Resources.textEncoding)), Number(values[1])))
      process.stdout.write(`${line}${Resources.lineSeparator}`);
  }
}
else {
  const [budget, margin, readme, ...resultsFiles] = values;
  const readmePath = String(readme);
  const listed = testing.TestTimingCheck.readListed(fs.existsSync(readmePath) ? fs.readFileSync(readmePath, Resources.textEncoding) : "");
  const runs = resultsFiles.map(t => testing.TestTimeRecord.parseAll(fs.readFileSync(t, Resources.textEncoding)));
  const timings = new testing.TestTimingCheck(Number(budget), Number(margin), listed).judge(runs);
  for (const timing of timings.filter(t => t.isOver || t.isListed))
    process.stdout.write(`${timing.format()}${Resources.lineSeparator}`);

  process.stdout.write(`${testing.TestTimingCheck.formatSummary(timings, runs.length)}${Resources.lineSeparator}`);
  process.exitCode = timings.some(t => t.isOver) ? Resources.failureExitCode : Resources.successExitCode;
}
