/**
 * @license
 * Copyright (c) Noldova.
 *
 * This source code is licensed under the license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { PackageInfo } from "./package-info.ts";

export class Config {
  public static readonly BUILD_FOLDER: string = "_build/packages";
  public static readonly COVERAGE_FOLDER: string = "_build/coverage";
  public static readonly PACKAGES_FOLDER: string = "_packages";
  public static readonly TESTS_FOLDER: string = "_build/tests";
  public static readonly VERSION_FILE_PATH: string = "version.json";

  public static readonly PACKAGES_INFO: readonly PackageInfo[] = [
    new PackageInfo("noldova.tools.pipelines", "@noldova/tools.pipelines"),
    new PackageInfo("noldova.tools.pipelines.github", "@noldova/tools.pipelines.github")
  ];
}
