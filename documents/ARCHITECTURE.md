# Tools architecture

**Scope:** The packages' boundaries and the code rules only this repository has, on top of the organization's [standards](https://github.com/noldova-com/.github/blob/main/standards/AGENTS.md)

Noldova's [standards](https://github.com/noldova-com/.github/blob/main/standards/AGENTS.md) apply here in full.
This document holds only what is this repository's own; a rule here that is stricter than a standard says so.

## 1. Packages

| Package | Owns |
|---|---|
| `@noldova/tools.pipelines` | The steps that work the same on any pipeline host: git checks of the commit and its version, checks of the packed archives, npm publishing and the wait until the registry serves a version, versions, and the command-line base the steps share |
| `@noldova/tools.pipelines.github` | Running those steps on GitHub Actions: the command line a workflow calls, reading GitHub's environment, tags through GitHub's REST API, and GitHub's annotations |

- `tools.pipelines.github` depends on `tools.pipelines`, never the reverse.
- `tools.pipelines` names no pipeline host.
  What a step needs from the host, such as where it runs or how a tag is made, it asks through an interface it declares and the host's package implements.
- Another host gets its own package beside GitHub's, built on the same steps.
- Neither package names a product or a repository that uses it.
  What differs between repositories, such as their packages and where their version is kept, comes in as settings.

## 2. Running in a pipeline

- The packages have no third-party runtime dependencies, so a pipeline job installs nothing but them.
  This is stricter than the TypeScript standard's [Dependencies](https://github.com/noldova-com/.github/blob/main/standards/stacks/TYPESCRIPT.md#dependencies), which allows pinned ones.
- Each step checks before it acts.
  When a check fails, the step stops with a message that says what is wrong and exits with code 1, without a stack trace.
- No step deletes or overwrites a published version.
