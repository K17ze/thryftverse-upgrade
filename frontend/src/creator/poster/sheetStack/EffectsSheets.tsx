/**
 * EffectsSheets — the effects sheet branch of PosterSheetStack:
 * EffectPreviewRail + Style-effects entry + AdjustPanel inside a
 * GlassSheet, plus the AIEffectBrowserSheet. Extracted verbatim from
 * PosterSheetStack.tsx.
 */
import React from 'react';
import { View, Text, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { SharedValue } from 'react-native-reanimated';
import { IconGrammar } from '../../../theme/designTokens';
import type { ThemeColors } from '../../../theme/ThemeContext';
import type { useHaptic } from '../../../hooks/useHaptic';
import { GlassSheet } from '../../surfaces/GlassSheet';
import { PressScale } from '../../shared/CreatorAnimations';
import { EffectPreviewRail, AdjustPanel, FILTER_PRESETS, AutoAdjustButton } from '../../tools/effects';
import { AIEffectBrowserSheet } from '../../tools/effects/AIEffectBrowserSheet';
import type { AdjustNode } from '../../tools/effects';
import type { CreatorLayer } from '../../core/projectStore/composition';
import type { PosterSheetStackStyles } from '../PosterSheetStack';

type Haptic = ReturnType<typeof useHaptic>;

interface EffectsSheetsProps {
  styles: PosterSheetStackStyles;
  colors: ThemeColors;
  sheetPaddingBottom: number;
  haptic: Haptic;
  manipulationActiveSV: SharedValue<number>;
  showEffectsSheet: boolean;
  selectedMediaLayer: CreatorLayer | null;
  effectsSourceUri: string;
  selectedFilterId: string | null;
  handleEffectFilterSelect: (presetId: string) => void;
  filterAmount: number;
  handleEffectIntensityChange: (value: number) => void;
  handleEffectIntensityCommit: (value: number) => void;
  autoAdjustActive: boolean;
  handleAutoAdjust: () => void;
  currentAdjustments: Partial<Omit<AdjustNode, 'type'>>;
  handleEffectAdjustChange: (parameter: string, value: number) => void;
  handleEffectAdjustCommit: (parameter: string, value: number) => void;
  handleEffectReset: () => void;
  setBottomSurface: (surface: 'tools' | 'timeline' | 'effects' | null) => void;
  activeAIEffectId: string | null;
  handleAIEffectApply: (effectId: string, intensity: number) => void;
  handleAIEffectRemove: (effectId: string) => void;
}

export function EffectsSheets({
  styles,
  colors,
  sheetPaddingBottom,
  haptic,
  manipulationActiveSV,
  showEffectsSheet,
  selectedMediaLayer,
  effectsSourceUri,
  selectedFilterId,
  handleEffectFilterSelect,
  filterAmount,
  handleEffectIntensityChange,
  handleEffectIntensityCommit,
  autoAdjustActive,
  handleAutoAdjust,
  currentAdjustments,
  handleEffectAdjustChange,
  handleEffectAdjustCommit,
  handleEffectReset,
  setBottomSurface,
  activeAIEffectId,
  handleAIEffectApply,
  handleAIEffectRemove }: EffectsSheetsProps) {
  const [showAIEffects, setShowAIEffects] = React.useState(false);
  return (
    <>
      {/* ── Effects sheet ─────────────────────────────────────────────── */}
      {/* Bottom sheet showing the EffectPreviewRail (filter thumbnails
          rendered from the selected media layer's own source URI) and
          the AdjustPanel (fine-tuning sliders). Filter selection and
          adjustment changes commit to the layer's non-destructive
          `effects` array (EffectNode[]) via updateLayer. */}
      {showEffectsSheet && selectedMediaLayer && (
        <GlassSheet
          title="Effects"
          onClose={() => { haptic.light(); setBottomSurface('tools'); }}
          doneHint="Closes the effects panel"
          paddingBottom={sheetPaddingBottom}
        >
          <ScrollView
            showsVerticalScrollIndicator={false}
            style={styles.effectsSheetScroll}
          >
            <EffectPreviewRail
              sourceUri={effectsSourceUri}
              presets={FILTER_PRESETS}
              selectedId={selectedFilterId}
              onSelect={handleEffectFilterSelect}
              intensity={filterAmount}
              onIntensityChange={handleEffectIntensityChange}
              onIntensityCommit={handleEffectIntensityCommit}
            />
            {/* Style effects entry — folded under Effects (same pattern
                as Look). "Styles", not "AI": the current effect set is
                deterministic Skia filters, not ML/generative. */}
            <PressScale
              onPress={() => { haptic.medium(); setShowAIEffects(true); }}
              style={[styles.aiEffectsBtn, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}
              accessibilityLabel="Style effects"
              accessibilityHint="Browse photo effects"
              scale={0.97}
            >
              <Ionicons name="bulb-outline" size={IconGrammar.metadata} color={colors.textPrimary} />
              <Text style={[styles.aiEffectsBtnText, { color: colors.textPrimary }]}>
                Style effects
              </Text>
              <Ionicons name="chevron-forward" size={IconGrammar.metadata} color={colors.textMuted} />
            </PressScale>
            <View style={styles.effectsAdjustWrap}>
              <View style={styles.effectsAutoRow}>
                <AutoAdjustButton
                  isActive={autoAdjustActive}
                  onApply={handleAutoAdjust}
                />
              </View>
              <AdjustPanel
                values={currentAdjustments}
                onChange={handleEffectAdjustChange}
                onCommit={handleEffectAdjustCommit}
                onReset={handleEffectReset}
                onDragStateChange={(dragging) => {
                  // Lightroom flagship pattern: fade top-bar chrome while
                  // dragging an adjust slider so the user focuses on the
                  // image, not the controls. The effects sheet itself
                  // stays visible — only the top bar recedes.
                  manipulationActiveSV.value = dragging ? 1 : 0;
                }}
              />
            </View>
          </ScrollView>
        </GlassSheet>
      )}
      {/* ── Style effects browser ── */}
      <AIEffectBrowserSheet
        visible={showAIEffects}
        initialEffectId={activeAIEffectId}
        sourceImageUri={effectsSourceUri}
        onApply={handleAIEffectApply}
        onRemove={handleAIEffectRemove}
        onClose={() => setShowAIEffects(false)}
      />
    </>
  );
}
