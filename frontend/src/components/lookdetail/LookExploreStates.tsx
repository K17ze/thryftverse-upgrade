import React, { useMemo } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { Space, Radius, LetterSpacing } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { AppIcon } from '../common/AppIcon';
import { IconSize } from '../../theme/iconTokens';

/**
 * Labeled soft seam — a deliberate mode-shift between the detail
 * (evaluate this one) and the explore grid (discover among many).
 * Research: a hard unbroken scroll erodes choice confidence on
 * commerce surfaces (CUHK 2026). A labeled seam is the cognitive
 * reset cue — "you are now entering browse mode." Editorial
 * microcopy reads as human curation; "Recommended for you" is
 * the AI tell. Hairline divider + generous whitespace, not a
 * heavy card or different background. Magazine section break,
 * not screen boundary.
 */
function ExploreSeamImpl() {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={styles.exploreSeam}>
      <View style={styles.exploreSeamDivider} />
      <Text style={styles.exploreSeamLabel}>More looks you might like</Text>
    </View>
  );
}

export const ExploreSeam = React.memo(ExploreSeamImpl);

export interface ExploreFooterProps {
  loading: boolean;
  loadingMore: boolean;
  error: boolean;
  hasItems: boolean;
  hasMore: boolean;
  onRetryMore: () => void;
}

/**
 * Footer — full state machine: loading, error+retry, end state, spacer.
 */
function ExploreFooterImpl({ loading, loadingMore, error, hasItems, hasMore, onRetryMore }: ExploreFooterProps) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  if (loading) {
    return (
      <View style={styles.exploreLoading}>
        <ActivityIndicator size="small" color={colors.textMuted} />
      </View>
    );
  }
  if (loadingMore) {
    return (
      <View style={styles.exploreLoading}>
        <ActivityIndicator size="small" color={colors.textMuted} />
      </View>
    );
  }
  // Pagination error — inline retry, preserves already-loaded items.
  if (error && hasItems) {
    return (
      <Pressable
        style={styles.exploreRetry}
        onPress={onRetryMore}
        accessibilityRole="button"
        accessibilityLabel="Retry loading more looks"
      >
        <Ionicons name="refresh-outline" size={16} color={colors.textSecondary} aria-hidden={true} />
        <Text style={styles.exploreRetryText}>Couldn't load more. Tap to retry.</Text>
      </Pressable>
    );
  }
  // End state — a stopping cue. Reintroducing stopping cues is a 2026 HCI
  // and regulatory recommendation for infinite scroll surfaces. This is
  // a positive brand moment, not a dead end.
  if (!hasMore && hasItems) {
    return (
      <View style={styles.exploreEnd}>
        <View style={styles.exploreEndDivider} />
        <Text style={styles.exploreEndText}>You're all caught up</Text>
        <Text style={styles.exploreEndSub}>Fresh looks drop daily — come back tomorrow</Text>
      </View>
    );
  }
  return <View style={{ height: Space.xl + Space.sm }} />;
}

export const ExploreFooter = React.memo(ExploreFooterImpl);

export interface ExploreEmptyProps {
  loading: boolean;
  error: boolean;
  onRetry: () => void;
}

/**
 * Empty state — shown when the first page returns zero items or the initial
 * fetch failed. Distinguishes error (with retry) from truly empty.
 */
function ExploreEmptyImpl({ loading, error, onRetry }: ExploreEmptyProps) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  if (loading) return null; // footer handles loading
  if (error) {
    return (
      <View style={styles.exploreEmpty}>
        <Ionicons name="cloud-offline-outline" size={32} color={colors.textMuted} aria-hidden={true} />
        <Text style={styles.exploreEmptyTitle}>Couldn't load more looks</Text>
        <Text style={styles.exploreEmptySub}>Check your connection and try again.</Text>
        <Pressable
          style={styles.exploreEmptyRetry}
          onPress={onRetry}
          accessibilityRole="button"
          accessibilityLabel="Retry loading looks"
        >
          <Text style={styles.exploreEmptyRetryText}>Try again</Text>
        </Pressable>
      </View>
    );
  }
  return (
    <View style={styles.exploreEmpty}>
      <AppIcon name="search-outline" size={IconSize.hero} color="textMuted" opticalCenter accessible={false} />
      <Text style={styles.exploreEmptyTitle}>No more looks to explore</Text>
      <Text style={styles.exploreEmptySub}>Fresh looks drop daily — check back soon.</Text>
    </View>
  );
}

export const ExploreEmpty = React.memo(ExploreEmptyImpl);

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    // ── Explore grid loading footer ──
    exploreLoading: {
      paddingVertical: Space.xl,
      alignItems: 'center',
      justifyContent: 'center' },

    // ── Labeled soft seam (detail → explore transition) ──
    // A magazine section break: hairline divider + editorial label.
    // Not a heavy card, not a different background — just a deliberate
    // mode-shift cue. Reads as human curation, not algorithmic bleed.
    exploreSeam: {
      paddingHorizontal: Space.md,
      paddingTop: Space.xl,
      paddingBottom: Space.sm,
      gap: Space.sm },
    exploreSeamDivider: {
      height: 1,
      backgroundColor: colors.borderSubtle },
    exploreSeamLabel: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      color: colors.textSecondary,
      letterSpacing: LetterSpacing.caps,
      textTransform: 'uppercase' },

    // ── Explore empty state ──
    exploreEmpty: {
      paddingVertical: Space.xxl,
      paddingHorizontal: Space.lg,
      alignItems: 'center',
      gap: Space.sm },
    exploreEmptyTitle: {
      fontSize: TypographyV2.body.size,
      fontFamily: TypographyV2.body.fontFamily,
      color: colors.textPrimary },
    exploreEmptySub: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      color: colors.textSecondary,
      textAlign: 'center' },
    exploreEmptyRetry: {
      marginTop: Space.xs,
      paddingHorizontal: Space.lg,
      paddingVertical: Space.sm,
      borderRadius: Radius.full,
      backgroundColor: colors.surfaceAlt },
    exploreEmptyRetryText: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      color: colors.textPrimary },

    // ── Explore footer: retry + end state ──
    exploreRetry: {
      paddingVertical: Space.lg,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: Space.xs },
    exploreRetryText: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      color: colors.textSecondary },
    exploreEnd: {
      paddingVertical: Space.xl,
      alignItems: 'center',
      gap: Space.xs },
    exploreEndDivider: {
      width: 40,
      height: 2,
      backgroundColor: colors.borderSubtle,
      borderRadius: 1,
      marginBottom: Space.xs },
    exploreEndText: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      color: colors.textSecondary },
    exploreEndSub: {
      fontSize: TypographyV2.meta.size - 1,
      fontFamily: TypographyV2.meta.fontFamily,
      color: colors.textMuted } });
}
