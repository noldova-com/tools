/**
 * @license
 * Copyright (c) Noldova.
 *
 * This source code is licensed under the license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { once } from "node:events";
import http from "node:http";

interface PublishedVersion {
  readonly dependencies?: Readonly<Record<string, string>>;
  readonly peerDependencies?: Readonly<Record<string, string>>;
}

// A registry on the loopback address that serves only the packuments of the versions published to it, which is all
// `npm install --package-lock-only` reads: npm resolves a lock file from them without fetching a tarball.
export class LocalRegistryFixture implements AsyncDisposable {
  private static readonly HOST: string = "127.0.0.1";

  public readonly url: string;
  private readonly server: http.Server;
  private readonly packages: Map<string, Map<string, PublishedVersion>> = new Map();

  private constructor(server: http.Server, url: string) {
    this.server = server;
    this.url = url;
  }

  public static async startAsync(): Promise<LocalRegistryFixture> {
    let registry: LocalRegistryFixture | null = null;
    const server = http.createServer((request, response) => registry?.answer(request, response));
    server.listen(0, LocalRegistryFixture.HOST);
    await once(server, "listening");
    const address = server.address();
    if (address === null || typeof address === "string")
      throw new Error("The local registry has no port.");

    registry = new LocalRegistryFixture(server, `http://${LocalRegistryFixture.HOST}:${address.port}/`);

    return registry;
  }

  public publish(name: string, version: string, published: PublishedVersion = {}): void {
    const versions = this.packages.get(name) ?? new Map<string, PublishedVersion>();
    versions.set(version, published);
    this.packages.set(name, versions);
  }

  public async [Symbol.asyncDispose](): Promise<void> {
    this.server.closeAllConnections();
    this.server.close();
    await once(this.server, "close");
  }

  private answer(request: http.IncomingMessage, response: http.ServerResponse): void {
    const name = decodeURIComponent((request.url ?? "/").slice(1));
    const versions = this.packages.get(name);
    if (versions === undefined) {
      response.writeHead(404, { "content-type": "application/json" });
      response.end("{}");
      return;
    }

    const latest = [...versions.keys()].at(-1);
    const packument = {
      name,
      "dist-tags": { latest },
      versions: Object.fromEntries([...versions].map(([version, published]) =>
        [version, { name, version, ...published, dist: { tarball: `${this.url}${name}/-/${name.split("/").at(-1)}-${version}.tgz` } }]))
    };
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify(packument));
  }
}
