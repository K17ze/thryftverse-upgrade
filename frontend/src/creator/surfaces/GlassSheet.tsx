/**
 * GlassSheet — shared bottom sheet shell with title + Done header.
 *
 * Extracted from the 6 inline sheet implementations in PosterComposerScreen
 * (Transitions, Keyframes, SpeedCurve, Reverse, FreezeFrame, AudioFade).
 * Each duplicated the same sheet + overlay + hairline + header structure.
 *
 * Per AGENTS.md §4: one system, not many. GlassSheet is now a thin wrapper
 * around SheetContainer (the canonical animated sheet from CreatorAnimations).
 * It passes the title + doneHint to SheetContainer's built-in header and
 * delegates all sheet physics, backdrop, drag handle, and swipe-to-dismiss
 * to SheetContainer so there is one owner for sheet motion.
 */
import React from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';

import { Space } from '../../theme/designTokens';
import { SheetContainer } from '../CreatorAnimations';

// ── Types ─────────────────────────────────────────────────────────────

export interface GlassSheetProps {
  /** Sheet title shown in the header. */
  title: string;
  /** Called when the user taps Done or the backdrop. */
  onClose: () => void;
  /** Accessibility hint for the Done button. Defaults to "Closes this panel". */
  doneHint?: string;
  /** Padding bottom override (typically insets.bottom + Space.sm). */
  paddingBottom?: number;
  /** Sheet content. */
  children: React.ReactNode;
}

// ── Component ─────────────────────────────────────────────────────────

/**
 * Bottom sheet shell with a title + Done header. Delegates sheet physics
 * (slide-up, backdrop fade, swipe-to-dismiss, grabber handle) to
 * SheetContainer. The backdrop tap and Done button both call onClose.
 */
export const GlassSheet = React.memo(function GlassSheet({
  title,
  onClose,
  doneHint,
  paddingBottom = 0,
  children,
}: GlassSheetProps): React.ReactElement {
  return (
    <SheetContainer
      visible={true}
      onClose={onClose}
      maxHeight={0.5}
      title={title}
      doneHint={doneHint}
    >
      <View style={[styles.body, { paddingBottom }]}>
        {children}
      </View>
    </SheetContainer>
  );
});

// ── Styles ────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  body: {
    flex: 1,
  } as ViewStyle,
});
