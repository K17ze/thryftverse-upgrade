import React from 'react';
import {
  Pressable,
  StyleSheet,
  View,
  ViewStyle,
  StyleProp,
  useWindowDimensions,
  type AccessibilityRole,
} from 'react-native';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  Easing as ReanimatedEasing,
  runOnJS,
} from 'react-native-reanimated';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { useMotionConfig } from '../../hooks/useMotionConfig';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import {
  Radius,
  Space,
  Elevation,
  ZIndex,
} from '../../theme/designTokens';

const ReanimatedView = Reanimated.View;

export type AppPopoverPlacement = 'top' | 'bottom' | 'left' | 'right' | 'auto';
export type AppPopoverTrigger = 'press' | 'longPress';

export interface AppPopoverProps {
  content: React.ReactNode;
  children: React.ReactNode;
  placement?: AppPopoverPlacement;
  trigger?: AppPopoverTrigger;
  maxWidth?: number;
  onClose?: () => void;
  style?: StyleProp<ViewStyle>;
}

interface MeasuredRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

const ARROW_SIZE = 8;

/**
 * AppPopover — a positioned popover with arbitrary content. The anchor is
 * measured via `measureInWindow` and the popover is placed above, below,
 * left, or right of it. When `placement='auto'` the popover flips below if
 * there is not enough space above, and vice-versa.
 *
 * Entrance is a fade + spring scale (Reanimated). A transparent backdrop
 * dismisses the popover on tap. The content exposes
 * `accessibilityRole="popover"`.
 */
export function AppPopover({
  content,
  children,
  placement = 'auto',
  trigger = 'press',
  maxWidth = 280,
  onClose,
  style,
}: AppPopoverProps) {
  const { colors } = useAppTheme();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const { spring } = useMotionConfig();
  const reducedMotion = useReducedMotion();
  const anchorRef = React.useRef<View>(null);
  const [visible, setVisible] = React.useState(false);
  const [rect, setRect] = React.useState<MeasuredRect | null>(null);
  const [computedPlacement, setComputedPlacement] = React.useState<Exclude<AppPopoverPlacement, 'auto'>>('bottom');
  const opacity = useSharedValue(0);
  const scale = useSharedValue(reducedMotion ? 1 : 0.92);

  const styles = React.useMemo(() => createStyles(colors), [colors]);

  const dismiss = React.useCallback(() => {
    opacity.value = withTiming(0, { duration: 140, easing: ReanimatedEasing.in(Easing.cubic) });
    if (!reducedMotion) {
      scale.value = withTiming(0.92, { duration: 140, easing: ReanimatedEasing.in(Easing.cubic) });
    }
    runOnJS(setVisible)(false);
    onClose?.();
  }, [opacity, reducedMotion, scale, onClose]);

  const show = React.useCallback(() => {
    anchorRef.current?.measureInWindow((x, y, width, height) => {
      setRect({ x, y, width, height });
      const resolved = resolvePlacement(placement, y, height, screenHeight);
      setComputedPlacement(resolved);
      setVisible(true);
    });
  }, [placement, screenHeight]);

  React.useEffect(() => {
    if (visible) {
      opacity.value = withTiming(1, { duration: 180, easing: ReanimatedEasing.out(Easing.cubic) });
      if (!reducedMotion) {
        scale.value = withSpring(1, spring.lift);
      }
    }
  }, [visible, opacity, scale, reducedMotion, spring.lift]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));

  const popoverLayout = React.useMemo(
    () => (rect ? computePopoverLayout(rect, computedPlacement, maxWidth, screenWidth, screenHeight) : null),
    [rect, computedPlacement, maxWidth, screenWidth, screenHeight],
  );

  const triggerProps = React.useMemo(() => {
    if (trigger === 'press') return { onPress: show };
    return { onLongPress: show, delayLongPress: 350 };
  }, [trigger, show]);

  return (
    <View style={[styles.host, style]}>
      <View ref={anchorRef} {...triggerProps}>
        {children}
      </View>

      {visible && popoverLayout ? (
        <View style={styles.overlay} onStartShouldSetResponder={() => true} onResponderRelease={dismiss}>
          <ReanimatedView
            style={[
              styles.popover,
              animatedStyle,
              {
                position: 'absolute',
                left: popoverLayout.left,
                top: popoverLayout.top,
                maxWidth,
              },
            ]}
            accessibilityRole={'popover' as AccessibilityRole}
          >
            {content}
          </ReanimatedView>
        </View>
      ) : null}
    </View>
  );
}

function resolvePlacement(
  placement: AppPopoverPlacement,
  y: number,
  height: number,
  screenHeight: number,
): Exclude<AppPopoverPlacement, 'auto'> {
  if (placement !== 'auto') return placement;
  const spaceAbove = y;
  const spaceBelow = screenHeight - (y + height);
  return spaceAbove > spaceBelow ? 'top' : 'bottom';
}

interface PopoverLayout {
  left: number;
  top: number;
}

function computePopoverLayout(
  rect: MeasuredRect,
  placement: Exclude<AppPopoverPlacement, 'auto'>,
  maxWidth: number,
  screenWidth: number,
  screenHeight: number,
): PopoverLayout {
  const centerX = rect.x + rect.width / 2;
  const centerY = rect.y + rect.height / 2;
  const estimatedWidth = Math.min(maxWidth, 240);
  const estimatedHeight = 120;

  switch (placement) {
    case 'top':
      return {
        left: clamp(centerX - estimatedWidth / 2, 8, screenWidth - estimatedWidth - 8),
        top: rect.y - estimatedHeight - ARROW_SIZE - Space.xxs,
      };
    case 'bottom':
      return {
        left: clamp(centerX - estimatedWidth / 2, 8, screenWidth - estimatedWidth - 8),
        top: rect.y + rect.height + ARROW_SIZE + Space.xxs,
      };
    case 'left':
      return {
        left: rect.x - estimatedWidth - ARROW_SIZE - Space.xxs,
        top: clamp(centerY - estimatedHeight / 2, 8, screenHeight - estimatedHeight - 8),
      };
    case 'right':
      return {
        left: rect.x + rect.width + ARROW_SIZE + Space.xxs,
        top: clamp(centerY - estimatedHeight / 2, 8, screenHeight - estimatedHeight - 8),
      };
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

const Easing = ReanimatedEasing;

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    host: {
      alignSelf: 'flex-start',
    } as ViewStyle,
    overlay: {
      ...StyleSheet.absoluteFill,
      zIndex: ZIndex.dropdown,
    } as ViewStyle,
    popover: {
      backgroundColor: colors.surfaceElevated,
      borderRadius: Radius.lg,
      padding: Space.sm,
      ...Elevation.modal,
    } as ViewStyle,
  });
}
