/**
 * @license
 * Copyright (c) Noldova.
 *
 * This source code is licensed under the license found in the
 * LICENSE file in the root directory of this source tree.
 */

export class WorkflowChanges {
  public readonly moves: readonly string[];
  public readonly majors: readonly string[];
  public readonly left: readonly string[];

  public constructor(moves: readonly string[], majors: readonly string[], left: readonly string[]) {
    this.moves = moves;
    this.majors = majors;
    this.left = left;
  }
}
