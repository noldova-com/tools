/**
 * @license
 * Copyright (c) Noldova.
 *
 * This source code is licensed under the license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { JsonReader } from "@noldova/context.json";
import { StepResult } from "@noldova/tools.pipelines";

import { Resources } from "../resources.js";

export class GitHubAnswer {
  public readonly method: string;
  public readonly resource: string;
  public readonly status: number;
  public readonly statusText: string;
  public readonly contentType: string;
  public readonly text: string;

  public constructor(method: string, resource: string, status: number, statusText: string, contentType: string, text: string) {
    this.method = method;
    this.resource = resource;
    this.status = status;
    this.statusText = statusText;
    this.contentType = contentType;
    this.text = text;
  }

  public readBody(): JsonReader {
    return JsonReader.parse(this.text, this.resource);
  }

  public readMessage(): string {
    const text = this.text.trim();
    if (text.length === 0)
      return this.statusText;
    if (!Resources.jsonContentTypePattern.test(this.contentType))
      return text;

    return this.readBody().readOptionalString(Resources.messageField) ?? text;
  }

  public toFailure(): StepResult {
    return StepResult.failed(Resources.formatApiFailed(this.method, this.resource, this.status, this.readMessage()));
  }
}
