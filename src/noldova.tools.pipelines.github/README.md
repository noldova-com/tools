# @noldova/tools.pipelines.github

Runs the steps of `@noldova/tools.pipelines` on GitHub Actions.
This version holds `pipelines`, the command line a workflow calls, with the source, archive, publish and nightly steps.

## Install

```bash
npm install @noldova/tools.pipelines.github
```

## Use

### In a workflow

A job installs the package at an exact version, without install scripts, and calls `pipelines` with a step's name and values in the checkout:

```yaml
- run: npm install --global --ignore-scripts @noldova/tools.pipelines.github@0.0.1
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

`@noldova/tools.pipelines`'s README says what each step checks and does.

- A step that succeeds writes its message to standard output and exits with code `0`; an empty message, such as the nightly step's when nothing changed, writes nothing.
- A step that fails writes its message as one error annotation, which the run's summary shows, and exits with code `1`; so does a first value that names no step, with the usage line of every step.
- The annotation goes to standard error, which GitHub Actions reads workflow commands from as it does standard output, so a step whose output the workflow keeps, such as the nightly version above, still shows it.
- A fault, such as git failing to start, ends the run with its stack trace and exit code `1`.

### From code

```ts
import { GitHubStepOutput, PipelinesProgram } from "@noldova/tools.pipelines.github";

const program = new PipelinesProgram(new GitHubStepOutput(process.stdout, process.stderr));
process.exitCode = await program.runAsync(["source", "0.0.4", "225059f4c1e6a3b2d8f7e9a0b1c2d3e4f5a6b7c8"]);
```

The declaration file `api/index.d.ts` documents every member with its contract and examples.

## License

MIT; see `LICENSE`.
