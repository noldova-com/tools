/**
 * @license
 * Copyright (c) Noldova.
 *
 * This source code is licensed under the license found in the
 * LICENSE file in the root directory of this source tree.
 */

export class Resources {
  public static readonly annotationEscapes: readonly (readonly [string, string])[] = [["%", "%25"], ["\r", "%0D"], ["\n", "%0A"]];
  public static readonly lineSeparator: string = "\n";
  public static readonly programName: string = "pipelines";

  public static formatErrorAnnotation(message: string): string {
    const escaped = Resources.annotationEscapes.reduce((text, [character, escape]) => text.replaceAll(character, escape), message);

    return `::error::${escaped}${Resources.lineSeparator}`;
  }
}
