import React from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../theme/ThemeContext';
import { Typography } from '../theme/designTokens';

const { width: SCREEN_W } = Dimensions.get('window');

interface Props {
  label?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  width?: number;
  height?: number;
  style?: object;
}

const LIGHT_GRADIENT_PAIRS: [string, string][] = [
  ['#F5F0EB', '#EDE8E1'],
  ['#EAE5DE', '#E2DDD6'],
  ['#F0EBE6', '#E8E3DC'],
  ['#EDE8E1', '#E5E0D9'],
];

const DARK_GRADIENT_PAIRS: [string, string][] = [
  ['#1A1A1A', '#141414'],
  ['#1F1F1F', '#181818'],
  ['#1C1C1C', '#161616'],
  ['#222222', '#1B1B1B'],
];

export function ImageEmptyGraphic({
  label,
  icon = 'image-outline',
  width: w,
  height: h,
  style,
}: Props) {
  const { isDark } = useAppTheme();
  const gradientPairs = isDark ? DARK_GRADIENT_PAIRS : LIGHT_GRADIENT_PAIRS;
  const pairIndex = (label?.length ?? 0) % gradientPairs.length;
  const [gradStart, gradEnd] = gradientPairs[pairIndex];

  const stripeColor = isDark ? 'rgba(255,255,255,0.025)' : 'rgba(0,0,0,0.03)';
  const iconColor = isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.18)';
  const iconRingBg = isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)';
  const iconRingBorder = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)';
  const labelBg = isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)';
  const labelColor = isDark ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.35)';

  return (
    <View
      style={[
        styles.container,
        w ? { width: w } : { width: '100%' },
        h ? { height: h } : { aspectRatio: 1 },
        style,
      ]}
    >
      <LinearGradient
        colors={[gradStart, gradEnd]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      {/* Subtle geometric texture — diagonal stripe pattern */}
      <View style={styles.texture} pointerEvents="none">
        {Array.from({ length: 6 }).map((_, i) => (
          <View
            key={i}
            style={[
              styles.stripe,
              {
                left: `${i * 22}%`,
                backgroundColor: stripeColor,
              },
            ]}
          />
        ))}
      </View>

      {/* Center content */}
      <View style={styles.center}>
        <View style={[styles.iconRing, { backgroundColor: iconRingBg, borderColor: iconRingBorder }]}>
          <Ionicons
            name={icon}
            size={22}
            color={iconColor}
          />
        </View>
        {label ? (
          <View style={[styles.labelWrap, { backgroundColor: labelBg }]}>
            <Text style={[styles.label, { color: labelColor }]}>{label}</Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
    borderRadius: 0,
    position: 'relative',
  },
  texture: {
    ...StyleSheet.absoluteFill,
    overflow: 'hidden',
  },
  stripe: {
    position: 'absolute',
    width: 2,
    height: '200%',
    transform: [{ rotate: '35deg' }],
    top: '-50%',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  iconRing: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  labelWrap: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 4,
  },
  label: {
    fontFamily: Typography.family.medium,
    fontSize: 11,
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
});