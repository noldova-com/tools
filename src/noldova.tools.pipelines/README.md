# @noldova/tools.pipelines

The steps of a build and release pipeline that work the same on any host.
This version holds the version model the steps share, the command-line base a host builds its command line on, and the steps: `source`, `archive`, `publish`, `nightly`, `prune`, `tag`, `toolchain`, `line-endings`, `unchanged`, `reproducible`, `dependents` and `pins`.

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
- each archive's `package/package.json` has the package's name, inside the scope, the version, and the commit as its `gitHead`, isn't `"private": true`, has a `license`, and lists any other expected package under `dependencies` at exactly the version;
- each archive holds `package/LICENSE`, and no file of a kind that holds credentials: `.npmrc`, `.netrc`, `.env` or `.env.<name>`, `id_rsa`, `id_dsa`, `id_ecdsa`, `id_ed25519`, or a name ending in `.pem`, `.key`, `.p12` or `.pfx`, such as `.key` itself, in any folder and whatever its case;
- each archive holds every file the build copies into its package, as a file with the same bytes as its source, and neither the copy nor its source is a symbolic link or under one.

The step asks the build for those copies with `npm run build --silent -- --list-copies`, in the folder the `Npm` it's given works in, the checkout's root.
The build script prints one line for each copy, with tabs between its source's path from the checkout's root, the package's name, and its path inside the package, such as `LICENSE`, `@noldova/tools.pipelines` and `LICENSE`, with `/` between a path's parts, then `end of copies` as its last line, also when it copies nothing; it builds nothing.
Every build the step checks must answer `--list-copies` so before the build's release or CI moves to this version of the step: a build that doesn't fails the step.

```ts
import { ArchiveStep, CommandLine, Git, Npm, ProcessRunner, SourceStep, Tar } from "@noldova/tools.pipelines";

const processRunner = new ProcessRunner();
const git = new Git(processRunner, process.cwd());
const commandLine = new CommandLine("pipelines", [new SourceStep(git), new ArchiveStep(git, new Tar(processRunner), new Npm(processRunner, process.cwd()))], {
  writeSuccess: message => console.log(message),
  writeFailure: message => console.error(message)
});

process.exitCode = await commandLine.runAsync(["archive", "archives", "0.0.4", "225059f4c1e6a3b2d8f7e9a0b1c2d3e4f5a6b7c8", "@noldova"]);
```

A wrong value, a checkout at another commit or a missing folder fails with that one message.
Otherwise the step fails with one line for each problem it finds with the archives, such as `archives has no noldova-tools.pipelines-0.0.4.tgz.` or `noldova-tools.pipelines-0.0.4.tgz: its version is 0.0.3, not 0.0.4.`
It reads each manifest and lists each archive's files with the `tar` program, which must be on the `PATH`; an archive `tar` can't read or list is one of those lines, with `tar`'s exit code and message.
When the archives pass, the step checks the copies, extracting each archive with `tar` into a new temporary folder that it removes after, and adds one line, such as `Each of the 2 files the build copies in matches its source.`; it fails with npm's exit code and message when the build can't list its copies, and when its output doesn't end with `end of copies`; otherwise with one line for each copy the build lists that isn't three fields, has a path that isn't inside its folder or a package without an archive, a source that is a symbolic link or under one or isn't a file, an archive `tar` can't extract, and a copy an archive lacks, holds as a symbolic link, under one or as a folder, or holds with other bytes.
A `package.json`, in an archive or under `src/`, makes the step throw `JsonException` if it isn't a JSON object, lacks a `name` or `version` text where the step needs one, has a `gitHead` or a `license` that isn't a text, or has a `private` that isn't `true` or `false` or `dependencies` that aren't an object of texts.

### The publish step

`publish <folder> <version> <commit> <scope> <registry> <access>` publishes the archives the archive step checks, with the `npm` program, which must be on the `PATH` as an executable, as it is on Linux and macOS.
The registry is an `https` URL without credentials, a query or a fragment, such as `https://registry.npmjs.org/`, and the access is `public` or `restricted`.
A release is published under the `latest` dist-tag, and a nightly version under `nightly`; a nightly version must be newer than both.
The step passes no token: `npm` takes its credentials from its own configuration, such as the environment a pipeline sets up.

```ts
import { ArchiveStep, CommandLine, Git, Npm, ProcessRunner, PublishStep, Tar } from "@noldova/tools.pipelines";

const processRunner = new ProcessRunner();
const archiveStep = new ArchiveStep(new Git(processRunner, process.cwd()), new Tar(processRunner), new Npm(processRunner, process.cwd()));
const commandLine = new CommandLine("pipelines", [archiveStep, new PublishStep(archiveStep, new Npm(processRunner, process.cwd()))], {
  writeSuccess: message => console.log(message),
  writeFailure: message => console.error(message)
});

process.exitCode = await commandLine.runAsync(["publish", "archives", "0.0.4", "225059f4c1e6a3b2d8f7e9a0b1c2d3e4f5a6b7c8", "@noldova", "https://registry.npmjs.org/", "public"]);
```

The step:

1. runs the archive step's checks, except the build's copies, and fails with their message when they fail;
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
const npm = new Npm(processRunner, process.cwd());
const nightlyStep = new NightlyStep(git, new ArchiveStep(git, new Tar(processRunner), npm), npm);
const commandLine = new CommandLine("pipelines", [nightlyStep], {
  writeSuccess: message => console.log(message),
  writeFailure: message => console.error(message)
});

process.exitCode = await commandLine.runAsync(["nightly", "225059f4c1e6a3b2d8f7e9a0b1c2d3e4f5a6b7c8", "https://registry.npmjs.org/"]);
```

The step prints nothing when the last nightly version of every package the archive step expects has the commit as its `gitHead`, or is from the same UTC date, so a pipeline skips the build when the output is empty.
It fails with one line naming the packages when only some have a nightly version from that date, and with `npm`'s exit code and message for a read of the registry that fails.

### The prune step

`prune <version> <commit> <scope> <registry> <keep-versions>` runs after a release on a registry that keeps only its newest versions: it deletes each package's older release versions, keeping the newest `<keep-versions>`, a whole number above 0, and every version a repository's lock file still holds, so that repository's `npm ci` keeps working.
It lists and deletes versions, and reads the lock files, through the host's `IRegistryHost`, which a host's package implements for its own registry, and runs only on that registry; it refuses npm's public registry whatever the host names, so a version published there stays.
Since the step deletes, a pipeline runs it only in a release whose publish an environment's reviewers approve.

```ts
import { ArchiveStep, Git, type IRegistryHost, Npm, ProcessRunner, PruneStep, Tar } from "@noldova/tools.pipelines";

const processRunner = new ProcessRunner();
const git = new Git(processRunner, process.cwd());
const versions = new Set(["0.0.2", "0.0.3", "0.0.4"]);
const host: IRegistryHost = {
  registry: "https://npm.pkg.github.com/",
  readVersionsAsync: async () => [...versions],
  deleteVersionAsync: async (packageName, version) => versions.delete(version),
  readLockFilesAsync: async () => new Map([["app/package-lock.json", JSON.stringify({ packages: { "node_modules/@noldova/a": { version: "0.0.3" } } })]])
};
const step = new PruneStep(git, new ArchiveStep(git, new Tar(processRunner), new Npm(processRunner, process.cwd())), host);
const result = await step.runAsync(["0.0.4", "225059f4c1e6a3b2d8f7e9a0b1c2d3e4f5a6b7c8", "@noldova", "https://npm.pkg.github.com/", "1"]);
result.message; // "@noldova/a@0.0.3 kept, since app/package-lock.json locks it.\n@noldova/a@0.0.2 deleted." when the commit holds only @noldova/a
```

- It fails, asking the registry nothing, unless the version is a release version, the commit is its full id and in the clone, the scope holds every package the archive step expects at the commit, the registry is the host's and not npm's, and the number to keep is one.
- It lists every package's versions before it deletes any, and fails, deleting nothing, with one line for each package whose versions the host can't list and each whose newest release version isn't the version.
- When a package has more release versions than it keeps, it reads the host's lock files first, and fails, deleting nothing, when the host can't read them all or one has no `packages` object, as the lock files of npm 7 and later have.
- It keeps each of those versions that a lock file holds under a `node_modules/` path, by the folder's name or the entry's `name` for an alias, with a line naming the lock files.
- It deletes the others, with one line for each, and succeeds with one line saying nothing is deleted when no package has more; a version another run deleted first is reported, not a failure.
- It stops at the first delete that fails, with the lines before it and the host's answer, or a line naming the version with the error's message when the delete rejects, such as for a lost connection.
- It counts and deletes only release versions: a nightly version, or any other version, stays.

### The tag step

`tag <version> <commit>` ends a release: it tags the released commit `v<version>`, such as `v0.0.4`.
It reads and creates the tag through the host's `ITagHost`, which a host's package implements, such as through the host's API.

```ts
import { type ITagHost, TagStep } from "@noldova/tools.pipelines";

const tags = new Map<string, string>();
const host: ITagHost = {
  readTagAsync: async tag => tags.get(tag) ?? "",
  createTagAsync: async (tag, commit) => tags.has(tag) ? false : (tags.set(tag, commit), true)
};
const result = await new TagStep(host).runAsync(["0.0.4", "225059f4c1e6a3b2d8f7e9a0b1c2d3e4f5a6b7c8"]);
result.message; // "Tagged commit 225059f4c1e6a3b2d8f7e9a0b1c2d3e4f5a6b7c8 as v0.0.4."
```

- It fails, before asking the host, unless the version is a release version and the commit is its full id; a nightly version gets no tag.
- It creates the tag when the host has none, and succeeds, such as `Tagged commit 225059f… as v0.0.4.`
- When the tag is already there, such as from a rerun or from another run that made it first, it succeeds if the tag points to the commit, and otherwise fails, naming both commits; it never moves or deletes a tag.
- A failed answer of the host is the step's result.

### The toolchain step

`toolchain <node-version> [<npm-version>]` checks that the Node.js running it is `<node-version>` and, when given, that `npm --version` prints `<npm-version>`; an empty npm version checks none.

```ts
import { Npm, ProcessRunner, ToolchainStep } from "@noldova/tools.pipelines";

const step = new ToolchainStep(new Npm(new ProcessRunner(), process.cwd()), process.version);
const result = await step.runAsync(["24.21.0", "11.19.0"]);
result.message; // "Node.js v24.21.0 and npm 11.19.0 run this step."
```

- Each version is exact, `major.minor.patch`; anything else, such as `24` or `v24.21.0`, fails before anything is read.
- It fails with one line for each version that differs, naming the version found, the one expected and the fix.

### The line-endings step

`line-endings` takes no values and checks the files the checkout tracks, in the working directory and the folders inside it.

```ts
import { Git, LineEndingsStep, ProcessRunner } from "@noldova/tools.pipelines";

const result = await new LineEndingsStep(new Git(new ProcessRunner(), process.cwd())).runAsync([]);
result.message; // ".gitattributes holds \"* text=auto eol=lf\", and the 12 tracked text files use LF line endings and end with exactly one newline."
```

- `.gitattributes` at the checkout's root holds the line `* text=auto eol=lf`.
- Every tracked text file's committed content uses LF line endings, and the file in the checkout ends with exactly one newline; a tracked file the checkout doesn't hold is a failure.
- It reads the files' ends from the checkout, so a pipeline runs it on a checkout as committed, before the build.
- It skips symbolic links, submodules, files git sees as binary and files `.gitattributes` marks `-text` or `binary`.
- It fails with one line for each thing that is wrong, naming the file and the fix, and fails when git lists no tracked file.

### The unchanged step

`unchanged` takes no values and checks that the checkout is as committed, such as after a build and its tests: `git status --porcelain` lists nothing.
It fails with each path git lists, changed, staged or untracked outside the ignored paths, and says to undo the change or ignore the output in `.gitignore`.

```ts
import { Git, ProcessRunner, UnchangedStep } from "@noldova/tools.pipelines";

const result = await new UnchangedStep(new Git(new ProcessRunner(), process.cwd())).runAsync([]);
result.message; // "The checkout has no changed or untracked file."
```

### The reproducible step

`reproducible <folder>` runs after the build, in the checkout, and checks that a second build of the same commit packs the same archives, so that rerunning a release publishes nothing new.

```ts
import { Git, Npm, ProcessRunner, ReproducibleStep } from "@noldova/tools.pipelines";

const processRunner = new ProcessRunner();
const step = new ReproducibleStep(new Git(processRunner, process.cwd()), new Npm(processRunner, process.cwd()));
const result = await step.runAsync(["_packages"]);
result.message; // "A second build of commit 225059f…, in another folder, packed the same 2 archives byte for byte: …"
```

- It adds a worktree of the checkout's commit in a new temporary folder, runs `npm run build` there, and compares the `.tgz` archives in `<folder>`, a path from the checkout's root, with those in the worktree's.
- It succeeds listing each archive with its SHA-512, and fails with one line for each archive that differs or is in only one build.
- It fails when `<folder>` is missing or holds no archive, and when the second build fails, with npm's exit code and error output.
- It removes the worktree and its folder whether it succeeds or fails.
- It makes its temporary folder in the root its constructor is given, or in `os.tmpdir()`; give a root the pipeline host empties after each job, so a cancelled run leaves nothing behind.
- `<folder>` must be inside the checkout: an absolute path, `..` or the checkout itself fails.

### The dependents step

`dependents <version> <commit>` runs after a release, in a checkout of the released commit, and proposes the release to every repository that pins its packages exactly at an older version.
It lists, checks out, pushes to and proposes in the repositories through the host's `IUpdateHost`, which a host's package implements, such as through the host's API.

```ts
import { ArchiveStep, DependentsStep, Git, type IUpdateHost, Npm, ProcessRunner, Tar } from "@noldova/tools.pipelines";

declare const host: IUpdateHost;
const processRunner = new ProcessRunner();
const archiveStep = new ArchiveStep(new Git(processRunner, process.cwd()), new Tar(processRunner), new Npm(processRunner, process.cwd()));
const step = new DependentsStep(archiveStep, host, processRunner, new Npm(processRunner, process.cwd()));
const result = await step.runAsync(["0.0.4", "225059f4c1e6a3b2d8f7e9a0b1c2d3e4f5a6b7c8"]);
result.message; // "Looked for exact pins of @noldova/a, @noldova/b older than 0.0.4 in 2 repositories: …"
```

- It fails, before asking the host, unless the version is a release version and the commit is its full id; a nightly version moves nothing.
- It reads the packages the commit releases as the archive step does, and checks out each repository the host lists into a new temporary folder.
- In each tracked `package.json`, it moves every value that names one of those packages at an exact version older than the release, such as `"0.0.3"`; a range, such as `"^0.0.3"`, and a newer or equal version stay.
- When a released package needs another package as a peer at an exact version, it also moves the repository's exact pins of that package when older, and the description names the released package that needs each.
- Before the refresh, it leaves a repository as it is when any tracked `package-lock.json` holds another package that needs one of the moved packages, as a peer, at another exact version, and names each such package and the version it needs; npm couldn't install the moved pins until that package accepts them.
- After the refresh, it leaves the repository as it is, without chasing further, when a refreshed lock file still holds a package whose exact peer differs from the version it locks, and names each.
- When it moved any, it refreshes every tracked `package-lock.json` with `npm install --package-lock-only --ignore-scripts`, without the host's credential variables, and, on Linux and macOS, stops a refresh that runs longer than 5 minutes, which fails that repository; it then commits, pushes the branch `pipelines/update-<source>` and proposes it with the moved pins and the release's notes; a repository that pins none is left as it is.
- When the branch exists, it replaces it only while the branch is at a commit of its own, with its title and the same committer; a branch with anyone else's commit is left as it is, and that repository fails, so nobody's work is lost.
- It succeeds with one line for each repository, and fails, after trying every other repository, with the line of each that failed; an error in one repository, such as git failing, is that repository's line.
- Given an output, it writes each repository's line there instead, as a success or a failure, as soon as that repository is done, so a run stopped partway still shows the repositories it finished; its result's message is then only the summary.
- It removes its temporary folder whether it succeeds or fails, and makes it in the root its constructor is given, or in `os.tmpdir()`.

### The pins step

`pins <version> <commit>` runs after a shared repository of workflows tags `v<version>` at the commit, in a clone that holds the commit, and proposes the tag to every repository that pins its workflows at an older version.
It works through the host's `IUpdateHost`, as the dependents step does.

```ts
import { Git, type IUpdateHost, PinsStep, ProcessRunner } from "@noldova/tools.pipelines";

declare const host: IUpdateHost;
const processRunner = new ProcessRunner();
const step = new PinsStep(new Git(processRunner, process.cwd()), host, processRunner);
const result = await step.runAsync(["1.2.0", "225059f4c1e6a3b2d8f7e9a0b1c2d3e4f5a6b7c8"]);
result.message; // "Looked for pins on .github's workflows older than v1.2.0 in 2 repositories: …"
```

- It fails, before asking the host, unless the version is a release version and the commit is its full id.
- It reads the outside actions the commit's `.github/workflows` pin as `uses: <action>@<commit> # v<version>`, keeping the highest version of each.
- It leaves a repository with a tracked `.github/dependabot.yml` or `.github/dependabot.yaml` to Dependabot.
- In each other repository's tracked `.github/workflows/*.yml` and `*.yaml`, it moves each `uses: <owner>/<source>/<path>@<commit>`, with that repository's owner, to the new commit and `# v<version>` when its version comment is older within the same major version, or missing; a pin a major version behind stays, and the repository's line and the proposal name it.
- It moves each outside action pinned at an older version than the shared repository's to the shared one's commit and version.
- When it moved any, it commits, pushes the branch `pipelines/pins-<source>` and proposes it with the moved and the left pins and the release's notes; the branch, the lines, the output and the temporary folder work as in the dependents step.

The declaration file `api/index.d.ts` documents every member with its contract and examples.

## License

MIT; see `LICENSE`.
