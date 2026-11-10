/**
 * @license
 * Copyright (c) Noldova.
 *
 * This source code is licensed under the license found in the
 * LICENSE file in the root directory of this source tree.
 */


import zlib from "node:zlib";

export interface ZipEntry {
  readonly name: string;
  readonly text: string;
  readonly isDeflated: boolean;
}

// Writes a zip archive as GitHub serves an artifact, without checksums, which the reader doesn't check.
export class ZipArchiveFixture {
  public static create(entries: readonly ZipEntry[]): Buffer {
    const locals: Buffer[] = [];
    const centrals: Buffer[] = [];
    let offset = 0;
    for (const entry of entries) {
      const name = Buffer.from(entry.name, "utf8");
      const text = Buffer.from(entry.text, "utf8");
      const data = entry.isDeflated ? zlib.deflateRawSync(text) : text;
      const method = entry.isDeflated ? 8 : 0;
      const local = Buffer.alloc(30);
      local.writeUInt32LE(0x04034b50, 0);
      local.writeUInt16LE(20, 4);
      local.writeUInt16LE(method, 8);
      local.writeUInt32LE(data.length, 18);
      local.writeUInt32LE(text.length, 22);
      local.writeUInt16LE(name.length, 26);
      const comment = Buffer.from("a comment", "utf8");
      const central = Buffer.alloc(46);
      central.writeUInt32LE(0x02014b50, 0);
      central.writeUInt16LE(20, 4);
      central.writeUInt16LE(20, 6);
      central.writeUInt16LE(method, 10);
      central.writeUInt32LE(data.length, 20);
      central.writeUInt32LE(text.length, 24);
      central.writeUInt16LE(name.length, 28);
      central.writeUInt16LE(comment.length, 32);
      central.writeUInt32LE(offset, 42);
      locals.push(local, name, data);
      centrals.push(central, name, comment);
      offset += local.length + name.length + data.length;
    }

    const directory = Buffer.concat(centrals);
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0);
    end.writeUInt16LE(entries.length, 8);
    end.writeUInt16LE(entries.length, 10);
    end.writeUInt32LE(directory.length, 12);
    end.writeUInt32LE(offset, 16);

    return Buffer.concat([...locals, directory, end]);
  }
}
