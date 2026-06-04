/**
 * GlassSurface — Frosted glass primitive for flagship native feel
 * Uses expo-blur for true iOS-style glassmorphism
 *
 * Usage:
 *   <GlassSurface intensity={40} tint="dark" style={styles.navHeader}>
 *     <Text>Navigation content</Text>
 *   </GlassSurface>
 */

import React from 'react';
import {
  View,
  StyleSheet,
  StyleProp,
  ViewStyle,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { Colors, ActiveTheme } from '../../constants/colors';
import { Radius } from '../../theme/designTokens';

export interface GlassSurfaceProps {
  children?: React.ReactNode;
  intensity?: number; // 0-100, default 40
  tint?: 'light' | 'dark' | 'default';
  borderRadius?: number;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
  /** Add subtle top/bottom hairline border for depth separation */
  borderPosition?: 'top' | 'bottom' | 'both' | 'none';
}

export function GlassSurface({
  children,
  intensity = 40,
  tint = 'default',
  borderRadius = Radius.lg,
  style,
  contentStyle,
  borderPosition = 'none',
}: GlassSurfaceProps) {
  const resolvedTint = tint === 'default'
    ? (ActiveTheme === 'light' ? 'light' : 'dark')
    : tint;

  return (
    <View
      style={[
        styles.outer,
        { borderRadius },
        style,
      ]}
    >
      <BlurView
        intensity={intensity}
        tint={resolvedTint}
        style={[StyleSheet.absoluteFill, { borderRadius }]}
      />
      {/* Subtle border overlay for depth */}
      {borderPosition !== 'none' && (
        <View
          style={[
            styles.borderOverlay,
            { borderRadius },
            borderPosition === 'top' && styles.borderTop,
            borderPosition === 'bottom' && styles.borderBottom,
            borderPosition === 'both' && styles.borderBoth,
          ]}
          pointerEvents="none"
        />
      )}
      <View style={[styles.content, contentStyle]}>
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  outer: {
    overflow: 'hidden',
    // iOS shadow for floating glass feel
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
  },
  content: {
    // Ensure content sits above blur
    zIndex: 1,
  },
  borderOverlay: {
    ...StyleSheet.absoluteFillObject,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
    zIndex: 2,
    pointerEvents: 'none',
  },
  borderTop: {
    borderBottomWidth: 0,
    borderLeftWidth: 0,
    borderRightWidth: 0,
  },
  borderBottom: {
    borderTopWidth: 0,
    borderLeftWidth: 0,
    borderRightWidth: 0,
  },
  borderBoth: {},
});

/**
 * GlassHeader — Pre-configured glass surface for sticky nav headers
 * Automatically uses dark tint and top border for depth separation
 */
export function GlassHeader({
  children,
  intensity = 50,
  style,
  contentStyle,
}: Omit<GlassSurfaceProps, 'borderPosition' | 'tint' | 'borderRadius'>) {
  return (
    <GlassSurface
      intensity={intensity}
      tint="default"
      borderRadius={0}
      borderPosition="bottom"
      style={style}
      contentStyle={contentStyle}
    >
      {children}
    </GlassSurface>
  );
}

/**
 * GlassBottomBar — Pre-configured glass surface for floating bottom bars
 * Uses top border for depth separation from content below
 */
export function GlassBottomBar({
  children,
  intensity = 45,
  style,
  contentStyle,
}: Omit<GlassSurfaceProps, 'borderPosition' | 'tint' | 'borderRadius'>) {
  return (
    <GlassSurface
      intensity={intensity}
      tint="default"
      borderRadius={0}
      borderPosition="top"
      style={style}
      contentStyle={contentStyle}
    >
      {children}
    </GlassSurface>
  );
}

/**
 * GlassCard — Glassmorphic card for featured content / hero moments
 * Uses larger border radius and stronger shadow for floating effect
 */
export function GlassCard({
  children,
  intensity = 35,
  borderRadius = Radius.xl,
  style,
  contentStyle,
}: Omit<GlassSurfaceProps, 'borderPosition' | 'tint'>) {
  return (
    <GlassSurface
      intensity={intensity}
      tint="default"
      borderRadius={borderRadius}
      borderPosition="both"
      style={[cardStyles.cardShadow, style]}
      contentStyle={contentStyle}
    >
      {children}
    </GlassSurface>
  );
}

const cardStyles = StyleSheet.create({
  cardShadow: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 20,
    elevation: 8,
  },
});
