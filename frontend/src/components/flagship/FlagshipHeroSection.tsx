import React from 'react';
import { View, Text, StyleSheet, useWindowDimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { Space, Type, FontFamily, Scrim } from '../../theme/designTokens';
import { Motion } from '../../theme/motionTokens';
import { CachedImage } from '../CachedImage';
import { AppButton } from '../ui/AppButton';

interface FlagshipHeroSectionProps {
  imageUri?: string;
  title: string;
  subtitle?: string;
  ctaLabel?: string;
  onCta?: () => void;
  height?: number;
}

export function FlagshipHeroSection({
  imageUri,
  title,
  subtitle,
  ctaLabel,
  onCta,
  height = 320,
}: FlagshipHeroSectionProps) {
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const { width } = useWindowDimensions();

  return (
    <View style={[styles.root, { width, height }]}>
      {imageUri ? (
        <CachedImage
          uri={imageUri}
          style={{ width, height }}
          contentFit="cover"
          transition={Motion.transitions.mediaLoad.duration}
          accessibilityRole="image"
          accessibilityLabel={title}
        />
      ) : (
        <View style={[styles.imageFallback, { width, height }]} accessibilityElementsHidden />
      )}

      {/* Authored scrim — bottom-weighted for text legibility */}
      <LinearGradient
        colors={Scrim.bottom.colors}
        locations={Scrim.bottom.locations}
        style={[StyleSheet.absoluteFill, { width, height }]}
        accessibilityElementsHidden
      />

      <View style={styles.textWrap}>
        <Text style={styles.title}>
          {title}
        </Text>
        {subtitle && (
          <Text style={styles.subtitle}>
            {subtitle}
          </Text>
        )}
        {ctaLabel && onCta && (
          <View style={styles.ctaWrap}>
            <AppButton title={ctaLabel} variant="primary" onPress={onCta} size="sm" />
          </View>
        )}
      </View>
    </View>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  root: {
    position: 'relative',
    overflow: 'hidden',
  },
  imageFallback: {
    backgroundColor: colors.surfaceAlt,
  },
  textWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: Space.lg,
    paddingBottom: Space.xl,
  },
  title: {
    fontSize: Type.display.size,
    lineHeight: Type.display.lineHeight,
    fontFamily: FontFamily.bold,
    color: colors.scrimTextPrimary,
    letterSpacing: -0.5,
  },
  subtitle: {
    marginTop: Space.xs,
    fontSize: Type.body.size,
    lineHeight: Type.body.lineHeight,
    fontFamily: FontFamily.regular,
    color: colors.scrimTextSecondary,
  },
  ctaWrap: {
    marginTop: Space.md,
    alignSelf: 'flex-start',
  },
});
