/**
 * @license
 * Copyright (c) Noldova.
 *
 * This source code is licensed under the license found in the
 * LICENSE file in the root directory of this source tree.
 */


import zlib from "node:zlib";

// Reads one file from a zip archive, such as an artifact GitHub serves, through the archive's central directory, which
// holds every entry's sizes even when its local header defers them.
export class ZipArchive {
  private static readonly END_SIGNATURE: Buffer = Buffer.from([0x50, 0x4b, 0x05, 0x06]);
  private static readonly END_ENTRY_COUNT_OFFSET: number = 10;
  private static readonly END_DIRECTORY_OFFSET: number = 16;
  private static readonly ENTRY_METHOD_OFFSET: number = 10;
  private static readonly ENTRY_COMPRESSED_SIZE_OFFSET: number = 20;
  private static readonly ENTRY_NAME_LENGTH_OFFSET: number = 28;
  private static readonly ENTRY_EXTRA_LENGTH_OFFSET: number = 30;
  private static readonly ENTRY_COMMENT_LENGTH_OFFSET: number = 32;
  private static readonly ENTRY_LOCAL_OFFSET: number = 42;
  private static readonly ENTRY_HEADER_LENGTH: number = 46;
  private static readonly LOCAL_NAME_LENGTH_OFFSET: number = 26;
  private static readonly LOCAL_EXTRA_LENGTH_OFFSET: number = 28;
  private static readonly LOCAL_HEADER_LENGTH: number = 30;
  private static readonly STORED_METHOD: number = 0;

  public static readText(archive: Buffer, name: string): string | null {
    const end = archive.lastIndexOf(ZipArchive.END_SIGNATURE);
    if (end < 0)
      return null;

    let offset = archive.readUInt32LE(end + ZipArchive.END_DIRECTORY_OFFSET);
    for (let index = archive.readUInt16LE(end + ZipArchive.END_ENTRY_COUNT_OFFSET); index > 0; index--) {
      const nameLength = archive.readUInt16LE(offset + ZipArchive.ENTRY_NAME_LENGTH_OFFSET);
      const nameStart = offset + ZipArchive.ENTRY_HEADER_LENGTH;
      if (archive.toString("utf8", nameStart, nameStart + nameLength) === name) {
        const local = archive.readUInt32LE(offset + ZipArchive.ENTRY_LOCAL_OFFSET);
        const start = local + ZipArchive.LOCAL_HEADER_LENGTH + archive.readUInt16LE(local + ZipArchive.LOCAL_NAME_LENGTH_OFFSET) + archive.readUInt16LE(local + ZipArchive.LOCAL_EXTRA_LENGTH_OFFSET);
        const data = archive.subarray(start, start + archive.readUInt32LE(offset + ZipArchive.ENTRY_COMPRESSED_SIZE_OFFSET));

        return (archive.readUInt16LE(offset + ZipArchive.ENTRY_METHOD_OFFSET) === ZipArchive.STORED_METHOD ? data : zlib.inflateRawSync(data)).toString("utf8");
      }

      offset = nameStart + nameLength + archive.readUInt16LE(offset + ZipArchive.ENTRY_EXTRA_LENGTH_OFFSET) + archive.readUInt16LE(offset + ZipArchive.ENTRY_COMMENT_LENGTH_OFFSET);
    }

    return null;
  }
}
