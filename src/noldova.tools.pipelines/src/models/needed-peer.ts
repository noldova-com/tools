/**
 * @license
 * Copyright (c) Noldova.
 *
 * This source code is licensed under the license found in the
 * LICENSE file in the root directory of this source tree.
 */

export class NeededPeer {
  public readonly peerName: string;
  public readonly peerVersion: string;
  public readonly movedVersion: string;

  public constructor(peerName: string, peerVersion: string, movedVersion: string) {
    this.peerName = peerName;
    this.peerVersion = peerVersion;
    this.movedVersion = movedVersion;
  }
}
