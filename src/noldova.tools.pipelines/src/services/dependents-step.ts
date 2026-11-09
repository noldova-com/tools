/**
 * @license
 * Copyright (c) Noldova.
 *
 * This source code is licensed under the license found in the
 * LICENSE file in the root directory of this source tree.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";

import type { JsonReader } from "@noldova/context.json";

import { ProcessException } from "../exceptions/process.exception.js";
import type { IStep } from "../interfaces/i-step.js";
import type { IStepOutput } from "../interfaces/i-step-output.js";
import type { IUpdateHost } from "../interfaces/i-update-host.js";
import { DependentsUpdate, type PinTarget } from "../models/dependents-update.js";
import type { ProcessResult } from "../models/process-result.js";
import { StepResult } from "../models/step-result.js";
import { Version } from "../models/version.js";
import { Resources } from "../resources.js";
import type { ArchiveStep } from "./archive-step.js";
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
  readonly peerDependencies?: Readonly<Record<string, string>>;
  readonly peerDependenciesMeta?: Readonly<Record<string, unknown>>;
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

export class DependentsStep implements IStep {
  private readonly archiveStep: ArchiveStep;
  private readonly updateHost: IUpdateHost;
  private readonly processRunner: ProcessRunner;
  private readonly npm: Npm;
  private readonly temporaryRoot: string;
  private readonly output: IStepOutput | undefined;

  public readonly name: string = Resources.dependentsStepName;
  public readonly usage: string = Resources.dependentsStepUsage;

  public constructor(archiveStep: ArchiveStep, updateHost: IUpdateHost, processRunner: ProcessRunner, npm: Npm, temporaryRoot?: string, output?: IStepOutput) {
    this.archiveStep = archiveStep;
    this.updateHost = updateHost;
    this.processRunner = processRunner;
    this.npm = npm;
    this.temporaryRoot = temporaryRoot === undefined || temporaryRoot.length === 0 ? os.tmpdir() : temporaryRoot;
    this.output = output;
  }

  public async runAsync(values: readonly string[]): Promise<StepResult> {
    const [version, commit, ...rest] = values;
    if (version === undefined || commit === undefined || rest.length !== 0)
      return StepResult.failed(Resources.formatStepValuesInvalid(this.name, this.usage));

    const versionProblem = Version.validate(version);
    if (versionProblem !== null)
      return StepResult.failed(versionProblem);
    if (Version.parse(version).nightlyDate !== null)
      return StepResult.failed(Resources.formatDependentsVersionNotRelease(version));
    if (!Resources.commitPattern.test(commit))
      return StepResult.failed(Resources.formatCommitInvalid(commit));

    const source = this.updateHost.readSourceName();
    if (source instanceof StepResult)
      return source;

    const manifests = await this.archiveStep.readPackageManifestsAsync(commit);
    const packageNames = manifests.map(t => t.readString(Resources.nameField)).sort();
    if (packageNames.length === 0)
      return StepResult.failed(Resources.formatPackagesMissing(commit, Resources.packagesFolderPath));

    const repositories = await this.updateHost.listRepositoriesAsync();
    if (repositories instanceof StepResult)
      return repositories;

    const notes = await this.updateHost.readReleaseNotesAsync(version, commit);
    if (notes instanceof StepResult)
      return notes;

    const update = new DependentsUpdate(source, version, commit, packageNames, DependentsStep.readPeerPins(manifests, packageNames, version), notes);
    const lines: string[] = [];
    let isSuccessful = true;
    const root = fs.mkdtempSync(path.join(this.temporaryRoot, Resources.dependentsFolderPrefix));
    try {
      for (const [index, repository] of repositories.entries()) {
        const result = await this.tryUpdateAsync(update, repository, path.join(root, String(index)));
        isSuccessful &&= result.isSuccessful;
        if (this.output === undefined)
          lines.push(result.message);
        else if (result.isSuccessful)
          this.output.writeSuccess(result.message);
        else
          this.output.writeFailure(result.message);
      }
    }
    finally {
      fs.rmSync(root, { recursive: true, force: true });
    }

    const message = this.output === undefined
      ? [Resources.formatDependentsSummary(packageNames, version, repositories.length), ...lines].join(Resources.lineSeparator)
      : Resources.formatDependentsWritten(packageNames, version, repositories.length);

    return isSuccessful ? StepResult.succeeded(message) : StepResult.failed(message);
  }

  private async tryUpdateAsync(update: DependentsUpdate, repository: string, directory: string): Promise<StepResult> {
    try {
      return await this.updateAsync(update, repository, directory);
    }
    catch (error: unknown) {
      if (!(error instanceof Error))
        throw error;

      return StepResult.failed(Resources.formatRepositoryFailed(repository, error.message));
    }
  }

  private async updateAsync(update: DependentsUpdate, repository: string, directory: string): Promise<StepResult> {
    const checkout = await this.updateHost.checkOutAsync(repository, directory);
    if (checkout !== null)
      return StepResult.failed(Resources.formatRepositoryFailed(repository, checkout.message));

    const git = new Git(this.processRunner, directory);
    const filePaths = (await git.listTrackedFilesAsync()).map(t => t.filePath);
    const manifestPaths = filePaths.filter(t => path.posix.basename(t) === Resources.manifestFileName);
    const released = update.packageNames.map(t => ({ packageName: t, version: update.version, reason: null }));
    const moves = manifestPaths.flatMap(t => DependentsStep.movePins(path.join(directory, t), t, released));
    if (moves.length === 0)
      return StepResult.succeeded(Resources.formatRepositoryUnpinned(repository, update.version));

    const peerMoves = manifestPaths.flatMap(t => DependentsStep.movePins(path.join(directory, t), t, update.peerPins));
    const expected = new Map([...released, ...update.peerPins.filter(t => peerMoves.some(m => m.packageName === t.packageName))].map(t => [t.packageName, t.version]));
    const moved = new Map([...expected].filter(([t]) => [...moves, ...peerMoves].some(m => m.packageName === t)));
    const chase = await this.chasePeersAsync(directory, manifestPaths, moved);
    for (const [packageName, version] of moved)
      expected.set(packageName, version);
    if (chase.misses.length > 0)
      return StepResult.succeeded(Resources.formatRepositoryUnmatched(repository, update.version, chase.misses));

    const lockFilePaths = filePaths.filter(t => path.posix.basename(t) === Resources.lockFileName);
    const blockers = lockFilePaths.flatMap(t => DependentsStep.findConflicts(path.join(directory, t), t, expected));
    if (blockers.length > 0)
      return StepResult.succeeded(Resources.formatRepositoryBlocked(repository, update.version, blockers));

    const owners = DependentsStep.readOwners(directory, manifestPaths);
    const ownLocks = lockFilePaths.flatMap(t => DependentsStep.findOwnLock(directory, t, owners));
    const shared = new Map(ownLocks.flatMap(t => [...t.pins]).filter(([, t]) => t.manifestPaths.length > 1)
      .map(([packageName, t]) => [packageName, Resources.formatOwnManifests(packageName, t.manifestPaths)]));
    if (shared.size > 0)
      return StepResult.succeeded(Resources.formatRepositoryOwnShared(repository, update.version, [...shared.values()]));

    const allMoves = [...moves, ...peerMoves, ...chase.moves];
    const movedNames = new Set(allMoves.map(t => t.packageName));
    for (const lockFilePath of lockFilePaths) {
      DependentsStep.unlockMoved(path.join(directory, lockFilePath), movedNames);
      const ownLock = ownLocks.find(t => t.lockFilePath === lockFilePath);
      const result = ownLock === undefined
        ? await this.npm.lockAsync(path.join(directory, path.dirname(lockFilePath)), this.updateHost.credentialVariables)
        : await this.lockOwnAsync(directory, ownLock, owners);
      if (!result.isSuccessful)
        return StepResult.failed(Resources.formatRepositoryFailed(repository, Resources.formatLockFailed(lockFilePath, result.exitCode, result.errorOutput)));
    }

    const conflicts = lockFilePaths.flatMap(t => DependentsStep.findConflicts(path.join(directory, t), t, null));
    if (conflicts.length > 0)
      return StepResult.succeeded(Resources.formatRepositoryConflicted(repository, update.version, conflicts));

    const title = Resources.formatUpdateTitle(update.source, update.version);
    await git.commitAllAsync(title);
    const branch = Resources.formatUpdateBranch(update.source);
    const replaced = await this.updateHost.fetchBranchAsync(repository, directory, branch);
    if (replaced instanceof StepResult)
      return StepResult.failed(Resources.formatRepositoryFailed(repository, replaced.message));
    if (replaced !== null && !await DependentsStep.isOwnCommitAsync(git, replaced, update.source))
      return StepResult.failed(Resources.formatRepositoryFailed(repository, Resources.formatBranchNotOwn(branch, replaced)));

    const push = await this.updateHost.pushAsync(repository, directory, branch, replaced);
    if (push !== null)
      return StepResult.failed(Resources.formatRepositoryFailed(repository, push.message));

    const ownLines = ownLocks.map(t => Resources.formatOwnLocked(t.lockFilePath, [...t.pins.keys()]));
    const body = Resources.formatUpdateBody(update.source, update.version, update.commit, allMoves.map(t => t.line), lockFilePaths, ownLines, update.notes);
    const proposal = await this.updateHost.proposeAsync(repository, branch, title, body, Resources.updateIssueSummary);
    if (proposal instanceof StepResult)
      return StepResult.failed(Resources.formatRepositoryFailed(repository, proposal.message));

    return StepResult.succeeded(Resources.formatRepositoryProposed(repository, proposal, allMoves.length));
  }

  // Relocks a folder that pins the repository's own unpublished packages: each one, and each own package it reaches,
  // resolves from a stand-in archive built from its tracked manifest, so npm never asks the registry for it; then the
  // lock leaves out every entry at or under an own package, and its root entry keeps the folder's pins.
  private async lockOwnAsync(directory: string, ownLock: OwnLock, owners: ReadonlyMap<string, readonly string[]>): Promise<ProcessResult> {
    const folder = path.join(directory, path.dirname(ownLock.lockFilePath));
    const manifestPath = path.join(folder, Resources.manifestFileName);
    const standIns = `${directory}${Resources.standInFolderSuffix}`;
    fs.mkdirSync(standIns, { recursive: true });
    const text = fs.readFileSync(manifestPath, Resources.textEncoding);
    const manifest: Record<string, unknown> = JSON.parse(text);
    for (const [index, [packageName, pin]] of [...ownLock.pins].entries()) {
      const archive = path.join(standIns, `${index}${Resources.standInArchiveExtension}`);
      DependentsStep.writeStandIn(archive, DependentsStep.createStandIn(packageName, pin.manifestPaths.map(t => DependentsStep.readManifest(directory, t)), owners));
      for (const name of Resources.lockedDependencyFields) {
        const specifiers = DependentsStep.readField(manifest, name);
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
      const result = await this.npm.lockAsync(folder, this.updateHost.credentialVariables);
      if (result.isSuccessful)
        DependentsStep.leaveOutOwn(path.join(directory, ownLock.lockFilePath), new Set(ownLock.pins.keys()), JSON.parse(text));

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
    const own = new Set(manifestPaths.flatMap(t => DependentsStep.readManifest(directory, t).name ?? []));
    const isSettled = (packageName: string): boolean => moved.has(packageName) || own.has(packageName);
    const move = (packageName: string, version: string, reason: string): void => {
      const pinMoves = manifestPaths.flatMap(t => DependentsStep.movePins(path.join(directory, t), t, [{ packageName, version, reason }]));
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
          const newer = DependentsStep.readExactPins(directory, manifestPaths).filter(([t, pinned]) => t === peerName && Version.parse(pinned).compareTo(needed) > 0);
          if (newer.length > 0)
            misses.push(...newer.map(([, pinned]) => Resources.formatPeerNewer(peerName, pinned, peerVersion, packageName, version)));
          else
            move(peerName, peerVersion, Resources.formatPeerReason(packageName, version));
        }
      }

      for (const [packageName, version] of DependentsStep.readExactPins(directory, manifestPaths).filter(([t]) => !isSettled(t))) {
        const needed = DependentsStep.findNeeded(await this.readPeersAsync(directory, packageName, version, peers), moved);
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
    const candidates = DependentsStep.readVersions(await this.viewAsync(directory, packageName, Resources.npmVersionsField))
      .filter(t => Resources.exactVersionPattern.test(t) && Version.parse(t).compareTo(pinned) > 0)
      .sort((a, b) => Version.parse(a).compareTo(Version.parse(b)));
    for (const candidate of candidates) {
      const candidatePeers = await this.readPeersAsync(directory, packageName, candidate, peers);
      if (needed.every(t => candidatePeers.get(t.peerName) === t.movedVersion) && DependentsStep.findNeeded(candidatePeers, moved).length === 0)
        return candidate;
      if (needed.some(t => Version.parse(candidatePeers.get(t.peerName) ?? t.peerVersion).compareTo(Version.parse(t.movedVersion)) > 0))
        return null;
    }

    return null;
  }

  private async readPeersAsync(directory: string, packageName: string, version: string, peers: Map<string, ReadonlyMap<string, string>>): Promise<ReadonlyMap<string, string>> {
    const specifier = `${packageName}@${version}`;
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
    const result = await this.npm.viewInAsync(directory, specifier, field, this.updateHost.credentialVariables);
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

  private static readExactPins(directory: string, manifestPaths: readonly string[]): readonly (readonly [string, string])[] {
    const pins = new Map<string, readonly [string, string]>();
    for (const manifestPath of manifestPaths) {
      const manifest = DependentsStep.readManifest(directory, manifestPath);
      for (const [packageName, version] of [...Object.entries(manifest.dependencies ?? {}), ...Object.entries(manifest.devDependencies ?? {})])
        if (Resources.exactVersionPattern.test(version))
          pins.set(`${packageName}@${version}`, [packageName, version]);
    }

    return [...pins.values()];
  }

  private static readOwners(directory: string, manifestPaths: readonly string[]): ReadonlyMap<string, readonly string[]> {
    const owners = new Map<string, readonly string[]>();
    for (const manifestPath of manifestPaths) {
      const { name } = DependentsStep.readManifest(directory, manifestPath);
      if (name !== undefined)
        owners.set(name, [...owners.get(name) ?? [], manifestPath]);
    }

    return owners;
  }

  // Finds the own packages a lock folder pins exactly while its lock holds no entry for them, and every own package
  // they reach through their tracked manifests, each with the manifest field it goes in and the manifests that name it.
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
      for (const reached of manifestPaths.map(t => DependentsStep.readManifest(directory, t)))
        for (const [name, paths] of findOwn([reached.dependencies, reached.optionalDependencies, reached.peerDependencies].flatMap(t => Object.keys(t ?? {}))))
          visit(name, paths, field);
    };
    for (const field of Resources.lockedDependencyFields)
      for (const [name, paths] of findOwn(Object.entries(DependentsStep.readField(manifest, field)).filter(([, t]) => Resources.exactVersionPattern.test(t)).map(([t]) => t)))
        visit(name, paths, field);

    return pins.size === 0 ? [] : [{ lockFilePath, pins }];
  }

  private static createStandIn(packageName: string, manifests: readonly Manifest[], owners: ReadonlyMap<string, readonly string[]>): Readonly<Record<string, unknown>> {
    const external = <T>(entries: readonly (Readonly<Record<string, T>> | undefined)[]): Readonly<Record<string, T>> =>
      Object.fromEntries(entries.flatMap(t => Object.entries(t ?? {})).filter(([t]) => !owners.has(t)));

    return {
      name: packageName,
      version: Resources.standInVersion,
      dependencies: external(manifests.map(t => t.dependencies)),
      optionalDependencies: external(manifests.map(t => t.optionalDependencies)),
      peerDependencies: external(manifests.map(t => t.peerDependencies)),
      peerDependenciesMeta: external(manifests.map(t => t.peerDependenciesMeta))
    };
  }

  // Writes a gzipped tar archive holding only package/package.json, which is all npm reads to lock a package.
  private static writeStandIn(archivePath: string, manifest: Readonly<Record<string, unknown>>): void {
    const content = Buffer.from(JSON.stringify(manifest), Resources.textEncoding);
    const block = Resources.tarBlockSize;
    const header = Buffer.alloc(block);
    for (const [offset, value] of Resources.formatTarHeaderFields(Resources.standInEntryName, content.length))
      header.write(value, offset, Resources.tarHeaderEncoding);
    header.write(Resources.formatTarChecksum(header.reduce((sum, t) => sum + t, 0)), Resources.tarChecksumOffset, Resources.tarHeaderEncoding);
    const body = Buffer.alloc(Math.ceil(content.length / block) * block);
    content.copy(body);
    fs.writeFileSync(archivePath, zlib.gzipSync(Buffer.concat([header, body, Buffer.alloc(block * 2)])));
  }

  private static leaveOutOwn(lockPath: string, ownNames: ReadonlySet<string>, manifest: Readonly<Record<string, unknown>>): void {
    const lock: LockedPackages = JSON.parse(fs.readFileSync(lockPath, Resources.textEncoding));
    const isOwn = (key: string): boolean => key.split(Resources.nodeModulesSegment).slice(1).some(t => ownNames.has(t.replace(/\/$/, "")));
    const entries = Object.entries(lock.packages)
      .filter(([key]) => !isOwn(key))
      .map(([key, entry]): [string, unknown] => [key, key.length === 0 ? DependentsStep.restoreRoot(entry, manifest) : entry]);
    fs.writeFileSync(lockPath, `${JSON.stringify({ ...lock, packages: Object.fromEntries(entries) }, null, 2)}\n`);
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

  private static readField(manifest: Readonly<Record<string, unknown>>, field: string): Record<string, string> {
    const value = manifest[field];

    return typeof value === "object" && value !== null && !Array.isArray(value)
      ? Object.fromEntries(Object.entries(value).filter((t: [string, unknown]): t is [string, string] => typeof t[1] === "string"))
      : {};
  }

  private static readManifest(directory: string, manifestPath: string): Manifest {
    return JSON.parse(fs.readFileSync(path.join(directory, manifestPath), Resources.textEncoding));
  }

  private static readPeerPins(manifests: readonly JsonReader[], packageNames: readonly string[], releasedVersion: string): readonly PinTarget[] {
    const pins = new Map<string, PinTarget>();
    for (const manifest of manifests.filter(t => t.hasField(Resources.peerDependenciesField))) {
      const reason = Resources.formatPeerReason(manifest.readString(Resources.nameField), releasedVersion);
      for (const [packageName, value] of Object.entries(manifest.readObject(Resources.peerDependenciesField).toJson())) {
        const version = String(value);
        if (Resources.exactVersionPattern.test(version) && !packageNames.includes(packageName) && !pins.has(packageName))
          pins.set(packageName, { packageName, version, reason });
      }
    }

    return [...pins.values()];
  }

  private static async isOwnCommitAsync(git: Git, commit: string, source: string): Promise<boolean> {
    return await git.readCommitterAsync(commit) === await git.readCommitterAsync(Resources.gitHeadRevision)
      && (await git.readSubjectAsync(commit)).startsWith(Resources.formatUpdateTitlePrefix(source));
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
        const found = expected === null ? DependentsStep.findLocked(packages, key, peerName)?.version : expected.get(peerName);
        if (found !== undefined && found !== range && Resources.exactVersionPattern.test(range))
          conflicts.add(Resources.formatPeerBlocker(filePath, name, entry.version, peerName, range));
      }
    }

    return [...conflicts];
  }

  private static unlockMoved(fullPath: string, packageNames: ReadonlySet<string>): void {
    const lock: LockFile = JSON.parse(fs.readFileSync(fullPath, Resources.textEncoding));
    if (lock.packages === undefined)
      return;

    const entries = Object.entries(lock.packages);
    const unlocked = entries.filter(([key, entry]) => DependentsStep.isMovedOrDependent(key, entry, packageNames)).map(([key]) => key);
    const kept = entries.filter(([key]) => !unlocked.some(t => key === t || key.startsWith(`${t}/`)));
    fs.writeFileSync(fullPath, `${JSON.stringify({ ...lock, packages: Object.fromEntries(kept) }, null, 2)}\n`);
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
      const found = packages[`${base}/${Resources.nodeModulesSegment}${name}`];
      const index = base.lastIndexOf(`/${Resources.nodeModulesSegment}`);
      if (found !== undefined || index < 0)
        return found ?? packages[`${Resources.nodeModulesSegment}${name}`];

      base = base.slice(0, index);
    }
  }

  private static movePins(fullPath: string, filePath: string, targets: readonly PinTarget[]): readonly PinMove[] {
    const moves: PinMove[] = [];
    let text = fs.readFileSync(fullPath, Resources.textEncoding);
    for (const { packageName, version, reason } of targets) {
      const target = Version.parse(version);
      text = text.replace(Resources.createPinPattern(packageName), (pin: string, prefix: string, found: string, suffix: string) => {
        if (!Resources.exactVersionPattern.test(found) || Version.parse(found).compareTo(target) >= 0)
          return pin;

        const line = Resources.formatPinMoved(filePath, packageName, found, version);
        moves.push({ packageName, line: reason === null ? line : `${line}${reason}` });

        return `${prefix}${version}${suffix}`;
      });
    }
    if (moves.length > 0)
      fs.writeFileSync(fullPath, text);

    return moves;
  }
}
