/**
 * PosterToolRailDock — the default bottom surface of the Poster composer.
 *
 * Extracted from PosterComposerScreen (pure extraction — no visual or
 * behavioral change). The ContextToolRail is the single bottom surface for
 * both default and selection states; it adapts its visible tool set from
 * the active ToolContext. Up to 4 primary actions are always visible;
 * additional tools are revealed under the trailing "More" button. The
 * frame count indicator sits at the start when multiple frames, and the
 * direct 1-tap Send / Story action trails the rail (Snapchat / Instagram
 * flagship pattern).
 *
 * Rendered by the parent only when `bottomSurface === 'tools'` — one
 * bottom surface at a time per the spec. The rail recedes during active
 * layer manipulation via the shared `chromeFadeStyle`.
 */
import React from 'react';
import { View, Text, StyleSheet, type ViewStyle, type TextStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Reanimated, { useAnimatedStyle } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';

import { Scrim } from '../../../theme/designTokens';
import type { ThemeColors } from '../../../theme/ThemeContext';
import { PressScale } from '../../shared/CreatorAnimations';
import { ContextToolRail } from '../../surfaces/ContextToolRail';
import type { CreatorLayer } from '../../core/projectStore/composition';
import type { ToolContext, ToolGroup } from '../../core/toolRegistry';
import type { useHaptic } from '../../../hooks/useHaptic';
import type { ActiveSheet } from '../useActiveSheet';

// ── Types ────────────────────────────────────────────────────────────

/**
 * The haptic engine returned by useHaptic.
 */
type Haptic = ReturnType<typeof useHaptic>;

/**
 * The subset of the screen's StyleSheet styles the tool rail renders. The
 * parent passes its full `styles` object; only these keys are read.
 */
export interface PosterToolRailDockStyles {
  bottomRailContainer: ViewStyle;
  bottomRailContent: ViewStyle;
  bottomRailGlassDock: ViewStyle;
  frameBadgePill: ViewStyle;
  frameCountText: TextStyle;
  contextRail: ViewStyle;
  bottomStoryPostBtn: ViewStyle;
}

export interface PosterToolRailDockProps {
  /** Screen styles (the parent's full createStyles() object). */
  styles: PosterToolRailDockStyles;
  /** Theme colors. */
  colors: ThemeColors;
  /** Bottom safe-area inset (padding under the rail). */
  bottomInset: number;
  /** Reanimated animated opacity — recedes chrome during manipulation. */
  chromeFadeStyle: ReturnType<typeof useAnimatedStyle>;
  /** Whether the rail should ignore touches (layer being dragged). */
  isManipulating: boolean;
  hasMultipleFrames: boolean;
  /** Currently selected layer (suppresses the frame badge when set). */
  selectedLayer: CreatorLayer | null;
  activePageIndex: number;
  pageCount: number;
  /** The resolved ToolContext (editor mode + selection state). */
  activeToolContext: ToolContext;
  /** Tool groups from buildPosterToolRail. */
  toolGroups: ToolGroup[];
  /** Opens a mutually-exclusive sheet ('overflow' for More, 'publish' for Send). */
  openSheet: (sheet: Exclude<ActiveSheet, null>) => void;
  /** Haptic engine (medium on Send). */
  haptic: Haptic;
}

export function PosterToolRailDock({
  styles,
  colors,
  bottomInset,
  chromeFadeStyle,
  isManipulating,
  hasMultipleFrames,
  selectedLayer,
  activePageIndex,
  pageCount,
  activeToolContext,
  toolGroups,
  openSheet,
  haptic,
}: PosterToolRailDockProps) {
  return (
    <Reanimated.View style={[styles.bottomRailContainer, { paddingBottom: bottomInset }, chromeFadeStyle]} pointerEvents={isManipulating ? 'none' : 'auto'}>
      <LinearGradient
        colors={Scrim.bottom.colors}
        locations={Scrim.bottom.locations}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      <View style={styles.bottomRailContent}>
        {/* Frame position label ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â non-interactive; page dots at top
            handle navigation. The frame organizer is in the More menu. */}
        {hasMultipleFrames && !selectedLayer && (
          <View style={styles.frameBadgePill}>
            <Text style={styles.frameCountText}>
              {activePageIndex + 1}/{pageCount}
            </Text>
          </View>
        )}

        <View style={styles.bottomRailGlassDock}>
          <ContextToolRail
            context={activeToolContext}
            groups={toolGroups}
            onOverflowPress={() => openSheet('overflow')}
            style={styles.contextRail}
          />
        </View>

        {/* Direct 1-tap Send / Story action (Snapchat / Instagram flagship pattern) */}
        <PressScale
          onPress={() => { haptic.medium(); openSheet('publish'); }}
          style={[styles.bottomStoryPostBtn, { backgroundColor: colors.brand }]}
          accessibilityLabel="Share story"
          accessibilityHint="Opens publish sheet to share your story"
          scale={0.94}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="paper-plane" size={17} color={colors.textInverse} />
        </PressScale>
      </View>
    </Reanimated.View>
  );
}
