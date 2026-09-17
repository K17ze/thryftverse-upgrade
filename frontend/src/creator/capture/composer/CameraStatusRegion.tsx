import React from 'react';
import { View, Text, Image, type StyleProp, type ViewStyle } from 'react-native';
import type { AnimatedStyle } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import Reanimated from 'react-native-reanimated';
import { useAppTheme } from '../../../theme/ThemeContext';
import type { GreenScreenSettings } from '../../camera/GreenScreenSheet';
import { styles } from '../CreatorCameraStyles';

// ── Consolidated status region ───────────────────────────────────────
// One top-center pill shows the single most-relevant status so the
// top area never hosts competing badges. Priority:
// recording > hands-free > green-screen > zoom. The zoom indicator
// is the transient fallback (animated opacity, invisible unless a
// pinch just occurred). One consistent pill style:
// colors.mediaOverlayScrim fill, colors.scrimTextPrimary text,
// Radius.full.

export interface CameraStatusRegionProps {
  top: number;
  isRecording: boolean;
  /** Pre-rendered elapsed label, e.g. "3s" or "3s  2×". */
  recordingLabel: string;
  isMutedRecording: boolean;
  handsFreeMode: boolean;
  handsFreeCountdown: number | null;
  greenScreenSettings: GreenScreenSettings | null;
  showGreenScreenSheet: boolean;
  zoomIndicatorStyle: StyleProp<AnimatedStyle<ViewStyle>>;
  zoomLabel: string;
}

export function CameraStatusRegion({
  top,
  isRecording,
  recordingLabel,
  isMutedRecording,
  handsFreeMode,
  handsFreeCountdown,
  greenScreenSettings,
  showGreenScreenSheet,
  zoomIndicatorStyle,
  zoomLabel }: CameraStatusRegionProps) {
  const { colors } = useAppTheme();
  return (
    <View style={[styles.statusRegion, { top }]} pointerEvents="none">
      {isRecording ? (
        <View style={[styles.statusPill, { backgroundColor: colors.mediaOverlayScrim }]}>
          <View style={[styles.recordingDot, { backgroundColor: colors.danger }]} />
          <Text style={[styles.statusPillText, { color: colors.scrimTextPrimary }]}>
            {recordingLabel}
          </Text>
          {isMutedRecording && (
            <View style={styles.mutedIndicator}>
              <Ionicons name="mic-off" size={10} color={colors.scrimTextPrimary} />
            </View>
          )}
        </View>
      ) : handsFreeMode && handsFreeCountdown === null ? (
        <View style={[styles.statusPill, { backgroundColor: colors.mediaOverlayScrim }]}>
          <Ionicons name="hand-right-outline" size={12} color={colors.scrimTextSecondary} />
          <Text style={[styles.statusPillText, { color: colors.scrimTextPrimary }]}>Hands-free</Text>
        </View>
      ) : greenScreenSettings && !showGreenScreenSheet ? (
        <View style={[styles.statusPill, { backgroundColor: colors.mediaOverlayScrim }]}>
          <Image
            source={{ uri: greenScreenSettings.backgroundUri }}
            style={styles.greenScreenThumb}
          />
          <Text style={[styles.statusPillText, { color: colors.scrimTextPrimary }]}>Green Screen</Text>
        </View>
      ) : (
        <Reanimated.View style={[styles.statusPill, { backgroundColor: colors.mediaOverlayScrim }, zoomIndicatorStyle]}>
          <Text style={[styles.statusPillText, { color: colors.scrimTextPrimary }]}>
            {zoomLabel}
          </Text>
        </Reanimated.View>
      )}
    </View>
  );
}
