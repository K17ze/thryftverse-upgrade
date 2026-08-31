import { useCallback } from 'react';

import { useHaptic } from '../../hooks/useHaptic';

/**
 * Editor haptic grammar — maps creator-surface gestures to deliberate
 * haptic calls so the 526 ad-hoc `haptic.light()` / `haptic.selection()`
 * sites in `src/creator/` can migrate to a single typed vocabulary.
 *
 * Per 2026 haptics research (AGENTS.md §13, §27.9):
 *   - Haptics are a language, not a uniform buzz.
 *   - "Safe-rack" haptics strengthen as an element approaches the correct
 *     setting.
 *   - Haptics fire on destructive, celebratory, and error events — not
 *     on every tap.
 *
 * The grammar composes `useHaptic` primitives only; the AHAP engine is a
 * platform concern accessed via `useHaptic().playPattern` when richer
 * feedback is warranted.
 */
export interface EditorHapticGrammar {
  /** Light selection tick when a layer snaps to a guide/collision. */
  snapToGuide: () => void;
  /** Tick on bring-to-front / send-to-back. */
  zOrderChange: () => void;
  /** Light impact on add layer. */
  layerAdd: () => void;
  /** Selection tick on layer select/deselect. */
  layerSelect: () => void;
  /** Medium impact + warning on trash-zone removal. */
  deleteLayer: () => void;
  /** Success composition on publish. */
  publishSuccess: () => void;
  /** Light tick on rail/surface swap. */
  railSwap: () => void;
  /** Light tick on tool selection. */
  toolSelect: () => void;
  /** Medium impact on crop/transform commit. */
  transformCommit: () => void;
  /** Error on invalid action. */
  invalidAction: () => void;
}

export function useEditorHapticGrammar(): EditorHapticGrammar {
  const haptic = useHaptic();

  return {
    snapToGuide: useCallback(() => haptic.selection(), [haptic]),
    zOrderChange: useCallback(() => haptic.selection(), [haptic]),
    layerAdd: useCallback(() => haptic.light(), [haptic]),
    layerSelect: useCallback(() => haptic.selection(), [haptic]),
    deleteLayer: useCallback(() => {
      haptic.medium();
      haptic.warning();
    }, [haptic]),
    publishSuccess: useCallback(() => haptic.success(), [haptic]),
    railSwap: useCallback(() => haptic.selection(), [haptic]),
    toolSelect: useCallback(() => haptic.selection(), [haptic]),
    transformCommit: useCallback(() => haptic.medium(), [haptic]),
    invalidAction: useCallback(() => haptic.error(), [haptic]),
  };
}
