import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme, type ThemeColors } from '../theme/ThemeContext';
import { Typography, Radius, Space, Stroke} from '../theme/designTokens';
import { TypographyV2 } from '../theme/typography.v2';

interface Props {
  label?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  width?: number;
  height?: number;
  style?: object;
  /** Optional content rendered below the label (e.g. a retry control). */
  children?: React.ReactNode;
  /** When true, hides this element and its descendants from the screen reader. */
  accessibilityElementsHidden?: boolean;
}

const GRADIENT_PAIRS_LIGHT: [string, string][] = [
  ['#F5F0EB', '#EDE8E1'],
  ['#EAE5DE', '#E2DDD6'],
  ['#F0EBE6', '#E8E3DC'],
  ['#EDE8E1', '#E5E0D9'],
];

const GRADIENT_PAIRS_DARK: [string, string][] = [
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
  children,
  accessibilityElementsHidden }: Props) {
  const { colors, isDark } = useAppTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);

  const gradientPairs = isDark ? GRADIENT_PAIRS_DARK : GRADIENT_PAIRS_LIGHT;
  const pairIndex = (label?.length ?? 0) % gradientPairs.length;
  const [gradStart, gradEnd] = gradientPairs[pairIndex];

  return (
    <View
      style={[
        styles.container,
        w ? { width: w } : { width: '100%' },
        h ? { height: h } : { aspectRatio: 1 },
        style,
      ]}
      accessibilityElementsHidden={accessibilityElementsHidden}
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
                backgroundColor: colors.borderSubtle },
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
            color={colors.textMuted}
          />
        </View>
        {label ? (
          <View style={styles.labelWrap}>
            <Text style={styles.label}>{label}</Text>
          </View>
        ) : null}
        {children}
      </View>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: {
      overflow: 'hidden',
      borderRadius: Radius.none,
      position: 'relative' },
    texture: {
      ...StyleSheet.absoluteFill,
      overflow: 'hidden' },
    stripe: {
      position: 'absolute',
      width: 2,
      height: '200%',
      transform: [{ rotate: '35deg' }],
      top: '-50%' },
    center: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 10 },
    iconRing: {
      width: 48,
      height: 48,
      borderRadius: Radius.xxl,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surfaceAlt,
      borderWidth: Stroke.standard,
      borderColor: colors.borderSubtle },
    labelWrap: {
      paddingHorizontal: 10,
      paddingVertical: Space.xs,
      borderRadius: Radius.sm,
      backgroundColor: colors.surfaceAlt },
    label: {
      fontFamily: Typography.family.medium,
      fontSize: TypographyV2.meta.size,
      color: colors.textMuted,
      letterSpacing: 0.3,
      textTransform: 'uppercase' } });
}