/**
 * @license
 * Copyright (c) Noldova.
 *
 * This source code is licensed under the license found in the
 * LICENSE file in the root directory of this source tree.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { Assert, TestClass, TestMethod } from "@noldova/context.testing";
import { BuildException, ProcessResult, ProcessRunner, TypeScript } from "@noldova/tools.pipelines";

class RecordingRunner extends ProcessRunner {
  public readonly calls: string[][] = [];

  public override async runAsync(program: string, values: readonly string[], workingDirectory: string): Promise<ProcessResult> {
    this.calls.push([program, ...values, workingDirectory]);

    return new ProcessResult(0, "", "");
  }
}

@TestClass
export class TypeScriptTests {
  @TestMethod
  public async compilesWithTheCompilerTheDirectoryInstallsAsync(): Promise<void> {
    const runner = new RecordingRunner();
    const typeScript = new TypeScript(runner, process.cwd());

    const result = await typeScript.compileAsync("src/noldova.example/src/tsconfig.json");

    Assert.isTrue(result.isSuccessful);
    Assert.areEqual(process.cwd(), typeScript.workingDirectory);
    const [program, compiler, ...rest] = runner.calls[0] ?? [];
    Assert.areEqual(process.execPath, program);
    Assert.areEqual(path.join(process.cwd(), "node_modules", "typescript", "bin", "tsc"), compiler);
    Assert.areEqual(JSON.stringify(["--pretty", "--project", "src/noldova.example/src/tsconfig.json", process.cwd()]), JSON.stringify(rest));
  }

  @TestMethod
  public async failsWhereTypeScriptIsNotInstalledAsync(): Promise<void> {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "tools-pipelines-"));
    try {
      const exception = await Assert.throwsAsync(() => new TypeScript(new RecordingRunner(), directory).compileAsync("tsconfig.json"), BuildException);

      Assert.areEqual("typescript is not installed; the repository's devDependencies name it.", exception.message);
      Assert.areEqual("MODULE_NOT_FOUND", exception.cause instanceof Error ? Reflect.get(exception.cause, "code") : null);
    }
    finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  }

  @TestMethod
  public async passesOnAFailureToFindTypeScriptThatIsNotAMissingPackageAsync(): Promise<void> {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "tools-pipelines-"));
    try {
      fs.mkdirSync(path.join(directory, "node_modules", "typescript"), { recursive: true });
      fs.writeFileSync(path.join(directory, "node_modules", "typescript", "package.json"), "{\"name\":\"typescript\",\"exports\":{\".\":\"./index.js\"}}");

      const rejection = await new TypeScript(new RecordingRunner(), directory).compileAsync("tsconfig.json").then(() => null, (error: unknown) => error);

      Assert.areEqual("ERR_PACKAGE_PATH_NOT_EXPORTED", rejection instanceof Error ? Reflect.get(rejection, "code") : null);
    }
    finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  }
}
