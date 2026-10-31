# Tools

Development tools from Noldova.

## Packages

| Package | What it is |
|---|---|
| `@noldova/tools.pipelines` | The steps of a build and release pipeline that work the same on any host: checks of the commit and its version, checks of the packed archives, and publishing them to npm |
| `@noldova/tools.pipelines.github` | Runs those steps on GitHub Actions: the command line a workflow calls, GitHub's environment, tags and annotations |

How to install and use each package comes with its first release.

## Checks

Every pull request into `main` must pass its checks before it merges.

| Check | What it verifies |
|---|---|
| Check / Linked issue | `.github/workflows/require-linked-issue.yml`, the "PR" workflow: the PR description has a standalone `Issue: #N`, `Issue #N` or closing reference, such as `Closes #N`, that names an issue in this repository. |

## Contributing

Report bugs and ideas in this repository's issues; pull requests come from the maintainers.
[Noldova's contributing guide](https://github.com/noldova-com/.github/blob/main/CONTRIBUTING.md) and [security policy](https://github.com/noldova-com/.github/blob/main/SECURITY.md) apply here.

## License

MIT; see [LICENSE](LICENSE).
