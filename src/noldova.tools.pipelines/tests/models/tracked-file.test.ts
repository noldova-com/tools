/**
 * @license
 * Copyright (c) Noldova.
 *
 * This source code is licensed under the license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { Assert, TestClass, TestMethod } from "@noldova/context.testing";
import { TrackedFile } from "@noldova/tools.pipelines";

@TestClass
export class TrackedFileTests {
  @TestMethod
  public keepsThePathTheLineEndingsAndWhetherItIsText(): void {
    const file = new TrackedFile("src/a.ts", "crlf", true);

    Assert.areEqual("src/a.ts", file.filePath);
    Assert.areEqual("crlf", file.lineEndings);
    Assert.isTrue(file.isText);
  }
}
