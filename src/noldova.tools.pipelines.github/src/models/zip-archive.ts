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
  public static readText(archive: Buffer, name: string): string | null | StepResult {
    const end = archive.lastIndexOf(Buffer.from(Resources.zipEndSignature));
    if (end < 0)
      return null;

    const read = (part: string, start: number, length: number, value: () => number): number | StepResult =>
      start + length <= archive.length ? value() : StepResult.failed(Resources.formatZipOutOfRange(part, start, length, archive.length));
    const endRecord = read(Resources.zipEndRecordPart, end, Resources.zipEndLength, () => archive.readUInt32LE(end + Resources.zipEndDirectoryOffset));
    if (endRecord instanceof StepResult)
      return endRecord;

    let offset = endRecord;
    for (let index = archive.readUInt16LE(end + Resources.zipEndEntryCountOffset); index > 0; index--) {
      const header = offset;
      const nameLength = read(Resources.zipEntryPart, header, Resources.zipEntryHeaderLength, () => archive.readUInt16LE(header + Resources.zipEntryNameLengthOffset));
      if (nameLength instanceof StepResult)
        return nameLength;

      const nameStart = header + Resources.zipEntryHeaderLength;
      if (archive.toString(Resources.textEncoding, nameStart, nameStart + nameLength) === name)
        return ZipArchive.readEntry(archive, header, name, read);

      offset = nameStart + nameLength + archive.readUInt16LE(header + Resources.zipEntryExtraLengthOffset) + archive.readUInt16LE(header + Resources.zipEntryCommentLengthOffset);
    }

    return null;
  }

  private static readEntry(archive: Buffer, header: number, name: string, read: (part: string, start: number, length: number, value: () => number) => number | StepResult): string | StepResult {
    const method = archive.readUInt16LE(header + Resources.zipEntryMethodOffset);
    if (method !== Resources.zipStoredMethod && method !== Resources.zipDeflatedMethod)
      return StepResult.failed(Resources.formatZipMethodUnsupported(name, method));

    const local = archive.readUInt32LE(header + Resources.zipEntryLocalOffset);
    const start = read(Resources.zipLocalHeaderPart, local, Resources.zipLocalHeaderLength,
      () => local + Resources.zipLocalHeaderLength + archive.readUInt16LE(local + Resources.zipLocalNameLengthOffset) + archive.readUInt16LE(local + Resources.zipLocalExtraLengthOffset));
    if (start instanceof StepResult)
      return start;

    const size = archive.readUInt32LE(header + Resources.zipEntryCompressedSizeOffset);
    const fits = read(Resources.formatZipDataPart(name), start, size, () => size);
    if (fits instanceof StepResult)
      return fits;

    const data = archive.subarray(start, start + size);

    return (method === Resources.zipStoredMethod ? data : zlib.inflateRawSync(data)).toString(Resources.textEncoding);
  }
}
