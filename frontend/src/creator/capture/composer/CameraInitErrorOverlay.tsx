import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Typography, Space, IconGrammar } from '../../../theme/designTokens';
import { TypographyV2 } from '../../../theme/typography.v2';
import { useAppTheme } from '../../../theme/ThemeContext';
import { styles } from '../CreatorCameraStyles';

// ── Camera init failure overlay ──────────────────────────────────────
// Dedicated error overlay with retry — distinct from permission-denied.

export interface CameraInitErrorOverlayProps {
  isPoster: boolean;
  onRetry: () => void;
  onGallery: () => void;
}

export function CameraInitErrorOverlay({ isPoster, onRetry, onGallery }: CameraInitErrorOverlayProps) {
  const { colors } = useAppTheme();
  return (
    <View style={StyleSheet.absoluteFill}>
      <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' }]}>
        <Ionicons name="camera-outline" size={IconGrammar.hero} color={colors.textSecondary} style={{ marginBottom: Space.xs }} />
        <Text style={{ fontFamily: Typography.family.semibold, fontSize: TypographyV2.sectionTitle.size, color: colors.textPrimary, marginTop: Space.xs }}>
          Camera couldn't start
        </Text>
        <Text style={{ fontFamily: Typography.family.regular, fontSize: TypographyV2.body.size, lineHeight: TypographyV2.body.lineHeight, color: colors.textSecondary, textAlign: 'center', paddingHorizontal: 40 }}>
          {`Something went wrong initializing the camera. Try again or use your gallery to create your ${isPoster ? 'story' : 'look'}.`}
        </Text>
        <Pressable
          style={({ pressed }) => [styles.cameraInitErrorBtn, { backgroundColor: colors.brand }, pressed && styles.btnPressed]}
          onPress={onRetry}
          accessibilityRole="button"
          accessibilityLabel="Try again"
          accessibilityHint="Re-initializes the camera"
        >
          <Text style={[styles.cameraInitErrorBtnText, { color: colors.textInverse }]}>Try again</Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.cameraInitErrorGalleryBtn, pressed && styles.btnPressed]}
          onPress={onGallery}
          accessibilityRole="button"
          accessibilityLabel="Use gallery instead"
          accessibilityHint="Opens your photo library"
        >
          <Text style={[styles.cameraInitErrorGalleryText, { color: colors.textSecondary }]}>Use gallery instead</Text>
        </Pressable>
      </View>
    </View>
  );
}
