import React from 'react';
import { View, Text, StyleSheet, Pressable, LayoutChangeEvent } from 'react-native';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  useDerivedValue,
  interpolateColor,
} from 'react-native-reanimated';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { Space, TypeStyles, Radius } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { useMotionConfig } from '../../hooks/useMotionConfig';
import { Motion } from '../../theme/motionTokens';

/**
 * The two inbox segments. Primary holds active conversations; Requests
 * holds pending message requests from new buyers/sellers.
 */
export type MessagingSegment = 'primary' | 'requests';

export interface MessagingSegmentRailProps {
  active: MessagingSegment;
  onChange: (segment: MessagingSegment) => void;
  /** Unread count for the Primary segment. */
  primaryCount?: number;
  /** Pending request count for the Requests segment. */
  requestCount?: number;
}

/**
 * MessagingSegmentRail — a compact two-segment control (Primary / Requests)
 * with an animated sliding indicator.
 *
 * Motion grammar: the indicator uses the `indicator` spring (controlled,
 * no overshoot) and collapses to instant under reduced motion (instant
 * family). The indicator slides between segments; labels crossfade weight
 * rather than colour to keep the silhouette calm.
 */
export function MessagingSegmentRail({
  active,
  onChange,
  primaryCount = 0,
  requestCount = 0,
}: MessagingSegmentRailProps) {
  const { colors } = useAppTheme();
  const { isEnabled, spring } = useMotionConfig();
  const styles = React.useMemo(() => createStyles(colors), [colors]);

  // Measure each segment's label width so the indicator can slide to the
  // active segment. We measure on layout, not on every render.
  const primaryWidth = useSharedValue(0);
  const requestsWidth = useSharedValue(0);
  const [ready, setReady] = React.useState(false);

  const onPrimaryLayout = React.useCallback((e: LayoutChangeEvent) => {
    primaryWidth.value = e.nativeEvent.layout.width;
  }, [primaryWidth]);

  const onRequestsLayout = React.useCallback((e: LayoutChangeEvent) => {
    requestsWidth.value = e.nativeEvent.layout.width;
    setReady(true);
  }, [requestsWidth]);

  // The indicator's horizontal offset is derived from the active segment.
  // Primary → 0; Requests → primaryWidth + gap.
  const gap = Space.smMd;
  const translateX = useDerivedValue(() => {
    if (active === 'primary') return 0;
    return primaryWidth.value + gap;
  });

  const indicatorStyle = useAnimatedStyle(() => {
    if (!isEnabled) {
      return { transform: [{ translateX: translateX.value }], opacity: ready ? 1 : 0 };
    }
    return {
      transform: [
        {
          translateX: withSpring(translateX.value, {
            damping: spring.indicator.damping,
            stiffness: spring.indicator.stiffness,
            mass: spring.indicator.mass,
          }),
        },
      ],
      opacity: withTiming(ready ? 1 : 0, { duration: Motion.duration.fast }),
    };
  });

  // Indicator width tracks the active segment's label width.
  const indicatorWidth = useDerivedValue(() => {
    return active === 'primary' ? primaryWidth.value : requestsWidth.value;
  });

  const indicatorSizing = useAnimatedStyle(() => ({
    width: isEnabled
      ? withSpring(indicatorWidth.value, {
          damping: spring.indicator.damping,
          stiffness: spring.indicator.stiffness,
          mass: spring.indicator.mass,
        })
      : indicatorWidth.value,
  }));

  const segments: { key: MessagingSegment; label: string; badge?: number }[] = [
    { key: 'primary', label: 'Primary', badge: primaryCount > 0 ? primaryCount : undefined },
    { key: 'requests', label: 'Requests', badge: requestCount > 0 ? requestCount : undefined },
  ];

  return (
    <View style={styles.root}>
      <View style={styles.track}>
        <Reanimated.View style={[styles.indicator, indicatorStyle, indicatorSizing]} />
        {segments.map((seg) => {
          const isActive = seg.key === active;
          return (
            <Pressable
              key={seg.key}
              onPress={() => onChange(seg.key)}
              accessibilityRole="tab"
              accessibilityState={{ selected: isActive }}
              accessibilityLabel={`${seg.label} tab${seg.badge ? `, ${seg.badge} new` : ''}`}
              style={({ pressed }) => [styles.tab, pressed && styles.tabPressed]}
            >
              <SegmentLabel
                label={seg.label}
                isActive={isActive}
                onLayout={seg.key === 'primary' ? onPrimaryLayout : onRequestsLayout}
              />
              {seg.badge ? (
                <View style={[styles.badge, isActive && styles.badgeActive]}>
                  <Text style={[styles.badgeText, isActive && styles.badgeTextActive]}>
                    {seg.badge > 99 ? '99+' : seg.badge}
                  </Text>
                </View>
              ) : null}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

// Label extracted so its layout width can be measured independently of the
// badge. The animated colour swap uses the instant family (timing fast) so
// the weight shift reads as a snap, not a fade.
const SegmentLabel = React.memo(function SegmentLabel({
  label,
  isActive,
  onLayout,
}: {
  label: string;
  isActive: boolean;
  onLayout: (e: LayoutChangeEvent) => void;
}) {
  const { colors } = useAppTheme();
  const { isEnabled } = useMotionConfig();
  const styles = React.useMemo(() => createStyles(colors), [colors]);

  const colorAnim = useSharedValue(isActive ? 1 : 0);
  React.useEffect(() => {
    colorAnim.value = isEnabled
      ? withTiming(isActive ? 1 : 0, { duration: Motion.duration.fast })
      : isActive ? 1 : 0;
  }, [isActive, isEnabled, colorAnim]);

  const labelStyle = useAnimatedStyle(() => ({
    color: interpolateColor(colorAnim.value, [0, 1], [colors.textMuted, colors.textPrimary]),
    fontFamily: isActive ? TypeStyles.bodyEmphasis.fontFamily : TypeStyles.body.fontFamily,
  }));

  return (
    <Reanimated.Text
      onLayout={onLayout}
      style={[styles.label, labelStyle]}
      numberOfLines={1}
    >
      {label}
    </Reanimated.Text>
  );
});

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  root: {
    paddingHorizontal: Space.md,
    paddingVertical: Space.xs + 2,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  track: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.smMd,
    position: 'relative',
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs + 1,
    paddingVertical: Space.sm,
    paddingHorizontal: Space.xs,
    minHeight: 36,
  },
  tabPressed: {
    opacity: 0.6,
  },
  label: {
    fontSize: TypographyV2.bodyStrong.size,
    letterSpacing: TypographyV2.bodyStrong.letterSpacing,
  },
  indicator: {
    position: 'absolute',
    bottom: -Space.xs - 2,
    left: Space.xs,
    height: 2.5,
    borderRadius: Radius.full,
    backgroundColor: colors.textPrimary,
  },
  badge: {
    minWidth: 18,
    height: 18,
    borderRadius: Radius.full,
    backgroundColor: colors.brandSubtle,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Space.xs + 1,
  },
  badgeActive: {
    backgroundColor: colors.brand,
  },
  badgeText: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypeStyles.bodyEmphasis.fontFamily,
    color: colors.brand,
  },
  badgeTextActive: {
    color: colors.textInverse,
  },
});
