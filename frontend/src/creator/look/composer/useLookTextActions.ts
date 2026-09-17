/**
 * useLookTextActions — text editing actions for the Look composer.
 *
 * Extracted from LookComposerScreen — pure relocation, no changes.
 */

import { useCallback } from 'react';
import type { CreatorLayer } from '../../core/projectStore/composition';
import { TEXT_STYLE_PRESETS } from '../../tools/text/textStylePresets';
import type { CreatorContextValue } from '../../studio/CreatorContext';
import type { LookComposerStateResult } from './useLookComposerState';
import type { HapticApi } from './useLookMultiSelectActions';

export function useLookTextActions({
  cs,
  creator,
  selectedLayer,
  handleEditLayer,
  haptic,
}: {
  cs: LookComposerStateResult;
  creator: CreatorContextValue;
  selectedLayer: CreatorLayer | null;
  handleEditLayer: (layer: CreatorLayer) => void;
  haptic: HapticApi;
}) {
  const { setShowTextColorPicker } = cs;
  const { updateLayer } = creator;

  // ── Text editing actions ─────────────────────────────────────────────
  const handleTextEditAction = useCallback(() => {
    if (!selectedLayer || selectedLayer.type !== 'text') {
      haptic.light();
      return;
    }
    handleEditLayer(selectedLayer);
  }, [selectedLayer, handleEditLayer, haptic]);

  // Font tool — cycles through curated text style presets with haptic
  // feedback. Each tap advances to the next preset and updates the layer
  // in real-time so the user sees the change immediately.
  const handleTextFontAction = useCallback(() => {
    if (!selectedLayer || selectedLayer.type !== 'text') {
      haptic.light();
      return;
    }
    haptic.light();
    const presets = TEXT_STYLE_PRESETS;
    const currentIdx = presets.findIndex(p => p.id === (selectedLayer.payload.textStyle ?? 'clean'));
    const nextPreset = presets[(currentIdx + 1) % presets.length];
    updateLayer(selectedLayer.id, {
      type: 'text',
      payload: { ...selectedLayer.payload, textStyle: nextPreset.id as typeof selectedLayer.payload.textStyle },
    }, 'Change font style');
  }, [selectedLayer, updateLayer, haptic]);

  // Color tool — opens the CreatorColorPicker sheet for the selected
  // text layer. Replaces the former hardcoded palette cycling.
  const handleTextColorAction = useCallback(() => {
    if (!selectedLayer || selectedLayer.type !== 'text') {
      haptic.light();
      return;
    }
    haptic.light();
    setShowTextColorPicker(true);
  }, [selectedLayer, haptic, setShowTextColorPicker]);

  // Align tool — cycles left → center → right → left. The tool rail
  // glyph updates to reflect the current alignment.
  const handleTextAlignAction = useCallback(() => {
    if (!selectedLayer || selectedLayer.type !== 'text') {
      haptic.light();
      return;
    }
    haptic.light();
    const current = selectedLayer.payload.alignment ?? 'center';
    const next = current === 'left' ? 'center' : current === 'center' ? 'right' : 'left';
    updateLayer(selectedLayer.id, {
      type: 'text',
      payload: { ...selectedLayer.payload, alignment: next },
    }, 'Change alignment');
  }, [selectedLayer, updateLayer, haptic]);

  return {
    handleTextEditAction,
    handleTextFontAction,
    handleTextColorAction,
    handleTextAlignAction,
  };
}
