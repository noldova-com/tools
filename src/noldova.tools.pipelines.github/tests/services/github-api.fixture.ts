/**
 * @license
 * Copyright (c) Noldova.
 *
 * This source code is licensed under the license found in the
 * LICENSE file in the root directory of this source tree.
 */

import http from "node:http";
import type { AddressInfo } from "node:net";
import { setTimeout } from "node:timers/promises";

export class GitHubApiAnswer {
  public readonly status: number;
  public readonly body: string;
  public readonly contentType: string;

  public constructor(status: number, body: string, contentType: string = "application/json; charset=utf-8") {
    this.status = status;
    this.body = body;
    this.contentType = contentType;
  }

  public static json(status: number, value: unknown): GitHubApiAnswer {
    return new GitHubApiAnswer(status, JSON.stringify(value));
  }
}

export class GitHubApiRequest {
  public readonly method: string;
  public readonly url: string;
  public readonly headers: http.IncomingHttpHeaders;
  public readonly body: string;

  public constructor(method: string, url: string, headers: http.IncomingHttpHeaders, body: string) {
    this.method = method;
    this.url = url;
    this.headers = headers;
    this.body = body;
  }
}

export class GitHubApiFixture implements AsyncDisposable {
  private static readonly HOST: string = "127.0.0.1";
  private static readonly TCP_RESOURCE_TYPES: readonly string[] = ["TCPServerWrap", "TCPSocketWrap"];

  private readonly server: http.Server;
  private readonly answers: Map<string, GitHubApiAnswer[]>;
  private readonly tcpResourceCountBefore: number = GitHubApiFixture.countTcpResources();

  public readonly requests: GitHubApiRequest[] = [];

  private constructor(answers: Readonly<Record<string, GitHubApiAnswer | readonly GitHubApiAnswer[]>>) {
    this.answers = new Map(Object.entries(answers).map(([key, answer]) => [key, answer instanceof GitHubApiAnswer ? [answer] : [...answer]]));
    this.server = http.createServer((request, response) => {
      const chunks: Buffer[] = [];
      request.on("data", (chunk: Buffer) => chunks.push(chunk));
      request.on("end", () => {
        const method = request.method ?? "";
        const url = request.url ?? "";
        this.requests.push(new GitHubApiRequest(method, url, request.headers, Buffer.concat(chunks).toString("utf8")));

        const queued = this.answers.get(`${method} ${url}`) ?? [];
        const answer = (queued.length > 1 ? queued.shift() : queued[0]) ?? GitHubApiAnswer.json(404, { message: "Not Found" });
        response.writeHead(answer.status, { "Connection": "close", ...(answer.contentType.length === 0 ? {} : { "Content-Type": answer.contentType }) });
        response.end(answer.body);
      });
    });
  }

  public get url(): string {
    const address: AddressInfo | string | null = this.server.address();
    if (address === null || typeof address === "string")
      throw new Error("The server listens on no port.");

    return `http://${GitHubApiFixture.HOST}:${address.port}`;
  }

  public static async startAsync(answers: Readonly<Record<string, GitHubApiAnswer | readonly GitHubApiAnswer[]>>): Promise<GitHubApiFixture> {
    const fixture = new GitHubApiFixture(answers);
    await new Promise<void>(resolve => fixture.server.listen(0, GitHubApiFixture.HOST, resolve));

    return fixture;
  }

  public async [Symbol.asyncDispose](): Promise<void> {
    this.server.closeAllConnections();
    await new Promise<void>(resolve => this.server.close(() => resolve()));
    while (GitHubApiFixture.countTcpResources() > this.tcpResourceCountBefore)
      await setTimeout(0);
  }

  private static countTcpResources(): number {
    return process.getActiveResourcesInfo().filter(t => GitHubApiFixture.TCP_RESOURCE_TYPES.includes(t)).length;
  }
}
