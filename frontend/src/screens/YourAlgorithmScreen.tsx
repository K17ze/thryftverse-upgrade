/**
 * YourAlgorithmScreen — the user's feed topics, tunable.
 *
 * Direct composition: an inline add field leads the viewport. Suggested
 * topics sit below as quick-pick chips. Active topics render as weight-
 * visible chips — brand-tinted for "More", neutral for "Usual", faded
 * for "Less". Locked topics (from immutable history) show a lock glyph
 * and are tunable but not removable. Tapping any chip opens a compact
 * sheet to adjust or remove.
 *
 * Per AGENTS.md §11 (Truthful UI): topics come from the real intent profile
 * (`/recommendations/intent/:userId/profile`). When the backend cannot
 * answer, the service falls back to illustrative data flagged `isDemo` —
 * this screen does NOT render fabricated topics. It shows the honest
 * unavailable state instead.
 *
 * Per AGENTS.md §4: flat canvas, hairline separators, one radius
 * grammar, three type sizes per viewport. AppIcon + IconSize only.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Modal,
  ActivityIndicator } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { useAppTheme } from '../theme/ThemeContext';
import { useHaptic } from '../hooks/useHaptic';
import {
  FlagshipScreen,
  FlagshipHeader,
  FlagshipState } from '../components/flagship';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { AppIcon } from '../components/common/AppIcon';
import { IconSize } from '../theme/iconTokens';
import { AppInput } from '../components/ui/AppInput';

import {
  AlgorithmTopic,
  AlgorithmTransparencyProfile,
  TopicWeight,
  fetchAlgorithmProfile,
  updateTopicWeight,
  removeTopic,
  addTopic } from '../services/algorithmTransparencyApi';
import { formatSignalLabel } from '../services/algorithmicSignalsService';

import { Space, Radius, FontFamily, Control } from '../theme/designTokens';
import { TypographyV2 } from '../theme/typography.v2';
import { useAppTranslation } from '../i18n/useAppTranslation';

type Props = NativeStackScreenProps<RootStackParamList, 'YourAlgorithm'>;

type ScreenStatus = 'loading' | 'populated' | 'empty' | 'error' | 'offline';

/** Curated starter topics — the fast path to a tuned feed. */
const SUGGESTED_TOPICS = [
  'Vintage denim',
  'Sneakers',
  'Streetwear',
  'Minimalist style',
  'Tailored outerwear',
  'Vintage watches',
  'Workwear',
  'Leather goods',
  'Knitwear',
  'Archive fashion',
  'Knit vests',
  'Sustainability',
] as const;

const DEFAULT_CATEGORY = 'Category preference';

export default function YourAlgorithmScreen({ navigation }: Props) {
  const { colors } = useAppTheme();
  const haptic = useHaptic();
  const { t } = useAppTranslation('algorithm');

  const [profile, setProfile] = useState<AlgorithmTransparencyProfile | null>(null);
  const [status, setStatus] = useState<ScreenStatus>('loading');
  const [query, setQuery] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [pendingTopicId, setPendingTopicId] = useState<string | null>(null);
  const [sheetTopicId, setSheetTopicId] = useState<string | null>(null);

  const loadProfile = useCallback(async () => {
    setStatus('loading');
    try {
      const data = await fetchAlgorithmProfile();
      if (data.isDemo) {
        // Truthful UI: the service could not reach the intent backend and
        // returned illustrative topics. Do not render fabricated data —
        // surface the honest unavailable state.
        setProfile(null);
        setStatus('error');
        return;
      }
      setProfile(data);
      setStatus(data.topics.length === 0 ? 'empty' : 'populated');
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      if (/network|offline|fetch/i.test(msg)) {
        setStatus('offline');
      } else {
        setStatus('error');
      }
    }
  }, []);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  const topics = useMemo(() => profile?.topics ?? [], [profile]);
  const sheetTopic = topics.find((tp) => tp.id === sheetTopicId) ?? null;

  const addTopicByName = useCallback(async (rawLabel: string) => {
    const label = rawLabel.trim();
    if (!label || isAdding) return;
    if (topics.some((tp) => tp.label.toLowerCase() === label.toLowerCase())) {
      setQuery('');
      return;
    }
    haptic.light();
    setIsAdding(true);
    try {
      const created = await addTopic(label, DEFAULT_CATEGORY);
      setProfile((prev) =>
        prev ? { ...prev, topics: [created, ...prev.topics] } : prev);
      setStatus((prev) => (prev === 'empty' ? 'populated' : prev));
      setQuery('');
    } finally {
      setIsAdding(false);
    }
  }, [isAdding, topics, haptic]);

  const handleWeightChange = useCallback(async (topicId: string, weight: TopicWeight) => {
    haptic.light();
    setPendingTopicId(topicId);
    const previous = profile;
    setProfile((prev) => prev
      ? { ...prev, topics: prev.topics.map((tp) => (tp.id === topicId ? { ...tp, weight } : tp)) }
      : prev);
    try {
      const updated = await updateTopicWeight(topicId, weight);
      if (updated) {
        setProfile((prev) => prev
          ? { ...prev, topics: prev.topics.map((tp) => (tp.id === topicId ? updated : tp)) }
          : prev);
      } else if (previous) {
        setProfile(previous);
      }
    } finally {
      setPendingTopicId(null);
    }
  }, [profile, haptic]);

  const handleRemoveTopic = useCallback(async (topicId: string) => {
    haptic.medium();
    setPendingTopicId(topicId);
    try {
      const ok = await removeTopic(topicId);
      if (ok) {
        setProfile((prev) => {
          if (!prev) return prev;
          const next = prev.topics.filter((tp) => tp.id !== topicId);
          if (next.length === 0) setStatus('empty');
          return { ...prev, topics: next };
        });
        setSheetTopicId(null);
      }
    } finally {
      setPendingTopicId(null);
    }
  }, [haptic]);

  const handleRetry = useCallback(() => {
    loadProfile();
  }, [loadProfile]);

  const removableTopics = topics.filter((tp) => tp.removable);
  const lockedTopics = topics.filter((tp) => !tp.removable);

  const suggestions = useMemo(() => {
    const q = query.trim().toLowerCase();
    const existing = new Set(topics.map((tp) => tp.label.toLowerCase()));
    return SUGGESTED_TOPICS
      .filter((s) => !existing.has(s.toLowerCase()))
      .filter((s) => (q ? s.toLowerCase().includes(q) : true))
      .slice(0, 8);
  }, [query, topics]);

  const queryHasExactMatch = topics.some(
    (tp) => tp.label.toLowerCase() === query.trim().toLowerCase());
  const canAddQuery = query.trim().length > 0 && !queryHasExactMatch;

  const styles = useMemo(() => createStyles(colors), [colors]);

  // Interactive surface only exists for a real (non-demo) profile.
  const interactive = status === 'populated' || status === 'empty';

  const addBtn = (
    <Pressable
      onPress={() => void addTopicByName(query)}
      disabled={isAdding || !canAddQuery}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={t('addTopic.addBtn')}
      accessibilityState={{ disabled: !canAddQuery || isAdding }}
    >
      {isAdding
        ? <ActivityIndicator size="small" color={colors.brand} />
        : (
          <AppIcon
            name={canAddQuery ? 'add-circle' : 'add-circle-outline'}
            size={IconSize.lg}
            color={canAddQuery ? colors.brand : colors.textMuted}
            accessible={false}
          />
        )}
    </Pressable>
  );

  return (
    <FlagshipScreen
      testID="your-algorithm-screen"
      contentStyle={styles.screenContent}
      header={
        <FlagshipHeader
          title={t('header.title')}
          subtitle={t('header.subtitle')}
          onBack={() => navigation.goBack()}
        />
      }
    >
      {/* ── Interactive surface (real profile only) ── */}
      {interactive && (
        <>
          {/* ── Inline add ── */}
          <View style={styles.addRow}>
            <AppInput
              placeholder={t('addTopic.placeholder')}
              value={query}
              onChangeText={setQuery}
              accessibilityLabel={t('addTopic.placeholder')}
              accessibilityHint="Adds a topic that shapes what you discover"
              returnKeyType="done"
              onSubmitEditing={() => void addTopicByName(query)}
              inputContainerStyle={styles.topicInput}
              rightAction={addBtn}
            />
          </View>

          {/* ── Suggested quick picks ── */}
          {suggestions.length > 0 && (
            <View style={styles.chipCloud}>
              {suggestions.map((s) => (
                <Chip
                  key={s}
                  label={s}
                  variant="suggested"
                  onPress={() => void addTopicByName(s)}
                  colors={colors}
                  styles={styles}
                />
              ))}
            </View>
          )}
        </>
      )}

      {/* ── States ── */}
      {status === 'loading' && <LoadingSkeleton styles={styles} colors={colors} />}

      {status === 'error' && (
        <FlagshipState
          variant="error"
          title={t('error.title')}
          subtitle={t('error.subtitle')}
          actionLabel={t('error.retry')}
          onAction={handleRetry}
        />
      )}

      {status === 'offline' && (
        <FlagshipState
          variant="offline"
          subtitle={t('offline.banner')}
          actionLabel={t('error.retry')}
          onAction={handleRetry}
        />
      )}

      {status === 'empty' && (
        <FlagshipState
          variant="empty"
          title={t('empty.title')}
          subtitle={t('empty.subtitle')}
        />
      )}

      {/* ── Active topics (weight-visible) ── */}
      {removableTopics.length > 0 && (
        <View style={styles.sectionWrap}>
          <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>
            {t('topics.title')}
          </Text>
          <View style={styles.chipCloudInner}>
            {removableTopics.map((tp) => (
              <Chip
                key={tp.id}
                label={formatSignalLabel(tp.label)}
                variant="active"
                weight={tp.weight}
                onPress={() => { haptic.selection(); setSheetTopicId(tp.id); }}
                colors={colors}
                styles={styles}
              />
            ))}
          </View>
        </View>
      )}

      {/* ── Locked topics (history-derived, tunable not removable) ── */}
      {lockedTopics.length > 0 && (
        <View style={styles.sectionWrap}>
          <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>
            {t('topics.locked')}
          </Text>
          <View style={styles.chipCloudInner}>
            {lockedTopics.map((tp) => (
              <Chip
                key={tp.id}
                label={formatSignalLabel(tp.label)}
                variant="locked"
                weight={tp.weight}
                onPress={() => { haptic.selection(); setSheetTopicId(tp.id); }}
                colors={colors}
                styles={styles}
              />
            ))}
          </View>
        </View>
      )}

      {/* ── Topic tuning sheet ── */}
      <Modal
        visible={sheetTopic !== null}
        transparent
        animationType="slide"
        onRequestClose={() => setSheetTopicId(null)}
      >
        <Pressable style={styles.sheetScrim} onPress={() => setSheetTopicId(null)}>
          <View
            style={[styles.sheet, { backgroundColor: colors.surface }]}
            onStartShouldSetResponder={() => true}
          >
            {sheetTopic && (
              <>
                <Text style={[styles.sheetTitle, { color: colors.textPrimary }]} numberOfLines={1}>
                  {formatSignalLabel(sheetTopic.label)}
                </Text>

                {([
                  ['high', t('topics.moreOfThis')],
                  ['medium', t('topics.weightUsual')],
                  ['low', t('topics.lessOfThis')],
                ] as const).map(([weight, label]) => {
                  const selected = sheetTopic.weight === weight;
                  return (
                    <Pressable
                      key={weight}
                      style={[styles.sheetRow, selected && { backgroundColor: colors.surfaceAlt }]}
                      onPress={() => void handleWeightChange(sheetTopic.id, weight)}
                      disabled={pendingTopicId === sheetTopic.id}
                      accessibilityRole="button"
                      accessibilityLabel={label}
                      accessibilityState={{ selected, disabled: pendingTopicId === sheetTopic.id }}
                    >
                      <Text style={[styles.sheetRowText, { color: colors.textPrimary }]}>
                        {label}
                      </Text>
                      {selected && (
                        <AppIcon name="check" size={IconSize.sm} color={colors.brand} accessible={false} />
                      )}
                    </Pressable>
                  );
                })}

                {sheetTopic.removable ? (
                  <Pressable
                    style={styles.sheetRow}
                    onPress={() => void handleRemoveTopic(sheetTopic.id)}
                    disabled={pendingTopicId === sheetTopic.id}
                    accessibilityRole="button"
                    accessibilityLabel={`${t('topics.removeTopic')} ${formatSignalLabel(sheetTopic.label)}`}
                    accessibilityState={{ disabled: pendingTopicId === sheetTopic.id }}
                  >
                    {pendingTopicId === sheetTopic.id
                      ? <ActivityIndicator size="small" color={colors.danger} />
                      : (
                        <View style={styles.sheetRowDangerWrap}>
                          <AppIcon name="trash" size={IconSize.sm} color={colors.danger} accessible={false} />
                          <Text style={[styles.sheetRowDanger, { color: colors.danger }]}>
                            {t('topics.removeTopic')}
                          </Text>
                        </View>
                      )}
                  </Pressable>
                ) : (
                  <Text style={[styles.sheetLockHint, { color: colors.textMuted }]}>
                    {t('topics.lockHint')}
                  </Text>
                )}
              </>
            )}
          </View>
        </Pressable>
      </Modal>
    </FlagshipScreen>
  );
}

// ─── Chip ────────────────────────────────────────────────────────────────────
function Chip({
  label,
  variant,
  weight,
  onPress,
  colors,
  styles }: {
  label: string;
  variant: 'suggested' | 'active' | 'locked';
  weight?: TopicWeight;
  onPress: () => void;
  colors: ReturnType<typeof useAppTheme>['colors'];
  styles: ReturnType<typeof createStyles>;
}) {
  // Weight-visible backgrounds for active/locked chips
  const weightBg = weight === 'high'
    ? colors.brandSubtle
    : weight === 'low'
      ? colors.surfaceAlt
      : colors.surface;

  const chipBg = variant === 'suggested'
    ? 'transparent'
    : variant === 'locked'
      ? colors.surfaceAlt
      : weightBg;

  const chipBorder = variant === 'suggested'
    ? { borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border }
    : weight === 'medium' && variant === 'active'
      ? { borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border }
      : { borderWidth: 0 };

  const textColor = variant === 'suggested'
    ? colors.textSecondary
    : variant === 'locked'
      ? colors.textMuted
      : weight === 'high'
        ? colors.textPrimary
        : weight === 'low'
          ? colors.textMuted
          : colors.textPrimary;

  return (
    <AnimatedPressable
      onPress={onPress}
      scaleValue={0.96}
      hapticFeedback="light"
      style={[styles.chip, { backgroundColor: chipBg }, chipBorder]}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      {variant === 'locked' && (
        <AppIcon name="lock" size={IconSize.micro} color={colors.textMuted} accessible={false} />
      )}
      <Text
        style={[styles.chipText, { color: textColor }]}
        numberOfLines={1}
      >
        {label}
      </Text>
    </AnimatedPressable>
  );
}

// ─── Loading skeleton ────────────────────────────────────────────────────────
function LoadingSkeleton({
  styles,
  colors }: {
  styles: ReturnType<typeof createStyles>;
  colors: ReturnType<typeof useAppTheme>['colors'];
}) {
  return (
    <View style={styles.skeletonWrap}>
      <View style={[styles.skeletonChip, { width: 88, backgroundColor: colors.surfaceAlt }]} />
      <View style={[styles.skeletonChip, { width: 64, backgroundColor: colors.surfaceAlt }]} />
      <View style={[styles.skeletonChip, { width: 96, backgroundColor: colors.surfaceAlt }]} />
      <View style={[styles.skeletonChip, { width: 72, backgroundColor: colors.surfaceAlt }]} />
      <View style={[styles.skeletonChip, { width: 80, backgroundColor: colors.surfaceAlt }]} />
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────
function createStyles(colors: ReturnType<typeof useAppTheme>['colors']) {
  return StyleSheet.create({
    screenContent: {
      paddingHorizontal: 0 },
    addRow: {
      paddingHorizontal: Space.md,
      paddingTop: Space.sm },
    topicInput: {
      borderRadius: Radius.lg },
    chipCloud: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: Space.sm,
      paddingHorizontal: Space.md,
      paddingTop: Space.sm },
    chipCloudInner: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: Space.sm },
    chip: {
      minHeight: Control.hit - 8,
      borderRadius: Radius.md,
      paddingHorizontal: Space.md,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      justifyContent: 'center' },
    chipText: {
      fontSize: TypographyV2.body.size,
      fontFamily: FontFamily.medium },
    sectionWrap: {
      marginTop: Space.lg,
      paddingHorizontal: Space.md },
    sectionLabel: {
      fontSize: TypographyV2.meta.size,
      lineHeight: TypographyV2.meta.lineHeight,
      fontFamily: FontFamily.semibold,
      marginBottom: Space.sm },
    skeletonWrap: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: Space.sm,
      paddingHorizontal: Space.md,
      paddingTop: Space.lg },
    skeletonChip: {
      height: Control.hit - 8,
      borderRadius: Radius.md },
    sheetScrim: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.4)',
      justifyContent: 'flex-end' },
    sheet: {
      borderTopLeftRadius: Radius.lg,
      borderTopRightRadius: Radius.lg,
      paddingHorizontal: Space.md,
      paddingTop: Space.lg,
      paddingBottom: Space.xl },
    sheetTitle: {
      fontSize: TypographyV2.bodyStrong.size,
      lineHeight: TypographyV2.bodyStrong.lineHeight,
      fontFamily: FontFamily.semibold,
      marginBottom: Space.md },
    sheetRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      minHeight: Control.hit,
      borderRadius: Radius.md,
      paddingHorizontal: Space.md },
    sheetRowText: {
      fontSize: TypographyV2.body.size,
      fontFamily: FontFamily.medium },
    sheetRowDangerWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.sm },
    sheetRowDanger: {
      fontSize: TypographyV2.body.size,
      fontFamily: FontFamily.medium,
      color: colors.danger },
    sheetLockHint: {
      fontSize: TypographyV2.meta.size,
      lineHeight: TypographyV2.meta.lineHeight,
      fontFamily: FontFamily.regular,
      color: colors.textMuted,
      marginTop: Space.sm },
  });
}
