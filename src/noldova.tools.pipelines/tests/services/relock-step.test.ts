/**
 * @license
 * Copyright (c) Noldova.
 *
 * This source code is licensed under the license found in the
 * LICENSE file in the root directory of this source tree.
 */

import fs from "node:fs";
import path from "node:path";

import { Assert, TestClass, TestData, TestMethod } from "@noldova/context.testing";
import { Npm, ProcessResult, ProcessRunner, RelockedFiles, RelockStep, StepResult } from "@noldova/tools.pipelines";

import { GitRepositoryFixture } from "./git-repository.fixture.js";

class ScriptNpm extends Npm {
  private readonly root: string;

  public readonly locked: string[] = [];
  public readonly scripts: string[] = [];
  public scriptResult: ProcessResult = new ProcessResult(0, "", "");
  public viewResult: ProcessResult = new ProcessResult(1, "", "npm error code E404\n");
  public thrown: unknown = null;

  public constructor(root: string) {
    super(new ProcessRunner(), root);

    this.root = root;
  }

  public override async lockAsync(directory: string, hiddenVariables: readonly string[] = []): Promise<ProcessResult> {
    this.locked.push(`${path.relative(this.root, directory) || "."} ${hiddenVariables.join(",")}`);
    fs.writeFileSync(path.join(directory, "package-lock.json"), `${JSON.stringify({ lockedFrom: fs.readFileSync(path.join(directory, "package.json"), "utf8") })}\n`);

    return new ProcessResult(0, "", "");
  }

  public override async runScriptAsync(directory: string, script: string, hiddenVariables: readonly string[] = []): Promise<ProcessResult> {
    this.scripts.push(`${path.relative(this.root, directory) || "."} ${script} ${hiddenVariables.join(",")}`);
    fs.writeFileSync(path.join(directory, "app", "package-lock.json"), `${JSON.stringify({ scripted: fs.readFileSync(path.join(directory, "app", "package.json"), "utf8") })}\n`);

    return this.scriptResult;
  }

  public override async viewInAsync(): Promise<ProcessResult> {
    if (this.thrown !== null)
      throw this.thrown;

    return this.viewResult;
  }
}

@TestClass
export class RelockStepTests {
  private static readonly REPOSITORY: string = "noldova-com/pinned";
  private static readonly FILES: Readonly<Record<string, string>> = {
    "package.json": "{ \"dependencies\": { \"@noldova/a\": \"0.0.3\" } }\n",
    "package-lock.json": "{}\n",
    "app/package.json": "{ \"dependencies\": { \"@noldova/a\": \"0.0.3\", \"@noldova/own\": \"0.0.1\" } }\n",
    "app/package-lock.json": "{}\n",
    "src/package.json": "{ \"name\": \"@noldova/own\", \"dependencies\": { \"@noldova/c\": \"0.0.1\" } }\n",
    "src/package-lock.json": "{}\n"
  };

  @TestMethod
  public namesItselfAndItsValues(): void {
    const step = new RelockStep(new ProcessRunner(), new Npm(new ProcessRunner(), "."), ".");

    Assert.areEqual("relock", step.name);
    Assert.areEqual("<repository> <request> <result file> [<lock file>=<npm script>...]", step.usage);
  }

  @TestMethod
  public async movesThePinsRelocksAndWritesOnlyTheChangedFilesAsync(): Promise<void> {
    using target = RelockStepTests.createTarget();
    const npm = new ScriptNpm(target.directory);

    const result = await new RelockStep(new ProcessRunner(), npm, target.directory).runAsync([RelockStepTests.REPOSITORY, RelockStepTests.createRequest("@noldova/a"), "relock.json", "app/package-lock.json=lock:app"]);

    Assert.isTrue(result.isSuccessful, result.message);
    Assert.areEqual("noldova-com/pinned: moved 2 pins and wrote the 5 files that changed into the result.", result.message);
    const written = RelockStepTests.readResult(target);
    if (!(written instanceof RelockedFiles))
      throw new Error(`The result is a message: ${written.message}`);

    Assert.areEqual("`app/package.json`: `@noldova/a` from 0.0.3 to 0.0.4|`package.json`: `@noldova/a` from 0.0.3 to 0.0.4", written.moves.join("|"));
    Assert.areEqual(
      [
        "`app/package-lock.json`: the moved packages, the entries nested under them and the entries that depend on them resolved again with the repository's own `npm run lock:app`, after the dependent prepared its checkout as its own build does",
        "`package-lock.json`: the moved packages, the entries nested under them and the entries that depend on them resolved again with `npm install --package-lock-only --ignore-scripts --no-audit --no-fund`; every other entry kept unless a resolved package needs it to change",
        "`src/package-lock.json`: the moved packages, the entries nested under them and the entries that depend on them resolved again with `npm install --package-lock-only --ignore-scripts --no-audit --no-fund`; every other entry kept unless a resolved package needs it to change"
      ].join("|"),
      written.lockLines.join("|"));
    Assert.areEqual("app/package.json,package.json,app/package-lock.json,package-lock.json,src/package-lock.json", Object.keys(written.files).join(","));
    Assert.areEqual("{ \"dependencies\": { \"@noldova/a\": \"0.0.4\", \"@noldova/own\": \"0.0.1\" } }\n", written.files["app/package.json"]);
    Assert.areEqual(`${JSON.stringify({ scripted: written.files["app/package.json"] })}\n`, written.files["app/package-lock.json"]);
    Assert.areEqual(". lock:app ", npm.scripts.join("|"));
    Assert.areEqual(". |src ", npm.locked.join("|"));
  }

  @TestMethod
  public async writesTheLineOfARepositoryThatPinsNoneAsync(): Promise<void> {
    using target = RelockStepTests.createTarget();

    const result = await new RelockStep(new ProcessRunner(), new ScriptNpm(target.directory), target.directory).runAsync([RelockStepTests.REPOSITORY, RelockStepTests.createRequest("@noldova/z"), "relock.json"]);

    Assert.isTrue(result.isSuccessful, result.message);
    Assert.areEqual("noldova-com/pinned: pins none of them below 0.0.4.", result.message);
    const written = RelockStepTests.readResult(target);
    Assert.isTrue(written instanceof StepResult && written.isSuccessful);
    Assert.areEqual("noldova-com/pinned: pins none of them below 0.0.4.", written instanceof StepResult ? written.message : "");
  }

  @TestMethod
  public async writesAFailedScriptAsAFailedResultAsync(): Promise<void> {
    using target = RelockStepTests.createTarget();
    const npm = new ScriptNpm(target.directory);
    npm.scriptResult = new ProcessResult(2, "", "npm error lock broke\n");

    const result = await new RelockStep(new ProcessRunner(), npm, target.directory).runAsync([RelockStepTests.REPOSITORY, RelockStepTests.createRequest("@noldova/a"), "relock.json", "app/package-lock.json=lock:app"]);

    Assert.isTrue(result.isSuccessful, result.message);
    const written = RelockStepTests.readResult(target);
    Assert.isTrue(written instanceof StepResult && !written.isSuccessful);
    Assert.isTrue(result.message.startsWith("noldova-com/pinned: Relocking app/package-lock.json, npm run lock:app, exited with code 2"), result.message);
    Assert.isTrue(result.message.includes("npm error lock broke"), result.message);
  }

  @TestMethod
  public async writesALockScriptForAnUntrackedLockFileAsAFailedResultAsync(): Promise<void> {
    using target = RelockStepTests.createTarget();
    const npm = new ScriptNpm(target.directory);

    const result = await new RelockStep(new ProcessRunner(), npm, target.directory).runAsync([RelockStepTests.REPOSITORY, RelockStepTests.createRequest("@noldova/a"), "relock.json", "web/package-lock.json=lock:web"]);

    Assert.areEqual("noldova-com/pinned: The lock scripts name lock files the repository doesn't track: web/package-lock.json.", result.message);
    const written = RelockStepTests.readResult(target);
    Assert.isTrue(written instanceof StepResult && !written.isSuccessful);
    Assert.areEqual(0, npm.locked.length + npm.scripts.length);
    Assert.areEqual(RelockStepTests.FILES["app/package.json"], fs.readFileSync(path.join(target.directory, "app", "package.json"), "utf8"));
  }

  @TestMethod
  public async writesAnErrorAsAFailedResultAsync(): Promise<void> {
    using target = RelockStepTests.createTarget();
    const npm = new ScriptNpm(target.directory);
    npm.viewResult = new ProcessResult(1, "", "npm error code E500\n");

    const result = await new RelockStep(new ProcessRunner(), npm, target.directory).runAsync([RelockStepTests.REPOSITORY, RelockStepTests.createRequest("@noldova/a"), "relock.json"]);

    Assert.isTrue(result.isSuccessful, result.message);
    Assert.isTrue(result.message.startsWith("noldova-com/pinned: "), result.message);
    Assert.isTrue(result.message.includes("E500"), result.message);
    const written = RelockStepTests.readResult(target);
    Assert.isTrue(written instanceof StepResult && !written.isSuccessful);
  }

  @TestMethod
  public async rejectsWhatIsThrownThatIsNoErrorAsync(): Promise<void> {
    using target = RelockStepTests.createTarget();
    const npm = new ScriptNpm(target.directory);
    npm.thrown = "not an error";

    const rejection = await new RelockStep(new ProcessRunner(), npm, target.directory).runAsync([RelockStepTests.REPOSITORY, RelockStepTests.createRequest("@noldova/a"), "relock.json"]).then(() => null, (error: unknown) => error);

    Assert.areEqual("not an error", rejection);
    Assert.isFalse(fs.existsSync(path.join(target.directory, "relock.json")));
  }

  @TestData("", "The relock step takes <repository> <request> <result file> [<lock file>=<npm script>...].")
  @TestData("noldova-com/pinned|{}", "The relock step takes <repository> <request> <result file> [<lock file>=<npm script>...].")
  @TestData("noldova-com/pinned|{}|relock.json|lock:app", "lock:app isn't a lock script: give each tracked lock file once, as <lock file>=<npm script>, such as app/package-lock.json=lock:app, with a script name of letters, digits and : . _ -.")
  @TestData("noldova-com/pinned|{}|relock.json|=lock:app", "=lock:app isn't a lock script: give each tracked lock file once, as <lock file>=<npm script>, such as app/package-lock.json=lock:app, with a script name of letters, digits and : . _ -.")
  @TestData("noldova-com/pinned|{}|relock.json|app/package-lock.json=lock app", "app/package-lock.json=lock app isn't a lock script: give each tracked lock file once, as <lock file>=<npm script>, such as app/package-lock.json=lock:app, with a script name of letters, digits and : . _ -.")
  @TestData("noldova-com/pinned|{}|relock.json|app/package-lock.json=lock:app|app/package-lock.json=lock:other", "app/package-lock.json=lock:other isn't a lock script: give each tracked lock file once, as <lock file>=<npm script>, such as app/package-lock.json=lock:app, with a script name of letters, digits and : . _ -.")
  @TestMethod
  public async failsForValuesItCantTakeAsync(values: string, expected: string): Promise<void> {
    using target = RelockStepTests.createTarget();

    const result = await new RelockStep(new ProcessRunner(), new ScriptNpm(target.directory), target.directory).runAsync(values.split("|").filter(t => t.length > 0));

    Assert.isFalse(result.isSuccessful);
    Assert.areEqual(expected, result.message);
    Assert.isFalse(fs.existsSync(path.join(target.directory, "relock.json")));
  }

  private static createRequest(packageName: string): string {
    return JSON.stringify({ source: "source", version: "0.0.4", commit: "225059f4c1e6a3b2d8f7e9a0b1c2d3e4f5a6b7c8", packageNames: [packageName], peerPins: [{ packageName: "@noldova/kit", version: "0.0.5", reason: null }] });
  }

  private static createTarget(): GitRepositoryFixture {
    const target = GitRepositoryFixture.create();
    target.commit(RelockStepTests.FILES);

    return target;
  }

  private static readResult(target: GitRepositoryFixture): StepResult | RelockedFiles {
    return RelockedFiles.parse(fs.readFileSync(path.join(target.directory, "relock.json"), "utf8"));
  }
}
