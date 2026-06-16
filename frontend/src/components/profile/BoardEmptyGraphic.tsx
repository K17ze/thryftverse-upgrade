import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, ActiveTheme } from '../../constants/colors';
import { Typography, Space, Radius } from '../../theme/designTokens';

interface BoardEmptyGraphicProps {
  title: string;
  subtitle?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  size?: number;
}

const BG: [string, string] = ActiveTheme === 'light'
  ? ['#F5F0EB', '#EDE8E1']
  : ['#1A1A1A', '#141414'];

export function BoardEmptyGraphic({
  title,
  subtitle,
  icon = 'folder-open-outline',
  size = 120,
}: BoardEmptyGraphicProps) {
  return (
    <View style={[styles.container, { width: size, height: size }]}>
      <LinearGradient
        colors={BG}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      {/* Subtle dot pattern */}
      <View style={styles.dots} pointerEvents="none">
        {Array.from({ length: 12 }).map((_, i) => (
          <View
            key={i}
            style={[
              styles.dot,
              {
                left: `${(i % 4) * 25 + 10}%`,
                top: `${Math.floor(i / 4) * 30 + 15}%`,
                opacity: 0.04 + (i % 3) * 0.02,
              },
            ]}
          />
        ))}
      </View>

      <View style={styles.center}>
        <View style={styles.iconRing}>
          <Ionicons
            name={icon}
            size={28}
            color={ActiveTheme === 'light' ? 'rgba(0,0,0,0.2)' : 'rgba(255,255,255,0.2)'}
          />
        </View>
        <Text style={styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: Radius.lg,
    overflow: 'hidden',
    position: 'relative',
    alignSelf: 'center',
  },
  dots: {
    ...StyleSheet.absoluteFillObject,
  },
  dot: {
    position: 'absolute',
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: ActiveTheme === 'light' ? '#000' : '#fff',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    padding: Space.md,
  },
  iconRing: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor:
      ActiveTheme === 'light' ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor:
      ActiveTheme === 'light' ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.08)',
  },
  title: {
    fontFamily: Typography.family.semibold,
    fontSize: 13,
    color: ActiveTheme === 'light' ? 'rgba(0,0,0,0.5)' : 'rgba(255,255,255,0.5)',
    textAlign: 'center',
  },
  subtitle: {
    fontFamily: Typography.family.regular,
    fontSize: 11,
    color: ActiveTheme === 'light' ? 'rgba(0,0,0,0.35)' : 'rgba(255,255,255,0.35)',
    textAlign: 'center',
  },
});