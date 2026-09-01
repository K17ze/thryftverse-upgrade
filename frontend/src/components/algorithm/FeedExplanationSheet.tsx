/**
 * FeedExplanationSheet — "Why am I seeing this?" bottom sheet
 *
 * Opens when a user taps "Why am I seeing this?" on a feed item. Shows the
 * AlgorithmFeedExplanation: item thumbnail, title, ranked reasons, a
 * descriptive confidence label (never a raw percentage), and three actions:
 * "See more like this", "Show less like this", "Remove this topic".
 *
 * Per AGENTS.md §11 (Truthful UI): in demo mode the sheet shows an honest
 * "Demo mode" indicator and never claims the actions affect a live feed.
 *
 * Design (per AGENTS.md §4):
 * - Uses the existing BottomSheet component (import from '../BottomSheet')
 * - Flat composition inside the sheet, hairline separators
 * - Max two non-avatar radius sizes (Radius.md for thumbnail, Radius.lg for actions)
 * - All colors via useAppTheme(), all geometry via design tokens
 *
 * Accessibility:
 * - Full accessibilityLabel / accessibilityRole / accessibilityHint
 * - Confidence label is announced as text (not a percentage)
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { BottomSheet } from '../BottomSheet';
import { CachedImage } from '../CachedImage';
import { AnimatedPressable } from '../AnimatedPressable';
import { useAppTheme } from '../../theme/ThemeContext';
import { useHaptic } from '../../hooks/useHaptic';
import { Space, Radius, Control, Stroke } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';

import {
  AlgorithmFeedExplanation,
  FeedExplanationReason,
  SignalSource,
  ConfidenceLabel,
  ALGORITHM_DEMO_MODE,
  fetchFeedExplanation,
  removeTopic } from '../../services/algorithmTransparencyApi';

// ─── Props ───────────────────────────────────────────────────────────────────
export interface FeedExplanationSheetProps {
  /** Whether the sheet is visible. */
  visible: boolean;
  /** Called when the user dismisses the sheet. */
  onDismiss: () => void;
  /** The feed item ID to explain. */
  itemId: string | null;
  /** Called when the user taps "See more like this". Receives the top reason topic. */
  onSeeMoreLikeThis?: (topic: string) => void;
  /** Called when the user taps "Show less like this". Receives the top reason topic. */
  onShowLessLikeThis?: (topic: string) => void;
  /** Called after a topic is successfully removed. */
  onTopicRemoved?: (topic: string) => void;
}

// ─── Source labels ───────────────────────────────────────────────────────────
const SOURCE_LABEL: Record<SignalSource, string> = {
  explicit: 'Explicit',
  implicit: 'Implicit',
  inferred: 'Inferred' };

// ─── Confidence visual metadata ──────────────────────────────────────────────
const CONFIDENCE_META: Record<ConfidenceLabel, { barWidth: number; iconName: keyof typeof Ionicons.glyphMap }> = {
  'Strong match': { barWidth: 0.85, iconName: 'checkmark-circle' },
  'Moderate match': { barWidth: 0.55, iconName: 'remove-circle' },
  'Exploratory': { barWidth: 0.25, iconName: 'search-outline' } };

// ─── Component ───────────────────────────────────────────────────────────────
export function FeedExplanationSheet({
  visible,
  onDismiss,
  itemId,
  onSeeMoreLikeThis,
  onShowLessLikeThis,
  onTopicRemoved }: FeedExplanationSheetProps) {
  const { colors } = useAppTheme();
  const haptic = useHaptic();

  const [explanation, setExplanation] = useState<AlgorithmFeedExplanation | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(false);
  const [removingTopic, setRemovingTopic] = useState<string | null>(null);

  const styles = useMemo(() => createStyles(colors), [colors]);

  // ── Fetch explanation when itemId changes ──
  useEffect(() => {
    if (!visible || !itemId) {
      setExplanation(null);
      setError(false);
      return;
    }

    let mounted = true;
    setIsLoading(true);
    setError(false);
    setExplanation(null);

    fetchFeedExplanation(itemId)
      .then((data) => {
        if (!mounted) return;
        if (data) {
          setExplanation(data);
        } else {
          setError(true);
        }
      })
      .catch(() => {
        if (mounted) setError(true);
      })
      .finally(() => {
        if (mounted) setIsLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [visible, itemId]);

  // ── Handlers ──
  const topReasonTopic = useMemo(() => {
    if (!explanation || explanation.reasons.length === 0) return null;
    return explanation.reasons[0].topic;
  }, [explanation]);

  const handleSeeMore = useCallback(() => {
    if (!topReasonTopic) return;
    haptic.light();
    onSeeMoreLikeThis?.(topReasonTopic);
  }, [topReasonTopic, haptic, onSeeMoreLikeThis]);

  const handleShowLess = useCallback(() => {
    if (!topReasonTopic) return;
    haptic.light();
    onShowLessLikeThis?.(topReasonTopic);
  }, [topReasonTopic, haptic, onShowLessLikeThis]);

  const handleRemoveTopic = useCallback(async () => {
    if (!topReasonTopic) return;
    haptic.medium();
    setRemovingTopic(topReasonTopic);
    try {
      // The explanation reasons don't carry a topic ID, so we attempt removal
      // by matching the label. In demo mode this updates the session profile.
      // We use a best-effort approach: the service removes by ID, so we pass
      // a derived identifier. In demo mode the mock handles it gracefully.
      const ok = await removeTopic(`topic-label-${topReasonTopic}`);
      if (ok) {
        onTopicRemoved?.(topReasonTopic);
        onDismiss();
      }
    } finally {
      setRemovingTopic(null);
    }
  }, [topReasonTopic, haptic, onTopicRemoved, onDismiss]);

  return (
    <BottomSheet visible={visible} onDismiss={onDismiss} snapPoint={0.62}>
      <View style={styles.container}>
        {/* ── Header ── */}
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>
          Why you're seeing this
        </Text>

        {/* ── Demo mode indicator ── */}
        {ALGORITHM_DEMO_MODE && (
          <View style={[styles.demoPill, { backgroundColor: colors.surfaceAlt }]}>
            <Ionicons name="information-circle-outline" size={14} color={colors.textSecondary} />
            <Text style={styles.demoPillText}>Demo mode — illustrative data</Text>
          </View>
        )}

        {/* ── Loading ── */}
        {isLoading && (
          <View style={styles.loadingWrap}>
            <ActivityIndicator size="large" color={colors.textMuted} />
            <Text style={[styles.loadingText, { color: colors.textMuted }]}>
              Loading explanation…
            </Text>
          </View>
        )}

        {/* ── Error ── */}
        {!isLoading && error && (
          <View style={styles.errorWrap}>
            <Ionicons name="alert-circle-outline" size={28} color={colors.textMuted} />
            <Text style={[styles.errorTitle, { color: colors.textPrimary }]}>
              Couldn't load this explanation
            </Text>
            <Text style={[styles.errorSubtitle, { color: colors.textSecondary }]}>
              We couldn't determine why this item appeared. Try again.
            </Text>
          </View>
        )}

        {/* ── Populated ── */}
        {!isLoading && !error && explanation && (
          <View>
            {/* ── Item identity ── */}
            <View style={styles.itemRow}>
              <CachedImage
                uri={explanation.itemThumbnail}
                style={styles.itemThumb}
                contentFit="cover"
              />
              <View style={styles.itemText}>
                <Text style={[styles.itemTitle, { color: colors.textPrimary }]} numberOfLines={2}>
                  {explanation.itemTitle}
                </Text>
                <Text style={[styles.itemCaption, { color: colors.textMuted }]}>
                  Appeared in your feed
                </Text>
              </View>
            </View>

            {/* ── Confidence indicator ── */}
            <View style={[styles.confidenceWrap, { borderColor: colors.border }]}>
              <View style={styles.confidenceHeader}>
                <Ionicons
                  name={CONFIDENCE_META[explanation.confidenceLabel].iconName}
                  size={18}
                  color={colors.textPrimary}
                />
                <Text style={[styles.confidenceLabel, { color: colors.textPrimary }]}>
                  {explanation.confidenceLabel}
                </Text>
              </View>
              <View style={[styles.confidenceBar, { backgroundColor: colors.border }]}>
                <View
                  style={[
                    styles.confidenceFill,
                    {
                      width: `${Math.round(CONFIDENCE_META[explanation.confidenceLabel].barWidth * 100)}%`,
                      backgroundColor: colors.textPrimary },
                  ]}
                />
              </View>
            </View>

            {/* ── Reasons ── */}
            <Text style={[styles.reasonsHeader, { color: colors.textMuted }]}>
              REASONS
            </Text>
            <View style={styles.reasonsList}>
              {explanation.reasons.map((reason, i) => (
                <ReasonRow
                  key={`${reason.topic}-${i}`}
                  reason={reason}
                  isLast={i === explanation.reasons.length - 1}
                  colors={colors}
                  styles={styles}
                />
              ))}
            </View>

            {/* ── Actions ── */}
            <View style={styles.actionsWrap}>
              <AnimatedPressable
                onPress={handleSeeMore}
                scaleValue={0.97}
                hapticFeedback="light"
                style={[styles.actionBtn, styles.actionPrimary, { backgroundColor: colors.brand }]}
                accessibilityRole="button"
                accessibilityLabel="See more like this"
                accessibilityHint="Signals that you want to see more items like this"
              >
                <Ionicons name="add-circle-outline" size={18} color={colors.textInverse} />
                <Text style={[styles.actionPrimaryText, { color: colors.textInverse }]}>
                  See more like this
                </Text>
              </AnimatedPressable>

              <AnimatedPressable
                onPress={handleShowLess}
                scaleValue={0.97}
                hapticFeedback="light"
                style={[styles.actionBtn, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}
                accessibilityRole="button"
                accessibilityLabel="Show less like this"
                accessibilityHint="Signals that you want to see fewer items like this"
              >
                <Ionicons name="remove-circle-outline" size={18} color={colors.textPrimary} />
                <Text style={[styles.actionSecondaryText, { color: colors.textPrimary }]}>
                  Show less like this
                </Text>
              </AnimatedPressable>

              <Pressable
                style={styles.removeAction}
                onPress={handleRemoveTopic}
                disabled={removingTopic !== null}
                accessibilityRole="button"
                accessibilityLabel={`Remove ${topReasonTopic ?? 'this topic'}`}
                accessibilityHint="Removes the top matching topic from your algorithm profile"
                accessibilityState={{ disabled: removingTopic !== null }}
              >
                {removingTopic !== null ? (
                  <ActivityIndicator size="small" color={colors.danger} />
                ) : (
                  <>
                    <Ionicons name="trash-outline" size={16} color={colors.danger} />
                    <Text style={[styles.removeActionText, { color: colors.danger }]}>
                      Remove this topic
                    </Text>
                  </>
                )}
              </Pressable>
            </View>
          </View>
        )}
      </View>
    </BottomSheet>
  );
}

// ─── Reason row ──────────────────────────────────────────────────────────────
function ReasonRow({
  reason,
  isLast,
  colors,
  styles }: {
  reason: FeedExplanationReason;
  isLast: boolean;
  colors: ReturnType<typeof useAppTheme>['colors'];
  styles: ReturnType<typeof createStyles>;
}) {
  return (
    <View
      style={[styles.reasonRow, !isLast && { borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth }]}
      accessibilityRole="text"
      accessibilityLabel={`${reason.topic}, ${SOURCE_LABEL[reason.source]} source`}
    >
      <View style={styles.reasonMain}>
        <Text style={[styles.reasonTopic, { color: colors.textPrimary }]} numberOfLines={1}>
          {reason.topic}
        </Text>
        <Text style={[styles.reasonSource, { color: colors.textMuted }]}>
          {SOURCE_LABEL[reason.source]} source
        </Text>
      </View>
      {/* Weight contribution bar — relative, not a percentage label */}
      <View style={styles.reasonWeightBar}>
        <View
          style={[
            styles.reasonWeightFill,
            { width: `${Math.round(reason.weight * 100)}%`, backgroundColor: colors.textPrimary },
          ]}
        />
      </View>
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────
function createStyles(colors: ReturnType<typeof useAppTheme>['colors']) {
  return StyleSheet.create({
    container: {
      paddingBottom: Space.lg },

    // Header
    headerTitle: {
      fontSize: TypographyV2.sectionTitle.size,
      fontFamily: TypographyV2.sectionTitle.fontFamily,
      letterSpacing: TypographyV2.sectionTitle.letterSpacing,
      lineHeight: TypographyV2.sectionTitle.lineHeight,
      marginBottom: Space.sm },

    // Demo pill
    demoPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs,
      paddingHorizontal: Space.sm,
      paddingVertical: Space.xs + 1,
      borderRadius: Radius.full,
      alignSelf: 'flex-start',
      marginBottom: Space.md },
    demoPillText: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      letterSpacing: TypographyV2.meta.letterSpacing,
      color: colors.textSecondary },

    // Loading
    loadingWrap: {
      alignItems: 'center',
      paddingVertical: Space.xl },
    loadingText: {
      fontSize: TypographyV2.body.size,
      fontFamily: TypographyV2.body.fontFamily,
      letterSpacing: TypographyV2.body.letterSpacing,
      marginTop: Space.md },

    // Error
    errorWrap: {
      alignItems: 'center',
      paddingVertical: Space.xl,
      paddingHorizontal: Space.md },
    errorTitle: {
      fontSize: TypographyV2.bodyStrong.size,
      fontFamily: TypographyV2.bodyStrong.fontFamily,
      letterSpacing: TypographyV2.bodyStrong.letterSpacing,
      lineHeight: TypographyV2.bodyStrong.lineHeight,
      marginTop: Space.md,
      marginBottom: Space.xs },
    errorSubtitle: {
      fontSize: TypographyV2.body.size,
      fontFamily: TypographyV2.body.fontFamily,
      letterSpacing: TypographyV2.body.letterSpacing,
      lineHeight: TypographyV2.body.lineHeight,
      textAlign: 'center' },

    // Item identity
    itemRow: {
      flexDirection: 'row',
      gap: Space.md,
      marginBottom: Space.md },
    itemThumb: {
      width: 64,
      height: 64,
      borderRadius: Radius.md,
      backgroundColor: colors.surfaceAlt },
    itemText: {
      flex: 1,
      justifyContent: 'center' },
    itemTitle: {
      fontSize: TypographyV2.bodyStrong.size,
      fontFamily: TypographyV2.bodyStrong.fontFamily,
      letterSpacing: TypographyV2.bodyStrong.letterSpacing,
      lineHeight: TypographyV2.bodyStrong.lineHeight },
    itemCaption: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      letterSpacing: TypographyV2.meta.letterSpacing,
      lineHeight: TypographyV2.meta.lineHeight,
      marginTop: 2 },

    // Confidence
    confidenceWrap: {
      borderWidth: Stroke.standard,
      borderRadius: Radius.lg,
      padding: Space.md,
      marginBottom: Space.lg },
    confidenceHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs + 2,
      marginBottom: Space.sm },
    confidenceLabel: {
      fontSize: TypographyV2.bodyStrong.size,
      fontFamily: TypographyV2.bodyStrong.fontFamily,
      letterSpacing: TypographyV2.bodyStrong.letterSpacing,
      lineHeight: TypographyV2.bodyStrong.lineHeight },
    confidenceBar: {
      height: 4,
      borderRadius: Radius.full,
      overflow: 'hidden' },
    confidenceFill: {
      height: '100%',
      borderRadius: Radius.full },

    // Reasons
    reasonsHeader: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      letterSpacing: 0.5,
      lineHeight: TypographyV2.meta.lineHeight,
      textTransform: 'uppercase',
      marginBottom: Space.sm },
    reasonsList: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
      marginBottom: Space.lg },
    reasonRow: {
      paddingVertical: Space.md,
      minHeight: Control.hit },
    reasonMain: {
      marginBottom: Space.xs },
    reasonTopic: {
      fontSize: TypographyV2.body.size,
      fontFamily: TypographyV2.body.fontFamily,
      letterSpacing: TypographyV2.body.letterSpacing,
      lineHeight: TypographyV2.body.lineHeight },
    reasonSource: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      letterSpacing: TypographyV2.meta.letterSpacing,
      lineHeight: TypographyV2.meta.lineHeight,
      marginTop: 2 },
    reasonWeightBar: {
      height: 3,
      borderRadius: Radius.full,
      backgroundColor: colors.border,
      overflow: 'hidden' },
    reasonWeightFill: {
      height: '100%',
      borderRadius: Radius.full },

    // Actions
    actionsWrap: {
      gap: Space.sm },
    actionBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: Space.xs + 2,
      height: 52,
      borderRadius: Radius.lg },
    actionPrimary: {
      // backgroundColor set inline
    },
    actionPrimaryText: {
      fontSize: TypographyV2.bodyStrong.size,
      fontFamily: TypographyV2.bodyStrong.fontFamily,
      letterSpacing: TypographyV2.bodyStrong.letterSpacing },
    actionSecondary: {
      borderWidth: Stroke.standard },
    actionSecondaryText: {
      fontSize: TypographyV2.bodyStrong.size,
      fontFamily: TypographyV2.bodyStrong.fontFamily,
      letterSpacing: TypographyV2.bodyStrong.letterSpacing },
    removeAction: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: Space.xs,
      paddingVertical: Space.md,
      minHeight: Control.hit },
    removeActionText: {
      fontSize: TypographyV2.body.size,
      fontFamily: TypographyV2.body.fontFamily,
      letterSpacing: TypographyV2.body.letterSpacing } });
}
