/**
 * @license
 * Copyright (c) Noldova.
 *
 * This source code is licensed under the license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { CommandFailedException } from "./command-failed.exception.ts";
import { Config } from "./config.ts";
import type { PackageInfo } from "./package-info.ts";

export abstract class Script {
  private static readonly API_DIRECTORY_NAME: string = "api";
  private static readonly DECLARATION_FILE_NAME: string = "index.d.ts";
  private static readonly NPM_EXECUTABLE_PATH_UNAVAILABLE: string = "npm_execpath is unavailable. Run the script through npm.";
  private static readonly NPM_EXECUTABLE_PATH_VARIABLE: string = "npm_execpath";
  private static readonly README_FILE_NAME: string = "README.md";
  private static readonly SOURCE_TSCONFIG_PATH: string = "src/tsconfig.json";
  private static readonly STEP_DONE: string = " Done.";
  private static readonly STEP_FAILED: string = " Failed.";
  private static readonly TYPESCRIPT_COMPILER_DIRECTORY_NAME: string = "bin";
  private static readonly TYPESCRIPT_COMPILER_FILE_NAME: string = "tsc";
  private static readonly TYPESCRIPT_MANIFEST_PATH: string = "typescript/package.json";
  private static readonly TYPESCRIPT_PRETTY_OPTION: string = "--pretty";
  protected static readonly SOURCE_DIRECTORY_NAME: string = "src";
  protected static readonly TEXT_ENCODING: BufferEncoding = "utf8";
  protected static readonly TYPESCRIPT_PROJECT_OPTION: string = "--project";

  public abstract runAsync(): Promise<void>;

  public async runAsEntryPointAsync(): Promise<void> {
    try {
      await this.runAsync();
    }
    catch (error) {
      if (!(error instanceof CommandFailedException))
        throw error;

      console.error(error.message);
      process.exitCode = 1;
    }
  }

  protected async executeProcessAsync(
    command: string,
    arguments_: readonly string[],
    workingDirectory: string,
    silent: boolean = false,
    environment?: Record<string, string>): Promise<string> {
    return new Promise((resolve, reject) => {
      const child = spawn(command, arguments_, {
        cwd: workingDirectory,
        stdio: silent ? "pipe" : "inherit",
        shell: false,
        env: environment === undefined ? process.env : { ...process.env, ...environment }
      });
      const output: string[] = [];
      const standardOutput: string[] = [];
      child.stdout?.on("data", (t: Buffer) => {
        output.push(t.toString());
        standardOutput.push(t.toString());
      });
      child.stderr?.on("data", (t: Buffer) => output.push(t.toString()));

      child.on("close", t => {
        if (t === 0)
          resolve(standardOutput.join(""));
        else
          reject(new CommandFailedException(Script.commandFailed(command, t, output.join(""))));
      });

      child.on("error", t => { reject(t); });
    });
  }

  protected async executeNPMCommandAsync(arguments_: readonly string[], workingDirectory: string, silent: boolean = false): Promise<void> {
    await this.executeProcessAsync(process.execPath, [Script.readNPMPath(), ...arguments_], workingDirectory, silent);
  }

  protected async executeTypeScriptCompilerAsync(arguments_: readonly string[]): Promise<void> {
    const manifestPath = fileURLToPath(import.meta.resolve(Script.TYPESCRIPT_MANIFEST_PATH));
    const compilerPath = path.join(path.dirname(manifestPath), Script.TYPESCRIPT_COMPILER_DIRECTORY_NAME, Script.TYPESCRIPT_COMPILER_FILE_NAME);

    await this.executeProcessAsync(process.execPath, [compilerPath, Script.TYPESCRIPT_PRETTY_OPTION, ...arguments_], process.cwd(), true);
  }

  protected async writeLogAsync(message: string): Promise<void> {
    console.log(message);
  }

  protected async runStepAsync(message: string, step: () => Promise<void>): Promise<void> {
    process.stdout.write(message);
    try {
      await step();
    }
    catch (error) {
      console.log(Script.STEP_FAILED);
      throw error;
    }
    console.log(Script.STEP_DONE);
  }

  protected async createDirectoryAsync(directoryName: string): Promise<void> {
    await fs.mkdir(directoryName, { recursive: true });
  }

  protected async removeDirectoryAsync(directoryName: string): Promise<void> {
    await fs.rm(directoryName, { recursive: true, force: true });
  }

  protected async pathExistsAsync(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    }
    catch {
      return false;
    }
  }

  protected async copyFileAsync(source: string, destination: string): Promise<void> {
    await fs.copyFile(source, destination);
  }

  protected async readFileAsync(filePath: string): Promise<string> {
    return await fs.readFile(filePath, Script.TEXT_ENCODING);
  }

  protected async writeFileAsync(filePath: string, content: string): Promise<void> {
    await fs.writeFile(filePath, content);
  }

  protected async compilePackageAsync(packageInfo: PackageInfo): Promise<void> {
    const sourceDirectory = `${Script.SOURCE_DIRECTORY_NAME}/${packageInfo.name}`;
    const buildDirectory = `${Config.BUILD_FOLDER}/${packageInfo.name}`;
    const readmePath = `${sourceDirectory}/${Script.README_FILE_NAME}`;
    if (!await this.pathExistsAsync(readmePath))
      throw new CommandFailedException(Script.readmeMissing(packageInfo.packageName, readmePath));

    await this.createDirectoryAsync(`${buildDirectory}/${Script.API_DIRECTORY_NAME}`);
    await this.copyFileAsync(
      `${sourceDirectory}/${Script.SOURCE_DIRECTORY_NAME}/${Script.API_DIRECTORY_NAME}/${Script.DECLARATION_FILE_NAME}`,
      `${buildDirectory}/${Script.API_DIRECTORY_NAME}/${Script.DECLARATION_FILE_NAME}`);
    await this.copyFileAsync(readmePath, `${buildDirectory}/${Script.README_FILE_NAME}`);
    await this.executeTypeScriptCompilerAsync([Script.TYPESCRIPT_PROJECT_OPTION, `${sourceDirectory}/${Script.SOURCE_TSCONFIG_PATH}`]);
  }

  private static readNPMPath(): string {
    const npmPath = process.env[Script.NPM_EXECUTABLE_PATH_VARIABLE];
    if (npmPath === undefined || npmPath.length === 0)
      throw new CommandFailedException(Script.NPM_EXECUTABLE_PATH_UNAVAILABLE);

    return npmPath;
  }

  private static commandFailed(command: string, exitCode: number | null, output: string): string {
    return output.trim().length === 0 ? `Command "${command}" failed with exit code ${exitCode}.` : output.trimEnd();
  }

  private static readmeMissing(packageName: string, readmePath: string): string {
    return `Package ${packageName} has no ${Script.README_FILE_NAME} at "${readmePath}"; every package ships one.`;
  }
}
