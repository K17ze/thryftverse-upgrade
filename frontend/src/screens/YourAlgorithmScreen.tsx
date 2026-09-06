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
 * Per AGENTS.md §11 (Truthful UI): the service reports demo mode and
 * every entity carries isDemo; a single line states it plainly.
 *
 * Per AGENTS.md §4: flat canvas, hairline separators, one radius
 * grammar, three type sizes per viewport.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  Modal,
  ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { useAppTheme } from '../theme/ThemeContext';
import { useHaptic } from '../hooks/useHaptic';
import { FlagshipScreen, FlagshipHeader } from '../components/flagship';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { AppInput } from '../components/ui/AppInput';

import {
  AlgorithmTopic,
  TopicWeight,
  getAlgorithmDemoMode,
  fetchAlgorithmProfile,
  updateTopicWeight,
  removeTopic,
  addTopic } from '../services/algorithmTransparencyApi';

import { Space, Radius, Typography, Control } from '../theme/designTokens';
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

/** Backend intent rows can carry raw ids ("topic-denim") — humanize for display. */
function prettifyTopicLabel(label: string): string {
  if (!/^topic-[a-z0-9-]+$/i.test(label)) return label;
  return label
    .replace(/^topic-(user-)?/i, '')
    .split('-')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

export default function YourAlgorithmScreen({ navigation }: Props) {
  const { colors } = useAppTheme();
  const haptic = useHaptic();
  const { t } = useAppTranslation('algorithm');

  const [profile, setProfile] = useState<AlgorithmTopic[] | null>(null);
  const [status, setStatus] = useState<ScreenStatus>('loading');
  const [query, setQuery] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [pendingTopicId, setPendingTopicId] = useState<string | null>(null);
  const [sheetTopicId, setSheetTopicId] = useState<string | null>(null);

  const loadProfile = useCallback(async () => {
    setStatus('loading');
    try {
      const data = await fetchAlgorithmProfile();
      setProfile(data.topics);
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

  const topics = profile ?? [];
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
      setProfile((prev) => [created, ...(prev ?? [])]);
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
      ? prev.map((tp) => (tp.id === topicId ? { ...tp, weight } : tp))
      : prev);
    try {
      const updated = await updateTopicWeight(topicId, weight);
      if (updated) {
        setProfile((prev) => prev
          ? prev.map((tp) => (tp.id === topicId ? updated : tp))
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
          const next = prev.filter((tp) => tp.id !== topicId);
          if (next.length === 0) setStatus('empty');
          return next;
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
          <Ionicons
            name={canAddQuery ? 'add-circle' : 'add-circle-outline'}
            size={26}
            color={canAddQuery ? colors.brand : colors.textMuted}
            accessible={false}
          />
        )}
    </Pressable>
  );

  return (
    <FlagshipScreen
      header={
        <FlagshipHeader
          title={t('header.title')}
          subtitle={t('header.subtitle')}
          onBack={() => navigation.goBack()}
        />
      }
    >
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
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

        {/* ── Demo line ── */}
        {getAlgorithmDemoMode() && status !== 'loading' && status !== 'error' && (
          <Text style={[styles.demoLine, { color: colors.textMuted }]}>
            {t('demo.banner')}
          </Text>
        )}

        {/* ── States ── */}
        {status === 'loading' && <LoadingSkeleton styles={styles} colors={colors} />}

        {status === 'error' && (
          <ErrorState styles={styles} colors={colors} onRetry={handleRetry} t={t} />
        )}

        {status === 'offline' && (
          <View style={styles.offlineWrap}>
            <Ionicons name="cloud-offline-outline" size={24} color={colors.textMuted} accessible={false} />
            <Text style={[styles.offlineText, { color: colors.textSecondary }]}>
              {t('offline.banner')}
            </Text>
          </View>
        )}

        {status === 'empty' && (
          <View style={styles.emptyWrap}>
            <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>
              {t('empty.title')}
            </Text>
            <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
              {t('empty.subtitle')}
            </Text>
          </View>
        )}

        {/* ── Active topics (weight-visible) ── */}
        {removableTopics.length > 0 && (
          <View style={styles.sectionWrap}>
            <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>
              {t('topics.title')}
            </Text>
            <View style={styles.chipCloud}>
              {removableTopics.map((tp) => (
                <Chip
                  key={tp.id}
                  label={prettifyTopicLabel(tp.label)}
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
            <View style={styles.chipCloud}>
              {lockedTopics.map((tp) => (
                <Chip
                  key={tp.id}
                  label={prettifyTopicLabel(tp.label)}
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
      </ScrollView>

      {/* ── Topic tuning sheet ── */}
      <Modal
        visible={sheetTopic !== null}
        transparent
        animationType="slide"
        onRequestClose={() => setSheetTopicId(null)}
      >
        <Pressable style={styles.sheetScrim} onPress={() => setSheetTopicId(null)}>
          <Pressable style={[styles.sheet, { backgroundColor: colors.surface }]} onPress={() => {}}>
            {sheetTopic && (
              <>
                <Text style={[styles.sheetTitle, { color: colors.textPrimary }]} numberOfLines={1}>
                  {prettifyTopicLabel(sheetTopic.label)}
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
                        <Ionicons name="checkmark" size={18} color={colors.brand} accessible={false} />
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
                    accessibilityLabel={`${t('topics.removeTopic')} ${prettifyTopicLabel(sheetTopic.label)}`}
                    accessibilityState={{ disabled: pendingTopicId === sheetTopic.id }}
                  >
                    {pendingTopicId === sheetTopic.id
                      ? <ActivityIndicator size="small" color={colors.danger} />
                      : (
                        <>
                          <Ionicons name="trash-outline" size={16} color={colors.danger} accessible={false} />
                          <Text style={[styles.sheetRowDanger, { color: colors.danger }]}>
                            {t('topics.removeTopic')}
                          </Text>
                        </>
                      )}
                  </Pressable>
                ) : (
                  <Text style={[styles.sheetLockHint, { color: colors.textMuted }]}>
                    {t('topics.lockHint')}
                  </Text>
                )}
              </>
            )}
          </Pressable>
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
        <Ionicons name="lock-closed" size={11} color={colors.textMuted} accessible={false} />
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

// ─── Error state ─────────────────────────────────────────────────────────────
function ErrorState({
  styles,
  colors,
  onRetry,
  t }: {
  styles: ReturnType<typeof createStyles>;
  colors: ReturnType<typeof useAppTheme>['colors'];
  onRetry: () => void;
  t: (key: string) => string;
}) {
  return (
    <View style={styles.errorWrap}>
      <Ionicons name="cloud-offline-outline" size={28} color={colors.textMuted} accessible={false} />
      <Text style={[styles.errorTitle, { color: colors.textPrimary }]}>
        {t('error.title')}
      </Text>
      <Text style={[styles.errorSubtitle, { color: colors.textSecondary }]}>
        {t('error.subtitle')}
      </Text>
      <AnimatedPressable
        onPress={onRetry}
        scaleValue={0.97}
        hapticFeedback="light"
        style={[styles.retryBtn, { borderColor: colors.border }]}
        accessibilityRole="button"
        accessibilityLabel={t('error.retry')}
      >
        <Text style={[styles.retryText, { color: colors.textPrimary }]}>{t('error.retry')}</Text>
      </AnimatedPressable>
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────
function createStyles(colors: ReturnType<typeof useAppTheme>['colors']) {
  return StyleSheet.create({
    scroll: {
      flex: 1 },
    scrollContent: {
      paddingBottom: Space.xxl },
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
      fontFamily: Typography.family.medium },
    demoLine: {
      fontSize: TypographyV2.meta.size,
      lineHeight: TypographyV2.meta.lineHeight,
      fontFamily: Typography.family.regular,
      paddingHorizontal: Space.md,
      paddingTop: Space.md },
    sectionWrap: {
      marginTop: Space.lg,
      paddingHorizontal: Space.md },
    sectionLabel: {
      fontSize: TypographyV2.meta.size,
      lineHeight: TypographyV2.meta.lineHeight,
      fontFamily: Typography.family.semibold,
      marginBottom: Space.sm },
    emptyWrap: {
      alignItems: 'center',
      paddingHorizontal: Space.md,
      paddingVertical: Space.xl },
    emptyTitle: {
      fontSize: TypographyV2.bodyStrong.size,
      fontFamily: Typography.family.semibold },
    emptySubtitle: {
      fontSize: TypographyV2.body.size,
      lineHeight: TypographyV2.body.lineHeight,
      fontFamily: Typography.family.regular,
      color: colors.textSecondary,
      textAlign: 'center',
      marginTop: Space.xs },
    offlineWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.sm,
      paddingHorizontal: Space.md,
      paddingVertical: Space.md },
    offlineText: {
      flex: 1,
      fontSize: TypographyV2.body.size,
      lineHeight: TypographyV2.body.lineHeight,
      fontFamily: Typography.family.regular },
    skeletonWrap: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: Space.sm,
      paddingHorizontal: Space.md,
      paddingTop: Space.lg },
    skeletonChip: {
      height: Control.hit - 8,
      borderRadius: Radius.md },
    errorWrap: {
      alignItems: 'center',
      paddingHorizontal: Space.md,
      paddingVertical: Space.xl },
    errorTitle: {
      fontSize: TypographyV2.bodyStrong.size,
      fontFamily: Typography.family.semibold,
      marginTop: Space.md },
    errorSubtitle: {
      fontSize: TypographyV2.body.size,
      fontFamily: Typography.family.regular,
      color: colors.textSecondary,
      textAlign: 'center',
      marginTop: Space.xs },
    retryBtn: {
      marginTop: Space.md,
      minHeight: Control.hit,
      paddingHorizontal: Space.lg,
      borderRadius: Radius.md,
      borderWidth: StyleSheet.hairlineWidth,
      alignItems: 'center',
      justifyContent: 'center' },
    retryText: {
      fontSize: TypographyV2.body.size,
      fontFamily: Typography.family.medium },
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
      fontFamily: Typography.family.semibold,
      marginBottom: Space.md },
    sheetRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      minHeight: Control.hit + 4,
      borderRadius: Radius.md,
      paddingHorizontal: Space.md },
    sheetRowText: {
      fontSize: TypographyV2.body.size,
      fontFamily: Typography.family.medium },
    sheetRowDanger: {
      fontSize: TypographyV2.body.size,
      fontFamily: Typography.family.medium,
      color: colors.danger },
    sheetLockHint: {
      fontSize: TypographyV2.meta.size,
      lineHeight: TypographyV2.meta.lineHeight,
      fontFamily: Typography.family.regular,
      color: colors.textMuted,
      marginTop: Space.sm },
  });
}
