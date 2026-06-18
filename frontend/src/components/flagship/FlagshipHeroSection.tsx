import React from 'react';
import { View, Text, StyleSheet, useWindowDimensions, Pressable } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Reanimated, { FadeInUp } from 'react-native-reanimated';
import { Colors } from '../../constants/colors';
import { Space, Radius, Type } from '../../theme/designTokens';
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
  const { width } = useWindowDimensions();

  return (
    <View style={[styles.root, { width, height }]}>
      {imageUri ? (
        <CachedImage uri={imageUri} style={{ width, height }} contentFit="cover" transition={500} />
      ) : (
        <View style={[styles.imageFallback, { width, height }]} />
      )}

      <LinearGradient
        colors={['rgba(0,0,0,0.15)', 'rgba(0,0,0,0.55)']}
        style={[StyleSheet.absoluteFill, { width, height }]}
      />

      <View style={styles.textWrap}>
        <Reanimated.Text entering={FadeInUp.duration(500)} style={styles.title}>
          {title}
        </Reanimated.Text>
        {subtitle && (
          <Reanimated.Text entering={FadeInUp.delay(100).duration(500)} style={styles.subtitle}>
            {subtitle}
          </Reanimated.Text>
        )}
        {ctaLabel && onCta && (
          <Reanimated.View entering={FadeInUp.delay(180).duration(500)} style={styles.ctaWrap}>
            <AppButton title={ctaLabel} variant="primary" onPress={onCta} size="sm" />
          </Reanimated.View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    position: 'relative',
    overflow: 'hidden',
    borderRadius: Radius.none,
  },
  imageFallback: {
    backgroundColor: Colors.surfaceAlt,
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
    fontWeight: '800',
    color: '#fff',
    letterSpacing: -0.8,
    lineHeight: 40,
    textShadowColor: 'rgba(0,0,0,0.4)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  subtitle: {
    marginTop: Space.xs,
    fontSize: Type.body.size,
    fontWeight: '400',
    color: 'rgba(255,255,255,0.92)',
    lineHeight: 22,
    textShadowColor: 'rgba(0,0,0,0.3)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  ctaWrap: {
    marginTop: Space.md,
    alignSelf: 'flex-start',
  },
});