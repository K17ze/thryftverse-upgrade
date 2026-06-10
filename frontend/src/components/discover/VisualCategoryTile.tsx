import React from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { AnimatedPressable } from '../AnimatedPressable';
import { CachedImage } from '../CachedImage';
import { Colors, ActiveTheme } from '../../constants/colors';
import { Typography, Space, Radius } from '../../theme/designTokens';

const { width: SCREEN_W } = Dimensions.get('window');

interface Props {
  title: string;
  subtitle?: string;
  imageUri?: string;
  count?: number;
  onPress: () => void;
  size?: 'large' | 'medium' | 'small';
}

const SIZE_MAP = {
  large: { width: SCREEN_W - Space.md * 2, height: 180, titleSize: 24, radius: Radius.xl },
  medium: { width: (SCREEN_W - Space.md * 2 - Space.sm) / 2, height: 140, titleSize: 18, radius: Radius.lg },
  small: { width: (SCREEN_W - Space.md * 2 - Space.sm * 2) / 3, height: 110, titleSize: 14, radius: Radius.md },
};

const GRADIENT_OVERLAYS: readonly [string, string] = ActiveTheme === 'light'
  ? ['rgba(0,0,0,0.0)', 'rgba(0,0,0,0.45)']
  : ['rgba(0,0,0,0.0)', 'rgba(0,0,0,0.55)'];

export function VisualCategoryTile({
  title,
  subtitle,
  imageUri,
  count,
  onPress,
  size = 'medium',
}: Props) {
  const dims = SIZE_MAP[size];

  return (
    <AnimatedPressable
      style={[styles.card, { width: dims.width, height: dims.height, borderRadius: dims.radius }]}
      onPress={onPress}
      activeOpacity={0.92}
      accessibilityLabel={`${title} category`}
      accessibilityRole="button"
    >
      <CachedImage
        uri={imageUri ?? ''}
        style={StyleSheet.absoluteFill}
        containerStyle={{ borderRadius: dims.radius }}
        contentFit="cover"
        emptyLabel={title}
        emptyIcon="grid-outline"
      />

      <LinearGradient
        colors={GRADIENT_OVERLAYS}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={[StyleSheet.absoluteFill, { borderRadius: dims.radius }]}
      />

      <View style={styles.textOverlay}>
        <Text style={[styles.title, { fontSize: dims.titleSize }]} numberOfLines={1}>{title}</Text>
        {subtitle ? (
          <Text style={styles.subtitle} numberOfLines={1}>{subtitle}</Text>
        ) : null}
        {count !== undefined ? (
          <View style={styles.countRow}>
            <Ionicons name="shirt-outline" size={10} color="rgba(255,255,255,0.8)" />
            <Text style={styles.countText}>{count} items</Text>
          </View>
        ) : null}
      </View>
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  card: {
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: Colors.surfaceAlt,
  },
  textOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 14,
  },
  title: {
    fontFamily: Typography.family.bold,
    color: '#fff',
    letterSpacing: -0.3,
    textShadowColor: 'rgba(0,0,0,0.3)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  subtitle: {
    fontFamily: Typography.family.medium,
    fontSize: 12,
    color: 'rgba(255,255,255,0.8)',
    marginTop: 2,
    textShadowColor: 'rgba(0,0,0,0.25)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  countRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 6,
  },
  countText: {
    fontFamily: Typography.family.medium,
    fontSize: 10,
    color: 'rgba(255,255,255,0.75)',
    letterSpacing: 0.2,
  },
});
