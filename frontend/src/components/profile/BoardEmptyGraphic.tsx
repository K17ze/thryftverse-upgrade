import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useAppTheme } from '../../theme/ThemeContext';
import { Typography, Space, Radius, Type } from '../../theme/designTokens';

interface BoardEmptyGraphicProps {
  title: string;
  subtitle?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  size?: number;
}

export function BoardEmptyGraphic({
  title,
  subtitle,
  icon = 'folder-open-outline',
  size = 120,
}: BoardEmptyGraphicProps) {
  const { colors, isDark } = useAppTheme();

  const bg: [string, string] = isDark
    ? [colors.surfaceAlt, colors.surface]
    : [colors.surfaceAlt, colors.surface];

  const iconColor = isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.2)';
  const dotColor = isDark ? '#fff' : '#000';
  const iconRingBg = isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)';
  const iconRingBorder = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)';
  const titleColor = isDark ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.5)';
  const subtitleColor = isDark ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.35)';

  return (
    <View style={[styles.container, { width: size, height: size }]}>
      <LinearGradient
        colors={bg}
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
                backgroundColor: dotColor,
              },
            ]}
          />
        ))}
      </View>

      <View style={styles.center}>
        <View style={[styles.iconRing, { backgroundColor: iconRingBg, borderColor: iconRingBorder }]}>
          <Ionicons name={icon} size={28} color={iconColor} />
        </View>
        <Text style={[styles.title, { color: titleColor }]}>{title}</Text>
        {subtitle ? <Text style={[styles.subtitle, { color: subtitleColor }]}>{subtitle}</Text> : null}
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
    ...StyleSheet.absoluteFill,
  },
  dot: {
    position: 'absolute',
    width: 4,
    height: 4,
    borderRadius: Radius.sm,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space.smMd,
    padding: Space.md,
  },
  iconRing: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  title: {
    fontFamily: Typography.family.semibold,
    fontSize: Type.captionElevated.size,
    textAlign: 'center',
  },
  subtitle: {
    fontFamily: Typography.family.regular,
    fontSize: Type.meta.size,
    textAlign: 'center',
  },
});
