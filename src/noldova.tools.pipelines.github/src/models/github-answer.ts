/**
 * @license
 * Copyright (c) Noldova.
 *
 * This source code is licensed under the license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { ExceptionOptions } from "@noldova/context.exceptions";
import { JsonException, JsonReader } from "@noldova/context.json";
import { StepResult } from "@noldova/tools.pipelines";

import { Resources } from "../resources.js";

export class GitHubAnswer {
  public readonly method: string;
  public readonly resource: string;
  public readonly status: number;
  public readonly statusText: string;
  public readonly contentType: string;
  public readonly retryAfter: string;
  public readonly text: string;

  public constructor(method: string, resource: string, status: number, statusText: string, contentType: string, retryAfter: string, text: string) {
    this.method = method;
    this.resource = resource;
    this.status = status;
    this.statusText = statusText;
    this.contentType = contentType;
    this.retryAfter = retryAfter;
    this.text = text;
  }

  public readBody(): JsonReader {
    return JsonReader.parse(this.text, this.resource);
  }

  public readItems(): readonly JsonReader[] {
    let value: unknown;
    try {
      value = JSON.parse(this.text);
    }
    catch (error: unknown) {
      throw new JsonException(Resources.answerNotJson, this.resource, new ExceptionOptions(error));
    }

    return JsonReader.fromValue({ [Resources.itemsField]: value }, this.resource).readObjectArray(Resources.itemsField);
  }

  public readMessage(): string {
    const text = this.text.trim();
    if (text.length === 0)
      return this.statusText;
    if (!Resources.jsonContentTypePattern.test(this.contentType) || !text.startsWith(Resources.jsonObjectStart))
      return text;

    return this.readBody().readOptionalString(Resources.messageField) ?? text;
  }

  public readRetryMilliseconds(unavailableMilliseconds: number): number | null {
    if (this.status < Resources.firstFailureStatus)
      return null;
    if (!Resources.retryAfterPattern.test(this.retryAfter))
      return Resources.unavailableStatuses.includes(this.status) ? unavailableMilliseconds : null;

    const seconds = Number(this.retryAfter);

    return seconds <= Resources.retryAfterMaxSeconds ? seconds * Resources.millisecondsPerSecond : null;
  }

  public toFailure(): StepResult {
    return StepResult.failed(Resources.formatApiFailed(this.method, this.resource, this.status, this.readMessage()));
  }
}
