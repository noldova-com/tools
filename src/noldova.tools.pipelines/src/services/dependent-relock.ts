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

import "@noldova/context.core";

import { ProcessException } from "../exceptions/process.exception.js";
import type { DependentsUpdate } from "../models/dependents-update.js";
import { ExactPin } from "../models/exact-pin.js";
import { LockScope } from "../models/lock-scope.js";
import { NeededPeer } from "../models/needed-peer.js";
import { OwnLock } from "../models/own-lock.js";
import { OwnPin } from "../models/own-pin.js";
import { PeerChase } from "../models/peer-chase.js";
import { PinMove } from "../models/pin-move.js";
import { PinTarget } from "../models/pin-target.js";
import type { ProcessResult } from "../models/process-result.js";
import { RelockedFiles } from "../models/relocked-files.js";
import { ScopeExpectation } from "../models/scope-expectation.js";
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
  readonly resolved?: string;
  readonly peer?: boolean;
  readonly dependencies?: Readonly<Record<string, string>>;
  readonly optionalDependencies?: Readonly<Record<string, string>>;
  readonly peerDependencies?: Readonly<Record<string, string>>;
}

interface Manifest {
  readonly name?: string;
  readonly dependencies?: Readonly<Record<string, string>>;
  readonly devDependencies?: Readonly<Record<string, string>>;
  readonly optionalDependencies?: Readonly<Record<string, string>>;
  readonly peerDependencies?: Readonly<Record<string, string>>;
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
    const released = update.packageNames.map(t => new PinTarget(t, update.version, null, null, []));
    const releasedMoves = new Map<string, readonly PinMove[]>();
    for (const manifestPath of manifestPaths)
      releasedMoves.set(manifestPath, DependentRelock.movePins(path.join(directory, manifestPath), manifestPath, released));
    const moves = [...releasedMoves.values()].flat();
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
    const peerMoves: PinMove[] = [];
    const peerRangeMoves: PinMove[] = [];
    const outside: string[] = [];
    const chaseMoves: PinMove[] = [];
    const misses: string[] = [];
    const expectedScopes: ScopeExpectation[] = [];
    for (const scope of LockScope.read(manifestPaths, lockFilePaths)) {
      const scopeMoves = scope.manifestPaths.flatMap(t => releasedMoves.get(t) ?? []);
      const installed = new Set([...scopeMoves.map(t => t.packageName), ...scope.lockFilePaths.flatMap(t => DependentRelock.readLockedNames(path.join(directory, t)))]);
      const targets = update.peerPins.filter(t => t.appliesTo(installed));
      const pinned = scope.manifestPaths.flatMap(t => DependentRelock.movePins(path.join(directory, t), t, targets));
      peerMoves.push(...pinned);
      peerRangeMoves.push(...scope.manifestPaths.flatMap(t => DependentRelock.movePeerRanges(path.join(directory, t), t, targets, refusals)));
      const expected = new Map<string, string>();
      for (const target of [...released, ...targets.filter(t => pinned.some(m => m.packageName === t.packageName))])
        expected.set(target.packageName, target.version);
      const moved = new Map<string, string>();
      expected.forEach((version, packageName) => {
        if ([...scopeMoves, ...pinned].some(m => m.packageName === packageName))
          moved.set(packageName, version);
      });
      for (const target of targets.filter(t => t.range === t.version && !moved.has(t.packageName)))
        moved.set(target.packageName, target.version);
      outside.push(...DependentRelock.findOutside(directory, scope.manifestPaths, targets));
      const chase = await this.chasePeersAsync(directory, scope.manifestPaths, manifestPaths, moved);
      chaseMoves.push(...chase.moves);
      misses.push(...chase.misses);
      moved.forEach((version, packageName) => {
        expected.set(packageName, version);
      });
      expectedScopes.push(new ScopeExpectation(scope, expected));
    }
    if (outside.length + refusals.length + misses.length > 0)
      return StepResult.failed(Resources.formatRepositoryUnmatched(repository, update.version, [...outside, ...refusals, ...misses]));

    const owners = DependentRelock.readOwners(directory, manifestPaths);
    const ownPeers = DependentRelock.readOwnPeers(directory, manifestPaths);
    const blockers = expectedScopes.flatMap(s => s.scope.lockFilePaths.flatMap(t => DependentRelock.findConflicts(path.join(directory, t), t, s.expected, ownPeers)));
    if (blockers.length > 0)
      return StepResult.failed(Resources.formatRepositoryBlocked(repository, update.version, blockers));

    const ownLocks = lockFilePaths.filter(t => !lockScripts.has(t)).flatMap(t => DependentRelock.findOwnLock(directory, t, owners));
    const shared = new Map<string, string>();
    for (const ownLock of ownLocks)
      ownLock.pins.forEach((pin, packageName) => {
        if (pin.manifestPaths.length > 1)
          shared.set(packageName, Resources.formatOwnManifests(packageName, pin.manifestPaths));
      });
    if (shared.size > 0)
      return StepResult.failed(Resources.formatRepositoryOwnShared(repository, update.version, [...shared.values()]));

    const allMoves = [...moves, ...rangeMoves, ...releasedRangeMoves, ...peerMoves, ...peerRangeMoves, ...chaseMoves];
    const movedNames = new Set(allMoves.map(t => t.packageName));
    for (const lockFilePath of [...lockFilePaths.filter(t => !lockScripts.has(t)), ...lockFilePaths.filter(t => lockScripts.has(t))]) {
      const script = lockScripts.get(lockFilePath);
      const ownLock = ownLocks.find(t => t.lockFilePath === lockFilePath);
      const keptPeers = Object.isUndefined(ownLock) ? [] : DependentRelock.readKeptPeers(path.join(directory, lockFilePath), movedNames);
      DependentRelock.unlockMoved(path.join(directory, lockFilePath), movedNames);
      const result = !Object.isUndefined(script)
        ? await this.npm.runScriptAsync(directory, script, this.credentialVariables)
        : Object.isUndefined(ownLock)
          ? await this.npm.lockAsync(path.join(directory, path.dirname(lockFilePath)), this.credentialVariables)
          : await this.lockOwnAsync(directory, ownLock, owners);
      if (!result.isSuccessful)
        return StepResult.failed(Resources.formatRepositoryFailed(repository, Object.isUndefined(script)
          ? Resources.formatLockFailed(lockFilePath, result.exitCode, result.errorOutput)
          : Resources.formatLockScriptFailed(lockFilePath, script, result.exitCode, result.errorOutput.trim().length > 0 ? result.errorOutput : Resources.keepLastOutputLines(result.output))));

      const lost = DependentRelock.findLost(path.join(directory, lockFilePath), keptPeers);
      if (lost.length > 0)
        return StepResult.failed(Resources.formatRepositoryPeersLost(repository, update.version, lockFilePath, lost));
    }

    const conflicts = lockFilePaths.flatMap(t => DependentRelock.findConflicts(path.join(directory, t), t, null, ownPeers));
    if (conflicts.length > 0)
      return StepResult.failed(Resources.formatRepositoryConflicted(repository, update.version, conflicts));

    const nested = expectedScopes.flatMap(s => {
      const named = DependentRelock.readNamed(directory, s.scope.manifestPaths);

      return s.scope.lockFilePaths.flatMap(t => DependentRelock.findNested(path.join(directory, t), t, s.expected, named));
    });
    if (nested.length > 0)
      return StepResult.failed(Resources.formatRepositoryNested(repository, update.version, nested));

    const after = DependentRelock.readFiles(directory, [...manifestPaths, ...lockFilePaths]);
    const changed = new Map<string, string>();
    after.forEach((text, filePath) => {
      if (before.get(filePath) !== text)
        changed.set(filePath, text);
    });
    const lockLines = lockFilePaths.map(t => {
      const script = lockScripts.get(t);

      return Object.isUndefined(script) ? Resources.formatLocked(t) : Resources.formatScriptLocked(t, script);
    });

    return new RelockedFiles(await git.readHeadAsync(), allMoves.map(t => t.line), [...lockLines, ...ownLocks.map(t => Resources.formatOwnLocked(t.lockFilePath, [...t.pins.keys()]))],
      Object.fromEntries(changed));
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
    let index = 0;
    ownLock.pins.forEach((pin, packageName) => {
      const archive = path.join(standIns, `${index}${Resources.archiveFileExtension}`);
      index += 1;
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
    });

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
  private async chasePeersAsync(directory: string, manifestPaths: readonly string[], ownPaths: readonly string[], moved: Map<string, string>): Promise<PeerChase> {
    const peers = new Map<string, ReadonlyMap<string, string>>();
    const moves: PinMove[] = [];
    const queue: ExactPin[] = [];
    moved.forEach((version, packageName) => {
      queue.push(new ExactPin(packageName, version));
    });
    const own = new Set(ownPaths.flatMap(t => DependentRelock.readManifest(directory, t).name ?? []));
    const isSettled = (packageName: string): boolean => moved.has(packageName) || own.has(packageName);
    const move = (packageName: string, version: string, reason: string): void => {
      const pinMoves = manifestPaths.flatMap(t => DependentRelock.movePins(path.join(directory, t), t, [new PinTarget(packageName, version, reason, null, [])]));
      if (pinMoves.length === 0)
        return;

      moved.set(packageName, version);
      queue.push(new ExactPin(packageName, version));
      moves.push(...pinMoves);
    };
    for (;;) {
      const misses: string[] = [];
      for (let next = queue.shift(); !Object.isUndefined(next); next = queue.shift()) {
        const { packageName, version } = next;
        (await this.readPeersAsync(directory, packageName, version, peers)).forEach((peerVersion, peerName) => {
          const movedVersion = moved.get(peerName);
          if (!Object.isUndefined(movedVersion) && movedVersion !== peerVersion)
            misses.push(Resources.formatPeerMovedElsewhere(peerName, movedVersion, peerVersion, packageName, version));
          if (isSettled(peerName))
            return;

          const needed = Version.parse(peerVersion);
          const newer = DependentRelock.readExactPins(directory, manifestPaths).filter(t => t.packageName === peerName && Version.parse(t.version).compareTo(needed) > 0);
          if (newer.length > 0)
            misses.push(...newer.map(t => Resources.formatPeerNewer(peerName, t.version, peerVersion, packageName, version)));
          else
            move(peerName, peerVersion, Resources.formatPeerReason(packageName, version));
        });
      }

      for (const { packageName, version } of DependentRelock.readExactPins(directory, manifestPaths).filter(t => !isSettled(t.packageName))) {
        const needed = DependentRelock.findNeeded(await this.readPeersAsync(directory, packageName, version, peers), moved);
        const [first] = needed;
        if (Object.isUndefined(first))
          continue;

        const match = await this.findMatchingAsync(directory, packageName, version, needed, moved, peers);
        if (Object.isNull(match))
          misses.push(...needed.map(t => Resources.formatPeerUnmatched(packageName, version, t.peerName, t.peerVersion, t.movedVersion)));
        else
          move(packageName, match, Resources.formatPeerMatchReason(first.peerName, first.movedVersion));
      }
      if (misses.length > 0 || queue.length === 0)
        return new PeerChase(moves, misses);
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
    if (!Object.isUndefined(known))
      return known;

    const value = await this.viewAsync(directory, specifier, Resources.peerDependenciesField);
    const found = new Map<string, string>();
    if (DependentRelock.isObject(value))
      for (const [peerName, range] of Object.entries(value))
        if (Object.isString(range) && Resources.exactVersionPattern.test(range))
          found.set(peerName, range);
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
    if (Object.isString(value))
      return [value];

    return Array.isArray(value) ? value.filter((t: unknown): t is string => Object.isString(t)) : [];
  }

  private static findNeeded(peers: ReadonlyMap<string, string>, moved: ReadonlyMap<string, string>): readonly NeededPeer[] {
    const needed: NeededPeer[] = [];
    peers.forEach((peerVersion, peerName) => {
      const movedVersion = moved.get(peerName);
      if (!Object.isUndefined(movedVersion) && movedVersion !== peerVersion)
        needed.push(new NeededPeer(peerName, peerVersion, movedVersion));
    });

    return needed;
  }

  // Names each exact pin of a target the released packages accept only within a range, or at one version, that stays
  // outside it once the older pins moved: a newer pin, which the release can't move back.
  private static findOutside(directory: string, manifestPaths: readonly string[], targets: readonly PinTarget[]): readonly string[] {
    const pins = DependentRelock.readExactPins(directory, manifestPaths);

    return targets.flatMap(({ packageName, reason, range }) => Object.isNull(range) || Object.isNull(reason) ? [] : pins
      .filter(t => t.packageName === packageName && !DependentRelock.accepts(range, t.version))
      .map(t => Resources.formatPinOutside(packageName, t.version, range, reason)));
  }

  private static accepts(range: string, version: string): boolean {
    const [, lowest, refused] = Resources.exactRangePattern.exec(range) ?? [];
    if (Object.isUndefined(lowest) || Object.isUndefined(refused))
      return range === version;

    const pinned = Version.parse(version);

    return pinned.compareTo(Version.parse(lowest)) >= 0 && pinned.compareTo(Version.parse(refused)) < 0;
  }

  private static readExactPins(directory: string, manifestPaths: readonly string[]): readonly ExactPin[] {
    const pins = new Map<string, ExactPin>();
    for (const manifestPath of manifestPaths) {
      const manifest = DependentRelock.readManifest(directory, manifestPath);
      for (const [packageName, version] of [...Object.entries(manifest.dependencies ?? {}), ...Object.entries(manifest.devDependencies ?? {})])
        if (Resources.exactVersionPattern.test(version))
          pins.set(Resources.formatSpecifier(packageName, version), new ExactPin(packageName, version));
    }

    return [...pins.values()];
  }

  private static readNamed(directory: string, manifestPaths: readonly string[]): ReadonlySet<string> {
    return new Set(manifestPaths.map(t => DependentRelock.readManifest(directory, t))
      .flatMap(t => [t.dependencies, t.devDependencies, t.optionalDependencies, t.peerDependencies].flatMap(f => Object.keys(f ?? {}))));
  }

  private static readOwners(directory: string, manifestPaths: readonly string[]): ReadonlyMap<string, readonly string[]> {
    const owners = new Map<string, readonly string[]>();
    for (const manifestPath of manifestPaths) {
      const { name } = DependentRelock.readManifest(directory, manifestPath);
      if (!Object.isUndefined(name))
        owners.set(name, [...owners.get(name) ?? [], manifestPath]);
    }

    return owners;
  }

  private static readOwnPeers(directory: string, manifestPaths: readonly string[]): ReadonlyMap<string, readonly Readonly<Record<string, string>>[]> {
    const peers = new Map<string, readonly Readonly<Record<string, string>>[]>();
    for (const manifestPath of manifestPaths) {
      const manifest = DependentRelock.readManifest(directory, manifestPath);
      if (!Object.isUndefined(manifest.name))
        peers.set(manifest.name, [...peers.get(manifest.name) ?? [], manifest.peerDependencies ?? {}]);
    }

    return peers;
  }

  // Finds the own packages a lock folder pins exactly while its lock holds no entry for them, and every own package
  // they reach by dependency or optional dependency through their tracked manifests, each with the manifest field it goes in and the manifests that name it.
  private static findOwnLock(directory: string, lockFilePath: string, owners: ReadonlyMap<string, readonly string[]>): readonly OwnLock[] {
    const manifest: Record<string, unknown> = JSON.parse(fs.readFileSync(path.join(directory, path.dirname(lockFilePath), Resources.manifestFileName), Resources.textEncoding));
    const lock: LockFile = JSON.parse(fs.readFileSync(path.join(directory, lockFilePath), Resources.textEncoding));
    const locked = new Set(Object.keys(lock.packages ?? {}).map(t => t.slice(t.lastIndexOf(Resources.nodeModulesSegment) + Resources.nodeModulesSegment.length)));
    const findOwn = (packageNames: readonly string[]): ReadonlyMap<string, readonly string[]> => {
      const found = new Map<string, readonly string[]>();
      owners.forEach((paths, name) => {
        if (packageNames.includes(name) && !locked.has(name))
          found.set(name, paths);
      });

      return found;
    };
    const pins = new Map<string, OwnPin>();
    const visit = (packageName: string, manifestPaths: readonly string[], field: string): void => {
      if (pins.has(packageName))
        return;

      pins.set(packageName, new OwnPin(field, manifestPaths));
      for (const reached of manifestPaths.map(t => DependentRelock.readManifest(directory, t)))
        findOwn([reached.dependencies, reached.optionalDependencies].flatMap(t => Object.keys(t ?? {}))).forEach((paths, name) => {
          visit(name, paths, field);
        });
    };
    for (const field of Resources.lockedDependencyFields)
      findOwn(Object.entries(DependentRelock.readField(manifest, field)).filter(([, t]) => Resources.exactVersionPattern.test(t)).map(([t]) => t)).forEach((paths, name) => {
        visit(name, paths, field);
      });

    return pins.size === 0 ? [] : [new OwnLock(lockFilePath, pins)];
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

  private static readLockedNames(lockPath: string): readonly string[] {
    const lock: LockFile = JSON.parse(fs.readFileSync(lockPath, Resources.textEncoding));

    return Object.keys(lock.packages ?? {}).filter(t => t.includes(Resources.nodeModulesSegment)).map(t => DependentRelock.readLockedName(t));
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
    for (const { offset, value } of Resources.formatTarHeaderFields(Resources.archiveManifestPath, content.length))
      header.write(value, offset, Resources.tarHeaderEncoding);
    header.write(Resources.formatTarChecksum(header.reduce((sum, t) => sum + t, 0)), Resources.tarChecksumOffset, Resources.tarHeaderEncoding);
    const body = Buffer.alloc(Math.ceil(content.length / block) * block);
    content.copy(body);
    fs.writeFileSync(archivePath, zlib.gzipSync(Buffer.concat([header, body, Buffer.alloc(block * Resources.tarEndBlockCount)])));
  }

  private static leaveOutOwn(lockPath: string, ownNames: ReadonlySet<string>, manifest: Readonly<Record<string, unknown>>): void {
    const lock: LockedPackages = JSON.parse(fs.readFileSync(lockPath, Resources.textEncoding));
    const isOwn = (key: string): boolean => key.split(Resources.nodeModulesSegment).slice(1).some(t => ownNames.has(t.replace(Resources.trailingSlashPattern, "")));
    const packages = new Map<string, unknown>();
    for (const [key, entry] of Object.entries(lock.packages))
      if (!isOwn(key))
        packages.set(key, key.length === 0 ? DependentRelock.restoreRoot(entry, manifest) : entry);
    fs.writeFileSync(lockPath, `${JSON.stringify({ ...lock, [Resources.lockPackagesField]: Object.fromEntries(packages) }, null, Resources.manifestIndentation)}${Resources.lineSeparator}`);
  }

  private static restoreRoot(entry: LockedPackage, manifest: Readonly<Record<string, unknown>>): Readonly<Record<string, unknown>> {
    const restored: Record<string, unknown> = { ...entry };
    for (const field of Resources.lockedDependencyFields) {
      const specifiers = manifest[field];
      if (Object.isUndefined(specifiers))
        delete restored[field];
      else
        restored[field] = specifiers;
    }

    return restored;
  }

  private static isObject(value: unknown): value is Readonly<Record<string, unknown>> {
    return Object.isPlainObject(value);
  }

  private static readField(manifest: Readonly<Record<string, unknown>>, field: string): Record<string, string> {
    const value = manifest[field];
    const specifiers = new Map<string, string>();
    if (DependentRelock.isObject(value))
      for (const [name, specifier] of Object.entries(value))
        if (Object.isString(specifier))
          specifiers.set(name, specifier);

    return Object.fromEntries(specifiers);
  }

  private static readManifest(directory: string, manifestPath: string): Manifest {
    return JSON.parse(fs.readFileSync(path.join(directory, manifestPath), Resources.textEncoding));
  }

  private static findConflicts(fullPath: string, filePath: string, expected: ReadonlyMap<string, string> | null,
    ownPeers: ReadonlyMap<string, readonly Readonly<Record<string, string>>[]>): readonly string[] {
    const lock: LockFile = JSON.parse(fs.readFileSync(fullPath, Resources.textEncoding));
    const packages = lock.packages ?? {};
    const conflicts = new Set<string>();
    for (const key of Object.keys(packages)) {
      const entry = packages[key];
      const index = key.lastIndexOf(Resources.nodeModulesSegment);
      const name = key.slice(index + Resources.nodeModulesSegment.length);
      if (Object.isUndefined(entry) || index < 0 || expected?.has(name) === true)
        continue;

      const own = entry.resolved?.startsWith(Resources.archiveSpecifierPrefix) === true ? ownPeers.get(name) : undefined;
      for (const peers of own ?? [entry.peerDependencies ?? {}])
        for (const peerName of Object.keys(peers)) {
          const range = peers[peerName];
          const found = Object.isNull(expected) ? DependentRelock.findLocked(packages, key, peerName)?.version : expected.get(peerName);
          if (!Object.isUndefined(range) && !Object.isUndefined(found) && found !== range && Resources.exactVersionPattern.test(range))
            conflicts.add(Resources.formatPeerBlocker(filePath, name, entry.version, peerName, range));
        }
    }

    return [...conflicts];
  }

  // Names each copy of a moved package that a lock nests under one of the repository's own folders, or under a parent its
  // own manifests name. npm nests a copy only for a parent whose range excludes the hoisted version; a parent the
  // repository names, it can move, while one only a dependency brings, such as app-builder-lib, which takes resedit 1
  // beside the resedit 3 of the released desktop.build, it can't, and the release's own lock holds the same two copies.
  private static findNested(fullPath: string, filePath: string, expected: ReadonlyMap<string, string>, named: ReadonlySet<string>): readonly string[] {
    const lock: LockFile = JSON.parse(fs.readFileSync(fullPath, Resources.textEncoding));
    return Object.entries(lock.packages ?? {}).flatMap(([key, entry]) => {
      const index = key.lastIndexOf(Resources.nestedNodeModulesSegment);
      const name = key.slice(index + Resources.nestedNodeModulesSegment.length);
      const movedVersion = expected.get(name);
      if (index < 0 || Object.isUndefined(movedVersion) || movedVersion === entry.version || !DependentRelock.isNamedParent(key.slice(0, index), named))
        return [];

      return [Resources.formatNestedCopy(filePath, key.slice(0, index), name, entry.version, movedVersion)];
    });
  }

  private static isNamedParent(parentKey: string, named: ReadonlySet<string>): boolean {
    return !parentKey.includes(Resources.nodeModulesSegment) || named.has(DependentRelock.readLockedName(parentKey));
  }

  private static unlockMoved(fullPath: string, packageNames: ReadonlySet<string>): void {
    const lock: LockFile = JSON.parse(fs.readFileSync(fullPath, Resources.textEncoding));
    if (Object.isUndefined(lock.packages))
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
      if (!Object.isUndefined(found) || index < 0)
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
        if (Object.isUndefined(lowest) || Version.parse(lowest).compareTo(target) >= 0)
          return pin;

        moves.push(new PinMove(fieldName, Resources.formatPinMoved(filePath, fieldName, found, range)));

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
          if (Object.isUndefined(lowest) || Object.isUndefined(refused)) {
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
          moves.push(new PinMove(packageName, DependentRelock.withReason(Resources.formatPinMoved(filePath, packageName, found, range), reason)));

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

        moves.push(new PinMove(packageName, DependentRelock.withReason(Resources.formatPinMoved(filePath, packageName, found, version), reason)));

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
    if (Object.isUndefined(operator) || Object.isUndefined(text))
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
    return Object.isNull(reason) ? line : `${line}${reason}`;
  }

  private static readFiles(directory: string, filePaths: readonly string[]): ReadonlyMap<string, string> {
    const files = new Map<string, string>();
    for (const filePath of filePaths)
      files.set(filePath, fs.readFileSync(path.join(directory, filePath), Resources.textEncoding));

    return files;
  }
}
