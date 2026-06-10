import React from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { Colors, ActiveTheme } from '../constants/colors';
import { Typography } from '../theme/designTokens';

const { width: SCREEN_W } = Dimensions.get('window');

interface Props {
  label?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  width?: number;
  height?: number;
  style?: object;
}

const GRADIENT_PAIRS: [string, string][] = ActiveTheme === 'light'
  ? [
    ['#F5F0EB', '#EDE8E1'],
    ['#EAE5DE', '#E2DDD6'],
    ['#F0EBE6', '#E8E3DC'],
    ['#EDE8E1', '#E5E0D9'],
  ]
  : [
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
  const pairIndex = (label?.length ?? 0) % GRADIENT_PAIRS.length;
  const [gradStart, gradEnd] = GRADIENT_PAIRS[pairIndex];

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
                backgroundColor:
                  ActiveTheme === 'light'
                    ? 'rgba(0,0,0,0.03)'
                    : 'rgba(255,255,255,0.025)',
              },
            ]}
          />
        ))}
      </View>

      {/* Center content */}
      <View style={styles.center}>
        <View style={styles.iconRing}>
          <Ionicons
            name={icon}
            size={22}
            color={ActiveTheme === 'light' ? 'rgba(0,0,0,0.18)' : 'rgba(255,255,255,0.2)'}
          />
        </View>
        {label ? (
          <View style={styles.labelWrap}>
            <Text style={styles.label}>{label}</Text>
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
    ...StyleSheet.absoluteFillObject,
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
    backgroundColor:
      ActiveTheme === 'light' ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor:
      ActiveTheme === 'light' ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.08)',
  },
  labelWrap: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 4,
    backgroundColor:
      ActiveTheme === 'light' ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.04)',
  },
  label: {
    fontFamily: Typography.family.medium,
    fontSize: 11,
    color: ActiveTheme === 'light' ? 'rgba(0,0,0,0.35)' : 'rgba(255,255,255,0.35)',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
});
