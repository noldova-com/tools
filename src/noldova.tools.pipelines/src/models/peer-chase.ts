/**
 * @license
 * Copyright (c) Noldova.
 *
 * This source code is licensed under the license found in the
 * LICENSE file in the root directory of this source tree.
 */

import type { PinMove } from "./pin-move.js";

export class PeerChase {
  public readonly moves: readonly PinMove[];
  public readonly misses: readonly string[];

  public constructor(moves: readonly PinMove[], misses: readonly string[]) {
    this.moves = moves;
    this.misses = misses;
  }
}
