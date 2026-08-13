import React from 'react';
import { View, Text, StyleSheet, useWindowDimensions, Pressable } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Reanimated, { FadeInUp } from 'react-native-reanimated';
import { useAppTheme } from '../../theme/ThemeContext';
import { Space, Radius, Type, FontFamily } from '../../theme/designTokens';
import { CachedImage } from '../CachedImage';
import { AppButton } from '../ui/AppButton';
import { useReducedMotion } from '../../hooks/useReducedMotion';

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
  const reducedMotion = useReducedMotion();

  return (
    <View style={[styles.root, { width, height }]}>
      {imageUri ? (
        <CachedImage uri={imageUri} style={{ width, height }} contentFit="cover" transition={500} />
      ) : (
        <View style={[styles.imageFallback, { width, height }]} />
      )}

      {/* Authored scrim — bottom-weighted for text legibility */}
      <LinearGradient
        colors={['rgba(0,0,0,0.0)', 'rgba(0,0,0,0.35)', 'rgba(0,0,0,0.65)']}
        locations={[0.3, 0.6, 1.0]}
        style={[StyleSheet.absoluteFill, { width, height }]}
      />

      <View style={styles.textWrap}>
        <Reanimated.Text entering={reducedMotion ? undefined : FadeInUp.duration(400)} style={styles.title}>
          {title}
        </Reanimated.Text>
        {subtitle && (
          <Reanimated.Text entering={reducedMotion ? undefined : FadeInUp.delay(80).duration(400)} style={styles.subtitle}>
            {subtitle}
          </Reanimated.Text>
        )}
        {ctaLabel && onCta && (
          <Reanimated.View entering={reducedMotion ? undefined : FadeInUp.delay(140).duration(400)} style={styles.ctaWrap}>
            <AppButton title={ctaLabel} variant="primary" onPress={onCta} size="sm" />
          </Reanimated.View>
        )}
      </View>
    </View>
  );
}

const createStyles = (colors: any) => StyleSheet.create({
  root: {
    position: 'relative',
    overflow: 'hidden',
    borderRadius: Radius.none,
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
    lineHeight: 38,
    fontFamily: FontFamily.bold,
    color: '#fff',
    letterSpacing: -0.5,
  },
  subtitle: {
    marginTop: Space.xs,
    fontSize: Type.body.size,
    lineHeight: 22,
    fontFamily: FontFamily.regular,
    color: 'rgba(255,255,255,0.88)',
  },
  ctaWrap: {
    marginTop: Space.md,
    alignSelf: 'flex-start',
  },
});
