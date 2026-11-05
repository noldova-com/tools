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
    Assert.areEqual("ArchiveCheck,ArchiveStep,BuildConfig,BuildException,BuildPackage,BuildStep,CommandLine,DependentsStep,Git,InstalledStep,LineEndingsStep,NightlyStep,Npm,PackageArchive,PinsStep,PipelineException,ProcessException,ProcessResult,ProcessRunner,PruneStep,PublishStep,ReproducibleStep,SourceStep,StepResult,TagStep,Tar,TestStep,ToolchainStep,TrackedFile,TypeScript,UnchangedStep,Version,VersionException", Object.keys(api).sort().join(","));
  }
}
