/**
 * PosterTopBar — presentational top-bar chrome for the Poster composer.
 *
 * Extracted from PosterComposerScreen to separate the top-bar render tree
 * (back, audio mute, quick save, undo/redo, Next) from the screen's state
 * orchestration. This component owns no state and uses no hooks — it renders
 * purely from props.
 *
 * The top bar recedes during active layer manipulation: the parent passes a
 * Reanimated `chromeFadeStyle` (animated opacity) and an `isManipulating`
 * flag that switches pointer events off while the chrome is dimmed.
 *
 * Two modes:
 *   - Selection mode (hasSelection): Done · More
 *   - Default mode: Close · Audio · Save · Undo · Redo · Next
 */
import React from 'react';
import { View, Text, StyleSheet, ActivityIndicator, type ViewStyle, type TextStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Reanimated, { useAnimatedStyle } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';

import { Scrim, IconGrammar } from '../../theme/designTokens';
import type { ThemeColors } from '../../theme/ThemeContext';
import { PressScale } from '../CreatorAnimations';
import type { useHaptic } from '../../hooks/useHaptic';
import type { ActiveSheet } from './useActiveSheet';

// ── Types ────────────────────────────────────────────────────────────

/**
 * The haptic engine returned by useHaptic.
 */
type Haptic = ReturnType<typeof useHaptic>;

/**
 * The subset of the screen's StyleSheet styles the top bar renders. The
 * parent passes its full `styles` object; only these keys are read.
 */
export interface PosterTopBarStyles {
  topBarContainer: ViewStyle;
  topBar: ViewStyle;
  topBarRow: ViewStyle;
  topBtn: ViewStyle;
  doneText: TextStyle;
  topCenter: ViewStyle;
  topRight: ViewStyle;
  topLeftGroup: ViewStyle;
  unsavedDot: ViewStyle;
  topCenterGroup: ViewStyle;
  topRightGroup: ViewStyle;
  publishBtn: ViewStyle;
  publishBtnText: TextStyle;
}

export interface PosterTopBarProps {
  /** Screen styles (the parent's full createStyles() object). */
  styles: PosterTopBarStyles;
  /** Theme colors. */
  colors: ThemeColors;
  /** Top safe-area inset (padding above the bar). */
  topInset: number;
  /** Reanimated animated opacity style — fades the chrome during manipulation. */
  chromeFadeStyle: ReturnType<typeof useAnimatedStyle>;
  /** Whether the chrome should ignore touches (layer being dragged). */
  isManipulating: boolean;
  /** Whether a layer is currently selected (switches to selection chrome). */
  hasSelection: boolean;
  /** Haptic engine (for press feedback on Done / More / Next). */
  haptic: Haptic;
  /** Deselects the current layer (Done button). */
  selectLayer: (id: string | null) => void;
  /** Opens a mutually-exclusive sheet by name. */
  openSheet: (sheet: Exclude<ActiveSheet, null>) => void;
  /** Truthful back — offers to save draft if dirty. */
  handleBack: () => void;
  /** Whether the document has unsaved changes (drives the unsaved dot). */
  isDirty: boolean;
  /** Whether the document carries audio (music layer or video). */
  hasAudioContent: boolean;
  /** Whether the document carries any video media. */
  hasVideoContent: boolean;
  /** Toggles live audio mute on the video player. */
  handleToggleAudioMute: () => void;
  /** Whether audio is currently muted. */
  isAudioMuted: boolean;
  /** Quick-save draft with haptic + toast feedback. */
  handleQuickSaveDraft: () => void;
  /** Whether a quick-save is in flight. */
  isQuickSaving: boolean;
  /** Whether an idle-debounce autosave is in flight. */
  isAutosaving: boolean;
  /** Epoch ms of the last successful autosave, or null if never saved. */
  lastAutosaveAt: number | null;
  /** Undo with haptic feedback. */
  handleUndo: () => void;
  /** Whether undo is available. */
  canUndo: boolean;
  /** Label describing the next undo step (null if none). */
  undoLabel: string | null;
  /** Redo with haptic feedback. */
  handleRedo: () => void;
  /** Whether redo is available. */
  canRedo: boolean;
  /** Label describing the next redo step (null if none). */
  redoLabel: string | null;
}

// ── Component ────────────────────────────────────────────────────────

export function PosterTopBar({
  styles,
  colors,
  topInset,
  chromeFadeStyle,
  isManipulating,
  hasSelection,
  haptic,
  selectLayer,
  openSheet,
  handleBack,
  isDirty,
  hasAudioContent,
  hasVideoContent,
  handleToggleAudioMute,
  isAudioMuted,
  handleQuickSaveDraft,
  isQuickSaving,
  isAutosaving,
  lastAutosaveAt,
  handleUndo,
  canUndo,
  undoLabel,
  handleRedo,
  canRedo,
  redoLabel,
}: PosterTopBarProps) {
  return (
    <Reanimated.View
      style={[styles.topBarContainer, { paddingTop: topInset }, chromeFadeStyle]}
      pointerEvents={isManipulating ? 'none' : 'auto'}
    >
      <LinearGradient
        colors={Scrim.top.colors}
        locations={Scrim.top.locations}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      <View style={styles.topBar}>
        <View style={styles.topBarRow}>
          {hasSelection ? (
            /* During selection: Done · More */
            <>
              <PressScale
                onPress={() => { haptic.light(); selectLayer(null); }}
                style={styles.topBtn}
                accessibilityLabel="Done"
                accessibilityHint="Deselects the current layer and exits selection mode"
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              >
                <Text style={styles.doneText}>Done</Text>
              </PressScale>

              <View style={styles.topCenter} />

              <View style={styles.topRight}>
                <PressScale
                  onPress={() => { haptic.light(); openSheet('overflow'); }}
                  style={styles.topBtn}
                  accessibilityLabel="More options"
                  accessibilityHint="Opens the overflow menu with undo, redo, preview and more"
                  hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                >
                  <Ionicons name="ellipsis-horizontal" size={IconGrammar.standard} color={colors.textPrimary} />
                </PressScale>
              </View>
            </>
          ) : (
            /* Default: Close · Audio · Save · Undo · Redo · Next (Instagram/Snapchat flagship) */
            <>
              <View style={styles.topLeftGroup}>
                <PressScale
                  onPress={handleBack}
                  style={styles.topBtn}
                  accessibilityLabel="Close editor"
                  accessibilityHint="Closes the composer, offers to save draft if there are unsaved changes"
                  hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                >
                  <Ionicons name="close" size={IconGrammar.standard} color={colors.textPrimary} />
                </PressScale>
                {isDirty && <View style={[styles.unsavedDot, { backgroundColor: colors.brand }]} />}
              </View>

              <View style={styles.topCenterGroup}>
                {/* Video/audio live mute toggle */}
                {(hasAudioContent || hasVideoContent) && (
                  <PressScale
                    onPress={handleToggleAudioMute}
                    style={styles.topBtn}
                    accessibilityLabel={isAudioMuted ? 'Unmute video audio' : 'Mute video audio'}
                    accessibilityHint="Toggles audio playback mute state"
                    hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}
                  >
                    <Ionicons
                      name={isAudioMuted ? 'volume-mute' : 'volume-high'}
                      size={IconGrammar.standard}
                      color={isAudioMuted ? colors.brand : colors.textPrimary}
                    />
                  </PressScale>
                )}

                {/* Quick Save to drafts */}
                <PressScale
                  onPress={handleQuickSaveDraft}
                  disabled={isQuickSaving}
                  style={[styles.topBtn, { opacity: isQuickSaving ? 0.5 : 1 }]}
                  accessibilityLabel="Save draft"
                  accessibilityHint="Saves the current story to drafts"
                  hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}
                >
                  <Ionicons name="bookmark-outline" size={IconGrammar.standard} color={colors.textPrimary} />
                </PressScale>

                {/* Subtle autosave indicator — silent, no toast (anti-AI: no motion) */}
                {isAutosaving ? (
                  <ActivityIndicator size={12} color={colors.textSecondary} />
                ) : (
                  lastAutosaveAt !== null &&
                  Date.now() - lastAutosaveAt < 5000 && (
                    <Ionicons
                      name="checkmark-circle"
                      size={12}
                      color={colors.textSecondary}
                      accessibilityLabel="Draft autosaved"
                    />
                  )
                )}

                <PressScale
                  onPress={handleUndo}
                  disabled={!canUndo}
                  style={[styles.topBtn, { opacity: canUndo ? 1 : 0.3 }]}
                  accessibilityLabel="Undo"
                  accessibilityHint={undoLabel ? `Undo ${undoLabel}` : 'Reverts the last edit'}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: !canUndo }}
                  hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}
                >
                  <Ionicons name="arrow-undo" size={IconGrammar.standard} color={colors.textPrimary} />
                </PressScale>
                <PressScale
                  onPress={handleRedo}
                  disabled={!canRedo}
                  style={[styles.topBtn, { opacity: canRedo ? 1 : 0.3 }]}
                  accessibilityLabel="Redo"
                  accessibilityHint={redoLabel ? `Redo ${redoLabel}` : 'Reapplies the last undone edit'}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: !canRedo }}
                  hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}
                >
                  <Ionicons name="arrow-redo" size={IconGrammar.standard} color={colors.textPrimary} />
                </PressScale>
              </View>

              <View style={styles.topRightGroup}>
                <PressScale
                  onPress={() => { haptic.medium(); openSheet('publish'); }}
                  style={[styles.publishBtn, { backgroundColor: colors.brand }]}
                  accessibilityLabel="Next"
                  accessibilityHint="Opens the publish sheet to review and publish your story"
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
  );
}
