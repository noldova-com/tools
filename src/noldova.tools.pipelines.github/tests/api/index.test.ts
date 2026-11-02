/**
 * @license
 * Copyright (c) Noldova.
 *
 * This source code is licensed under the license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { Assert, TestClass, TestMethod } from "@noldova/context.testing";
import * as api from "@noldova/tools.pipelines.github";

@TestClass
export class PipelinesGitHubApiTests {
  @TestMethod
  public exportsTheCompleteCatalog(): void {
    Assert.areEqual("GitHubPackages,GitHubStepOutput,GitHubTags,PipelinesProgram", Object.keys(api).sort().join(","));
  }
}
