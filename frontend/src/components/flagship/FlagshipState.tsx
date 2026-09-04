import React from 'react';
import { View, Text, StyleSheet, StyleProp, ViewStyle, DimensionValue } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  Easing,
  cancelAnimation,
  FadeIn } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { useAppTheme } from '../../theme/ThemeContext';
import { AnimatedPressable } from '../AnimatedPressable';
import { useHaptic } from '../../hooks/useHaptic';
import { useReducedMotion } from '../../hooks/useReducedMotion';

import { Space, Radius, IconGrammar, Stroke} from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { Motion } from '../../theme/motionTokens';
import {
  StateVariant,
  Domain,
  IconConcept,
  StateCopyContext,
  getStateCopy,
  resolveStateCopy,
} from './stateCopyRegistry';

/**
 * Map semantic icon concepts (from the state copy registry) to concrete
 * Ionicons outline glyphs. Keeps one icon family / optical band per surface
 * (AGENTS §4 icon grammar). Concepts decouple copy from glyph names so the
 * registry never imports vector-icon internals.
 */
const ICON_CONCEPT_GLYPHS: Record<IconConcept, React.ComponentProps<typeof Ionicons>['name']> = {
  search: 'search-outline',
  camera: 'camera-outline',
  chat: 'chatbubble-outline',
  bookmark: 'bookmark-outline',
  archive: 'archive-outline',
  store: 'storefront-outline',
  chart: 'bar-chart-outline',
  bag: 'bag-outline',
  tag: 'pricetag-outline',
  star: 'star-outline',
  bell: 'notifications-outline',
  wifi: 'wifi-outline',
  lock: 'lock-closed-outline',
  clock: 'time-outline',
  image: 'image-outline',
  sync: 'sync-outline',
  alert: 'alert-circle-outline',
  refresh: 'refresh-outline',
  back: 'chevron-back-outline',
};

export interface FlagshipStateProps {
  variant: StateVariant;
  /**
   * Context for contextual copy resolution. When provided, the component
   * resolves screen-specific first-use / cleared / error-adjacent copy from
   * the registry (preserving working context such as the active query or
   * missing permission). Explicit title/subtitle/actionLabel props still win.
   */
  context?: StateCopyContext;
  /** Legacy domain key. Used when `context` is not supplied. */
  domain?: Domain;
  /** @deprecated use `context` + registry `headline`. */
  title?: string;
  /** @deprecated use `context` + registry `body`. */
  subtitle?: string;
  actionLabel?: string;
  onAction?: () => void;
  icon?: React.ComponentProps<typeof Ionicons>['name'];
  /** Icon concept for the state glyph / primary action. */
  actionIcon?: IconConcept;
  /** Optional secondary action (e.g. "Go back") shown below the primary. */
  secondaryActionLabel?: string;
  /** @deprecated alias for `secondaryActionLabel`. */
  secondaryAction?: string;
  onSecondaryAction?: () => void;
  /**
   * Optional skeleton layout to render in place of the generic loading
   * shimmer when `variant === 'loading'`. Pass one of the composed skeleton
   * layouts (e.g. `<FeedSkeleton />`, `<ProductDetailSkeleton />`) so the
   * loading state matches the final screen geometry exactly — no layout
   * shift when data resolves. Per AGENTS §27.4 and 2026 skeleton research:
   * skeletons work best for predictable layouts (feeds, lists, profiles).
   */
  skeleton?: React.ReactNode;
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

const DEFAULT_TITLES: Record<StateVariant, string> = {
  loading: 'Loading',
  empty: 'Nothing here yet',
  error: 'Something went wrong',
  offline: 'You are offline',
  unavailable: 'Not available',
  partial: 'Some items did not load',
  conflict: 'This changed' };

const DEFAULT_SUBTITLES: Record<StateVariant, string> = {
  loading: 'One moment while we get this ready.',
  empty: 'When content appears, you\'ll see it here.',
  error: 'We could not load this. Tap below to try again.',
  offline: 'Check your connection and try again.',
  unavailable: 'This feature is not available right now.',
  partial: 'You can still browse what loaded.',
  conflict: 'Someone else updated this. Refresh to see the latest.' };

const DEFAULT_ICONS: Record<StateVariant, React.ComponentProps<typeof Ionicons>['name']> = {
  loading: 'sync-outline',
  empty: 'image-outline',
  error: 'alert-circle-outline',
  offline: 'cloud-offline-outline',
  unavailable: 'lock-closed-outline',
  partial: 'alert-outline',
  conflict: 'refresh-outline' };

const AnimatedLinearGradient = Reanimated.createAnimatedComponent(LinearGradient);

/**
 * FlagshipState — the canonical loading / empty / error / offline / unavailable
 * / partial / conflict surface for ThryftVerse.
 *
 * Design principles (AGENTS §14, §27.4):
 *   - loading uses a skeleton-style shimmer, not a generic centred spinner;
 *   - empty/error/offline get a restrained icon circle, clear title, helpful
 *     subtitle, and a recovery action with the correct haptic level;
 *   - partial shows what loaded and offers retry for the rest;
 *   - conflict signals server-side change and offers refresh;
 *   - error/offline/partial/conflict retry fires a medium haptic (action commit);
 *   - reduced motion collapses the shimmer to a static placeholder.
 *
 * Copy resolution: when `context` is provided, screen-specific first-use /
 * cleared / error-adjacent copy is pulled from the state copy registry
 * (preserving working context such as the active query or a missing
 * permission). When only `domain` is provided, legacy domain copy is used.
 * Explicit title/subtitle/actionLabel props always win. See
 * stateCopyRegistry.ts and TERMINOLOGY.md.
 */
export function FlagshipState({
  variant,
  context,
  domain,
  title,
  subtitle,
  actionLabel,
  onAction,
  icon,
  actionIcon,
  secondaryActionLabel,
  secondaryAction,
  onSecondaryAction,
  skeleton,
  children,
  style }: FlagshipStateProps) {
  const { colors } = useAppTheme();
  const haptic = useHaptic();
  const reducedMotionEnabled = useReducedMotion();

  // ── Copy resolution ─────────────────────────────────────────────────────
  // Priority: explicit props > context-aware registry copy > legacy domain
  // copy > legacy defaults. Context (screen + empty/error reason) selects the
  // refined, anti-generic messages; domain is the legacy fallback.
  const contextCopy = context ? resolveStateCopy(variant, context) : undefined;
  const domainCopy = !context && domain ? getStateCopy(domain, variant) : undefined;
  const registryCopy = contextCopy ?? domainCopy;
  const resolvedHeadline = title ?? registryCopy?.headline ?? registryCopy?.title ?? DEFAULT_TITLES[variant];
  const resolvedBody = subtitle ?? registryCopy?.body ?? registryCopy?.subtitle ?? DEFAULT_SUBTITLES[variant];
  const resolvedActionLabel = actionLabel ?? registryCopy?.actionLabel;
  const resolvedSecondaryActionLabel =
    secondaryActionLabel ?? secondaryAction ?? registryCopy?.secondaryAction ?? registryCopy?.secondaryActionLabel;
  // State glyph: explicit `icon` > concept from `actionIcon` prop > concept
  // from registry copy > variant default.
  const resolvedConcept = actionIcon ?? registryCopy?.actionIcon;
  const resolvedIconName = icon ?? (resolvedConcept ? ICON_CONCEPT_GLYPHS[resolvedConcept] : undefined);

  // ── Loading: skeleton layout or skeleton shimmer ────────────────────────
  // When a `skeleton` prop is provided, render it in place of the generic
  // shimmer so the loading state matches the final screen geometry exactly
  // (no layout shift when data resolves). Per AGENTS §27.4 and 2026 skeleton
  // research: skeletons work best for predictable layouts (feeds, lists,
  // profiles). The generic shimmer remains the fallback for unpredictable
  // or short-load surfaces.
  if (variant === 'loading') {
    if (skeleton) {
      return (
        <View style={[styles.skeletonWrap, style]} accessibilityLiveRegion="polite">
          {skeleton}
        </View>
      );
    }
    return (
      <View style={[styles.center, style]} accessibilityLiveRegion="polite">
        <LoadingShimmer colors={colors} reduced={reducedMotionEnabled} />
        <Text style={[styles.loadingText, { color: colors.textMuted }]}>
          {resolvedHeadline}
        </Text>
        {resolvedBody ? (
          <Text style={[styles.loadingSub, { color: colors.textMuted }]}>
            {resolvedBody}
          </Text>
        ) : null}
      </View>
    );
  }

  const effectiveIcon = resolvedIconName ?? DEFAULT_ICONS[variant];
  const isErrorish = variant === 'error' || variant === 'offline' || variant === 'partial' || variant === 'conflict';

  const handleAction = () => {
    // Recovery actions commit a real retry — medium haptic per AGENTS §13.
    if (isErrorish) {
      haptic.medium();
    } else {
      haptic.light();
    }
    onAction?.();
  };

  const handleSecondary = () => {
    haptic.light();
    onSecondaryAction?.();
  };

  const enter = reducedMotionEnabled ? undefined : FadeIn.duration(Motion.transitions.listItem.duration);

  return (
    <Reanimated.View
      entering={enter}
      style={[styles.center, style]}
      accessibilityLiveRegion={isErrorish ? 'assertive' : 'polite'}
    >
      <Reanimated.View
        entering={enter}
        style={styles.iconSlot}
      >
        <Ionicons
          name={effectiveIcon}
          size={IconGrammar.hero}
          color={isErrorish ? colors.danger : colors.textMuted}
        />
      </Reanimated.View>
      <Reanimated.Text
        entering={enter}
        style={[styles.title, { color: colors.textPrimary }]}
        accessibilityRole="header"
      >
        {resolvedHeadline}
      </Reanimated.Text>
      {resolvedBody ? (
        <Reanimated.Text
          entering={enter}
          style={[styles.subtitle, { color: colors.textSecondary }]}
        >
          {resolvedBody}
        </Reanimated.Text>
      ) : null}
      {resolvedActionLabel && onAction && (
        <Reanimated.View entering={enter}>
          <AnimatedPressable
            onPress={handleAction}
            scaleValue={0.97}
            hapticFeedback="none"
            accessibilityRole="button"
            accessibilityLabel={resolvedActionLabel}
            accessibilityHint={isErrorish ? 'Tries loading this again' : undefined}
            style={[styles.actionBtn, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}
          >
            <Text style={[styles.actionText, { color: colors.textPrimary }]}>{resolvedActionLabel}</Text>
          </AnimatedPressable>
        </Reanimated.View>
      )}
      {resolvedSecondaryActionLabel && onSecondaryAction && (
        <Reanimated.View entering={enter}>
          <AnimatedPressable
            onPress={handleSecondary}
            scaleValue={0.98}
            hapticFeedback="none"
            accessibilityRole="button"
            accessibilityLabel={resolvedSecondaryActionLabel}
            style={styles.secondaryBtn}
          >
            <Text style={[styles.secondaryText, { color: colors.textSecondary }]}>
              {resolvedSecondaryActionLabel}
            </Text>
          </AnimatedPressable>
        </Reanimated.View>
      )}
      {children}
    </Reanimated.View>
  );
}

// ── Loading shimmer ──────────────────────────────────────────────────────────
// A compact skeleton-style indicator: three stacked shimmering bars that
// resemble a loading content block. Replaces the generic ActivityIndicator
// per AGENTS §14 ("Do not use a generic centred spinner for every state")
// and §27.4 (flagship loading = skeleton matching final silhouette + shimmer).
//
// ShimmerBar is extracted as a memoized component so the inline style objects
// that the old `bar()` closure created on every render are eliminated
// (research doc §5: "561 inline style objects … each is a potential re-render
// trigger on a memoized child").
const ShimmerBar = React.memo(function ShimmerBar({
  width,
  height,
  borderRadius,
  marginTop,
  surfaceColor,
  reduced,
  shimmerStyle }: {
  width: DimensionValue;
  height: number;
  borderRadius: number;
  marginTop: number;
  surfaceColor: string;
  reduced: boolean;
  shimmerStyle: ReturnType<typeof useAnimatedStyle>;
}) {
  return (
    <View
      style={[
        shimmerBarStyles.base,
        {
          width,
          height,
          borderRadius,
          backgroundColor: surfaceColor,
          marginTop },
      ]}
    >
      {reduced ? null : (
        <Reanimated.View style={[StyleSheet.absoluteFill, shimmerStyle]}>
          <AnimatedLinearGradient
            colors={['transparent', 'rgba(255,255,255,0.06)', 'transparent']}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={[StyleSheet.absoluteFill, shimmerBarStyles.gradient]}
          />
        </Reanimated.View>
      )}
    </View>
  );
});

function LoadingShimmer({
  colors,
  reduced }: {
  colors: ReturnType<typeof useAppTheme>['colors'];
  reduced: boolean;
}) {
  const shimmerX = useSharedValue(-1);

  React.useEffect(() => {
    if (reduced) {
      cancelAnimation(shimmerX);
      shimmerX.value = -1;
      return;
    }
    shimmerX.value = withRepeat(
      withSequence(
        withTiming(1, { duration: Motion.transitions.shimmer.duration, easing: Easing.inOut(Easing.ease) }),
        withTiming(-1, { duration: 0 })
      ),
      -1,
      false
    );
  }, [reduced, shimmerX]);

  const shimmerStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: shimmerX.value * 120 }] }));

  return (
    <View style={styles.shimmerBlock}>
      <View style={[styles.shimmerGlyph, { backgroundColor: colors.surfaceAlt }]}>
        <Ionicons name="image-outline" size={22} color={colors.textMuted} />
      </View>
      <ShimmerBar
        width="55%"
        height={12}
        borderRadius={Radius.sm}
        marginTop={12}
        surfaceColor={colors.surfaceAlt}
        reduced={reduced}
        shimmerStyle={shimmerStyle}
      />
      <ShimmerBar
        width="80%"
        height={10}
        borderRadius={Radius.sm}
        marginTop={8}
        surfaceColor={colors.surfaceAlt}
        reduced={reduced}
        shimmerStyle={shimmerStyle}
      />
    </View>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  center: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Space.xl,
    paddingHorizontal: Space.md },
  /** Skeleton wrapper — fills the available space so the skeleton layout
   *  controls its own geometry (matching the final screen). No centring;
   *  the skeleton is the content, not a placeholder indicator. */
  skeletonWrap: {
    flex: 1 },
  loadingText: {
    marginTop: Space.md,
    fontSize: TypographyV2.sectionTitle.size,
    fontFamily: TypographyV2.sectionTitle.fontFamily,
    letterSpacing: TypographyV2.sectionTitle.letterSpacing },
  loadingSub: {
    marginTop: Space.xs,
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily,
    letterSpacing: TypographyV2.body.letterSpacing,
    textAlign: 'center' },
  shimmerBlock: {
    alignItems: 'center',
    width: 180 },
  shimmerGlyph: {
    width: 56,
    height: 56,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center' },
  iconSlot: {
    alignItems: 'center',
    marginBottom: Space.md },
  title: {
    fontSize: TypographyV2.sectionTitle.size,
    fontFamily: TypographyV2.sectionTitle.fontFamily,
    textAlign: 'center',
    letterSpacing: TypographyV2.sectionTitle.letterSpacing,
    lineHeight: TypographyV2.sectionTitle.lineHeight,
    marginBottom: Space.xs },
  subtitle: {
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily,
    textAlign: 'center',
    letterSpacing: TypographyV2.body.letterSpacing,
    lineHeight: TypographyV2.body.lineHeight,
    marginBottom: Space.md,
    maxWidth: 280 },
  actionBtn: {
    paddingHorizontal: Space.lg,
    paddingVertical: Space.smMd,
    borderRadius: Radius.xl,
    borderWidth: Stroke.standard },
  actionText: {
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily,
    letterSpacing: TypographyV2.body.letterSpacing },
  secondaryBtn: {
    marginTop: Space.sm,
    paddingHorizontal: Space.md,
    paddingVertical: Space.xs },
  secondaryText: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    letterSpacing: TypographyV2.meta.letterSpacing } });

const shimmerBarStyles = StyleSheet.create({
  base: {
    overflow: 'hidden' },
  gradient: {
    width: 240 } });
