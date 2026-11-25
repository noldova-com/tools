/**
 * @license
 * Copyright (c) Noldova.
 *
 * This source code is licensed under the license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { spawn } from "node:child_process";

import "@noldova/context.core";
import { ExceptionOptions } from "@noldova/context.exceptions";

import { ProcessException } from "../exceptions/process.exception.js";
import { ProcessResult } from "../models/process-result.js";
import { Resources } from "../resources.js";

export class ProcessRunner {
  public async runAsync(program: string, values: readonly string[], workingDirectory: string, environment?: Readonly<Record<string, string | undefined>>, timeoutMilliseconds?: number): Promise<ProcessResult> {
    return await new Promise((resolve, reject) => {
      const env = Object.isUndefined(environment) ? undefined : Object.fromEntries(Object.entries({ ...process.env, ...environment }).filter(([, value]) => !Object.isUndefined(value)));
      const child = spawn(program, values, { cwd: workingDirectory, shell: false, stdio: Resources.pipedProcessStreams, ...(Object.isUndefined(env) ? {} : { env }) });
      const output: Buffer[] = [];
      const errorOutput: Buffer[] = [];
      let startError: Error | undefined;
      let stopReason: string | null = null;
      const timer = Object.isUndefined(timeoutMilliseconds) ? undefined : setTimeout(() => {
        stopReason = Resources.formatProcessTimedOut(program, timeoutMilliseconds);
        child.kill(Resources.processKillSignal);
      }, timeoutMilliseconds);

      child.stdout.on("data", (t: Buffer) => output.push(t));
      child.stderr.on("data", (t: Buffer) => errorOutput.push(t));
      child.on("error", t => { startError = t; });
      child.on("close", exitCode => {
        clearTimeout(timer);
        setTimeout(() => {
          if (Object.isUndefined(startError))
            resolve(new ProcessResult(Object.isNull(stopReason) ? exitCode : null, Buffer.concat(output).toString(Resources.textEncoding), `${Buffer.concat(errorOutput).toString(Resources.textEncoding)}${stopReason ?? ""}`));
          else
            reject(new ProcessException(program, Resources.formatProcessNotStarted(program, startError.message), new ExceptionOptions(startError)));
        }, Resources.processReleaseDelayMilliseconds);
      });
    });
  }

  public async runVisibleAsync(program: string, values: readonly string[], workingDirectory: string, environment: Readonly<Record<string, string>>): Promise<number | null> {
    return await new Promise((resolve, reject) => {
      const child = spawn(program, values, { cwd: workingDirectory, shell: false, stdio: Resources.visibleProcessStreams, env: { ...process.env, ...environment } });
      child.on("error", t => { reject(new ProcessException(program, Resources.formatProcessNotStarted(program, t.message), new ExceptionOptions(t))); });
      child.on("close", exitCode => { resolve(exitCode); });
    });
  }
}
