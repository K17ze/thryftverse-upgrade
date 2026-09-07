import React from 'react';
import { View, StyleSheet, Pressable, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../../theme/ThemeContext';
import { Space, Radius, FontFamily } from '../../../theme/designTokens';
import { TypographyV2 } from '../../../theme/typography.v2';
import { Text } from 'react-native';

export interface CoOwnAssetMediaStageProps {
  images: string[];
  conditionGrade?: string | null;
  onOpenFullscreen: (index: number) => void;
}

export function CoOwnAssetMediaStage({
  images,
  conditionGrade,
  onOpenFullscreen,
}: CoOwnAssetMediaStageProps) {
  const { colors, isDark } = useAppTheme();
  const primaryImage = images[0] ?? null;

  return (
    <View style={[styles.container, { backgroundColor: isDark ? colors.surfaceAlt : colors.surface }]}>
      <Pressable
        onPress={() => onOpenFullscreen(0)}
        style={styles.imagePressable}
        accessibilityRole="imagebutton"
        accessibilityLabel="View full-screen gallery"
        accessibilityHint="Opens high-resolution image gallery"
      >
        {primaryImage ? (
          <Image
            source={{ uri: primaryImage }}
            style={styles.image}
            resizeMode="cover"
            accessibilityIgnoresInvertColors
          />
        ) : (
          <View style={[styles.placeholder, { backgroundColor: colors.surfaceAlt }]}>
            <Ionicons name="cube-outline" size={48} color={colors.textMuted} />
          </View>
        )}

        {/* Condition Grade Badge */}
        {conditionGrade ? (
          <View style={[styles.conditionBadge, { backgroundColor: isDark ? 'rgba(0,0,0,0.72)' : 'rgba(255,255,255,0.92)' }]}>
            <Ionicons name="shield-checkmark" size={13} color={colors.brand} />
            <Text style={[styles.conditionText, { color: colors.textPrimary }]} maxFontSizeMultiplier={1.2}>
              {conditionGrade}
            </Text>
          </View>
        ) : null}

        {/* Gallery expand prompt */}
        <View style={[styles.expandPrompt, { backgroundColor: isDark ? 'rgba(0,0,0,0.6)' : 'rgba(255,255,255,0.85)' }]}>
          <Ionicons name="scan-outline" size={14} color={colors.textPrimary} />
          {images.length > 1 ? (
            <Text style={[styles.expandText, { color: colors.textPrimary }]} maxFontSizeMultiplier={1.2}>
              1/{images.length}
            </Text>
          ) : null}
        </View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    height: 200,
    width: '100%',
    overflow: 'hidden',
  },
  imagePressable: {
    flex: 1,
    position: 'relative',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  placeholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  conditionBadge: {
    position: 'absolute',
    top: Space.sm,
    left: Space.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Space.sm,
    paddingVertical: 4,
    borderRadius: Radius.full,
  },
  conditionText: {
    fontSize: TypographyV2.meta.size,
    fontFamily: FontFamily.semibold,
    lineHeight: TypographyV2.meta.lineHeight,
  },
  expandPrompt: {
    position: 'absolute',
    bottom: Space.sm,
    right: Space.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Space.xs + 2,
    paddingVertical: 4,
    borderRadius: Radius.sm,
  },
  expandText: {
    fontSize: TypographyV2.meta.size,
    fontFamily: FontFamily.medium,
  },
});
