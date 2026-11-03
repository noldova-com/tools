/**
 * @license
 * Copyright (c) Noldova.
 *
 * This source code is licensed under the license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { spawn } from "node:child_process";

import { ExceptionOptions } from "@noldova/context.exceptions";

import { ProcessException } from "../exceptions/process.exception.js";
import { ProcessResult } from "../models/process-result.js";
import { Resources } from "../resources.js";

export class ProcessRunner {
  public async runAsync(program: string, values: readonly string[], workingDirectory: string, environment?: Readonly<Record<string, string | undefined>>, timeoutMilliseconds?: number): Promise<ProcessResult> {
    return await new Promise((resolve, reject) => {
      const env = environment === undefined ? undefined : Object.fromEntries(Object.entries({ ...process.env, ...environment }).filter(([, value]) => value !== undefined));
      const child = spawn(program, values, { cwd: workingDirectory, shell: false, stdio: ["ignore", "pipe", "pipe"], ...(env === undefined ? {} : { env }) });
      const output: Buffer[] = [];
      const errorOutput: Buffer[] = [];
      let startError: Error | undefined;
      let stopReason: string | null = null;
      const timer = timeoutMilliseconds === undefined ? undefined : setTimeout(() => {
        stopReason = Resources.formatProcessTimedOut(program, timeoutMilliseconds);
        child.kill(Resources.processKillSignal);
      }, timeoutMilliseconds);

      child.stdout.on("data", (t: Buffer) => output.push(t));
      child.stderr.on("data", (t: Buffer) => errorOutput.push(t));
      child.on("error", t => { startError = t; });
      child.on("close", exitCode => {
        clearTimeout(timer);
        setTimeout(() => {
          if (startError === undefined)
            resolve(new ProcessResult(stopReason === null ? exitCode : null, Buffer.concat(output).toString(Resources.textEncoding), `${Buffer.concat(errorOutput).toString(Resources.textEncoding)}${stopReason ?? ""}`));
          else
            reject(new ProcessException(program, Resources.formatProcessNotStarted(program, startError.message), new ExceptionOptions(startError)));
        }, Resources.processReleaseDelayMilliseconds);
      });
    });
  }
}
