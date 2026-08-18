/**
 * useLookEffects — Effects system hook for the Look composer.
 *
 * Extracted from LookComposerScreen to separate the effects subsystem
 * (effect node management, auto-adjust computation, effect
 * application/removal handlers) from the screen's rendering orchestration.
 *
 * The hook is self-contained: it accepts the selected layer and the
 * `updateLayer` mutation from CreatorContext, and returns all derived
 * effect state plus handlers. The screen consumes these values to render
 * the effects bottom surface and wire the AIEffectBrowserSheet.
 */

import { useCallback, useMemo } from 'react';
import type { CreatorLayer, EffectNode } from '../composition';
import type { AdjustNode } from '../tools/effects';
import { computeAutoAdjust, isAutoAdjustNode } from '../tools/effects';

// ── Types ────────────────────────────────────────────────────────────

/**
 * The media layer extracted from the selected layer, or null when the
 * selection is not a media layer.
 */
type MediaLayer = Extract<CreatorLayer, { type: 'media' }>;

/**
 * The mutation signature from CreatorContext.updateLayer.
 */
type UpdateLayerFn = (
  id: string,
  updates: Partial<CreatorLayer>,
  label?: string,
) => void;

// ── Hook ─────────────────────────────────────────────────────────────

export function useLookEffects(
  selectedLayer: CreatorLayer | null,
  updateLayer: UpdateLayerFn,
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

  // ── Adjust change handler ─────────────────────────────────────────
  const handleEffectAdjustChange = useCallback(
    (parameter: string, value: number) => {
      if (!selectedMediaLayer) return;
      const existingAdjust = currentEffects.find((n) => n.type === 'adjust');
      const base = existingAdjust?.type === 'adjust'
        ? { ...existingAdjust }
        : { type: 'adjust' as const };
      (base as Record<string, unknown>)[parameter] = value;
      const newAdjust = base as Extract<EffectNode, { type: 'adjust' }>;
      const newEffects: EffectNode[] = [
        ...currentEffects.filter((n) => n.type !== 'adjust'),
        newAdjust,
      ];
      updateLayer(selectedMediaLayer.id, {
        type: 'media',
        payload: { ...selectedMediaLayer.payload, effects: newEffects },
      });
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
    handleEffectFilterSelect,
    handleEffectAdjustChange,
    handleEffectReset,
    autoAdjustActive,
    handleAutoAdjust,
    handleAIEffectApply,
    handleAIEffectRemove,
  };
}
