import React, { useRef, useCallback } from 'react';
import { View, Text, StyleSheet, Pressable, LayoutChangeEvent } from 'react-native';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { Typography, Space, Type, Radius, Stroke } from '../../theme/designTokens';
import { useReducedMotion } from '../../hooks/useReducedMotion';

interface TabItem {
  key: string;
  label: string;
  count?: number;
}

interface MyProfileTabRailProps {
  tabs: TabItem[];
  activeKey: string;
  onChange: (key: string) => void;
}

const TIMING_CONFIG = { duration: 220, easing: Easing.out(Easing.cubic) };

/**
 * Self-profile tab rail with one shared animated underline.
 * Mirrors the ProfileTabRail pattern used on the public profile.
 * Normal motion: timing animation (220ms cubic-out).
 * Reduced motion: instant assignment — no animation.
 */
export function MyProfileTabRail({ tabs, activeKey, onChange }: MyProfileTabRailProps) {
  const { colors } = useAppTheme();
  const reducedMotionHook = useReducedMotion();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const tabWidths = useRef<Record<string, number>>({});
  const tabOffsets = useRef<Record<string, number>>({});
  const underlineTranslateX = useSharedValue(0);
  const underlineWidth = useSharedValue(0);

  const measureTabs = useCallback(() => {
    let offsetX = 0;
    for (const tab of tabs) {
      tabOffsets.current[tab.key] = offsetX;
      offsetX += tabWidths.current[tab.key] ?? 0;
    }
  }, [tabs]);

  const positionUnderline = useCallback((key: string) => {
    measureTabs();
    const tabW = tabWidths.current[key] ?? 0;
    const offsetX = tabOffsets.current[key] ?? 0;
    const underlineW = tabW * 0.4;
    const targetX = offsetX + (tabW - underlineW) / 2;
    if (reducedMotionHook) {
      underlineTranslateX.value = targetX;
      underlineWidth.value = underlineW;
    } else {
      underlineTranslateX.value = withTiming(targetX, TIMING_CONFIG);
      underlineWidth.value = withTiming(underlineW, TIMING_CONFIG);
    }
  }, [measureTabs, reducedMotionHook, underlineTranslateX, underlineWidth]);

  const onTabLayout = useCallback((key: string) => (e: LayoutChangeEvent) => {
    tabWidths.current[key] = e.nativeEvent.layout.width;
    if (key === activeKey) {
      positionUnderline(key);
    }
  }, [activeKey, positionUnderline]);

  const handlePress = useCallback((key: string) => {
    positionUnderline(key);
    onChange(key);
  }, [positionUnderline, onChange]);

  React.useEffect(() => {
    positionUnderline(activeKey);
  }, [activeKey, positionUnderline]);

  const underlineStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: underlineTranslateX.value }],
    width: underlineWidth.value,
  }));

  return (
    <View style={styles.container}>
      {tabs.map((tab) => {
        const isActive = tab.key === activeKey;
        return (
          <Pressable
            key={tab.key}
            style={({ pressed }) => [styles.tab, pressed && { opacity: 0.6 }]}
            onLayout={onTabLayout(tab.key)}
            onPress={() => handlePress(tab.key)}
            accessibilityRole="tab"
            accessibilityState={{ selected: isActive }}
            accessibilityLabel={`${tab.label} tab${tab.count !== undefined ? `, ${tab.count} items` : ''}`}
          >
            <View style={styles.tabContent}>
              <Text
                style={[styles.label, isActive && styles.labelActive]}
                numberOfLines={1}
              >
                {tab.label}
              </Text>
              {tab.count !== undefined ? (
                <Text
                  style={[styles.count, isActive && styles.countActive]}
                >
                  {tab.count}
                </Text>
              ) : null}
            </View>
          </Pressable>
        );
      })}
      {/* One shared animated underline — no remounting per tab */}
      <Reanimated.View style={[styles.underline, underlineStyle]} />
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: {
      flexDirection: 'row',
      backgroundColor: colors.background,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
      position: 'relative',
    },
    tab: {
      flex: 1,
      height: 44,
      alignItems: 'center',
      justifyContent: 'center',
    },
    tabContent: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs + 1,
    },
    label: {
      fontSize: Type.body.size,
      fontFamily: Typography.family.medium,
      color: colors.textSecondary,
      letterSpacing: Type.body.letterSpacing,
    },
    labelActive: {
      fontFamily: Typography.family.bold,
      color: colors.textPrimary,
    },
    count: {
      fontSize: Type.caption.size,
      fontFamily: Typography.family.regular,
      color: colors.textMuted,
      minWidth: 14,
    },
    countActive: {
      color: colors.textSecondary,
    },
    underline: {
      position: 'absolute',
      bottom: 0,
      height: Stroke.emphasis,
      backgroundColor: colors.brand,
      borderRadius: Radius.sm,
    },
  });
}
