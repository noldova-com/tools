/**
 * @license
 * Copyright (c) Noldova.
 *
 * This source code is licensed under the license found in the
 * LICENSE file in the root directory of this source tree.
 */

export class StepResult {
  public readonly isSuccessful: boolean;
  public readonly message: string;

  private constructor(isSuccessful: boolean, message: string) {
    this.isSuccessful = isSuccessful;
    this.message = message;
  }

  public static succeeded(message: string): StepResult {
    return new StepResult(true, message);
  }

  public static failed(message: string): StepResult {
    return new StepResult(false, message);
  }
}
