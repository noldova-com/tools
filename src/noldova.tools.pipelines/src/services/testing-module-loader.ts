/**
 * @license
 * Copyright (c) Noldova.
 *
 * This source code is licensed under the license found in the
 * LICENSE file in the root directory of this source tree.
 */


import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";

import type { ITestingModule } from "../interfaces/i-testing-module.js";
import { Resources } from "../resources.js";

// Loads the checkout's own @noldova/context.testing, the version its tests run with, rather than one of the build tool's.
export class TestingModuleLoader {
  // Returns the module, or null after writing why to standard error when the checkout doesn't have it installed.
  public static async loadAsync(): Promise<ITestingModule | null> {
    let modulePath: string;
    try {
      modulePath = createRequire(path.resolve(Resources.manifestFileName)).resolve(Resources.testingPackageName);
    }
    catch (error: unknown) {
      if (!(error instanceof Error && Resources.codeField in error && error.code === Resources.moduleNotFoundCode))
        throw error;

      process.stderr.write(`${Resources.testingMissing}${Resources.lineSeparator}`);
      return null;
    }

    // The checkout's module is found by path at run time, so no static import can name it; the interface is the shape the steps read.
    const testing: ITestingModule = await import(pathToFileURL(modulePath).href);
    return testing;
  }
}
