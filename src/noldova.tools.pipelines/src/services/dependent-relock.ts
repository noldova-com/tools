/**
 * @license
 * Copyright (c) Noldova.
 *
 * This source code is licensed under the license found in the
 * LICENSE file in the root directory of this source tree.
 */


import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

import { ProcessException } from "../exceptions/process.exception.js";
import type { DependentsUpdate, PinTarget } from "../models/dependents-update.js";
import type { ProcessResult } from "../models/process-result.js";
import { RelockedFiles } from "../models/relocked-files.js";
import { StepResult } from "../models/step-result.js";
import { Version } from "../models/version.js";
import { Resources } from "../resources.js";
import { Git } from "./git.js";
import type { Npm } from "./npm.js";
import type { ProcessRunner } from "./process-runner.js";

interface LockFile {
  readonly packages?: Readonly<Record<string, LockedPackage>>;
}

interface LockedPackages {
  readonly packages: Readonly<Record<string, LockedPackage>>;
}

interface LockedPackage {
  readonly version: string;
  readonly peer?: boolean;
  readonly dependencies?: Readonly<Record<string, string>>;
  readonly optionalDependencies?: Readonly<Record<string, string>>;
  readonly peerDependencies?: Readonly<Record<string, string>>;
}

interface PinMove {
  readonly packageName: string;
  readonly line: string;
}

interface Manifest {
  readonly name?: string;
  readonly dependencies?: Readonly<Record<string, string>>;
  readonly devDependencies?: Readonly<Record<string, string>>;
  readonly optionalDependencies?: Readonly<Record<string, string>>;
}

interface OwnPin {
  readonly field: string;
  readonly manifestPaths: readonly string[];
}

interface OwnLock {
  readonly lockFilePath: string;
  readonly pins: ReadonlyMap<string, OwnPin>;
}

interface PeerChase {
  readonly moves: readonly PinMove[];
  readonly misses: readonly string[];
}

interface NeededPeer {
  readonly peerName: string;
  readonly peerVersion: string;
  readonly movedVersion: string;
}

export class DependentRelock {
  private readonly processRunner: ProcessRunner;
  private readonly npm: Npm;
  private readonly credentialVariables: readonly string[];

  public constructor(processRunner: ProcessRunner, npm: Npm, credentialVariables: readonly string[]) {
    this.processRunner = processRunner;
    this.npm = npm;
    this.credentialVariables = credentialVariables;
  }

  public async relockAsync(update: DependentsUpdate, repository: string, directory: string, lockScripts: ReadonlyMap<string, string>): Promise<StepResult | RelockedFiles> {
    const git = new Git(this.processRunner, directory);
    const filePaths = (await git.listTrackedFilesAsync()).map(t => t.filePath);
    const manifestPaths = filePaths.filter(t => path.posix.basename(t) === Resources.manifestFileName);
    const lockFilePaths = filePaths.filter(t => path.posix.basename(t) === Resources.lockFileName);
    const unknown = [...lockScripts.keys()].filter(t => !lockFilePaths.includes(t));
    if (unknown.length > 0)
      return StepResult.failed(Resources.formatRepositoryFailed(repository, Resources.formatLockScriptsUntracked(unknown)));

    const before = DependentRelock.readFiles(directory, [...manifestPaths, ...lockFilePaths]);
    const released = update.packageNames.map(t => ({ packageName: t, version: update.version, reason: null, range: null }));
    const moves = manifestPaths.flatMap(t => DependentRelock.movePins(path.join(directory, t), t, released));
    if (moves.length === 0)
      return StepResult.succeeded(Resources.formatRepositoryUnpinned(repository, update.version));

    const notObjects = manifestPaths.filter(t => !DependentRelock.isObject(JSON.parse(fs.readFileSync(path.join(directory, t), Resources.textEncoding))));
    if (notObjects.length > 0)
      return StepResult.failed(Resources.formatRepositoryFailed(repository, Resources.formatManifestsNotObjects(notObjects)));

    const unmanifested = lockFilePaths.filter(t => !lockScripts.has(t) && !manifestPaths.includes(path.posix.join(path.posix.dirname(t), Resources.manifestFileName)));
    if (unmanifested.length > 0)
      return StepResult.failed(Resources.formatRepositoryFailed(repository, Resources.formatLockManifestsUntracked(unmanifested)));

    const rangeMoves = manifestPaths.flatMap(t => DependentRelock.moveRanges(path.join(directory, t), t, update.packageNames, update.packageNames, update.version));
    const refusals: string[] = [];
    const releasedRangeMoves = manifestPaths.flatMap(t => DependentRelock.movePeerRanges(path.join(directory, t), t, released, refusals));
    const peerMoves = manifestPaths.flatMap(t => DependentRelock.movePins(path.join(directory, t), t, update.peerPins));
    const peerRangeMoves = manifestPaths.flatMap(t => DependentRelock.movePeerRanges(path.join(directory, t), t, update.peerPins, refusals));
    const expected = new Map([...released, ...update.peerPins.filter(t => peerMoves.some(m => m.packageName === t.packageName))].map(t => [t.packageName, t.version]));
    const moved = new Map([...expected].filter(([t]) => [...moves, ...peerMoves].some(m => m.packageName === t)));
    for (const { packageName, version } of update.peerPins.filter(t => t.range === t.version && !moved.has(t.packageName)))
      moved.set(packageName, version);
    const outside = DependentRelock.findOutside(directory, manifestPaths, update.peerPins);
    const chase = await this.chasePeersAsync(directory, manifestPaths, moved);
    for (const [packageName, version] of moved)
      expected.set(packageName, version);
    if (outside.length + refusals.length + chase.misses.length > 0)
      return StepResult.failed(Resources.formatRepositoryUnmatched(repository, update.version, [...outside, ...refusals, ...chase.misses]));

    const blockers = lockFilePaths.flatMap(t => DependentRelock.findConflicts(path.join(directory, t), t, expected));
    if (blockers.length > 0)
      return StepResult.failed(Resources.formatRepositoryBlocked(repository, update.version, blockers));

    const owners = DependentRelock.readOwners(directory, manifestPaths);
    const ownLocks = lockFilePaths.filter(t => !lockScripts.has(t)).flatMap(t => DependentRelock.findOwnLock(directory, t, owners));
    const shared = new Map(ownLocks.flatMap(t => [...t.pins]).filter(([, t]) => t.manifestPaths.length > 1)
      .map(([packageName, t]) => [packageName, Resources.formatOwnManifests(packageName, t.manifestPaths)]));
    if (shared.size > 0)
      return StepResult.failed(Resources.formatRepositoryOwnShared(repository, update.version, [...shared.values()]));

    const allMoves = [...moves, ...rangeMoves, ...releasedRangeMoves, ...peerMoves, ...peerRangeMoves, ...chase.moves];
    const movedNames = new Set(allMoves.map(t => t.packageName));
    for (const lockFilePath of [...lockFilePaths.filter(t => !lockScripts.has(t)), ...lockFilePaths.filter(t => lockScripts.has(t))]) {
      const script = lockScripts.get(lockFilePath);
      const ownLock = ownLocks.find(t => t.lockFilePath === lockFilePath);
      const keptPeers = ownLock === undefined ? [] : DependentRelock.readKeptPeers(path.join(directory, lockFilePath), movedNames);
      DependentRelock.unlockMoved(path.join(directory, lockFilePath), movedNames);
      const result = script !== undefined
        ? await this.npm.runScriptAsync(directory, script, this.credentialVariables)
        : ownLock === undefined
          ? await this.npm.lockAsync(path.join(directory, path.dirname(lockFilePath)), this.credentialVariables)
          : await this.lockOwnAsync(directory, ownLock, owners);
      if (!result.isSuccessful)
        return StepResult.failed(Resources.formatRepositoryFailed(repository, script === undefined
          ? Resources.formatLockFailed(lockFilePath, result.exitCode, result.errorOutput)
          : Resources.formatLockScriptFailed(lockFilePath, script, result.exitCode, result.errorOutput.trim().length > 0 ? result.errorOutput : Resources.keepLastOutputLines(result.output))));

      const lost = DependentRelock.findLost(path.join(directory, lockFilePath), keptPeers);
      if (lost.length > 0)
        return StepResult.failed(Resources.formatRepositoryPeersLost(repository, update.version, lockFilePath, lost));
    }

    const conflicts = lockFilePaths.flatMap(t => DependentRelock.findConflicts(path.join(directory, t), t, null));
    if (conflicts.length > 0)
      return StepResult.failed(Resources.formatRepositoryConflicted(repository, update.version, conflicts));

    const nested = lockFilePaths.flatMap(t => DependentRelock.findNested(path.join(directory, t), t, expected));
    if (nested.length > 0)
      return StepResult.failed(Resources.formatRepositoryNested(repository, update.version, nested));

    const after = DependentRelock.readFiles(directory, [...manifestPaths, ...lockFilePaths]);
    const lockLines = lockFilePaths.map(t => {
      const script = lockScripts.get(t);

      return script === undefined ? Resources.formatLocked(t) : Resources.formatScriptLocked(t, script);
    });

    return new RelockedFiles(await git.readHeadAsync(), allMoves.map(t => t.line), [...lockLines, ...ownLocks.map(t => Resources.formatOwnLocked(t.lockFilePath, [...t.pins.keys()]))],
      Object.fromEntries([...after].filter(([t, text]) => before.get(t) !== text)));
  }

  // Relocks a folder that pins the repository's own unpublished packages: each one, and each own package it reaches,
  // resolves from a stand-in archive built from its tracked manifest, so npm never asks the registry for it; then the
  // lock leaves out every entry at or under an own package, and its root entry keeps the folder's pins. A stand-in
  // names no peers, so npm installs none for an own package, as a lock made with --legacy-peer-deps holds none.
  private async lockOwnAsync(directory: string, ownLock: OwnLock, owners: ReadonlyMap<string, readonly string[]>): Promise<ProcessResult> {
    const folder = path.join(directory, path.dirname(ownLock.lockFilePath));
    const manifestPath = path.join(folder, Resources.manifestFileName);
    const standIns = `${directory}${Resources.standInFolderSuffix}`;
    fs.mkdirSync(standIns, { recursive: true });
    const text = fs.readFileSync(manifestPath, Resources.textEncoding);
    const manifest: Record<string, unknown> = JSON.parse(text);
    for (const [index, [packageName, pin]] of [...ownLock.pins].entries()) {
      const archive = path.join(standIns, `${index}${Resources.archiveFileExtension}`);
      DependentRelock.writeStandIn(archive, DependentRelock.createStandIn(packageName, pin.manifestPaths.map(t => DependentRelock.readManifest(directory, t)), owners));
      for (const name of Resources.lockedDependencyFields) {
        const specifiers = DependentRelock.readField(manifest, name);
        if (name === pin.field)
          specifiers[packageName] = `${Resources.archiveSpecifierPrefix}${path.relative(folder, archive).split(path.sep).join(path.posix.sep)}`;
        else
          delete specifiers[packageName];
        if (Object.keys(specifiers).length > 0)
          manifest[name] = specifiers;
        else
          delete manifest[name];
      }
    }

    fs.writeFileSync(manifestPath, JSON.stringify(manifest));
    try {
      const result = await this.npm.lockAsync(folder, this.credentialVariables);
      if (result.isSuccessful)
        DependentRelock.leaveOutOwn(path.join(directory, ownLock.lockFilePath), new Set(ownLock.pins.keys()), JSON.parse(text));

      return result;
    }
    finally {
      fs.writeFileSync(manifestPath, text);
    }
  }

  // Moves, until nothing more moves, every exact pin older than the exact peer a moved package's new version needs,
  // and every exact pin whose version needs a moved package at another exact version, to the first later version that
  // needs the moved versions; adds what it moves to the moved packages. It leaves the pins of the repository's own
  // packages, which its own next release moves. A pin newer than an exact peer a moved package needs, a moved package
  // another one needs at another exact version, or a pin with no later version that needs the moved versions, is a
  // miss.
  private async chasePeersAsync(directory: string, manifestPaths: readonly string[], moved: Map<string, string>): Promise<PeerChase> {
    const peers = new Map<string, ReadonlyMap<string, string>>();
    const moves: PinMove[] = [];
    const queue = [...moved];
    const own = new Set(manifestPaths.flatMap(t => DependentRelock.readManifest(directory, t).name ?? []));
    const isSettled = (packageName: string): boolean => moved.has(packageName) || own.has(packageName);
    const move = (packageName: string, version: string, reason: string): void => {
      const pinMoves = manifestPaths.flatMap(t => DependentRelock.movePins(path.join(directory, t), t, [{ packageName, version, reason, range: null }]));
      if (pinMoves.length === 0)
        return;

      moved.set(packageName, version);
      queue.push([packageName, version]);
      moves.push(...pinMoves);
    };
    for (;;) {
      const misses: string[] = [];
      for (let next = queue.shift(); next !== undefined; next = queue.shift()) {
        const [packageName, version] = next;
        for (const [peerName, peerVersion] of await this.readPeersAsync(directory, packageName, version, peers)) {
          const movedVersion = moved.get(peerName);
          if (movedVersion !== undefined && movedVersion !== peerVersion)
            misses.push(Resources.formatPeerMovedElsewhere(peerName, movedVersion, peerVersion, packageName, version));
          if (isSettled(peerName))
            continue;

          const needed = Version.parse(peerVersion);
          const newer = DependentRelock.readExactPins(directory, manifestPaths).filter(([t, pinned]) => t === peerName && Version.parse(pinned).compareTo(needed) > 0);
          if (newer.length > 0)
            misses.push(...newer.map(([, pinned]) => Resources.formatPeerNewer(peerName, pinned, peerVersion, packageName, version)));
          else
            move(peerName, peerVersion, Resources.formatPeerReason(packageName, version));
        }
      }

      for (const [packageName, version] of DependentRelock.readExactPins(directory, manifestPaths).filter(([t]) => !isSettled(t))) {
        const needed = DependentRelock.findNeeded(await this.readPeersAsync(directory, packageName, version, peers), moved);
        const [first] = needed;
        if (first === undefined)
          continue;

        const match = await this.findMatchingAsync(directory, packageName, version, needed, moved, peers);
        if (match === null)
          misses.push(...needed.map(t => Resources.formatPeerUnmatched(packageName, version, t.peerName, t.peerVersion, t.movedVersion)));
        else
          move(packageName, match, Resources.formatPeerMatchReason(first.peerName, first.movedVersion));
      }
      if (misses.length > 0 || queue.length === 0)
        return { moves, misses };
    }
  }

  private async findMatchingAsync(directory: string, packageName: string, version: string, needed: readonly NeededPeer[], moved: ReadonlyMap<string, string>,
    peers: Map<string, ReadonlyMap<string, string>>): Promise<string | null> {
    const pinned = Version.parse(version);
    const candidates = DependentRelock.readVersions(await this.viewAsync(directory, packageName, Resources.npmVersionsField))
      .filter(t => Resources.exactVersionPattern.test(t) && Version.parse(t).compareTo(pinned) > 0)
      .sort((a, b) => Version.parse(a).compareTo(Version.parse(b)));
    for (const candidate of candidates) {
      const candidatePeers = await this.readPeersAsync(directory, packageName, candidate, peers);
      if (needed.every(t => candidatePeers.get(t.peerName) === t.movedVersion) && DependentRelock.findNeeded(candidatePeers, moved).length === 0)
        return candidate;
      if (needed.some(t => Version.parse(candidatePeers.get(t.peerName) ?? t.peerVersion).compareTo(Version.parse(t.movedVersion)) > 0))
        return null;
    }

    return null;
  }

  private async readPeersAsync(directory: string, packageName: string, version: string, peers: Map<string, ReadonlyMap<string, string>>): Promise<ReadonlyMap<string, string>> {
    const specifier = Resources.formatSpecifier(packageName, version);
    const known = peers.get(specifier);
    if (known !== undefined)
      return known;

    const value = await this.viewAsync(directory, specifier, Resources.peerDependenciesField);
    const found = new Map(typeof value === "object" && value !== null && !Array.isArray(value)
      ? Object.entries(value).filter((t: [string, unknown]): t is [string, string] => typeof t[1] === "string" && Resources.exactVersionPattern.test(t[1]))
      : []);
    peers.set(specifier, found);

    return found;
  }

  private async viewAsync(directory: string, specifier: string, field: string): Promise<unknown> {
    const result = await this.npm.viewInAsync(directory, specifier, field, this.credentialVariables);
    if (result.isSuccessful)
      return result.output.trim().length === 0 ? null : JSON.parse(result.output);
    if (result.output.includes(Resources.npmNotFoundCode) || result.errorOutput.includes(Resources.npmNotFoundCode))
      return null;

    throw new ProcessException(Resources.npmProgram, Resources.formatNpmFailed(specifier, Resources.npmViewValues, result.exitCode, result.errorOutput));
  }

  private static readVersions(value: unknown): readonly string[] {
    if (typeof value === "string")
      return [value];

    return Array.isArray(value) ? value.filter((t: unknown): t is string => typeof t === "string") : [];
  }

  private static findNeeded(peers: ReadonlyMap<string, string>, moved: ReadonlyMap<string, string>): readonly NeededPeer[] {
    return [...peers].flatMap(([peerName, peerVersion]) => {
      const movedVersion = moved.get(peerName);

      return movedVersion === undefined || movedVersion === peerVersion ? [] : [{ peerName, peerVersion, movedVersion }];
    });
  }

  // Names each exact pin of a target the released packages accept only within a range, or at one version, that stays
  // outside it once the older pins moved: a newer pin, which the release can't move back.
  private static findOutside(directory: string, manifestPaths: readonly string[], targets: readonly PinTarget[]): readonly string[] {
    const pins = DependentRelock.readExactPins(directory, manifestPaths);

    return targets.flatMap(({ packageName, reason, range }) => range === null || reason === null ? [] : pins
      .filter(([name, pinned]) => name === packageName && !DependentRelock.accepts(range, pinned))
      .map(([, pinned]) => Resources.formatPinOutside(packageName, pinned, range, reason)));
  }

  private static accepts(range: string, version: string): boolean {
    const [, lowest, refused] = Resources.exactRangePattern.exec(range) ?? [];
    if (lowest === undefined || refused === undefined)
      return range === version;

    const pinned = Version.parse(version);

    return pinned.compareTo(Version.parse(lowest)) >= 0 && pinned.compareTo(Version.parse(refused)) < 0;
  }

  private static readExactPins(directory: string, manifestPaths: readonly string[]): readonly (readonly [string, string])[] {
    const pins = new Map<string, readonly [string, string]>();
    for (const manifestPath of manifestPaths) {
      const manifest = DependentRelock.readManifest(directory, manifestPath);
      for (const [packageName, version] of [...Object.entries(manifest.dependencies ?? {}), ...Object.entries(manifest.devDependencies ?? {})])
        if (Resources.exactVersionPattern.test(version))
          pins.set(Resources.formatSpecifier(packageName, version), [packageName, version]);
    }

    return [...pins.values()];
  }

  private static readOwners(directory: string, manifestPaths: readonly string[]): ReadonlyMap<string, readonly string[]> {
    const owners = new Map<string, readonly string[]>();
    for (const manifestPath of manifestPaths) {
      const { name } = DependentRelock.readManifest(directory, manifestPath);
      if (name !== undefined)
        owners.set(name, [...owners.get(name) ?? [], manifestPath]);
    }

    return owners;
  }

  // Finds the own packages a lock folder pins exactly while its lock holds no entry for them, and every own package
  // they reach by dependency or optional dependency through their tracked manifests, each with the manifest field it goes in and the manifests that name it.
  private static findOwnLock(directory: string, lockFilePath: string, owners: ReadonlyMap<string, readonly string[]>): readonly OwnLock[] {
    const manifest: Record<string, unknown> = JSON.parse(fs.readFileSync(path.join(directory, path.dirname(lockFilePath), Resources.manifestFileName), Resources.textEncoding));
    const lock: LockFile = JSON.parse(fs.readFileSync(path.join(directory, lockFilePath), Resources.textEncoding));
    const locked = new Set(Object.keys(lock.packages ?? {}).map(t => t.slice(t.lastIndexOf(Resources.nodeModulesSegment) + Resources.nodeModulesSegment.length)));
    const findOwn = (packageNames: readonly string[]): readonly (readonly [string, readonly string[]])[] =>
      [...owners].filter(([t]) => packageNames.includes(t) && !locked.has(t));
    const pins = new Map<string, OwnPin>();
    const visit = (packageName: string, manifestPaths: readonly string[], field: string): void => {
      if (pins.has(packageName))
        return;

      pins.set(packageName, { field, manifestPaths });
      for (const reached of manifestPaths.map(t => DependentRelock.readManifest(directory, t)))
        for (const [name, paths] of findOwn([reached.dependencies, reached.optionalDependencies].flatMap(t => Object.keys(t ?? {}))))
          visit(name, paths, field);
    };
    for (const field of Resources.lockedDependencyFields)
      for (const [name, paths] of findOwn(Object.entries(DependentRelock.readField(manifest, field)).filter(([, t]) => Resources.exactVersionPattern.test(t)).map(([t]) => t)))
        visit(name, paths, field);

    return pins.size === 0 ? [] : [{ lockFilePath, pins }];
  }

  // Reads the entries a lock marks as peers that no moved package's locked entry names, so the relock keeps them unless
  // it stops installing them.
  private static readKeptPeers(lockPath: string, movedNames: ReadonlySet<string>): readonly string[] {
    const lock: LockFile = JSON.parse(fs.readFileSync(lockPath, Resources.textEncoding));
    const entries = Object.entries(lock.packages ?? {});
    const explained = new Set(entries.filter(([key]) => movedNames.has(DependentRelock.readLockedName(key)))
      .flatMap(([, entry]) => [entry.dependencies, entry.optionalDependencies, entry.peerDependencies].flatMap(t => Object.keys(t ?? {}))));

    return entries.filter(([key, entry]) => entry.peer === true && !movedNames.has(DependentRelock.readLockedName(key)) && !explained.has(DependentRelock.readLockedName(key)))
      .map(([key]) => key);
  }

  private static findLost(lockPath: string, keptPeers: readonly string[]): readonly string[] {
    const lock: LockedPackages = JSON.parse(fs.readFileSync(lockPath, Resources.textEncoding));

    return keptPeers.filter(t => !Object.hasOwn(lock.packages, t));
  }

  private static readLockedName(key: string): string {
    return key.slice(key.lastIndexOf(Resources.nodeModulesSegment) + Resources.nodeModulesSegment.length);
  }

  private static createStandIn(packageName: string, manifests: readonly Manifest[], owners: ReadonlyMap<string, readonly string[]>): Readonly<Record<string, unknown>> {
    const external = <T>(entries: readonly (Readonly<Record<string, T>> | undefined)[]): Readonly<Record<string, T>> =>
      Object.fromEntries(entries.flatMap(t => Object.entries(t ?? {})).filter(([t]) => !owners.has(t)));

    return {
      [Resources.nameField]: packageName,
      [Resources.versionField]: Resources.standInVersion,
      [Resources.dependenciesField]: external(manifests.map(t => t.dependencies)),
      [Resources.optionalDependenciesField]: external(manifests.map(t => t.optionalDependencies))
    };
  }

  // Writes a gzipped tar archive holding only package/package.json, which is all npm reads to lock a package.
  private static writeStandIn(archivePath: string, manifest: Readonly<Record<string, unknown>>): void {
    const content = Buffer.from(JSON.stringify(manifest), Resources.textEncoding);
    const block = Resources.tarBlockSize;
    const header = Buffer.alloc(block);
    for (const [offset, value] of Resources.formatTarHeaderFields(Resources.archiveManifestPath, content.length))
      header.write(value, offset, Resources.tarHeaderEncoding);
    header.write(Resources.formatTarChecksum(header.reduce((sum, t) => sum + t, 0)), Resources.tarChecksumOffset, Resources.tarHeaderEncoding);
    const body = Buffer.alloc(Math.ceil(content.length / block) * block);
    content.copy(body);
    fs.writeFileSync(archivePath, zlib.gzipSync(Buffer.concat([header, body, Buffer.alloc(block * Resources.tarEndBlockCount)])));
  }

  private static leaveOutOwn(lockPath: string, ownNames: ReadonlySet<string>, manifest: Readonly<Record<string, unknown>>): void {
    const lock: LockedPackages = JSON.parse(fs.readFileSync(lockPath, Resources.textEncoding));
    const isOwn = (key: string): boolean => key.split(Resources.nodeModulesSegment).slice(1).some(t => ownNames.has(t.replace(Resources.trailingSlashPattern, "")));
    const entries = Object.entries(lock.packages)
      .filter(([key]) => !isOwn(key))
      .map(([key, entry]): [string, unknown] => [key, key.length === 0 ? DependentRelock.restoreRoot(entry, manifest) : entry]);
    fs.writeFileSync(lockPath, `${JSON.stringify({ ...lock, [Resources.lockPackagesField]: Object.fromEntries(entries) }, null, Resources.manifestIndentation)}${Resources.lineSeparator}`);
  }

  private static restoreRoot(entry: LockedPackage, manifest: Readonly<Record<string, unknown>>): Readonly<Record<string, unknown>> {
    const restored: Record<string, unknown> = { ...entry };
    for (const field of Resources.lockedDependencyFields) {
      const specifiers = manifest[field];
      if (specifiers === undefined)
        delete restored[field];
      else
        restored[field] = specifiers;
    }

    return restored;
  }

  private static isObject(value: unknown): value is Readonly<Record<string, unknown>> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }

  private static readField(manifest: Readonly<Record<string, unknown>>, field: string): Record<string, string> {
    const value = manifest[field];

    return DependentRelock.isObject(value)
      ? Object.fromEntries(Object.entries(value).filter((t: [string, unknown]): t is [string, string] => typeof t[1] === "string"))
      : {};
  }

  private static readManifest(directory: string, manifestPath: string): Manifest {
    return JSON.parse(fs.readFileSync(path.join(directory, manifestPath), Resources.textEncoding));
  }

  private static findConflicts(fullPath: string, filePath: string, expected: ReadonlyMap<string, string> | null): readonly string[] {
    const lock: LockFile = JSON.parse(fs.readFileSync(fullPath, Resources.textEncoding));
    const packages = lock.packages ?? {};
    const conflicts = new Set<string>();
    for (const [key, entry] of Object.entries(packages)) {
      const index = key.lastIndexOf(Resources.nodeModulesSegment);
      const name = key.slice(index + Resources.nodeModulesSegment.length);
      if (index < 0 || expected?.has(name) === true)
        continue;

      for (const [peerName, range] of Object.entries(entry.peerDependencies ?? {})) {
        const found = expected === null ? DependentRelock.findLocked(packages, key, peerName)?.version : expected.get(peerName);
        if (found !== undefined && found !== range && Resources.exactVersionPattern.test(range))
          conflicts.add(Resources.formatPeerBlocker(filePath, name, entry.version, peerName, range));
      }
    }

    return [...conflicts];
  }

  private static findNested(fullPath: string, filePath: string, expected: ReadonlyMap<string, string>): readonly string[] {
    const lock: LockFile = JSON.parse(fs.readFileSync(fullPath, Resources.textEncoding));
    return Object.entries(lock.packages ?? {}).flatMap(([key, entry]) => {
      const index = key.lastIndexOf(Resources.nestedNodeModulesSegment);
      const name = key.slice(index + Resources.nestedNodeModulesSegment.length);
      const movedVersion = expected.get(name);
      if (index < 0 || movedVersion === undefined || movedVersion === entry.version)
        return [];

      return [Resources.formatNestedCopy(filePath, key.slice(0, index), name, entry.version, movedVersion)];
    });
  }

  private static unlockMoved(fullPath: string, packageNames: ReadonlySet<string>): void {
    const lock: LockFile = JSON.parse(fs.readFileSync(fullPath, Resources.textEncoding));
    if (lock.packages === undefined)
      return;

    const entries = Object.entries(lock.packages);
    const unlocked = entries.filter(([key, entry]) => DependentRelock.isMovedOrDependent(key, entry, packageNames)).map(([key]) => key);
    const kept = entries.filter(([key]) => !unlocked.some(t => key === t || key.startsWith(Resources.formatFolderPrefix(t))));
    fs.writeFileSync(fullPath, `${JSON.stringify({ ...lock, [Resources.lockPackagesField]: Object.fromEntries(kept) }, null, Resources.manifestIndentation)}${Resources.lineSeparator}`);
  }

  private static isMovedOrDependent(key: string, entry: LockedPackage, packageNames: ReadonlySet<string>): boolean {
    const index = key.lastIndexOf(Resources.nodeModulesSegment);
    if (index < 0)
      return false;

    return packageNames.has(key.slice(index + Resources.nodeModulesSegment.length))
      || [entry.dependencies, entry.optionalDependencies, entry.peerDependencies].some(t => Object.keys(t ?? {}).some(n => packageNames.has(n)));
  }

  private static findLocked(packages: Readonly<Record<string, LockedPackage>>, key: string, name: string): LockedPackage | undefined {
    let base = key;
    for (;;) {
      const found = packages[Resources.formatNestedLockKey(base, name)];
      const index = base.lastIndexOf(Resources.nestedNodeModulesSegment);
      if (found !== undefined || index < 0)
        return found ?? packages[`${Resources.nodeModulesSegment}${name}`];

      base = base.slice(0, index);
    }
  }

  // Moves, in a module's manifest, each entry of its dependencies and optional dependencies that names one of the
  // targets at an older exact version, as the pins of a package's manifest move.
  public static moveModulePins(fullPath: string, filePath: string, targets: readonly PinTarget[]): readonly string[] {
    const moves: PinMove[] = [];
    const text = fs.readFileSync(fullPath, Resources.textEncoding).replace(Resources.moduleDependenciesPattern, (field: string) => DependentRelock.replacePins(field, filePath, targets, moves));
    if (moves.length > 0)
      fs.writeFileSync(fullPath, text);

    return moves.map(t => t.line);
  }

  public static moveModuleRange(fullPath: string, filePath: string, packageNames: readonly string[], version: string): readonly string[] {
    return DependentRelock.moveRanges(fullPath, filePath, packageNames, [Resources.noldovaDesktopField], version).map(t => t.line);
  }

  private static moveRanges(fullPath: string, filePath: string, packageNames: readonly string[], fieldNames: readonly string[], version: string): readonly PinMove[] {
    if (!packageNames.includes(Resources.noldovaDesktopPackageName))
      return [];

    const target = Version.parse(version);
    const range = Resources.formatSiblingPeerRange(version, (target.major === 0 ? target.nextMinor() : new Version(target.major + 1, 0, 0)).toString());
    const moves: PinMove[] = [];
    let text = fs.readFileSync(fullPath, Resources.textEncoding);
    for (const fieldName of fieldNames) {
      text = text.replace(Resources.createPinPattern(fieldName), (pin: string, prefix: string, found: string, suffix: string) => {
        const lowest = Resources.exactRangePattern.exec(found)?.[1];
        if (lowest === undefined || Version.parse(lowest).compareTo(target) >= 0)
          return pin;

        moves.push({ packageName: fieldName, line: Resources.formatPinMoved(filePath, fieldName, found, range) });

        return `${prefix}${range}${suffix}`;
      });
    }
    if (moves.length > 0)
      fs.writeFileSync(fullPath, text);

    return moves;
  }

  // Raises, in a manifest's peerDependencies, each range of the form >=<lowest> <refused> that names a released package,
  // or a package a released package needs or accepts as a peer, at a version newer than its lowest, such as a module's
  // own peer on the window package it pins, or a module window part's @angular/core peer when the released window
  // package needs a newer Angular, to start at that version, keeping the version it refuses. A range that refuses that version, in that form or as ^, ~ or < a plain version, is added to the refusals
  // instead, and stays. A version a released package only depends on gets its own copy, so it moves no peer range.
  private static movePeerRanges(fullPath: string, filePath: string, targets: readonly PinTarget[], refusals: string[]): readonly PinMove[] {
    const moves: PinMove[] = [];
    const text = fs.readFileSync(fullPath, Resources.textEncoding).replace(Resources.peerDependenciesPattern, (field: string) => {
      let replaced = field;
      for (const { packageName, version, reason } of targets.filter(t => t.range !== t.version)) {
        const target = Version.parse(version);
        replaced = replaced.replace(Resources.createPinPattern(packageName), (pin: string, prefix: string, found: string, suffix: string) => {
          const [, lowest, refused] = Resources.exactRangePattern.exec(found) ?? [];
          if (lowest === undefined || refused === undefined) {
            if (DependentRelock.refusesAbove(found, target))
              refusals.push(DependentRelock.withReason(Resources.formatPeerRangeRefuses(filePath, packageName, found, version), reason));
            return pin;
          }
          if (Version.parse(lowest).compareTo(target) >= 0)
            return pin;

          if (target.compareTo(Version.parse(refused)) >= 0) {
            refusals.push(DependentRelock.withReason(Resources.formatPeerRangeRefuses(filePath, packageName, found, version), reason));
            return pin;
          }

          const range = Resources.formatSiblingPeerRange(version, refused);
          moves.push({ packageName, line: DependentRelock.withReason(Resources.formatPinMoved(filePath, packageName, found, range), reason) });

          return `${prefix}${range}${suffix}`;
        });
      }

      return replaced;
    });
    if (moves.length > 0)
      fs.writeFileSync(fullPath, text);

    return moves;
  }

  private static movePins(fullPath: string, filePath: string, targets: readonly PinTarget[]): readonly PinMove[] {
    const moves: PinMove[] = [];
    const text = DependentRelock.replacePins(fs.readFileSync(fullPath, Resources.textEncoding), filePath, targets, moves);
    if (moves.length > 0)
      fs.writeFileSync(fullPath, text);

    return moves;
  }

  private static replacePins(text: string, filePath: string, targets: readonly PinTarget[], moves: PinMove[]): string {
    let replaced = text;
    for (const { packageName, version, reason } of targets) {
      const target = Version.parse(version);
      replaced = replaced.replace(Resources.createPinPattern(packageName), (pin: string, prefix: string, found: string, suffix: string) => {
        if (!Resources.exactVersionPattern.test(found) || Version.parse(found).compareTo(target) >= 0)
          return pin;

        moves.push({ packageName, line: DependentRelock.withReason(Resources.formatPinMoved(filePath, packageName, found, version), reason) });

        return `${prefix}${version}${suffix}`;
      });
    }

    return replaced;
  }

  // Whether a range of the form ^, ~ or < a plain version refuses the target by its upper end, as npm reads it: ^ up to the
  // next major, or below 1.0 the next minor, or below 0.1 the next patch; ~ up to the next minor; < up to the version. A
  // range of any other form isn't read.
  private static refusesAbove(range: string, target: Version): boolean {
    const [, operator, text] = Resources.boundedRangePattern.exec(range) ?? [];
    if (operator === undefined || text === undefined)
      return false;

    const bound = Version.parse(text);
    const refused = operator === Resources.belowRangeOperator ? bound
      : operator === Resources.tildeRangeOperator ? bound.nextMinor()
        : bound.major > 0 ? new Version(bound.major + 1, 0, 0)
          : bound.minor > 0 ? bound.nextMinor()
            : new Version(0, 0, bound.patch + 1);

    return target.compareTo(refused) >= 0;
  }

  private static withReason(line: string, reason: string | null): string {
    return reason === null ? line : `${line}${reason}`;
  }

  private static readFiles(directory: string, filePaths: readonly string[]): ReadonlyMap<string, string> {
    return new Map(filePaths.map(t => [t, fs.readFileSync(path.join(directory, t), Resources.textEncoding)]));
  }
}
