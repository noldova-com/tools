# Tools

Development tools from Noldova.

## Packages

| Package | What it is |
|---|---|
| `@noldova/tools.pipelines` | The steps of a build and release pipeline that work the same on any host: checks of the commit and its version, checks of the packed archives, and publishing them to npm |
| `@noldova/tools.pipelines.github` | Runs those steps on GitHub Actions: the command line a workflow calls, GitHub's environment, tags and annotations |

[documents/ARCHITECTURE.md](documents/ARCHITECTURE.md) lists what each package owns.
Each package lives in `src/`, in a folder named after it, such as `src/noldova.tools.pipelines` for `@noldova/tools.pipelines`, and its README says how to install and use it.

## Build and test

The toolchain is Node.js 24.21.0 with npm 11.19.0, as `package.json` pins them.

```bash
npm run build
```

```bash
npm test
```

`npm run build` installs the locked development packages, TypeScript, Node.js's type declarations, the test runner `@noldova/context.testing` and `@noldova/context.json`, which the build and the packages read JSON with, without running their install scripts; then it builds, packs and installs every package into `_build/` and `_packages/`.
Every package takes its version from `version.json` at the repository's root, such as `{ "version": "0.0.1" }`, or from the `--version` option, such as for a nightly version:

```bash
npm run build -- --version 0.0.5-nightly.20261102
```

The build writes the checkout's head commit into every package's `package.json` as `gitHead`, so each published version names the commit it was built from; it fails before building when it can't read the commit or doesn't run at the root of a git checkout.
`npm test` runs every package's tests and fails unless they cover all of the packages' source.
Two options shorten its output, as the CI run uses them:

```bash
npm test -- --skip-test-details --skip-coverage-details
```

- `--skip-test-details` hides the line of each passing test; failures, skipped tests and the totals still print.
- `--skip-coverage-details` hides the coverage rows of fully covered files; files with gaps and the overall row still print.

## Checks

Every pull request into `main` must pass its checks before it merges.

| Check | What it verifies |
|---|---|
| Check / Linked issue | `.github/workflows/require-linked-issue.yml`, the "PR" workflow: the PR description has a standalone `Issue: #N`, `Issue #N` or closing reference, such as `Closes #N`, that names an issue in this repository. |
| Check / Runner / Versions | The shared check's own call of the shared settings, which name the runner "Check / Linked issue" uses. |
| Versions / Versions | The organization's shared settings, `.github`'s `versions.yml`, name the Node.js and npm versions and the runner for each target that "Build and test" uses. |
| Linux x64 | `.github/workflows/build-and-test.yml`, the "Build and test" workflow: one job, on the GitHub-hosted runner the shared settings name for Linux x64, with the Node.js and npm versions they name; `.gitattributes` holds `* text=auto eol=lf`, and every tracked text file uses LF line endings and ends with exactly one newline; `npm run build` installs the locked packages with `npm ci --ignore-scripts`, then builds, packs and installs every package, `npm test` runs every test with the coverage gate, and both leave every tracked file unchanged; a second build of the same commit, in another folder, packs byte-identical archives; and the tool, installed from the packed archives into a folder of its own as the release workflow installs it, checks them from a depth-1 checkout of the commit with `pipelines archive`. |
| All targets | Passes only when "Versions / Versions" and "Linux x64" pass. |

## Releases

A maintainer releases both packages with the "Release npm packages" workflow, `.github/workflows/release-npm.yml`, started from `main` with the version, which `version.json` holds at the commit, and the full id of the commit on `main`: in the repository's Actions tab, choose "Release npm packages", then "Run workflow" on `main`, or run

```bash
gh workflow run release-npm.yml --ref main -f version=<version> -f commit=<full commit id>
```

It runs only from `main`, on GitHub-hosted runners, with the tool built from the commit itself, and takes the registry, the scope and the access from the shared versions workflow:

| Job | What it does |
|---|---|
| Check and build | With read access only: checks that the commit is on `main`, builds the packages, checks the source with `pipelines source` and the archives with `pipelines archive`, and keeps the archives for the next jobs. |
| Publish to npm | Waits in the `release` environment, which npm's trusted publishing names, for a reviewer's approval; then checks the commit out, installs the tool from the checked archives, and checks and publishes them with `pipelines publish` to npm's registry, public, with provenance, through trusted publishing: npm takes the job's ID token, and no npm token is stored. |
| Tag the commit | With write access to the contents: tags the commit `v<version>` with `pipelines tag`, and passes when the tag is already there. |

A rerun never publishes a version twice: the publish step skips a version the registry already holds from the same archive, and fails when it holds a different one.
"Re-run failed jobs" publishes the archives the first attempt checked.
"Re-run all jobs" builds and packs the commit again, and the "Build and test" workflow checks that a second build of a commit packs byte-identical archives, so a rerun of a release that was published passes without publishing anything.

## Contributing

Report bugs and ideas in this repository's issues; pull requests come from the maintainers.
[Noldova's contributing guide](https://github.com/noldova-com/.github/blob/main/CONTRIBUTING.md) and [security policy](https://github.com/noldova-com/.github/blob/main/SECURITY.md) apply here.

## License

MIT; see [LICENSE](LICENSE).
