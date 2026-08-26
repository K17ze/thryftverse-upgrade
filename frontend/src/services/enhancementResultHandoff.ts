/**
 * Enhancement result handoff — a lightweight module-level store for passing
 * a result from the AIPhotoEnhancement modal back to its caller.
 *
 * React Navigation v7 doesn't support non-serializable params (callbacks),
 * and `navigation.setParams` on the parent is awkward from a pushed screen.
 * This module-level store is the simplest clean pattern: the enhancement
 * screen writes the result before `goBack()`, and the caller reads it in
 * `useFocusEffect` when it regains focus.
 *
 * This is not a global store — it is a single-slot handoff consumed exactly
 * once. `consumeEnhancementResult()` clears the slot so a stale result can
 * never be applied twice.
 */

export interface EnhancementHandoffResult {
  originalUri: string;
  enhancedUri: string;
  appliedOperationLabel: string;
}

let pendingResult: EnhancementHandoffResult | null = null;

/** Write the result. Called by the enhancement screen before `navigation.goBack()`. */
export function setEnhancementResult(result: EnhancementHandoffResult): void {
  pendingResult = result;
}

/**
 * Read and clear the result. Called by the parent screen in `useFocusEffect`
 * when it regains focus after the enhancement modal closes.
 *
 * Returns `null` if no result was set (user backed out without applying,
 * or the capability was unavailable).
 */
export function consumeEnhancementResult(): EnhancementHandoffResult | null {
  const result = pendingResult;
  pendingResult = null;
  return result;
}
