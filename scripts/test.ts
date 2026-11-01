/**
 * @license
 * Copyright (c) Noldova.
 *
 * This source code is licensed under the license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * This script compiles every package's tests against the installed packages,
 * runs them through @noldova/context.testing in a child process measured by
 * V8 coverage, and requires complete coverage of the packages' source. Run
 * `npm run build` first.
 *
 * @example
 * npm run test - runs every test and the coverage gate.
 * npm run test -- <filter...> - runs the tests matching any package, file, class, ClassName.methodName substring or exact category:name identity; a filtered run skips the coverage gate.
 * npm run test -- --skip-test-details - hides the passing tests' lines; failures, skips and totals always print.
 * npm run test -- --skip-coverage-details - hides the fully covered files' rows; incomplete files and the totals always print.
 */

import { join } from "node:path";

import { CommandFailedException } from "./command-failed.exception.ts";
import { Config } from "./config.ts";
import { Script } from "./script.ts";

export class Test extends Script {
  private static readonly BLANK_LINE: string = "";
  private static readonly COVERAGE_INCOMPLETE: string = "Coverage is incomplete.";
  private static readonly COVERAGE_VARIABLE: string = "NODE_V8_COVERAGE";
  private static readonly ENABLED_VALUE: string = "1";
  private static readonly FILTERED_COVERAGE_SKIPPED: string = "The coverage gate is skipped for a filtered run.";
  private static readonly FILTERS_VARIABLE: string = "CONTEXT_TEST_FILTERS";
  private static readonly NODE_MODULES_DIRECTORY_NAME: string = "node_modules";
  private static readonly NO_TEST_PROJECTS: string = "No package has tests.";
  private static readonly OPTION_PREFIX: string = "--";
  private static readonly SKIP_COVERAGE_DETAILS_OPTION: string = "--skip-coverage-details";
  private static readonly SKIP_TEST_DETAILS_OPTION: string = "--skip-test-details";
  private static readonly SKIP_TEST_DETAILS_VARIABLE: string = "CONTEXT_SKIP_TEST_DETAILS";
  private static readonly SOURCE_MAPS_OPTION: string = "--enable-source-maps";
  private static readonly TEST_ENTRY_PATH: string = "node_modules/@noldova/context.testing/services/execution/test-run-entry-point.js";
  private static readonly TEST_TSCONFIG_PATH: string = "tests/tsconfig.json";

  public override async runAsync(): Promise<void> {
    const knownOptions = [Test.SKIP_TEST_DETAILS_OPTION, Test.SKIP_COVERAGE_DETAILS_OPTION];
    const options = new Set<string>();
    const filters: string[] = [];

    for (const argument of process.argv.slice(2)) {
      if (!argument.startsWith(Test.OPTION_PREFIX)) {
        filters.push(argument);
        continue;
      }

      if (!knownOptions.includes(argument))
        throw new CommandFailedException(Test.unknownOption(argument, knownOptions));

      options.add(argument);
    }

    const testProjectArguments: string[] = [];
    for (const packageInfo of Config.PACKAGES_INFO) {
      const tsconfigPath = `${Test.SOURCE_DIRECTORY_NAME}/${packageInfo.name}/${Test.TEST_TSCONFIG_PATH}`;
      if (!await this.pathExistsAsync(tsconfigPath))
        continue;

      const testBuildDirectory = `${Config.TESTS_FOLDER}/${packageInfo.name}`;
      await this.runStepAsync(Test.compilingTests(packageInfo.name), async () => {
        await this.removeDirectoryAsync(testBuildDirectory);
        await this.executeTypeScriptCompilerAsync([Test.TYPESCRIPT_PROJECT_OPTION, tsconfigPath]);
      });

      testProjectArguments.push(packageInfo.name, testBuildDirectory);
    }

    if (testProjectArguments.length === 0)
      throw new CommandFailedException(Test.NO_TEST_PROJECTS);

    await this.writeLogAsync(Test.BLANK_LINE);

    const environment: Record<string, string> = {};
    environment[Test.FILTERS_VARIABLE] = JSON.stringify(filters);
    if (options.has(Test.SKIP_TEST_DETAILS_OPTION))
      environment[Test.SKIP_TEST_DETAILS_VARIABLE] = Test.ENABLED_VALUE;

    if (filters.length === 0) {
      await this.removeDirectoryAsync(Config.COVERAGE_FOLDER);
      await this.createDirectoryAsync(Config.COVERAGE_FOLDER);
      environment[Test.COVERAGE_VARIABLE] = Config.COVERAGE_FOLDER;
    }

    try {
      await this.executeProcessAsync(process.execPath, [Test.SOURCE_MAPS_OPTION, Test.TEST_ENTRY_PATH, ...testProjectArguments], process.cwd(), false, environment);
    }
    catch (error) {
      // The run has printed its own failures; any other error, such as one starting it, propagates.
      if (!(error instanceof CommandFailedException))
        throw error;

      process.exitCode = 1;
    }

    if (filters.length > 0) {
      await this.writeLogAsync(Test.FILTERED_COVERAGE_SKIPPED);
      return;
    }

    const testing = await import("@noldova/context.testing");
    const coverageProjects = Config.PACKAGES_INFO.map(t => new testing.CoverageProject(
      t.name,
      join(Test.NODE_MODULES_DIRECTORY_NAME, t.packageName),
      join(Test.SOURCE_DIRECTORY_NAME, t.name, Test.SOURCE_DIRECTORY_NAME)));
    const coverage = await new testing.CoverageAnalyzer().analyzeAsync(Config.COVERAGE_FOLDER, coverageProjects);

    await this.writeLogAsync(Test.BLANK_LINE);
    for (const line of new testing.CoverageReportWriter().formatLines(coverage, options.has(Test.SKIP_COVERAGE_DETAILS_OPTION)))
      await this.writeLogAsync(line);

    if (!coverage.isComplete) {
      await this.writeLogAsync(Test.COVERAGE_INCOMPLETE);
      process.exitCode = 1;
    }
  }

  private static compilingTests(name: string): string {
    return `Compiling the tests of "${name}"...`;
  }

  private static unknownOption(option: string, knownOptions: readonly string[]): string {
    return `Unknown option "${option}". Known options: ${knownOptions.join(", ")}.`;
  }
}

await new Test().runAsEntryPointAsync();
