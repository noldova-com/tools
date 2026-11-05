/**
 * @license
 * Copyright (c) Noldova.
 *
 * This source code is licensed under the license found in the
 * LICENSE file in the root directory of this source tree.
 */

import fs from "node:fs";
import path from "node:path";

import { JsonException } from "@noldova/context.json";
import { Assert, TestClass, TestData, TestMethod } from "@noldova/context.testing";
import { BuildStep, Git, Npm, ProcessResult, ProcessRunner, TypeScript } from "@noldova/tools.pipelines";

import { RecordingOutput } from "./fake-update-host.js";
import { GitRepositoryFixture } from "./git-repository.fixture.js";

class FakeTypeScript extends TypeScript {
  public readonly calls: string[] = [];
  private readonly result: ProcessResult;

  public constructor(directory: string, result: ProcessResult = new ProcessResult(0, "", "")) {
    super(new ProcessRunner(), directory);

    this.result = result;
  }

  public override async compileAsync(projectPath: string): Promise<ProcessResult> {
    this.calls.push(projectPath);

    return this.result;
  }
}

class FakeNpm extends Npm {
  public readonly calls: string[] = [];
  public readonly manifests: string[] = [];
  public readonly backups: string[] = [];
  private readonly packResult: ProcessResult;
  private readonly installResult: ProcessResult;

  public constructor(directory: string, packResult: ProcessResult = new ProcessResult(0, "", ""), installResult: ProcessResult = new ProcessResult(0, "", "")) {
    super(new ProcessRunner(), directory);

    this.packResult = packResult;
    this.installResult = installResult;
  }

  public override async packAsync(directory: string, destination: string): Promise<ProcessResult> {
    this.calls.push(`pack ${path.basename(directory)}`);
    if (this.packResult.isSuccessful) {
      const manifest = JSON.parse(fs.readFileSync(path.join(directory, "package.json"), "utf8")) as { name: string; version: string };
      fs.writeFileSync(path.join(destination, `${manifest.name.slice(1).replace("/", "-")}-${manifest.version}.tgz`), "");
    }

    return this.packResult;
  }

  public override async installArchivesAsync(archivePaths: readonly string[]): Promise<ProcessResult> {
    this.calls.push(`install ${archivePaths.join(" ")}`);
    this.backups.push(fs.readdirSync(path.join(this.workingDirectory, "_build/restore")).join(" "));
    const manifestPath = path.join(this.workingDirectory, "package.json");
    if (fs.existsSync(manifestPath))
      this.manifests.push(fs.readFileSync(manifestPath, "utf8"));
    fs.writeFileSync(manifestPath, "{\"saved\":true}");
    fs.writeFileSync(path.join(this.workingDirectory, "package-lock.json"), "{\"locked\":true}");

    return this.installResult;
  }
}

@TestClass
export class BuildStepTests {
  private static readonly OK: ProcessResult = new ProcessResult(0, "", "");
  private static readonly RECORD: string = "require('node:fs').appendFileSync('order.txt', `${require('node:path').basename(__filename, '.js')} ${process.argv.slice(2).join(' ')}\\n`);";

  @TestMethod
  public namesItselfAndItsValues(): void {
    const step = BuildStepTests.createStep(".", new FakeTypeScript("."), new FakeNpm("."), []);

    Assert.areEqual("build", step.name);
    Assert.areEqual("[--version <version>] [<package>...], or --list-copies", step.usage);
  }

  @TestMethod
  public async buildsEachPackageInOrderAsync(): Promise<void> {
    using repository = BuildStepTests.createRepository();
    const commit = repository.readHead();
    fs.mkdirSync(path.join(repository.directory, "_build/packages/noldova.a"), { recursive: true });
    fs.writeFileSync(path.join(repository.directory, "_build/packages/noldova.a/stale.txt"), "");
    const typeScript = new FakeTypeScript(repository.directory);
    const npm = new FakeNpm(repository.directory);
    const lines: string[] = [];

    const result = await BuildStepTests.createStep(repository.directory, typeScript, npm, lines).runAsync([]);

    Assert.areEqual("Built 2 packages at version 0.0.5.", result.message);
    Assert.isTrue(result.isSuccessful);
    Assert.areEqual(`{\n  "name": "@noldova/a",\n  "version": "0.0.5",\n  "gitHead": "${commit}"\n}\n`, BuildStepTests.read(repository, "_build/packages/noldova.a/package.json"));
    Assert.areEqual(`{\n  "name": "@noldova/b",\n  "version": "0.0.5",\n  "dependencies": {\n    "@noldova/a": "0.0.5"\n  },\n  "gitHead": "${commit}"\n}\n`, BuildStepTests.read(repository, "_build/packages/noldova.b/package.json"));
    Assert.areEqual("LICENSE,README.md,THIRD-PARTY-NOTICES.txt,api,package.json", fs.readdirSync(path.join(repository.directory, "_build/packages/noldova.a")).sort().join(","));
    Assert.areEqual("declarations", BuildStepTests.read(repository, "_build/packages/noldova.a/api/index.d.ts"));
    Assert.areEqual("LICENSE,README.md,package.json", fs.readdirSync(path.join(repository.directory, "_build/packages/noldova.b")).sort().join(","));
    Assert.areEqual(
      "pre src/group/noldova.b _build/packages/noldova.b\ncompile src/group/noldova.b _build/packages/noldova.b\npost src/group/noldova.b _build/packages/noldova.b\n",
      BuildStepTests.read(repository, "order.txt"));
    Assert.areEqual("src/noldova.a/src/tsconfig.json", typeScript.calls.join(","));
    Assert.areEqual(
      "pack noldova.a|install ./_packages/noldova-a-0.0.5.tgz|pack noldova.b|install ./_packages/noldova-b-0.0.5.tgz",
      npm.calls.join("|"));
    Assert.isFalse(fs.existsSync(path.join(repository.directory, "package.json")));
    Assert.isFalse(fs.existsSync(path.join(repository.directory, "package-lock.json")));
    Assert.areEqual("progress: Building @noldova/a...|progress: Building @noldova/b...", lines.join("|"));
  }

  @TestMethod
  public async buildsTheNamedPackagesAtTheGivenVersionAsync(): Promise<void> {
    using repository = BuildStepTests.createRepository();
    const npm = new FakeNpm(repository.directory);

    const result = await BuildStepTests.createStep(repository.directory, new FakeTypeScript(repository.directory), npm, []).runAsync(["noldova.b", "--version", "0.0.5-nightly.20261102"]);

    Assert.areEqual("Built 1 package at version 0.0.5-nightly.20261102.", result.message);
    Assert.isTrue(BuildStepTests.read(repository, "_build/packages/noldova.b/package.json").includes("\"version\": \"0.0.5-nightly.20261102\""));
    Assert.areEqual("pack noldova.b|install ./_packages/noldova-b-0.0.5-nightly.20261102.tgz", npm.calls.join("|"));
  }

  @TestMethod
  public async listsTheArchivesItDoesNotBuildWhileItInstallsAndRestoresTheManifestAndLockAsync(): Promise<void> {
    using repository = BuildStepTests.createRepository();
    const manifest = "{\n\t\"name\": \"repository\",\n\t\"dependencies\": { \"x\": \"1.0.0\" }\n}";
    fs.writeFileSync(path.join(repository.directory, "package.json"), manifest);
    fs.writeFileSync(path.join(repository.directory, "package-lock.json"), "lock");
    fs.mkdirSync(path.join(repository.directory, "_packages"));
    fs.writeFileSync(path.join(repository.directory, "_packages/noldova-a-0.0.5.tgz"), "");
    const npm = new FakeNpm(repository.directory);

    const result = await BuildStepTests.createStep(repository.directory, new FakeTypeScript(repository.directory), npm, []).runAsync(["noldova.b"]);

    Assert.isTrue(result.isSuccessful);
    Assert.areEqual("{\n  \"name\": \"repository\",\n  \"dependencies\": {\n    \"x\": \"1.0.0\",\n    \"@noldova/a\": \"file:_packages/noldova-a-0.0.5.tgz\"\n  }\n}\n", npm.manifests.join("|"));
    Assert.areEqual(manifest, BuildStepTests.read(repository, "package.json"));
    Assert.areEqual("lock", BuildStepTests.read(repository, "package-lock.json"));
  }

  @TestMethod
  public async restoresTheManifestAndLockThatAnInterruptedBuildLeftAsync(): Promise<void> {
    using repository = BuildStepTests.createRepository();
    fs.writeFileSync(path.join(repository.directory, "package.json"), "{\"dependencies\":{\"@noldova/a\":\"file:_packages/noldova-a-0.0.5.tgz\"}}");
    fs.writeFileSync(path.join(repository.directory, "package-lock.json"), "changed");
    fs.mkdirSync(path.join(repository.directory, "_build/restore"), { recursive: true });
    fs.writeFileSync(path.join(repository.directory, "_build/restore/package.json"), "{\"name\":\"repository\"}");
    const npm = new FakeNpm(repository.directory);

    await BuildStepTests.createStep(repository.directory, new FakeTypeScript(repository.directory), npm, []).runAsync(["noldova.b"]);

    Assert.areEqual("{\"name\":\"repository\"}", npm.manifests.join("|"));
    Assert.areEqual("{\"name\":\"repository\"}", BuildStepTests.read(repository, "package.json"));
    Assert.isFalse(fs.existsSync(path.join(repository.directory, "package-lock.json")));
    Assert.isFalse(fs.existsSync(path.join(repository.directory, "_build/restore")));
  }

  @TestMethod
  public async keepsTheBackupOfTheManifestAndLockWhileItBuildsAsync(): Promise<void> {
    using repository = BuildStepTests.createRepository();
    fs.writeFileSync(path.join(repository.directory, "package.json"), "{}");
    fs.writeFileSync(path.join(repository.directory, "package-lock.json"), "lock");
    const npm = new FakeNpm(repository.directory);

    await BuildStepTests.createStep(repository.directory, new FakeTypeScript(repository.directory), npm, []).runAsync(["noldova.a", "noldova.b"]);

    Assert.areEqual("package-lock.json package.json|package-lock.json package.json", npm.backups.join("|"));
    Assert.isFalse(fs.existsSync(path.join(repository.directory, "_build/restore")));
  }

  @TestMethod
  public async listsTheArchivesItDoesNotBuildInAManifestWithoutDependenciesAsync(): Promise<void> {
    using repository = BuildStepTests.createRepository();
    fs.writeFileSync(path.join(repository.directory, "package.json"), "{\"name\":\"repository\"}");
    fs.mkdirSync(path.join(repository.directory, "_packages"));
    fs.writeFileSync(path.join(repository.directory, "_packages/noldova-a-0.0.5.tgz"), "");
    const npm = new FakeNpm(repository.directory);

    await BuildStepTests.createStep(repository.directory, new FakeTypeScript(repository.directory), npm, []).runAsync(["noldova.b"]);

    Assert.areEqual("{\n  \"name\": \"repository\",\n  \"dependencies\": {\n    \"@noldova/a\": \"file:_packages/noldova-a-0.0.5.tgz\"\n  }\n}\n", npm.manifests.join("|"));
    Assert.areEqual("{\"name\":\"repository\"}", BuildStepTests.read(repository, "package.json"));
    Assert.isFalse(fs.existsSync(path.join(repository.directory, "package-lock.json")));
  }

  @TestMethod
  public async listsTheArchivesItDoesNotBuildWithoutAManifestAsync(): Promise<void> {
    using repository = BuildStepTests.createRepository();
    fs.mkdirSync(path.join(repository.directory, "_packages"));
    fs.writeFileSync(path.join(repository.directory, "_packages/noldova-a-0.0.5.tgz"), "");
    const npm = new FakeNpm(repository.directory);

    await BuildStepTests.createStep(repository.directory, new FakeTypeScript(repository.directory), npm, []).runAsync(["noldova.b"]);

    Assert.areEqual("{\n  \"dependencies\": {\n    \"@noldova/a\": \"file:_packages/noldova-a-0.0.5.tgz\"\n  }\n}\n", npm.manifests.join("|"));
    Assert.isFalse(fs.existsSync(path.join(repository.directory, "package.json")));
  }

  @TestMethod
  public async listsTheFilesItCopiesAsync(): Promise<void> {
    using repository = BuildStepTests.createRepository();

    const result = await BuildStepTests.createStep(repository.directory, new FakeTypeScript(repository.directory), new FakeNpm(repository.directory), []).runAsync(["--list-copies"]);

    Assert.isTrue(result.isSuccessful);
    Assert.areEqual([
      "LICENSE\t@noldova/a\tLICENSE",
      "src/noldova.a/src/api/index.d.ts\t@noldova/a\tapi/index.d.ts",
      "src/noldova.a/README.md\t@noldova/a\tREADME.md",
      "src/noldova.a/THIRD-PARTY-NOTICES.txt\t@noldova/a\tTHIRD-PARTY-NOTICES.txt",
      "LICENSE\t@noldova/b\tLICENSE",
      "src/group/noldova.b/README.md\t@noldova/b\tREADME.md",
      "end of copies"
    ].join("\n"), result.message);
  }

  @TestData("--list-copies more", "The option --list-copies takes no other value.")
  @TestData("--version", "The option --version takes a version as its next value, such as --version 0.0.5 or --version 0.0.5-nightly.20261102.")
  @TestData("--version 0.0.5 --version 0.0.6", "The option --version is given more than once.")
  @TestData("--unknown", "Unknown option --unknown; the step takes [--version <version>] [<package>...], or --list-copies.")
  @TestData("noldova.a noldova.a", "The package noldova.a is named more than once.")
  @TestData("noldova.c", "build.json names no package noldova.c.")
  @TestMethod
  public async failsForValuesItDoesNotTakeAsync(joinedValues: string, message: string): Promise<void> {
    using repository = BuildStepTests.createRepository();

    const result = await BuildStepTests.createStep(repository.directory, new FakeTypeScript(repository.directory), new FakeNpm(repository.directory), []).runAsync(joinedValues.split(" "));

    Assert.isFalse(result.isSuccessful);
    Assert.areEqual(message, result.message);
  }

  @TestMethod
  public async failsForAVersionThatIsNotOneAsync(): Promise<void> {
    using repository = BuildStepTests.createRepository();

    const result = await BuildStepTests.createStep(repository.directory, new FakeTypeScript(repository.directory), new FakeNpm(repository.directory), []).runAsync(["--version", "1.4"]);

    Assert.isFalse(result.isSuccessful);
    Assert.isTrue(result.message.startsWith("\"1.4\" is not a version"), result.message);
  }

  @TestMethod
  public async failsOutsideTheCheckoutsRootAsync(): Promise<void> {
    using repository = BuildStepTests.createRepository();
    const directory = path.join(repository.directory, "src");
    fs.copyFileSync(path.join(repository.directory, "build.json"), path.join(directory, "build.json"));

    const result = await BuildStepTests.createStep(directory, new FakeTypeScript(directory), new FakeNpm(directory), []).runAsync([]);

    Assert.isFalse(result.isSuccessful);
    Assert.areEqual(`${directory} is not the root of a git checkout.`, result.message);
  }

  @TestData("build.json", "The checkout has no build.json, which names the packages to build.")
  @TestData("version.json", "The checkout has no version.json, which holds the version to build.")
  @TestData("src/noldova.a/package.json", "@noldova/a needs src/noldova.a/package.json, which is missing.")
  @TestData("src/noldova.a/README.md", "@noldova/a needs src/noldova.a/README.md, which is missing.")
  @TestMethod
  public async failsForAMissingFileAsync(filePath: string, message: string): Promise<void> {
    using repository = BuildStepTests.createRepository();
    fs.rmSync(path.join(repository.directory, filePath));

    const result = await BuildStepTests.createStep(repository.directory, new FakeTypeScript(repository.directory), new FakeNpm(repository.directory), []).runAsync([]);

    Assert.isFalse(result.isSuccessful);
    Assert.areEqual(message, result.message);
  }

  @TestMethod
  public async rejectsAVersionFileWithoutAVersionAsync(): Promise<void> {
    using repository = BuildStepTests.createRepository();
    repository.write({ "version.json": "{}" });

    await Assert.throwsAsync(() => BuildStepTests.createStep(repository.directory, new FakeTypeScript(repository.directory), new FakeNpm(repository.directory), []).runAsync([]), JsonException);
  }

  @TestData("1|error TS2322: wrong", "The TypeScript compiler exited with code 1 for src/noldova.a/src/tsconfig.json:\nerror TS2322: wrong")
  @TestData("2| \n", "The TypeScript compiler exited with code 2 for src/noldova.a/src/tsconfig.json.")
  @TestMethod
  public async failsWhenTheCompileFailsAsync(joined: string, message: string): Promise<void> {
    using repository = BuildStepTests.createRepository();
    const [exitCode = "", output = ""] = joined.split("|");

    const result = await BuildStepTests.createStep(repository.directory, new FakeTypeScript(repository.directory, new ProcessResult(Number(exitCode), output, "")), new FakeNpm(repository.directory), []).runAsync([]);

    Assert.isFalse(result.isSuccessful);
    Assert.areEqual(message, result.message);
  }

  @TestMethod
  public async failsWhenAScriptFailsAsync(): Promise<void> {
    using repository = BuildStepTests.createRepository();
    repository.write({ "scripts/post.js": "process.stdout.write('broke'); process.exitCode = 2;" });

    const result = await BuildStepTests.createStep(repository.directory, new FakeTypeScript(repository.directory), new FakeNpm(repository.directory), []).runAsync(["noldova.b"]);

    Assert.isFalse(result.isSuccessful);
    Assert.areEqual("The script scripts/post.js of @noldova/b exited with code 2:\nbroke", result.message);
  }

  @TestMethod
  public async failsWhenNpmCannotPackAsync(): Promise<void> {
    using repository = BuildStepTests.createRepository();
    const npm = new FakeNpm(repository.directory, new ProcessResult(1, "", "npm error pack"));

    const result = await BuildStepTests.createStep(repository.directory, new FakeTypeScript(repository.directory), npm, []).runAsync([]);

    Assert.areEqual("npm pack exited with code 1 for @noldova/a:\nnpm error pack", result.message);
    Assert.areEqual("pack noldova.a", npm.calls.join("|"));
  }

  @TestMethod
  public async failsWhenNpmCannotInstallAsync(): Promise<void> {
    using repository = BuildStepTests.createRepository();
    fs.writeFileSync(path.join(repository.directory, "package.json"), "{}");
    fs.writeFileSync(path.join(repository.directory, "package-lock.json"), "lock");

    const result = await BuildStepTests.createStep(repository.directory, new FakeTypeScript(repository.directory), new FakeNpm(repository.directory, BuildStepTests.OK, new ProcessResult(1, "npm error install", "")), []).runAsync([]);

    Assert.areEqual("npm install exited with code 1 for the built packages:\nnpm error install", result.message);
    Assert.areEqual("{}", BuildStepTests.read(repository, "package.json"));
    Assert.areEqual("lock", BuildStepTests.read(repository, "package-lock.json"));
  }

  private static createStep(directory: string, typeScript: TypeScript, npm: Npm, lines: string[]): BuildStep {
    const processRunner = new ProcessRunner();

    return new BuildStep(new Git(processRunner, directory), npm, typeScript, processRunner, new RecordingOutput(lines));
  }

  private static createRepository(): GitRepositoryFixture {
    const repository = GitRepositoryFixture.create();
    repository.commit({
      "build.json": JSON.stringify({
        packages: [
          { name: "noldova.a" },
          { name: "noldova.b", path: "group/noldova.b", pre: "scripts/pre.js", compile: "scripts/compile.js", post: "scripts/post.js" }
        ]
      }),
      "LICENSE": "MIT",
      "version.json": "{\"version\":\"0.0.5\"}",
      "scripts/pre.js": BuildStepTests.RECORD,
      "scripts/compile.js": BuildStepTests.RECORD,
      "scripts/post.js": BuildStepTests.RECORD,
      "src/noldova.a/package.json": "{\"name\":\"@noldova/a\",\"version\":\"__VERSION__\"}",
      "src/noldova.a/README.md": "# a",
      "src/noldova.a/THIRD-PARTY-NOTICES.txt": "notices",
      "src/noldova.a/src/api/index.d.ts": "declarations",
      "src/group/noldova.b/package.json": "{\"name\":\"@noldova/b\",\"version\":\"__VERSION__\",\"dependencies\":{\"@noldova/a\":\"__VERSION__\"}}",
      "src/group/noldova.b/README.md": "# b"
    });

    return repository;
  }

  private static read(repository: GitRepositoryFixture, filePath: string): string {
    return fs.readFileSync(path.join(repository.directory, filePath), "utf8");
  }
}
