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

### The archive step

`archive <folder> <version> <commit> <scope>` checks the archives a build packed with `npm pack`, before anything is published.
The packages it expects are the commit's `package.json` files under `src/`, outside `tests/` folders, that aren't `"private": true`.
It succeeds only when:

- the version is a version, the commit is its full id, and the scope is `@` and a lowercase name, such as `@noldova`;
- the checkout is at the commit;
- the folder holds one archive for each package at the version, named as `npm pack` names it, such as `noldova-tools.pipelines-0.0.4.tgz`, and nothing else;
- each archive's `package/package.json` has the package's name, inside the scope, the version, and the commit as its `gitHead`, isn't `"private": true`, and lists any other expected package under `dependencies` at exactly the version.

```ts
import { ArchiveStep, CommandLine, Git, ProcessRunner, SourceStep, Tar } from "@noldova/tools.pipelines";

const processRunner = new ProcessRunner();
const git = new Git(processRunner, process.cwd());
const commandLine = new CommandLine("pipelines", [new SourceStep(git), new ArchiveStep(git, new Tar(processRunner))], {
  writeSuccess: message => console.log(message),
  writeFailure: message => console.error(message)
});

process.exitCode = await commandLine.runAsync(["archive", "archives", "0.0.4", "225059f4c1e6a3b2d8f7e9a0b1c2d3e4f5a6b7c8", "@noldova"]);
```

A wrong value, a checkout at another commit or a missing folder fails with that one message.
Otherwise the step fails with one line for each problem it finds with the archives, such as `archives has no noldova-tools.pipelines-0.0.4.tgz.` or `noldova-tools.pipelines-0.0.4.tgz: its version is 0.0.3, not 0.0.4.`
It reads each manifest with the `tar` program, which must be on the `PATH`; an archive `tar` can't read is one of those lines, with `tar`'s exit code and message.
A `package.json`, in an archive or under `src/`, makes the step throw `JsonException` if it isn't a JSON object, lacks a `name` or `version` text where the step needs one, has a `gitHead` that isn't a text, or has a `private` that isn't `true` or `false` or `dependencies` that aren't an object of texts.

### The publish step

`publish <folder> <version> <commit> <scope> <registry> <access>` publishes the archives the archive step checks, with the `npm` program, which must be on the `PATH` as an executable, as it is on Linux and macOS.
The registry is an `https` URL without credentials, a query or a fragment, such as `https://registry.npmjs.org/`, and the access is `public` or `restricted`.
A release is published under the `latest` dist-tag, and a nightly version under `nightly`; a nightly version must be newer than both.
The step passes no token: `npm` takes its credentials from its own configuration, such as the environment a pipeline sets up.

```ts
import { ArchiveStep, CommandLine, Git, Npm, ProcessRunner, PublishStep, Tar } from "@noldova/tools.pipelines";

const processRunner = new ProcessRunner();
const archiveStep = new ArchiveStep(new Git(processRunner, process.cwd()), new Tar(processRunner));
const commandLine = new CommandLine("pipelines", [archiveStep, new PublishStep(archiveStep, new Npm(processRunner, process.cwd()))], {
  writeSuccess: message => console.log(message),
  writeFailure: message => console.error(message)
});

process.exitCode = await commandLine.runAsync(["publish", "archives", "0.0.4", "225059f4c1e6a3b2d8f7e9a0b1c2d3e4f5a6b7c8", "@noldova", "https://registry.npmjs.org/", "public"]);
```

The step:

1. runs the archive step's checks, and fails with their message when they fail;
2. asks the registry about each package, and fails, publishing nothing, with one line for each version it already has from another archive and each version that isn't newer than the version a tag it must pass points to; a version it already has from the same archive is skipped;
3. publishes the rest in turn, and stops at the first publish that fails;
4. waits until the registry serves each version it published with the same archive, up to 10 minutes, asking every 10 seconds, also after a failed publish, so a rerun skips the versions already published.

It succeeds with one line for each package, such as `@noldova/tools.pipelines@0.0.4 published.`, and otherwise fails with one line for each problem.
A failed `npm` call is one of those lines, with `npm`'s exit code and message, and without the credentials, query or fragment of any URL in it; `npm` failing to start throws `ProcessException`.

### The nightly step

`nightly <commit> <registry>` works out a nightly build's version, which the later steps take, and prints it alone, such as `0.0.5-nightly.20261102`: the release in `version.json` at the commit with one more patch, and the UTC date.
The commit must be on `origin/main`, and the registry is as the publish step takes it.

```ts
import { ArchiveStep, CommandLine, Git, NightlyStep, Npm, ProcessRunner, Tar } from "@noldova/tools.pipelines";

const processRunner = new ProcessRunner();
const git = new Git(processRunner, process.cwd());
const nightlyStep = new NightlyStep(git, new ArchiveStep(git, new Tar(processRunner)), new Npm(processRunner, process.cwd()));
const commandLine = new CommandLine("pipelines", [nightlyStep], {
  writeSuccess: message => console.log(message),
  writeFailure: message => console.error(message)
});

process.exitCode = await commandLine.runAsync(["nightly", "225059f4c1e6a3b2d8f7e9a0b1c2d3e4f5a6b7c8", "https://registry.npmjs.org/"]);
```

The step prints nothing when the last nightly version of every package the archive step expects has the commit as its `gitHead`, or is from the same UTC date, so a pipeline skips the build when the output is empty.
It fails with one line naming the packages when only some have a nightly version from that date, and with `npm`'s exit code and message for a read of the registry that fails.

The declaration file `api/index.d.ts` documents every member with its contract and examples.

## License

MIT; see `LICENSE`.
