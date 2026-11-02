# @noldova/tools.pipelines.github

Runs the steps of `@noldova/tools.pipelines` on GitHub Actions.
This version holds `pipelines`, the command line a workflow calls, with the source, archive, publish, nightly, prune, tag, toolchain, line-endings, unchanged, reproducible and dependents steps, and the prune, tag and dependents steps' access to GitHub.

## Install

```bash
npm install @noldova/tools.pipelines.github
```

## Use

### In a workflow

A job installs the package at an exact version, without install scripts, and calls `pipelines` with a step's name and values in the checkout:

```yaml
- run: npm install --global --ignore-scripts @noldova/tools.pipelines.github@0.0.3
- run: pipelines source "$VERSION" "$COMMIT"
- id: nightly
  run: |
    version="$(pipelines nightly "$COMMIT" https://registry.npmjs.org/)"
    echo "version=$version" >> "$GITHUB_OUTPUT"
```

| Step | Values |
|---|---|
| `source` | `<version> <commit>` |
| `archive` | `<folder> <version> <commit> <scope>` |
| `publish` | `<folder> <version> <commit> <scope> <registry> <access>` |
| `nightly` | `<commit> <registry>` |
| `prune` | `<version> <commit> <scope> <registry> <keep-versions>` |
| `tag` | `<version> <commit>` |
| `toolchain` | `<node-version> [<npm-version>]` |
| `line-endings` | none |
| `unchanged` | none |
| `reproducible` | `<folder>` |
| `dependents` | `<version> <commit>` |

`@noldova/tools.pipelines`'s README says what each step checks and does.
The reproducible and dependents steps make their temporary folders in `RUNNER_TEMP`, which the runner empties after each job, cancelled ones included.

- A step that succeeds writes its message to standard output and exits with code `0`; an empty message, such as the nightly step's when nothing changed, writes nothing.
- A step that fails writes its message as one error annotation, which the run's summary shows, and exits with code `1`; so does a first value that names no step, with the usage line of every step.
- The annotation goes to standard error, which GitHub Actions reads workflow commands from as it does standard output, so a step whose output the workflow keeps, such as the nightly version above, still shows it.
- A fault, such as git failing to start, ends the run with its stack trace and exit code `1`.

### The tag step

`pipelines tag <version> <commit>` tags the released commit `v<version>` through GitHub's REST API, and never moves a tag.
It reads `GITHUB_API_URL` and `GITHUB_REPOSITORY`, which GitHub Actions sets, and `GITHUB_TOKEN`, which the workflow passes in; the token needs to write the repository's contents, and is never written anywhere:

```yaml
- env:
    GITHUB_TOKEN: ${{ github.token }}
  run: pipelines tag "$VERSION" "$COMMIT"
```

The job needs `permissions: contents: write`.
The step fails, naming the variable, when one is missing or empty, and with the request, the status and GitHub's message for an answer it doesn't expect, such as a missing permission.

### The prune step

`pipelines prune <version> <commit> <scope> <registry> <keep-versions>` deletes each package's older release versions on GitHub Packages, `https://npm.pkg.github.com/`, keeping the newest `<keep-versions>`; for any other registry it fails and deletes nothing.
A package `@<owner>/<name>` is the npm package `<name>` of the organization `<owner>`, so the scope is the organization's.
It runs in a checkout of the commit, and reads `GITHUB_API_URL`, which GitHub Actions sets, and `GITHUB_TOKEN`, which the workflow passes in; the token needs to delete the packages' versions, and is never written anywhere:

```yaml
- env:
    GITHUB_TOKEN: ${{ github.token }}
  run: pipelines prune "$VERSION" "$COMMIT" @noldova-com https://npm.pkg.github.com/ 5
```

The job needs `permissions: packages: write`, and, since the step deletes, an environment whose reviewers approve each run.
The step fails, naming the variable, when one is missing or empty, and with the request, the status and GitHub's message for an answer it doesn't expect, such as GitHub refusing to delete a package's last version.
A 404 to a delete counts as a version already deleted only when GitHub's list no longer has it; otherwise the step fails.

### The dependents step

`pipelines dependents <version> <commit>` proposes a release to the repositories that pin its packages, each in a pull request from the branch `pipelines/update-<repository>`, where `<repository>` is the releasing repository's name.
It runs in a checkout of the released commit, and reads `GITHUB_API_URL`, `GITHUB_SERVER_URL` and `GITHUB_REPOSITORY`, which GitHub Actions sets, and `GITHUB_TOKEN`, which the workflow passes in:

```yaml
- env:
    GITHUB_TOKEN: ${{ steps.app-token.outputs.token }}
    GIT_AUTHOR_NAME: example[bot]
    GIT_AUTHOR_EMAIL: 1+example[bot]@users.noreply.github.com
    GIT_COMMITTER_NAME: example[bot]
    GIT_COMMITTER_EMAIL: 1+example[bot]@users.noreply.github.com
  run: pipelines dependents "$VERSION" "$COMMIT"
```

- The token is a GitHub App installation's: the repositories the installation is given are the ones the step checks, except the releasing repository and archived ones.
  It needs to write their contents, pull requests and issues, and is never written anywhere: git gets it through its environment, not its command line.
- The workflow sets the commits' author and committer, such as the App's bot account, through git's environment.
- npm refreshes each repository's lock files from the registries that repository names; one that needs a token to read gets it from the workflow, as for an install.
- The release notes are the section of the pull request that merged the commit headed `Release notes for <version>`; without one, the proposal has none.
- When a pull request from the branch is already open, the step pushes over the branch and updates that pull request and its issue; otherwise it opens an issue and a pull request that closes it, against the repository's default branch.
- The step fails, naming the variable, when one is missing or empty; it fails for a repository, after trying every other, with git's exit code and error output, or with the request, the status and GitHub's message for an answer it doesn't expect.

### When GitHub is briefly unavailable

The prune, tag and dependents steps send a request again, up to two more times, waiting 5 and then 15 seconds, when GitHub answers 502, 503 or 504, doesn't answer within a minute, or the connection fails.
A failing answer with a `Retry-After` header of up to 60 seconds is sent again too, after that wait, such as a 403 for a rate limit.
Any other answer comes back at once, such as a 403 or 404 without that header, or any answer with a longer `Retry-After`.
The last answer, timeout or failed connection is what the step reports, naming the request.
These retries count per request, and nothing bounds a step's requests together, so the job's `timeout-minutes` is the bound; since a request can be sent twice, a rerun is safe.

A create or delete that GitHub carried out but whose answer was lost is sent again, and is done, not a failure: the tag step finds the tag at the commit after GitHub refuses the second create, and the prune step reports the version as already deleted after a 404 and a new list without it.

### From code

```ts
import { GitHubStepOutput, PipelinesProgram } from "@noldova/tools.pipelines.github";

const program = new PipelinesProgram(new GitHubStepOutput(process.stdout, process.stderr));
process.exitCode = await program.runAsync(["source", "0.0.4", "225059f4c1e6a3b2d8f7e9a0b1c2d3e4f5a6b7c8"]);
```

The declaration file `api/index.d.ts` documents every member with its contract and examples.

## License

MIT; see `LICENSE`.
