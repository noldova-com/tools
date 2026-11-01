/**
 * @license
 * Copyright (c) Noldova.
 *
 * This source code is licensed under the license found in the
 * LICENSE file in the root directory of this source tree.
 */

export class CommandFailedException extends Error {
  public constructor(message: string) {
    super(message);

    this.name = CommandFailedException.name;
  }
}
