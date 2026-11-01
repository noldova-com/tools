#!/usr/bin/env node
/**
 * @license
 * Copyright (c) Noldova.
 *
 * This source code is licensed under the license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { GitHubStepOutput } from "../services/github-step-output.js";
import { PipelinesProgram } from "../services/pipelines-program.js";

process.exitCode = await new PipelinesProgram(new GitHubStepOutput(process.stdout, process.stderr)).runAsync(process.argv.slice(2));
