import React from 'react';
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  ViewStyle,
  StyleProp,
  Dimensions,
  type AccessibilityRole } from 'react-native';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  Easing as ReanimatedEasing,
  runOnJS } from 'react-native-reanimated';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { useMotionConfig } from '../../hooks/useMotionConfig';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import {
  Radius,
  Space,
  Elevation,
  ZIndex } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';

const ReanimatedView = Reanimated.View;

export type AppTooltipPlacement = 'top' | 'bottom' | 'left' | 'right';
export type AppTooltipTrigger = 'press' | 'longPress' | 'hover';

export interface AppTooltipProps {
  content: string;
  children: React.ReactNode;
  placement?: AppTooltipPlacement;
  trigger?: AppTooltipTrigger;
  /** Auto-dismiss duration in ms. 0 = manual dismiss only. */
  duration?: number;
  style?: StyleProp<ViewStyle>;
}

interface MeasuredRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

const ARROW_SIZE = 8;
const TOOLTIP_PADDING_H = Space.sm;
const TOOLTIP_PADDING_V = Space.xs;
const MAX_WIDTH = 240;
const SCREEN = Dimensions.get('window');

/**
 * AppTooltip — a positioned tooltip that appears relative to a wrapped
 * element. The anchor is measured via `measureInWindow` and the tooltip is
 * placed above, below, left, or right of it with an arrow pointing to the
 * target. Entrance is a fade + slight scale (Reanimated); dismissal happens
 * on outside tap or after an optional auto-dismiss duration.
 *
 * Accessible: the tooltip content exposes `accessibilityRole="tooltip"`.
 */
export function AppTooltip({
  content,
  children,
  placement = 'top',
  trigger = 'press',
  duration = 0,
  style }: AppTooltipProps) {
  const { colors, isDark } = useAppTheme();
  const { spring } = useMotionConfig();
  const reducedMotion = useReducedMotion();
  const anchorRef = React.useRef<View>(null);
  const [visible, setVisible] = React.useState(false);
  const [rect, setRect] = React.useState<MeasuredRect | null>(null);
  const [computedPlacement, setComputedPlacement] = React.useState<AppTooltipPlacement>(placement);
  const opacity = useSharedValue(0);
  const scale = useSharedValue(reducedMotion ? 1 : 0.9);
  const timeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const styles = React.useMemo(() => createStyles(colors, isDark), [colors, isDark]);

  const clearAutoDismiss = React.useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const dismiss = React.useCallback(() => {
    clearAutoDismiss();
    opacity.value = withTiming(0, { duration: 120, easing: ReanimatedEasing.in(ReanimatedEasing.cubic) });
    if (!reducedMotion) {
      scale.value = withTiming(0.9, { duration: 120, easing: ReanimatedEasing.in(ReanimatedEasing.cubic) });
    }
    runOnJS(setVisible)(false);
  }, [clearAutoDismiss, opacity, reducedMotion, scale]);

  const show = React.useCallback(() => {
    anchorRef.current?.measureInWindow((x, y, width, height) => {
      setRect({ x, y, width, height });
      let resolved = placement;
      if (placement === 'top' && y < 120) resolved = 'bottom';
      if (placement === 'bottom' && y + height > SCREEN.height - 120) resolved = 'top';
      setComputedPlacement(resolved);
      setVisible(true);
      clearAutoDismiss();
      if (duration > 0) {
        timeoutRef.current = setTimeout(dismiss, duration);
      }
    });
  }, [placement, duration, dismiss, clearAutoDismiss]);

  React.useEffect(() => {
    if (visible) {
      opacity.value = withTiming(1, { duration: 160, easing: ReanimatedEasing.out(ReanimatedEasing.cubic) });
      if (!reducedMotion) {
        scale.value = withSpring(1, spring.press);
      }
    }
  }, [visible, opacity, scale, reducedMotion, spring.press]);

  React.useEffect(() => {
    return () => clearAutoDismiss();
  }, [clearAutoDismiss]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }] }));

  const tooltipLayout = React.useMemo(
    () => (rect ? computeTooltipLayout(rect, computedPlacement) : null),
    [rect, computedPlacement],
  );

  const triggerProps = React.useMemo(() => {
    if (trigger === 'press') return { onPress: show };
    if (trigger === 'longPress') return { onLongPress: show, delayLongPress: 350 };
    return { onPressIn: show };
  }, [trigger, show]);

  return (
    <View style={[styles.host, style]}>
      <View ref={anchorRef} {...triggerProps} accessibilityLiveRegion="polite">
        {children}
      </View>

      {visible && tooltipLayout ? (
        <View style={styles.overlay} onStartShouldSetResponder={() => true} onResponderRelease={dismiss}>
          <ReanimatedView
            style={[
              styles.tooltip,
              animatedStyle,
              { position: 'absolute', left: tooltipLayout.left, top: tooltipLayout.top, maxWidth: MAX_WIDTH },
            ]}
            accessibilityRole={'tooltip' as AccessibilityRole}
            accessibilityLabel={content}
          >
            <Text style={styles.text}>{content}</Text>
            <View style={[styles.arrow, styles[`arrow_${computedPlacement}` as keyof typeof styles] as ViewStyle]} />
          </ReanimatedView>
        </View>
      ) : null}
    </View>
  );
}

interface TooltipLayout {
  left: number;
  top: number;
}

function computeTooltipLayout(rect: MeasuredRect, placement: AppTooltipPlacement): TooltipLayout {
  const centerX = rect.x + rect.width / 2;
  const centerY = rect.y + rect.height / 2;
  const estimatedWidth = Math.min(MAX_WIDTH, 200);
  const estimatedHeight = 36;

  switch (placement) {
    case 'top':
      return {
        left: clamp(centerX - estimatedWidth / 2, 8, SCREEN.width - estimatedWidth - 8),
        top: rect.y - estimatedHeight - ARROW_SIZE - Space.xxs };
    case 'bottom':
      return {
        left: clamp(centerX - estimatedWidth / 2, 8, SCREEN.width - estimatedWidth - 8),
        top: rect.y + rect.height + ARROW_SIZE + Space.xxs };
    case 'left':
      return {
        left: rect.x - estimatedWidth - ARROW_SIZE - Space.xxs,
        top: clamp(centerY - estimatedHeight / 2, 8, SCREEN.height - estimatedHeight - 8) };
    case 'right':
      return {
        left: rect.x + rect.width + ARROW_SIZE + Space.xxs,
        top: clamp(centerY - estimatedHeight / 2, 8, SCREEN.height - estimatedHeight - 8) };
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function createStyles(colors: ThemeColors, isDark: boolean) {
  const tooltipBg = isDark ? colors.surfaceElevated : colors.shadow;
  const arrowBase = {
    position: 'absolute' as const,
    width: 0,
    height: 0 };
  return StyleSheet.create({
    host: {
      alignSelf: 'flex-start' } as ViewStyle,
    overlay: {
      ...StyleSheet.absoluteFill,
      zIndex: ZIndex.dropdown } as ViewStyle,
    tooltip: {
      backgroundColor: tooltipBg,
      paddingHorizontal: TOOLTIP_PADDING_H,
      paddingVertical: TOOLTIP_PADDING_V,
      borderRadius: Radius.sm,
      ...Elevation.floating } as ViewStyle,
    text: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      color: colors.scrimTextPrimary,
      letterSpacing: TypographyV2.meta.letterSpacing,
      lineHeight: TypographyV2.meta.lineHeight } as ViewStyle,
    arrow: arrowBase as ViewStyle,
    arrow_top: {
      bottom: -ARROW_SIZE,
      left: '50%',
      marginLeft: -ARROW_SIZE,
      borderLeftWidth: ARROW_SIZE,
      borderRightWidth: ARROW_SIZE,
      borderTopWidth: ARROW_SIZE,
      borderLeftColor: 'transparent',
      borderRightColor: 'transparent',
      borderTopColor: tooltipBg } as ViewStyle,
    arrow_bottom: {
      top: -ARROW_SIZE,
      left: '50%',
      marginLeft: -ARROW_SIZE,
      borderLeftWidth: ARROW_SIZE,
      borderRightWidth: ARROW_SIZE,
      borderBottomWidth: ARROW_SIZE,
      borderLeftColor: 'transparent',
      borderRightColor: 'transparent',
      borderBottomColor: tooltipBg } as ViewStyle,
    arrow_left: {
      right: -ARROW_SIZE,
      top: '50%',
      marginTop: -ARROW_SIZE,
      borderTopWidth: ARROW_SIZE,
      borderBottomWidth: ARROW_SIZE,
      borderLeftWidth: ARROW_SIZE,
      borderTopColor: 'transparent',
      borderBottomColor: 'transparent',
      borderLeftColor: tooltipBg } as ViewStyle,
    arrow_right: {
      left: -ARROW_SIZE,
      top: '50%',
      marginTop: -ARROW_SIZE,
      borderTopWidth: ARROW_SIZE,
      borderBottomWidth: ARROW_SIZE,
      borderRightWidth: ARROW_SIZE,
      borderTopColor: 'transparent',
      borderBottomColor: 'transparent',
      borderRightColor: tooltipBg } as ViewStyle });
}
