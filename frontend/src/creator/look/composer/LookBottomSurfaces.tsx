import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import Reanimated, { useAnimatedStyle } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import type { EdgeInsets } from 'react-native-safe-area-context';
import { Space, IconGrammar, Scrim } from '../../../theme/designTokens';
import { useAppTheme } from '../../../theme/ThemeContext';
import type { CreatorLayer } from '../../core/projectStore/composition';
import { PressScale } from '../../shared/CreatorAnimations';
import { useHaptic } from '../../../hooks/useHaptic';
import { LookSourceTray, SourceTrayPeek, type LookSourceTrayProps } from '../LookSourceTray';
import { ContextToolRail } from '../../surfaces/ContextToolRail';
import { type ToolContext, type ToolGroup } from '../../core/toolRegistry';
import { EffectPreviewRail, AdjustPanel, FILTER_PRESETS, AutoAdjustButton } from '../../tools/effects';
import { LayoutPreviewRail } from '../layout/LayoutPreviewRail';
import type { LayoutPreview, LayoutId } from '../layout/layoutTypes';
import { SlideUpSurface } from './SlideUpSurface';
import { LookLayoutPanel } from './LookLayoutPanel';
import { lookComposerStyles as styles } from '../LookComposerStyles';

// ── Bottom surface state machine ───────────────────────────────────────
// Per spec: "One lower interaction surface at a time." The Look screen
// shows exactly ONE bottom surface at any moment. The default is 'tools'
// (the ContextToolRail). Tapping "Items" / "Layout" / "Effects" swaps
// the bottom surface to that panel; closing the panel returns to 'tools'.
// This replaces the old pattern of multiple permanent rails (AutoLayoutBar,
// LayoutPreviewRail, LookSourceTray) competing with the canvas.
export type BottomSurface = 'tools' | 'items' | 'layout' | 'effects' | null;

type SelectedMediaLayer = Extract<CreatorLayer, { type: 'media' }> | null;

// ── Bottom surfaces (presentational) ────────────────────────────────
// Extracted from LookComposerScreen — pure relocation, no changes.
// Renders the single active bottom surface: 'tools' (ContextToolRail),
// 'items' (LookSourceTray drawer), 'layout' (LayoutPreviewRail panel),
// or 'effects' (EffectPreviewRail + AI effects + AdjustPanel).
export function LookBottomSurfaces({
  bottomSurface,
  insets,
  chromeFadeStyle,
  isManipulating,
  sourcePeekThumbs,
  selectedLayerId,
  handleOpenItems,
  activeToolContext,
  toolGroups,
  haptic,
  setShowOverflow,
  handleCloseSurface,
  handleSourceTrayAddItem,
  handleDropProduct,
  onCanvasListingIds,
  colors,
  mediaLayers,
  mediaAssetUris,
  mediaFocalPoints,
  allLayouts,
  selectedLayoutId,
  handleLayoutSelect,
  handleLayoutPreview,
  handleLayoutPreviewEnd,
  selectedMediaLayer,
  effectsSourceUri,
  selectedFilterId,
  handleEffectFilterSelect,
  filterAmount,
  handleEffectIntensityChange,
  handleEffectIntensityCommit,
  setShowAIEffects,
  autoAdjustActive,
  handleAutoAdjust,
  currentAdjustments,
  handleEffectAdjustChange,
  handleEffectAdjustCommit,
  handleEffectReset }: {
  bottomSurface: BottomSurface;
  insets: EdgeInsets;
  chromeFadeStyle: ReturnType<typeof useAnimatedStyle>;
  isManipulating: boolean;
  sourcePeekThumbs: string[];
  selectedLayerId: string | null;
  handleOpenItems: () => void;
  activeToolContext: ToolContext;
  toolGroups: ToolGroup[];
  haptic: ReturnType<typeof useHaptic>;
  setShowOverflow: (show: boolean) => void;
  handleCloseSurface: () => void;
  handleSourceTrayAddItem: LookSourceTrayProps['onAddItem'];
  handleDropProduct: LookSourceTrayProps['onDropProduct'];
  onCanvasListingIds: Set<string>;
  colors: ReturnType<typeof useAppTheme>['colors'];
  mediaLayers: CreatorLayer[];
  mediaAssetUris: string[];
  mediaFocalPoints: React.ComponentProps<typeof LayoutPreviewRail>['assetFocalPoints'];
  allLayouts: LayoutPreview[];
  selectedLayoutId: LayoutId | null;
  handleLayoutSelect: (id: LayoutId) => void;
  handleLayoutPreview: (id: LayoutId) => void;
  handleLayoutPreviewEnd: () => void;
  selectedMediaLayer: SelectedMediaLayer;
  effectsSourceUri: string;
  selectedFilterId: React.ComponentProps<typeof EffectPreviewRail>['selectedId'];
  handleEffectFilterSelect: React.ComponentProps<typeof EffectPreviewRail>['onSelect'];
  filterAmount: React.ComponentProps<typeof EffectPreviewRail>['intensity'];
  handleEffectIntensityChange: React.ComponentProps<typeof EffectPreviewRail>['onIntensityChange'];
  handleEffectIntensityCommit: React.ComponentProps<typeof EffectPreviewRail>['onIntensityCommit'];
  setShowAIEffects: (show: boolean) => void;
  autoAdjustActive: React.ComponentProps<typeof AutoAdjustButton>['isActive'];
  handleAutoAdjust: React.ComponentProps<typeof AutoAdjustButton>['onApply'];
  currentAdjustments: React.ComponentProps<typeof AdjustPanel>['values'];
  handleEffectAdjustChange: React.ComponentProps<typeof AdjustPanel>['onChange'];
  handleEffectAdjustCommit: React.ComponentProps<typeof AdjustPanel>['onCommit'];
  handleEffectReset: React.ComponentProps<typeof AdjustPanel>['onReset'];
}) {
  return (
    <>
      {/* ── Bottom surface state machine ───────────────────────────── */}
      {/* Per spec: "One lower interaction surface at a time." Only ONE of
          the following surfaces renders at any moment. The default is
          'tools' (the ContextToolRail). Tapping Items / Layout / Effects
          swaps the surface; closing returns to 'tools'. No permanent
          rails compete with the canvas. */}

      {/* ── 'tools' surface: ContextToolRail ── */}
      {/* The rail adapts its visible tool set based on the current selection
          state. No selection → look-default (Add, Items, Text, Layout, More).
          Media selected → look-media-selected (Replace, Crop, Auto, Adjust, Effects).
          Text selected → look-text-selected (Edit, Font, Color, Align).
          Product selected → look-product-selected (Item, Tag Style, Price, Duplicate).
          Each tool's onPress calls an EXISTING handler — no new capabilities. */}
      {bottomSurface === 'tools' && (
        <Reanimated.View style={[styles.bottomBarContainer, { paddingBottom: insets.bottom }, chromeFadeStyle]} pointerEvents={isManipulating ? 'none' : 'auto'}>
          <LinearGradient
            colors={Scrim.bottom.colors}
            locations={Scrim.bottom.locations}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />
          <View style={styles.bottomBar}>
            {/* ── Source tray peek strip (§8.3: source tray peeking from bottom) ── */}
            {/* A thin strip of item thumbnails above the tool rail, making
                the source tray always visible as "creative supply." Tapping
                opens the full items surface. Only shown when no layer is
                selected so it doesn't compete with selection-specific tools. */}
            {sourcePeekThumbs.length > 0 && !selectedLayerId && (
              <SourceTrayPeek
                thumbnailUris={sourcePeekThumbs}
                onPress={handleOpenItems}
              />
            )}
            <ContextToolRail
              context={activeToolContext}
              groups={toolGroups}
              onOverflowPress={() => { haptic.selection(); setShowOverflow(true); }}
              style={styles.toolRail}
            />
          </View>
        </Reanimated.View>
      )}

      {/* ── 'items' surface: Items drawer (LookSourceTray expanded) ── */}
      {/* Replaces the tools rail temporarily. Shows Closet / Listings /
          Search tabs. Tapping an item adds it to the canvas. Closing
          the drawer returns to 'tools'. The LookSourceTray's peek bar
          acts as the drawer header with a close chevron. */}
      {bottomSurface === 'items' && (
        <SlideUpSurface>
          <View style={[styles.bottomBarContainer, { paddingBottom: insets.bottom }]}>
            <View style={styles.bottomBar}>
              <LookSourceTray
                expanded={true}
                onToggle={handleCloseSurface}
                onAddItem={handleSourceTrayAddItem}
                onDropProduct={handleDropProduct}
                onCanvasListingIds={onCanvasListingIds}
              />
            </View>
          </View>
        </SlideUpSurface>
      )}

      {/* ── 'layout' surface: Layout panel ── */}
      {/* Layout panel — single surface using LayoutPreviewRail with real
          preview thumbnails. The legacy icon-only LookAutoLayoutBar has
          been removed: the thumbnail rail IS the style picker now, which
          is the Instagram/Canva pattern. One engine, one coordinate
          convention, one commit path. Closing the panel returns to 'tools'. */}
      {bottomSurface === 'layout' && (
        <SlideUpSurface>
          <View style={[styles.bottomBarContainer, { paddingBottom: insets.bottom }]}>
            <View style={styles.bottomBar}>
              <LookLayoutPanel
                title="Layout"
                onClose={handleCloseSurface}
                colors={colors}
              >
                {mediaLayers.length > 0 ? (
                  <LayoutPreviewRail
                    assetUris={mediaAssetUris}
                    assetFocalPoints={mediaFocalPoints}
                    layouts={allLayouts}
                    selectedId={selectedLayoutId}
                    onSelect={handleLayoutSelect}
                    onPreview={handleLayoutPreview}
                    onPreviewEnd={handleLayoutPreviewEnd}
                  />
                ) : (
                  <Text style={[styles.layoutEmptyText, { color: colors.textMuted }]}>
                    Add photos first
                  </Text>
                )}
              </LookLayoutPanel>
            </View>
          </View>
        </SlideUpSurface>
      )}

      {/* ── 'effects' surface: Effects panel (includes AI effects) ── */}
      {/* Replaces the tools rail temporarily. Shows the EffectPreviewRail
          (filter thumbnails), an AI Effects entry button, the AutoAdjust
          button, and the AdjustPanel (fine-tuning sliders). AI effects
          are folded in here — no separate AI destination. */}
      {bottomSurface === 'effects' && selectedMediaLayer && (
        <SlideUpSurface>
          <View style={[styles.bottomBarContainer, { paddingBottom: insets.bottom }]}>
            <View style={[styles.effectsSurface, { paddingBottom: insets.bottom + Space.sm, backgroundColor: colors.surface }]}>
              <View style={[styles.effectsSheetHeader, { borderBottomColor: colors.border }]}>
                <Text style={[styles.effectsSheetTitle, { color: colors.textPrimary }]}>
                  Effects
                </Text>
                <PressScale
                  onPress={handleCloseSurface}
                  style={styles.effectsSheetDone}
                  accessibilityLabel="Done"
                  accessibilityHint="Close effects panel"
                  hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                >
                  <Text style={[styles.effectsSheetDoneText, { color: colors.brand }]}>
                    Done
                  </Text>
                </PressScale>
              </View>
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
              {/* ── Style effects entry (folded under Effects) ── */}
              {/* Opens the AIEffectBrowserSheet from within the effects
                  panel. Effects are not a separate destination — they
                  live inside the effects surface. §11: label says "Styles"
                  not "AI" because the current effect set is deterministic
                  filters, not ML/generative. */}
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
              <View style={[styles.effectsAdjustWrap, { borderTopColor: colors.border }]}>
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
                />
              </View>
            </ScrollView>
          </View>
        </View>
        </SlideUpSurface>
      )}

      {/* ── 'effects' surface empty state ── */}
      {/* When the user opens Effects without a media layer selected, show a
          minimal prompt instead of the full effects panel. */}
      {bottomSurface === 'effects' && !selectedMediaLayer && (
        <SlideUpSurface>
          <View style={[styles.bottomBarContainer, { paddingBottom: insets.bottom }]}>
            <View style={[styles.effectsSurface, { paddingBottom: insets.bottom + Space.sm, backgroundColor: colors.surface }]}>
              <View style={[styles.effectsSheetHeader, { borderBottomColor: colors.border }]}>
                <Text style={[styles.effectsSheetTitle, { color: colors.textPrimary }]}>
                  Effects
                </Text>
                <PressScale
                  onPress={handleCloseSurface}
                  style={styles.effectsSheetDone}
                  accessibilityLabel="Done"
                  accessibilityHint="Close effects panel"
                  hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                >
                  <Text style={[styles.effectsSheetDoneText, { color: colors.brand }]}>
                    Done
                  </Text>
                </PressScale>
              </View>
              <View style={styles.effectsEmptyState}>
                <Text style={[styles.effectsEmptyText, { color: colors.textMuted }]}>
                  Select a photo
                </Text>
              </View>
            </View>
          </View>
        </SlideUpSurface>
      )}
    </>
  );
}
