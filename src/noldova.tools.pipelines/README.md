# @noldova/tools.pipelines

The steps of a build and release pipeline that work the same on any host.
This first version holds the version model the steps share: `Version` reads, compares and writes releases of the form `major.minor.patch` and nightly versions of the form `major.minor.patch-nightly.YYYYMMDD`.

## Install

```bash
npm install @noldova/tools.pipelines
```

## Use

```ts
import { Version } from "@noldova/tools.pipelines";

const current = Version.parse("0.0.3");
const next = new Version(current.major, current.minor, current.patch + 1);

next.toString(); // "0.0.4"
next.compareTo(current); // 1

const nightly = new Version(next.major, next.minor, next.patch, "20261101");

nightly.toString(); // "0.0.4-nightly.20261101"
nightly.compareTo(next); // -1, a nightly version comes before its release
```

`Version.parse` and the constructor throw `VersionException` for a text or a part that isn't a version.
The declaration file `api/index.d.ts` documents every member with its contract and examples.

## License

MIT; see `LICENSE`.
