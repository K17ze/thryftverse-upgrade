import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Reanimated, { useAnimatedStyle } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { IconGrammar, Scrim } from '../../../theme/designTokens';
import { useAppTheme } from '../../../theme/ThemeContext';
import type { CreatorContextValue } from '../../studio/CreatorContext';
import type { CreatorLayer, CreatorPage } from '../../core/projectStore/composition';
import { PressScale } from '../../shared/CreatorAnimations';
import { useHaptic } from '../../../hooks/useHaptic';
import { lookComposerStyles as styles } from '../LookComposerStyles';

// ── Top bar (presentational) ────────────────────────────────────────
// Extracted from LookComposerScreen — pure relocation, no changes.
export function LookTopBar({
  topInset,
  chromeFadeStyle,
  isManipulating,
  multiSelectMode,
  exitMultiSelect,
  selectedLayerIds,
  page,
  selectLayers,
  haptic,
  selectedLayer,
  selectLayer,
  setShowOverflow,
  handleBack,
  isDirty,
  handleUndo,
  canUndo,
  undoLabel,
  handleRedo,
  canRedo,
  redoLabel,
  hasMultipleMedia,
  setInstantCutVisible,
  setShowPublish,
  colors }: {
  topInset: number;
  chromeFadeStyle: ReturnType<typeof useAnimatedStyle>;
  isManipulating: boolean;
  multiSelectMode: boolean;
  exitMultiSelect: () => void;
  selectedLayerIds: string[];
  page: CreatorPage;
  selectLayers: CreatorContextValue['selectLayers'];
  haptic: ReturnType<typeof useHaptic>;
  selectedLayer: CreatorLayer | null;
  selectLayer: CreatorContextValue['selectLayer'];
  setShowOverflow: (show: boolean) => void;
  handleBack: () => void;
  isDirty: boolean;
  handleUndo: () => void;
  canUndo: boolean;
  undoLabel: string | null;
  handleRedo: () => void;
  canRedo: boolean;
  redoLabel: string | null;
  hasMultipleMedia: boolean;
  setInstantCutVisible: React.Dispatch<React.SetStateAction<boolean>>;
  setShowPublish: (show: boolean) => void;
  colors: ReturnType<typeof useAppTheme>['colors'];
}) {
  return (
    <>
      {/* ── Top bar — minimal, neutral ─────────────────────────────── */}
      {/* Look uses a neutral top bar (not the full-bleed gradient scrim
          of Poster). Close · Undo · Redo on the left; Next on the right.
          During selection: Done · object label · More. */}
      <Reanimated.View style={[styles.topBarContainer, { paddingTop: topInset }, chromeFadeStyle]} pointerEvents={isManipulating ? 'none' : 'auto'}>
        <LinearGradient
          colors={Scrim.top.colors}
          locations={Scrim.top.locations}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
        <View style={styles.topBar}>
          <View style={styles.topBarRow}>
            {multiSelectMode ? (
              <>
                <PressScale
                  onPress={exitMultiSelect}
                  style={styles.topBtn}
                  accessibilityLabel="Done"
                  accessibilityHint="Exit multi-select"
                  hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                >
                  <Text style={[styles.doneText, { color: colors.textPrimary }]}>Done</Text>
                </PressScale>

                <View style={styles.topCenter}>
                  <View style={[styles.selectionCountBadge, { backgroundColor: colors.brand }]}>
                    <Text style={[styles.selectionCountText, { color: colors.textInverse }]}>
                      {selectedLayerIds.length} selected
                    </Text>
                  </View>
                </View>

                <View style={styles.topRight}>
                  <PressScale
                    onPress={() => {
                      haptic.light();
                      // Select all visible layers
                      const visible = (page?.layers ?? []).filter((l) => !l.hidden);
                      selectLayers(visible.map((l) => l.id));
                    }}
                    style={styles.topBtn}
                    accessibilityLabel="Select all"
                    accessibilityHint="Select all objects"
                    hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                  >
                    <Ionicons name="checkmark-done-outline" size={IconGrammar.standard} color={colors.textPrimary} />
                  </PressScale>
                </View>
              </>
            ) : selectedLayer ? (
              <>
                <PressScale
                  onPress={() => { haptic.light(); selectLayer(null); }}
                  style={styles.topBtn}
                  accessibilityLabel="Done"
                  accessibilityHint="Deselect object"
                  hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                >
                  <Text style={[styles.doneText, { color: colors.textPrimary }]}>Done</Text>
                </PressScale>

                <View style={styles.topCenter} />

                <View style={styles.topRight}>
                  <PressScale
                    onPress={() => { haptic.light(); setShowOverflow(true); }}
                    style={styles.topBtn}
                    accessibilityLabel="More options"
                    accessibilityHint="Open more options"
                    hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                  >
                    <Ionicons name="ellipsis-horizontal" size={IconGrammar.standard} color={colors.textPrimary} />
                  </PressScale>
                </View>
              </>
            ) : (
              <>
                <View style={styles.topLeftGroup}>
                  <PressScale
                    onPress={handleBack}
                    style={styles.topBtn}
                    accessibilityLabel="Close editor"
                    accessibilityHint="Close and save draft"
                    hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                  >
                    <Ionicons name="close" size={IconGrammar.standard} color={colors.textPrimary} />
                  </PressScale>
                  {isDirty && (
                    <View style={[styles.unsavedDot, { backgroundColor: colors.brand }]} />
                  )}
                </View>

                <View style={styles.topCenterGroup}>
                  <PressScale
                    onPress={handleUndo}
                    disabled={!canUndo}
                    style={[styles.topBtn, { opacity: canUndo ? 0.6 : 0.2 }]}
                    accessibilityLabel="Undo"
                    accessibilityHint={undoLabel ? `Undo ${undoLabel}` : 'Undo last edit'}
                    accessibilityRole="button"
                    accessibilityState={{ disabled: !canUndo }}
                    hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                  >
                    <Ionicons name="arrow-undo" size={IconGrammar.standard} color={colors.textPrimary} />
                  </PressScale>
                  <PressScale
                    onPress={handleRedo}
                    disabled={!canRedo}
                    style={[styles.topBtn, { opacity: canRedo ? 0.6 : 0.2 }]}
                    accessibilityLabel="Redo"
                    accessibilityHint={redoLabel ? `Redo ${redoLabel}` : 'Redo last edit'}
                    accessibilityRole="button"
                    accessibilityState={{ disabled: !canRedo }}
                    hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                  >
                    <Ionicons name="arrow-redo" size={IconGrammar.standard} color={colors.textPrimary} />
                  </PressScale>
                </View>

                <View style={styles.topRightGroup}>
                  {hasMultipleMedia ? (
                    <PressScale
                      onPress={() => { haptic.light(); setInstantCutVisible(true); }}
                      style={styles.topBtn}
                      accessibilityLabel="Instant Cut"
                      accessibilityHint="Auto-compose and publish instantly"
                      hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                    >
                      <Ionicons name="flash-outline" size={IconGrammar.standard} color={colors.textPrimary} />
                    </PressScale>
                  ) : null}
                  <PressScale
                    onPress={() => { haptic.medium(); setShowPublish(true); }}
                    style={[styles.publishBtn, { backgroundColor: colors.brand }]}
                    accessibilityLabel="Next"
                    accessibilityHint="Review and publish"
                    scale={0.97}
                    hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}
                  >
                    <Text style={[styles.publishBtnText, { color: colors.textInverse }]}>Next</Text>
                  </PressScale>
                </View>
              </>
            )}
          </View>
        </View>
      </Reanimated.View>
    </>
  );
}
