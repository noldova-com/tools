/**
 * @license
 * Copyright (c) Noldova.
 *
 * This source code is licensed under the license found in the
 * LICENSE file in the root directory of this source tree.
 */


import zlib from "node:zlib";

import { StepResult } from "@noldova/tools.pipelines";

import { Resources } from "../resources.js";

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
  private static readonly DEFLATED_METHOD: number = 8;
  private static readonly END_LENGTH: number = 22;
  private static readonly NAME_ENCODING: BufferEncoding = "utf8";

  public static readText(archive: Buffer, name: string): string | null | StepResult {
    const end = archive.lastIndexOf(ZipArchive.END_SIGNATURE);
    if (end < 0)
      return null;

    const read = (part: string, start: number, length: number, value: () => number): number | StepResult =>
      start + length <= archive.length ? value() : StepResult.failed(Resources.formatZipOutOfRange(part, start, length, archive.length));
    const endRecord = read(Resources.zipEndRecordPart, end, ZipArchive.END_LENGTH, () => archive.readUInt32LE(end + ZipArchive.END_DIRECTORY_OFFSET));
    if (endRecord instanceof StepResult)
      return endRecord;

    let offset = endRecord;
    for (let index = archive.readUInt16LE(end + ZipArchive.END_ENTRY_COUNT_OFFSET); index > 0; index--) {
      const header = offset;
      const nameLength = read(Resources.zipEntryPart, header, ZipArchive.ENTRY_HEADER_LENGTH, () => archive.readUInt16LE(header + ZipArchive.ENTRY_NAME_LENGTH_OFFSET));
      if (nameLength instanceof StepResult)
        return nameLength;

      const nameStart = header + ZipArchive.ENTRY_HEADER_LENGTH;
      if (archive.toString(ZipArchive.NAME_ENCODING, nameStart, nameStart + nameLength) === name)
        return ZipArchive.readEntry(archive, header, name, read);

      offset = nameStart + nameLength + archive.readUInt16LE(header + ZipArchive.ENTRY_EXTRA_LENGTH_OFFSET) + archive.readUInt16LE(header + ZipArchive.ENTRY_COMMENT_LENGTH_OFFSET);
    }

    return null;
  }

  private static readEntry(archive: Buffer, header: number, name: string, read: (part: string, start: number, length: number, value: () => number) => number | StepResult): string | StepResult {
    const method = archive.readUInt16LE(header + ZipArchive.ENTRY_METHOD_OFFSET);
    if (method !== ZipArchive.STORED_METHOD && method !== ZipArchive.DEFLATED_METHOD)
      return StepResult.failed(Resources.formatZipMethodUnsupported(name, method));

    const local = archive.readUInt32LE(header + ZipArchive.ENTRY_LOCAL_OFFSET);
    const start = read(Resources.zipLocalHeaderPart, local, ZipArchive.LOCAL_HEADER_LENGTH,
      () => local + ZipArchive.LOCAL_HEADER_LENGTH + archive.readUInt16LE(local + ZipArchive.LOCAL_NAME_LENGTH_OFFSET) + archive.readUInt16LE(local + ZipArchive.LOCAL_EXTRA_LENGTH_OFFSET));
    if (start instanceof StepResult)
      return start;

    const size = archive.readUInt32LE(header + ZipArchive.ENTRY_COMPRESSED_SIZE_OFFSET);
    const fits = read(Resources.formatZipDataPart(name), start, size, () => size);
    if (fits instanceof StepResult)
      return fits;

    const data = archive.subarray(start, start + size);

    return (method === ZipArchive.STORED_METHOD ? data : zlib.inflateRawSync(data)).toString(ZipArchive.NAME_ENCODING);
  }
}
