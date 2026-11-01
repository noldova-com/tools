/**
 * @license
 * Copyright (c) Noldova.
 *
 * This source code is licensed under the license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { Assert, TestClass, TestMethod } from "@noldova/context.testing";
import * as api from "@noldova/tools.pipelines";

@TestClass
export class PipelinesApiTests {
  @TestMethod
  public exportsTheCompleteCatalog(): void {
    Assert.areEqual("ArchiveCheck,ArchiveStep,CommandLine,Git,Npm,PackageArchive,PipelineException,ProcessException,ProcessResult,ProcessRunner,PublishStep,SourceStep,StepResult,Tar,Version,VersionException", Object.keys(api).sort().join(","));
  }
}
