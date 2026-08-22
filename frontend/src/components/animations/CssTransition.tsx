/**
 * CssTransition — Reanimated 4 CSS Transition wrapper for simple state animations.
 *
 * Reanimated 4's CSS Transition API lets the native UI thread interpolate
 * style changes without a JS-thread worklet loop. For simple state-driven
 * animations (opacity toggles, background-color swaps, transform changes)
 * this is more efficient than `useAnimatedStyle` + `withTiming` because:
 *
 *  - No JS-thread round-trips — the transition runs entirely on the UI thread.
 *  - No shared values or worklets to manage — just change the style prop.
 *  - The native transition engine handles interruption and easing natively.
 *
 * Usage:
 * ```tsx
 * <CssTransition
 *   style={styles.base}
 *   animatedStyle={{
 *     opacity: isVisible ? 1 : 0,
 *     transitionProperty: ['opacity'],
 *     transitionDuration: '200ms',
 *     transitionTimingFunction: 'ease-out',
 *   }}
 * >
 *   {children}
 * </CssTransition>
 * ```
 *
 * This component does NOT replace existing worklet animations — it is a
 * utility for new simple state animations where a full worklet pipeline is
 * unnecessary overhead.
 */
import React, { useMemo } from 'react';
import { View, type ViewStyle } from 'react-native';
import {
  createCSSAnimatedComponent,
  type CSSStyle,
} from 'react-native-reanimated';

const CSSAnimatedView = createCSSAnimatedComponent(View);

export interface CssTransitionProps {
  /** Static base style — never animated, applied as-is on every render. */
  style?: ViewStyle;
  /**
   * Style object containing the animated properties AND the transition
   * configuration (`transitionProperty`, `transitionDuration`,
   * `transitionTimingFunction`, `transitionDelay`).
   *
   * When a property listed in `transitionProperty` changes between
   * renders, the native UI thread interpolates the change automatically.
   */
  animatedStyle: CSSStyle<ViewStyle>;
  /** Children rendered inside the transitioned view. */
  children?: React.ReactNode;
}

/**
 * Wrap children in a CSS-animated View that transitions style changes
 * on the native UI thread without a JS worklet loop.
 *
 * @see https://docs.swmansion.com/react-native-reanimated/docs/css-transitions
 */
export function CssTransition({
  style,
  animatedStyle,
  children,
}: CssTransitionProps): React.ReactElement {
  const mergedStyle = useMemo(
    () => [style, animatedStyle] as ViewStyle[],
    [style, animatedStyle],
  );

  return <CSSAnimatedView style={mergedStyle}>{children}</CSSAnimatedView>;
}
