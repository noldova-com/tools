# @noldova/tools.pipelines

The steps of a build and release pipeline that work the same on any host.
This version holds the version model the steps share, the command-line base a host builds its command line on, and the first step, `source`, which checks a release's commit before anything is built or published.

## Install

```bash
npm install @noldova/tools.pipelines
```

## Use

### Versions

`Version` reads, compares and writes releases of the form `major.minor.patch` and nightly versions of the form `major.minor.patch-nightly.YYYYMMDD`.

```ts
import { Version } from "@noldova/tools.pipelines";

const current = Version.parse("0.0.3");
const next = new Version(current.major, current.minor, current.patch + 1);

next.toString(); // "0.0.4"
next.compareTo(current); // 1

const nightly = new Version(next.major, next.minor, next.patch, "20261101");

nightly.toString(); // "0.0.4-nightly.20261101"
nightly.compareTo(next); // -1, a nightly version comes before its release

Version.validate("0.0.4x"); // "\"0.0.4x\" is not a version: …", for a text from outside the program
```

`Version.parse` and the constructor throw `VersionException` for a text or a part that isn't a version.

### Steps and the command line

A step returns a `StepResult`: it succeeded, or it failed, each with the message a pipeline's log shows.
A failed check is a result, never an exception; the package throws only when something else goes wrong, such as git failing to start, and its exceptions extend `PipelineException`.

`CommandLine` runs the step its first value names, writes the step's message through the host's `IStepOutput`, and gives the exit code: `0` when the step succeeded, `1` when it failed or no step has that name.

```ts
import { CommandLine, Git, ProcessRunner, SourceStep } from "@noldova/tools.pipelines";

const git = new Git(new ProcessRunner(), process.cwd());
const commandLine = new CommandLine("pipelines", [new SourceStep(git)], {
  writeSuccess: message => console.log(message),
  writeFailure: message => console.error(message)
});

process.exitCode = await commandLine.runAsync(process.argv.slice(2));
```

### The source step

`source <version> <commit>` succeeds only when:

- the version is a version and the commit is its full id, 40 lowercase hexadecimal digits;
- the clone holds the commit, and the commit is on `origin/main`, which the clone has fetched with its history;
- the commit holds `version.json` at its root, and its `version` is that version, such as `{ "version": "0.0.4" }`.

Otherwise it fails with the first thing that is wrong, such as `Commit 225059f… is not on origin/main.` or `version.json at commit 225059f… holds 0.0.3, not 0.0.4.`
A `version.json` that isn't a JSON object with a `version` text makes the step throw `JsonException`, from `@noldova/context.json`.

The declaration file `api/index.d.ts` documents every member with its contract and examples.

## License

MIT; see `LICENSE`.
