import React from 'react';
import { View, Text, Pressable, Image, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../../theme/ThemeContext';
import type { CreatorInitialMedia } from '../../../navigation/types';
import { styles } from '../CreatorCameraStyles';

// ── Multi-snap staging tray ──────────────────────────────────────────
// Whenever captures exist, a persistent horizontal row of captured
// thumbnails is visible on the camera surface so the user sees their
// sequence accumulate while shooting. Each thumbnail is tappable to
// drop that frame. A Done button at the end lets the user finish and
// enter the editor. The tray is visible whenever captures exist,
// regardless of the multi-capture toggle, so accumulated captures
// are never hidden.

export interface CaptureStagingTrayProps {
  captures: CreatorInitialMedia[];
  top: number;
  onRemoveCapture: (captureId: string) => void;
  onDone: () => void;
}

export function CaptureStagingTray({ captures, top, onRemoveCapture, onDone }: CaptureStagingTrayProps) {
  const { colors } = useAppTheme();
  return (
    <View
      style={[styles.stagingTray, { top }]}
      pointerEvents="box-none"
    >
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.stagingTrayContent}
      >
        {captures.map((cap, i) => (
          <Pressable
            key={cap.id}
            style={styles.stagingThumbWrap}
            onPress={() => onRemoveCapture(cap.id)}
            hitSlop={4}
            accessibilityLabel={`Frame ${i + 1} of ${captures.length}, tap to remove`}
            accessibilityHint="Removes this capture from the batch"
            accessibilityRole="button"
          >
            {cap.kind === 'video' ? (
              // RN Image cannot decode a local .mp4 — render a truthful
              // video tile (play glyph + duration) instead of a blank.
              <View style={[styles.stagingThumb, styles.stagingThumbVideo, { borderColor: colors.scrimTextPrimary, backgroundColor: colors.mediaOverlayScrim }]}>
                <Ionicons name="play" size={12} color={colors.scrimTextPrimary} />
                {cap.durationMs ? (
                  <Text style={[styles.stagingThumbDuration, { color: colors.scrimTextPrimary }]}>
                    {`${Math.max(1, Math.round(cap.durationMs / 1000))}s`}
                  </Text>
                ) : null}
              </View>
            ) : (
              <Image source={{ uri: cap.uri }} style={[styles.stagingThumb, { borderColor: colors.scrimTextPrimary }]} />
            )}
            {/* Order index — bottom-left, the verified multi-select pattern */}
            <View style={[styles.stagingOrderBadge, { backgroundColor: colors.mediaOverlayScrim }]}>
              <Text style={[styles.stagingOrderText, { color: colors.scrimTextPrimary }]}>{i + 1}</Text>
            </View>
          </Pressable>
        ))}
        {/* Done button — finish multi-capture and enter the editor
            with the full batch. */}
        <Pressable
          style={({ pressed }) => [styles.stagingDoneBtn, { backgroundColor: colors.scrimTextTertiary }, pressed && styles.btnPressed]}
          onPress={onDone}
          hitSlop={4}
          accessibilityLabel={`Done, ${captures.length} captures selected`}
          accessibilityHint="Finishes multi-capture and opens the editor with all captures"
          accessibilityRole="button"
        >
          <Ionicons name="checkmark" size={12} color={colors.scrimTextPrimary} />
          <Text style={[styles.stagingDoneText, { color: colors.scrimTextPrimary }]}>Done ({captures.length})</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}
