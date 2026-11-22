/**
 * @license
 * Copyright (c) Noldova.
 *
 * This source code is licensed under the license found in the
 * LICENSE file in the root directory of this source tree.
 */

import type { LockScope } from "./lock-scope.js";

export class ScopeExpectation {
  public readonly scope: LockScope;
  public readonly expected: ReadonlyMap<string, string>;

  public constructor(scope: LockScope, expected: ReadonlyMap<string, string>) {
    this.scope = scope;
    this.expected = expected;
  }
}
