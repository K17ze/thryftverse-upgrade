import React from 'react';
import { View, type LayoutChangeEvent } from 'react-native';
import type { EdgeInsets } from 'react-native-safe-area-context';
import { useAppTheme } from '../../../theme/ThemeContext';
import type { CaptureViewport } from '../CaptureViewport';
import { styles } from '../CreatorCameraStyles';

// ── Capture guide overlay ────────────────────────────────────────────
// One unobscured capture viewport owns every composition guide. The
// guide frame is measured via onLayout so it adapts to real device
// dimensions instead of hardcoded offsets. Brackets and crosshair
// are shown ONLY for Visual Search or explicit framing mode. For
// ordinary Poster/Look capture, only an optional rule-of-thirds
// grid is shown.

export interface CaptureGuideOverlayProps {
  insets: EdgeInsets;
  hasBottomOverlay: boolean;
  isVisualSearch: boolean;
  isPoster: boolean;
  onViewportLayout: (event: LayoutChangeEvent) => void;
  showGrid: boolean;
  showFramingGuides: boolean;
  viewport: CaptureViewport | null;
}

export function CaptureGuideOverlay({
  insets,
  hasBottomOverlay,
  isVisualSearch,
  isPoster,
  onViewportLayout,
  showGrid,
  showFramingGuides,
  viewport }: CaptureGuideOverlayProps) {
  const { colors } = useAppTheme();
  return (
    <View
      style={[
        styles.captureGuideViewport,
        {
          top: Math.max(insets.top, 16) + 72,
          bottom: Math.max(insets.bottom, 16) + (hasBottomOverlay ? 184 : 140),
          left: isVisualSearch ? 52 : isPoster ? 24 : 36,
          right: isVisualSearch ? 52 : isPoster ? 24 : 36 },
      ]}
      onLayout={onViewportLayout}
      pointerEvents="none"
    >
      {/* Rule-of-thirds grid — available in all modes via Tools toggle.
          For ordinary capture this is the only guide (no brackets). */}
      {showGrid ? (
        <View style={styles.gridOverlay}>
          <View style={[styles.gridLineV1, { backgroundColor: colors.scrimTextTertiary }]} />
          <View style={[styles.gridLineV2, { backgroundColor: colors.scrimTextTertiary }]} />
          <View style={[styles.gridLineH1, { backgroundColor: colors.scrimTextTertiary }]} />
          <View style={[styles.gridLineH2, { backgroundColor: colors.scrimTextTertiary }]} />
        </View>
      ) : null}
      {/* Corner brackets + crosshair — Visual Search or explicit framing
          mode only. The guide frame is inset within the measured viewport
          to match the authored aspect ratio so brackets describe the
          actual capture crop. */}
      {showFramingGuides && viewport ? (
        <View
          style={[
            styles.framingFrame,
            {
              left: viewport.viewRect.x,
              top: viewport.viewRect.y,
              width: viewport.viewRect.width,
              height: viewport.viewRect.height },
          ]}
        >
          <View style={[styles.bracketTL, { borderColor: colors.scrimTextSecondary }]} />
          <View style={[styles.bracketTR, { borderColor: colors.scrimTextSecondary }]} />
          <View style={[styles.bracketBL, { borderColor: colors.scrimTextSecondary }]} />
          <View style={[styles.bracketBR, { borderColor: colors.scrimTextSecondary }]} />
          <View style={styles.crosshair}>
            <View style={[styles.crosshairH, { backgroundColor: colors.scrimTextTertiary }]} />
            <View style={[styles.crosshairV, { backgroundColor: colors.scrimTextTertiary }]} />
          </View>
        </View>
      ) : null}
    </View>
  );
}
