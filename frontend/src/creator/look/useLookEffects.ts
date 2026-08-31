/**
 * useLookEffects — Effects system hook for the Look composer.
 *
 * Extracted from LookComposerScreen to separate the effects subsystem
 * (effect node management, auto-adjust computation, effect
 * application/removal handlers) from the screen's rendering orchestration.
 *
 * The hook is self-contained: it accepts the selected layer, the
 * `updateLayer` mutation (history-pushing) and `updateLayerLive` mutation
 * (no-history, for live drag previews) from CreatorContext, and returns
 * all derived effect state plus handlers. The screen consumes these
 * values to render the effects bottom surface and wire the AIEffectBrowserSheet.
 */

import { useCallback, useMemo, useState } from 'react';
import type { CreatorLayer, EffectNode } from '../composition';
import type { AdjustNode, AdjustParameterId } from '../tools/effects';
import { ADJUST_PARAM_MAP, computeAutoAdjust, isAutoAdjustNode } from '../tools/effects';

// ── Types ────────────────────────────────────────────────────────────

/**
 * The media layer extracted from the selected layer, or null when the
 * selection is not a media layer.
 */
type MediaLayer = Extract<CreatorLayer, { type: 'media' }>;

/**
 * The mutation signature from CreatorContext.updateLayer (history-pushing).
 */
type UpdateLayerFn = (
  id: string,
  updates: Partial<CreatorLayer>,
  label?: string,
) => void;

/**
 * The mutation signature from CreatorContext.updateLayerLive (no-history).
 * Used for live drag previews that must not spam the undo stack.
 */
type UpdateLayerLiveFn = (
  id: string,
  updates: Partial<CreatorLayer>,
) => void;

// ── Hook ─────────────────────────────────────────────────────────────

export function useLookEffects(
  selectedLayer: CreatorLayer | null,
  updateLayer: UpdateLayerFn,
  updateLayerLive: UpdateLayerLiveFn,
) {
  // ── Derived media layer & effect state ────────────────────────────
  const selectedMediaLayer: MediaLayer | null =
    selectedLayer?.type === 'media' ? selectedLayer : null;
  const effectsSourceUri = selectedMediaLayer?.payload.mediaUri ?? '';
  const currentEffects: EffectNode[] = selectedMediaLayer?.payload.effects ?? [];

  // ── Selected filter ID (from the effect stack) ────────────────────
  const selectedFilterId = useMemo(() => {
    const filterNode = currentEffects.find((n) => n.type === 'filter');
    return filterNode?.type === 'filter' ? filterNode.id : null;
  }, [currentEffects]);

  // ── Active AI effect ID (filter nodes prefixed `ai:`) ─────────────
  const activeAIEffectId = useMemo(() => {
    const aiNode = currentEffects.find(
      (n) => n.type === 'filter' && n.id.startsWith('ai:'),
    );
    return aiNode?.type === 'filter' ? aiNode.id.slice(3) : null;
  }, [currentEffects]);

  // ── Current filter intensity (from the effect stack) ──────────────
  // Derived from the filter node's `amount`. A local `liveFilterAmount`
  // overrides this during slider drag for immediate UI response; it
  // resets to null on commit so the derived value re-syncs.
  const currentFilterAmount = useMemo(() => {
    const filterNode = currentEffects.find((n) => n.type === 'filter');
    return filterNode?.type === 'filter' ? filterNode.amount : 1;
  }, [currentEffects]);

  const [liveFilterAmount, setLiveFilterAmount] = useState<number | null>(null);
  const filterAmount = liveFilterAmount ?? currentFilterAmount;

  // ── Current manual adjustments ────────────────────────────────────
  const currentAdjustments = useMemo<Partial<Omit<AdjustNode, 'type'>>>(() => {
    const adjustNode = currentEffects.find((n) => n.type === 'adjust');
    if (adjustNode?.type !== 'adjust') return {};
    const { type: _t, ...rest } = adjustNode;
    return rest;
  }, [currentEffects]);

  // ── Filter select handler ─────────────────────────────────────────
  const handleEffectFilterSelect = useCallback(
    (presetId: string) => {
      if (!selectedMediaLayer) return;
      setLiveFilterAmount(null);
      const newEffects: EffectNode[] = [
        ...currentEffects.filter((n) => n.type !== 'filter'),
        { type: 'filter', id: presetId, amount: 1 },
      ];
      updateLayer(
        selectedMediaLayer.id,
        {
          type: 'media',
          payload: { ...selectedMediaLayer.payload, effects: newEffects },
        },
        'Apply filter',
      );
    },
    [selectedMediaLayer, currentEffects, updateLayer],
  );

  // ── Filter intensity handlers ─────────────────────────────────────
  // Live: updates the filter node's `amount` without pushing to history
  // so the slider drag doesn't spam the undo stack. Commit: pushes one
  // history entry on finger-up.
  const handleEffectIntensityChange = useCallback(
    (value: number) => {
      if (!selectedMediaLayer) return;
      setLiveFilterAmount(value);
      const newEffects: EffectNode[] = currentEffects.map((n) =>
        n.type === 'filter' ? { ...n, amount: value } : n,
      );
      updateLayerLive(selectedMediaLayer.id, {
        type: 'media',
        payload: { ...selectedMediaLayer.payload, effects: newEffects },
      });
    },
    [selectedMediaLayer, currentEffects, updateLayerLive],
  );

  const handleEffectIntensityCommit = useCallback(
    (value: number) => {
      if (!selectedMediaLayer) return;
      setLiveFilterAmount(null);
      const newEffects: EffectNode[] = currentEffects.map((n) =>
        n.type === 'filter' ? { ...n, amount: value } : n,
      );
      updateLayer(
        selectedMediaLayer.id,
        {
          type: 'media',
          payload: { ...selectedMediaLayer.payload, effects: newEffects },
        },
        'Adjust filter intensity',
      );
    },
    [selectedMediaLayer, currentEffects, updateLayer],
  );

  // ── Adjust change handler (live, no history) ──────────────────────
  // Builds a typed AdjustNode explicitly — no Record<string, unknown>
  // cast. The parameter is validated against the known adjust parameter
  // map before mutation. Uses updateLayerLive so slider drags don't
  // create per-frame history entries.
  const handleEffectAdjustChange = useCallback(
    (parameter: string, value: number) => {
      if (!selectedMediaLayer) return;
      if (!(parameter in ADJUST_PARAM_MAP)) return;
      const existingAdjust = currentEffects.find((n) => n.type === 'adjust');
      const base: AdjustNode = existingAdjust?.type === 'adjust'
        ? { ...existingAdjust }
        : { type: 'adjust' };
      const newAdjust: AdjustNode = {
        ...base,
        [parameter as AdjustParameterId]: value,
      };
      const newEffects: EffectNode[] = [
        ...currentEffects.filter((n) => n.type !== 'adjust'),
        newAdjust,
      ];
      updateLayerLive(selectedMediaLayer.id, {
        type: 'media',
        payload: { ...selectedMediaLayer.payload, effects: newEffects },
      });
    },
    [selectedMediaLayer, currentEffects, updateLayerLive],
  );

  // ── Adjust commit handler (one history entry on finger-up) ────────
  // Batches a live adjustment drag into a single undo step. Re-reads
  // the current effect stack (which already reflects the live updates)
  // and pushes one labelled history entry.
  const handleEffectAdjustCommit = useCallback(
    (parameter: string, value: number) => {
      if (!selectedMediaLayer) return;
      if (!(parameter in ADJUST_PARAM_MAP)) return;
      const existingAdjust = currentEffects.find((n) => n.type === 'adjust');
      const base: AdjustNode = existingAdjust?.type === 'adjust'
        ? { ...existingAdjust }
        : { type: 'adjust' };
      const newAdjust: AdjustNode = {
        ...base,
        [parameter as AdjustParameterId]: value,
      };
      const newEffects: EffectNode[] = [
        ...currentEffects.filter((n) => n.type !== 'adjust'),
        newAdjust,
      ];
      updateLayer(
        selectedMediaLayer.id,
        {
          type: 'media',
          payload: { ...selectedMediaLayer.payload, effects: newEffects },
        },
        'Adjust photo',
      );
    },
    [selectedMediaLayer, currentEffects, updateLayer],
  );

  // ── Reset adjustments handler ─────────────────────────────────────
  const handleEffectReset = useCallback(() => {
    if (!selectedMediaLayer) return;
    const newEffects = currentEffects.filter((n) => n.type !== 'adjust');
    updateLayer(
      selectedMediaLayer.id,
      {
        type: 'media',
        payload: { ...selectedMediaLayer.payload, effects: newEffects },
      },
      'Reset adjustments',
    );
  }, [selectedMediaLayer, currentEffects, updateLayer]);

  // ── Auto-adjust (one-tap color correction) ────────────────────────
  // Toggles the conservative auto-adjust preset on the selected media
  // layer. If the existing adjust node was produced by computeAutoAdjust,
  // tapping removes it; otherwise the auto preset replaces any manual
  // adjust node.
  const autoAdjustActive = useMemo(() => {
    const adjust = currentEffects.find((n) => n.type === 'adjust');
    return adjust ? isAutoAdjustNode(adjust) : false;
  }, [currentEffects]);

  const handleAutoAdjust = useCallback(async () => {
    if (!selectedMediaLayer) return;
    const existing = currentEffects.find((n) => n.type === 'adjust');
    if (existing && isAutoAdjustNode(existing)) {
      const newEffects = currentEffects.filter((n) => n.type !== 'adjust');
      updateLayer(
        selectedMediaLayer.id,
        {
          type: 'media',
          payload: { ...selectedMediaLayer.payload, effects: newEffects },
        },
        'Remove auto-adjust',
      );
      return;
    }
    const autoNode = await computeAutoAdjust(effectsSourceUri);
    const newEffects: EffectNode[] = [
      ...currentEffects.filter((n) => n.type !== 'adjust'),
      autoNode,
    ];
    updateLayer(
      selectedMediaLayer.id,
      {
        type: 'media',
        payload: { ...selectedMediaLayer.payload, effects: newEffects },
      },
      'Apply auto-adjust',
    );
  }, [selectedMediaLayer, currentEffects, updateLayer, effectsSourceUri]);

  // ── AI effect apply / remove ──────────────────────────────────────
  // AI effects are stored as composition-schema filter nodes with a
  // namespaced ID (`ai:<effectId>`) so the renderer can resolve them
  // via the AIEffectRegistry at draw time.
  const handleAIEffectApply = useCallback(
    (effectId: string, intensity: number) => {
      if (!selectedMediaLayer) return;
      setLiveFilterAmount(null);
      const newEffects: EffectNode[] = [
        ...currentEffects.filter(
          (n) => n.type !== 'filter' || !n.id.startsWith('ai:'),
        ),
        { type: 'filter', id: `ai:${effectId}`, amount: intensity },
      ];
      updateLayer(
        selectedMediaLayer.id,
        {
          type: 'media',
          payload: { ...selectedMediaLayer.payload, effects: newEffects },
        },
        `Apply AI effect`,
      );
    },
    [selectedMediaLayer, currentEffects, updateLayer],
  );

  const handleAIEffectRemove = useCallback(
    (effectId: string) => {
      if (!selectedMediaLayer) return;
      const newEffects = currentEffects.filter(
        (n) => !(n.type === 'filter' && n.id === `ai:${effectId}`),
      );
      updateLayer(
        selectedMediaLayer.id,
        {
          type: 'media',
          payload: { ...selectedMediaLayer.payload, effects: newEffects },
        },
        'Remove AI effect',
      );
    },
    [selectedMediaLayer, currentEffects, updateLayer],
  );

  return {
    selectedMediaLayer,
    effectsSourceUri,
    currentEffects,
    selectedFilterId,
    activeAIEffectId,
    currentAdjustments,
    filterAmount,
    handleEffectFilterSelect,
    handleEffectIntensityChange,
    handleEffectIntensityCommit,
    handleEffectAdjustChange,
    handleEffectAdjustCommit,
    handleEffectReset,
    autoAdjustActive,
    handleAutoAdjust,
    handleAIEffectApply,
    handleAIEffectRemove,
  };
}
