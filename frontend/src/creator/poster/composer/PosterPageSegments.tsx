/**
 * PosterPageSegments — Instagram-style frame progress segments for the
 * Poster composer.
 *
 * Extracted from PosterComposerScreen (pure extraction — no visual or
 * behavioral change). Thinner, quieter tracks than the viewer; rendered by
 * the parent only when there are multiple frames and no layer is selected.
 * Tapping a segment switches frames; long-press opens frame options. The
 * add-frame control sits at the end of the row.
 */
import React from 'react';
import { View, Pressable, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { IconGrammar } from '../../../theme/designTokens';
import type { ThemeColors } from '../../../theme/ThemeContext';
import { PressScale } from '../../shared/CreatorAnimations';
import type { CreatorPage } from '../../core/projectStore/composition';
import type { useHaptic } from '../../../hooks/useHaptic';

// ── Types ────────────────────────────────────────────────────────────

/**
 * The haptic engine returned by useHaptic.
 */
type Haptic = ReturnType<typeof useHaptic>;

/**
 * The subset of the screen's StyleSheet styles the segments render. The
 * parent passes its full `styles` object; only these keys are read.
 */
export interface PosterPageSegmentsStyles {
  pageSegmentsContainer: ViewStyle;
  pageSegmentsRow: ViewStyle;
  pageSegmentTarget: ViewStyle;
  pageSegmentTrack: ViewStyle;
  pageSegmentFill: ViewStyle;
  pageSegmentAdd: ViewStyle;
}

export interface PosterPageSegmentsProps {
  /** Screen styles (the parent's full createStyles() object). */
  styles: PosterPageSegmentsStyles;
  /** Theme colors. */
  colors: ThemeColors;
  /** Top safe-area inset (positions the row under the notch). */
  topInset: number;
  /** Document pages — one segment per frame. */
  pages: CreatorPage[];
  activePageIndex: number;
  /** Canonical page-change handler (resets transient selection). */
  goToPage: (index: number) => void;
  /** Haptic engine (medium on long-press). */
  haptic: Haptic;
  /** Opens the per-frame options menu (long-press on a segment). */
  setPageMenuIndex: (index: number | null) => void;
  pageCount: number;
  /** Adds a new frame (trailing "+" control; hidden at the 10-page cap). */
  handleAddFrame: () => void;
}

export function PosterPageSegments({
  styles,
  colors,
  topInset,
  pages,
  activePageIndex,
  goToPage,
  haptic,
  setPageMenuIndex,
  pageCount,
  handleAddFrame,
}: PosterPageSegmentsProps) {
  return (
    <View style={[styles.pageSegmentsContainer, { top: topInset + 6 }]}>
      <View style={styles.pageSegmentsRow}>
        {pages.map((p, i) => (
          <Pressable
            key={p.id}
            onPress={() => goToPage(i)}
            onLongPress={() => { haptic.medium(); setPageMenuIndex(i); }}
            style={styles.pageSegmentTarget}
            accessibilityLabel={`Frame ${i + 1}`}
            accessibilityHint="Switches to this frame. Long press for frame options."
            accessibilityRole="button"
            accessibilityState={{ selected: i === activePageIndex }}
            hitSlop={{ top: 12, bottom: 12, left: 4, right: 4 }}
          >
            <View style={styles.pageSegmentTrack}>
              <View
                style={[
                  styles.pageSegmentFill,
                  {
                    flex: i === activePageIndex ? 1 : 0,
                    backgroundColor: i <= activePageIndex ? colors.textSecondary : colors.border,
                  },
                ]}
              />
            </View>
          </Pressable>
        ))}
        {/* Add frame ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â sits at the end of the page dots row */}
        {pageCount < 10 && (
          <PressScale
            onPress={handleAddFrame}
            style={styles.pageSegmentAdd}
            accessibilityLabel="Add frame"
            accessibilityHint="Adds a new frame to the story"
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Ionicons name="add" size={IconGrammar.metadata} color={colors.textSecondary} />
          </PressScale>
        )}
      </View>
    </View>
  );
}
