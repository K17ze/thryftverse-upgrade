/**
 * YourAlgorithmScreen — Algorithm transparency dashboard
 *
 * A flagship trust surface showing exactly which topics and signals shape the
 * user's feed. Users can adjust topic weights, remove topics, add new
 * interests, and see recent behavioural signals.
 *
 * Per AGENTS.md §11 (Truthful UI): the service is mock, so a "Demo mode"
 * indicator is always shown. We never claim that changes affect the feed in
 * demo mode — weight/remove/add operations update the session profile but the
 * indicator makes clear the data is illustrative.
 *
 * Design (per AGENTS.md §4):
 * - Flat composition, hairline separators, no card-on-card
 * - One dominant panel (the topic list)
 * - Max two non-avatar radius sizes (Radius.md for chips, Radius.lg for inputs)
 * - Max three type sizes per viewport (title, body, caption)
 * - All colors via useAppTheme(), all geometry via design tokens
 *
 * State coverage (per AGENTS.md §14):
 * - Loading: skeleton placeholders matching final geometry
 * - Populated: full profile
 * - Empty: "No topics yet — your feed is based on general popularity"
 * - Error: error state with retry
 * - Offline: offline banner
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  interpolate,
  Extrapolation } from 'react-native-reanimated';
import { RootStackParamList } from '../navigation/types';
import { useAppTheme } from '../theme/ThemeContext';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { useHaptic } from '../hooks/useHaptic';
import { useMotionConfig } from '../hooks/useMotionConfig';
import { FlagshipScreen, FlagshipHeader } from '../components/flagship';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { AppInput } from '../components/ui/AppInput';
import { CachedImage } from '../components/CachedImage';

import {
  AlgorithmTransparencyProfile,
  AlgorithmTopic,
  AlgorithmSignal,
  TopicWeight,
  SignalSource,
  ALGORITHM_DEMO_MODE,
  fetchAlgorithmProfile,
  updateTopicWeight,
  removeTopic,
  addTopic } from '../services/algorithmTransparencyApi';

import { Space, Radius, Typography, Control, Stroke } from '../theme/designTokens';
import { TypographyV2 } from '../theme/typography.v2';
import { useAppTranslation } from '../i18n/useAppTranslation';

type Props = NativeStackScreenProps<RootStackParamList, 'YourAlgorithm'>;

// ─── Category options for the add-topic picker ───────────────────────────────
const TOPIC_CATEGORIES = [
  'Brand affinity',
  'Category preference',
  'Price sensitivity',
  'Style preferences',
  'Sustainability interest',
  'Location-based',
  'Social signals',
] as const;

// ─── Weight metadata ─────────────────────────────────────────────────────────
const WEIGHT_META: Record<TopicWeight, { dotCount: number }> = {
  low: { dotCount: 1 },
  medium: { dotCount: 2 },
  high: { dotCount: 3 } };

const WEIGHT_ORDER: TopicWeight[] = ['low', 'medium', 'high'];

const WEIGHT_LABEL_FN: Record<TopicWeight, (t: (key: string) => string) => string> = {
  low: (t) => t('weight.low'),
  medium: (t) => t('weight.medium'),
  high: (t) => t('weight.high'),
};

const SOURCE_LABEL_FN: Record<SignalSource, (t: (key: string) => string) => string> = {
  explicit: (t) => t('source.explicit'),
  implicit: (t) => t('source.implicit'),
  inferred: (t) => t('source.inferred'),
};

// ─── Screen status ───────────────────────────────────────────────────────────
type ScreenStatus = 'loading' | 'populated' | 'empty' | 'error' | 'offline';

export default function YourAlgorithmScreen({ navigation }: Props) {
  const { colors } = useAppTheme();
  const reducedMotion = useReducedMotion();
  const haptic = useHaptic();
  const { spring } = useMotionConfig();
  const { t } = useAppTranslation('algorithm');

  const [profile, setProfile] = useState<AlgorithmTransparencyProfile | null>(null);
  const [status, setStatus] = useState<ScreenStatus>('loading');
  const [expandedTopicId, setExpandedTopicId] = useState<string | null>(null);
  const [howItWorksExpanded, setHowItWorksExpanded] = useState(false);
  const [updatingTopicId, setUpdatingTopicId] = useState<string | null>(null);
  const [removingTopicId, setRemovingTopicId] = useState<string | null>(null);
  const [newTopicLabel, setNewTopicLabel] = useState('');
  const [newTopicCategory, setNewTopicCategory] = useState<string>(TOPIC_CATEGORIES[0]);
  const [categoryPickerOpen, setCategoryPickerOpen] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [isOffline, setIsOffline] = useState(false);

  // ── Load profile ──
  const loadProfile = useCallback(async () => {
    setStatus('loading');
    try {
      const data = await fetchAlgorithmProfile();
      setProfile(data);
      setIsOffline(false);
      setStatus(data.topics.length === 0 ? 'empty' : 'populated');
    } catch (e) {
      // Distinguish offline from generic errors via a simple heuristic.
      const msg = e instanceof Error ? e.message : '';
      if (/network|offline|fetch/i.test(msg)) {
        setIsOffline(true);
        setStatus('offline');
      } else {
        setStatus('error');
      }
    }
  }, []);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  // ── Handlers ──
  const handleToggleExpand = useCallback(
    (topicId: string) => {
      haptic.selection();
      setExpandedTopicId((prev) => (prev === topicId ? null : topicId));
    },
    [haptic],
  );

  const handleWeightChange = useCallback(
    async (topicId: string, weight: TopicWeight) => {
      haptic.light();
      setUpdatingTopicId(topicId);
      try {
        const updated = await updateTopicWeight(topicId, weight);
        if (updated && profile) {
          setProfile({
            ...profile,
            topics: profile.topics.map((t) => (t.id === topicId ? updated : t)) });
        }
      } finally {
        setUpdatingTopicId(null);
      }
    },
    [haptic, profile],
  );

  const handleRemoveTopic = useCallback(
    async (topicId: string) => {
      haptic.medium();
      setRemovingTopicId(topicId);
      try {
        const ok = await removeTopic(topicId);
        if (ok && profile) {
          const nextTopics = profile.topics.filter((t) => t.id !== topicId);
          setProfile({ ...profile, topics: nextTopics });
          setExpandedTopicId(null);
          if (nextTopics.length === 0) setStatus('empty');
        }
      } finally {
        setRemovingTopicId(null);
      }
    },
    [haptic, profile],
  );

  const handleAddTopic = useCallback(async () => {
    const trimmed = newTopicLabel.trim();
    if (!trimmed) return;
    haptic.light();
    setIsAdding(true);
    try {
      const created = await addTopic(trimmed, newTopicCategory);
      if (profile) {
        setProfile({ ...profile, topics: [created, ...profile.topics] });
      } else {
        setProfile({
          topics: [created],
          signals: [],
          recentInfluences: [],
          lastUpdated: new Date().toISOString(),
          isDemo: ALGORITHM_DEMO_MODE });
      }
      setNewTopicLabel('');
      setStatus('populated');
    } finally {
      setIsAdding(false);
    }
  }, [newTopicLabel, newTopicCategory, haptic, profile]);

  const handleRetry = useCallback(() => {
    loadProfile();
  }, [loadProfile]);

  // ── Derived ──
  const topicCount = profile?.topics.length ?? 0;
  const signalCount = profile?.signals.length ?? 0;
  const lastUpdatedLabel = useMemo(() => {
    if (!profile?.lastUpdated) return '—';
    try {
      const d = new Date(profile.lastUpdated);
      const now = new Date();
      const diffMs = now.getTime() - d.getTime();
      const diffH = Math.floor(diffMs / 3_600_000);
      if (diffH < 1) return t('time.justNow');
      if (diffH < 24) return t('time.hoursAgo', { count: diffH });
      const diffD = Math.floor(diffH / 24);
      return t('time.daysAgo', { count: diffD });
    } catch {
      return '—';
    }
  }, [profile?.lastUpdated, t]);

  const styles = useMemo(() => createStyles(colors), [colors]);

  // ── Render ──
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
      {/* ── Demo mode indicator (truthful UI per AGENTS.md §11) ── */}
      {ALGORITHM_DEMO_MODE && (
        <View
          style={[styles.demoBanner, { backgroundColor: colors.surfaceAlt }]}
          accessibilityRole="header"
          accessibilityLabel="Demo mode"
        >
          <Ionicons name="information-circle-outline" size={16} color={colors.textSecondary} />
          <Text style={styles.demoBannerText}>
            {t('demo.banner')}
          </Text>
        </View>
      )}

      {/* ── Offline banner ── */}
      {isOffline && status !== 'loading' && (
        <View
          style={[styles.offlineBanner, { backgroundColor: colors.surfaceAlt }]}
          accessibilityRole="header"
          accessibilityLabel="Offline"
        >
          <Ionicons name="cloud-offline-outline" size={16} color={colors.textSecondary} />
          <Text style={styles.offlineBannerText}>
            {t('offline.banner')}
          </Text>
        </View>
      )}

      {/* ── Loading state: skeleton ── */}
      {status === 'loading' && <LoadingSkeleton styles={styles} colors={colors} />}

      {/* ── Error state ── */}
      {status === 'error' && (
        <ErrorState styles={styles} colors={colors} onRetry={handleRetry} t={t} />
      )}

      {/* ── Populated / Empty / Offline-with-data ── */}
      {(status === 'populated' || status === 'empty' || (status === 'offline' && profile !== null)) && profile && (
        <View>
          {/* ── Summary strip (flat, hairline-separated) ── */}
          <View style={styles.summaryStrip}>
            <SummaryStat
              value={String(topicCount)}
              label={t('summary.activeTopics')}
              colors={colors}
              styles={styles}
            />
            <View style={[styles.summaryDivider, { backgroundColor: colors.border }]} />
            <SummaryStat
              value={String(signalCount)}
              label={t('summary.signals')}
              colors={colors}
              styles={styles}
            />
            <View style={[styles.summaryDivider, { backgroundColor: colors.border }]} />
            <SummaryStat
              value={lastUpdatedLabel}
              label={t('summary.lastUpdated')}
              colors={colors}
              styles={styles}
            />
          </View>

          {/* ── How this works (expandable, collapsed by default) ── */}
          <HowItWorks
            expanded={howItWorksExpanded}
            onToggle={() => {
              haptic.selection();
              setHowItWorksExpanded((p) => !p);
            }}
            colors={colors}
            styles={styles}
            reducedMotion={reducedMotion}
            spring={spring}
            t={t}
          />

          {/* ── Empty state ── */}
          {status === 'empty' && (
            <View style={styles.emptyStateWrap}>
              <View style={[styles.emptyIconCircle, { backgroundColor: colors.surfaceAlt }]}>
                <Ionicons name="git-network-outline" size={28} color={colors.textMuted} />
              </View>
              <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>
                {t('empty.title')}
              </Text>
              <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
                {t('empty.subtitle')}
              </Text>
            </View>
          )}

          {/* ── Topics section (the dominant panel) ── */}
          {status !== 'empty' && profile.topics.length > 0 && (
            <View style={styles.sectionWrap}>
              <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
                {t('topics.title')}
              </Text>
              <Text style={[styles.sectionCaption, { color: colors.textMuted }]}>
                {t('topics.caption')}
              </Text>

              <View style={styles.topicList}>
                {profile.topics.map((topic, index) => (
                  <TopicRow
                    key={topic.id}
                    topic={topic}
                    isExpanded={expandedTopicId === topic.id}
                    onToggle={() => handleToggleExpand(topic.id)}
                    onWeightChange={(w) => handleWeightChange(topic.id, w)}
                    onRemove={() => handleRemoveTopic(topic.id)}
                    isUpdating={updatingTopicId === topic.id}
                    isRemoving={removingTopicId === topic.id}
                    isLast={index === profile.topics.length - 1}
                    colors={colors}
                    styles={styles}
                    reducedMotion={reducedMotion}
                    spring={spring}
                    haptic={haptic}
                    t={t}
                  />
                ))}
              </View>
            </View>
          )}

          {/* ── Recent signals section ── */}
          {profile.recentInfluences.length > 0 && (
            <View style={styles.sectionWrap}>
              <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
                {t('signals.title')}
              </Text>
              <Text style={[styles.sectionCaption, { color: colors.textMuted }]}>
                {t('signals.caption')}
              </Text>
              <View style={styles.signalList}>
                {profile.recentInfluences.map((signal, index) => (
                  <SignalRow
                    key={signal.id}
                    signal={signal}
                    isLast={index === profile.recentInfluences.length - 1}
                    colors={colors}
                    styles={styles}
                    t={t}
                  />
                ))}
              </View>
            </View>
          )}

          {/* ── Add a topic section ── */}
          <View style={styles.sectionWrap}>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
              {t('addTopic.title')}
            </Text>
            <Text style={[styles.sectionCaption, { color: colors.textMuted }]}>
              {t('addTopic.caption')}
              {ALGORITHM_DEMO_MODE ? ' ' + t('addTopic.demoSuffix') : ''}
            </Text>

            <View style={styles.addTopicRow}>
              <AppInput
                placeholder={t('addTopic.placeholder')}
                value={newTopicLabel}
                onChangeText={setNewTopicLabel}
                accessibilityLabel="Topic label input"
                accessibilityHint="Enter the name of a topic to add to your algorithm profile"
                returnKeyType="done"
                onSubmitEditing={handleAddTopic}
                inputContainerStyle={styles.topicInput}
              />
            </View>

            {/* Category picker — flat, not a separate card */}
            <Pressable
              style={[styles.categoryPicker, { borderColor: colors.border, backgroundColor: colors.input }]}
              onPress={() => {
                haptic.selection();
                setCategoryPickerOpen((p) => !p);
              }}
              accessibilityRole="button"
              accessibilityLabel={`Category: ${newTopicCategory}`}
              accessibilityHint="Opens the category picker for the new topic"
            >
              <Text style={[styles.categoryPickerLabel, { color: colors.inputText }]} numberOfLines={1}>
                {newTopicCategory}
              </Text>
              <Ionicons
                name={categoryPickerOpen ? 'chevron-up' : 'chevron-down'}
                size={18}
                color={colors.textMuted}
              />
            </Pressable>

            {categoryPickerOpen && (
              <ScrollView
                style={[styles.categoryList, { borderColor: colors.border }]}
                nestedScrollEnabled
                accessibilityRole="list"
                accessibilityLabel="Category options"
              >
                {TOPIC_CATEGORIES.map((cat, i) => {
                  const selected = cat === newTopicCategory;
                  return (
                    <Pressable
                      key={cat}
                      style={[
                        styles.categoryOption,
                        i < TOPIC_CATEGORIES.length - 1 && {
                          borderBottomColor: colors.borderSubtle,
                          borderBottomWidth: StyleSheet.hairlineWidth },
                      ]}
                      onPress={() => {
                        haptic.selection();
                        setNewTopicCategory(cat);
                        setCategoryPickerOpen(false);
                      }}
                      accessibilityRole="button"
                      accessibilityLabel={`Select category ${cat}`}
                      accessibilityState={{ selected }}
                    >
                      <Text
                        style={[
                          styles.categoryOptionText,
                          { color: selected ? colors.textPrimary : colors.textSecondary },
                          selected && { fontFamily: Typography.family.semibold },
                        ]}
                      >
                        {cat}
                      </Text>
                      {selected && (
                        <Ionicons name="checkmark" size={18} color={colors.textPrimary} />
                      )}
                    </Pressable>
                  );
                })}
              </ScrollView>
            )}

            <AnimatedPressable
              onPress={handleAddTopic}
              disabled={!newTopicLabel.trim() || isAdding}
              scaleValue={0.97}
              hapticFeedback="light"
              style={[
                styles.addBtn,
                {
                  backgroundColor: !newTopicLabel.trim() || isAdding ? colors.surfaceAlt : colors.brand },
              ]}
              accessibilityRole="button"
              accessibilityLabel="Add topic"
              accessibilityHint="Adds the entered topic to your algorithm profile"
              accessibilityState={{ disabled: !newTopicLabel.trim() || isAdding }}
            >
              {isAdding ? (
                <ActivityIndicator size="small" color={colors.textInverse} />
              ) : (
                <Text
                  style={[
                    styles.addBtnText,
                    { color: !newTopicLabel.trim() ? colors.textMuted : colors.textInverse },
                  ]}
                >
                  {t('addTopic.addBtn')}
                </Text>
              )}
            </AnimatedPressable>
          </View>
        </View>
      )}
    </FlagshipScreen>
  );
}

// ─── Summary stat (flat, no card) ────────────────────────────────────────────
function SummaryStat({
  value,
  label,
  colors,
  styles }: {
  value: string;
  label: string;
  colors: ReturnType<typeof useAppTheme>['colors'];
  styles: ReturnType<typeof createStyles>;
}) {
  return (
    <View style={styles.summaryStat} accessibilityRole="text">
      <Text style={[styles.summaryValue, { color: colors.textPrimary }]} numberOfLines={1}>
        {value}
      </Text>
      <Text style={[styles.summaryLabel, { color: colors.textMuted }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

// ─── How it works (expandable) ───────────────────────────────────────────────
function HowItWorks({
  expanded,
  onToggle,
  colors,
  styles,
  reducedMotion,
  spring,
  t }: {
  expanded: boolean;
  onToggle: () => void;
  colors: ReturnType<typeof useAppTheme>['colors'];
  styles: ReturnType<typeof createStyles>;
  reducedMotion: boolean;
  spring: ReturnType<typeof useMotionConfig>['spring'];
  t: (key: string, options?: Record<string, unknown>) => string;
}) {
  const contentHeight = useSharedValue(0);
  const animatedHeight = useSharedValue(0);
  const rotate = useSharedValue(0);

  useEffect(() => {
    if (reducedMotion) {
      animatedHeight.value = expanded ? contentHeight.value : 0;
      rotate.value = expanded ? 1 : 0;
    } else {
      animatedHeight.value = withSpring(expanded ? contentHeight.value : 0, spring.entrance);
      rotate.value = withSpring(expanded ? 1 : 0, spring.press);
    }
  }, [expanded, reducedMotion, spring, animatedHeight, rotate, contentHeight]);

  const heightStyle = useAnimatedStyle(() => ({
    height: animatedHeight.value,
    opacity: interpolate(animatedHeight.value, [0, 10], [0, 1], Extrapolation.CLAMP) }));

  const chevronStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${interpolate(rotate.value, [0, 1], [0, 180])}deg` }] }));

  return (
    <View style={styles.howItWorksWrap}>
      <Pressable
        style={styles.howItWorksHeader}
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityLabel="How this works"
        accessibilityHint={expanded ? 'Collapses the explanation' : 'Expands the explanation'}
        accessibilityState={{ expanded }}
      >
        <Text style={[styles.howItWorksTitle, { color: colors.textPrimary }]}>
          {t('howItWorks.title')}
        </Text>
        <Reanimated.View style={chevronStyle}>
          <Ionicons name="chevron-down" size={18} color={colors.textMuted} />
        </Reanimated.View>
      </Pressable>

      <Reanimated.View style={heightStyle} pointerEvents={expanded ? 'auto' : 'none'}>
        <View
          onLayout={(e) => {
            contentHeight.value = e.nativeEvent.layout.height;
            if (expanded) animatedHeight.value = e.nativeEvent.layout.height;
          }}
          style={styles.howItWorksContent}
        >
          <Text style={[styles.howItWorksBody, { color: colors.textSecondary }]}>
            {t('howItWorks.body1')}
          </Text>
          <Text style={[styles.howItWorksBody, { color: colors.textSecondary }]}>
            {t('howItWorks.body2')}
          </Text>
          {ALGORITHM_DEMO_MODE && (
            <Text style={[styles.howItWorksDemo, { color: colors.textMuted }]}>
              {t('howItWorks.demoNote')}
            </Text>
          )}
        </View>
      </Reanimated.View>
    </View>
  );
}

// ─── Topic row (expandable) ──────────────────────────────────────────────────
function TopicRow({
  topic,
  isExpanded,
  onToggle,
  onWeightChange,
  onRemove,
  isUpdating,
  isRemoving,
  isLast,
  colors,
  styles,
  reducedMotion,
  spring,
  haptic,
  t }: {
  topic: AlgorithmTopic;
  isExpanded: boolean;
  onToggle: () => void;
  onWeightChange: (w: TopicWeight) => void;
  onRemove: () => void;
  isUpdating: boolean;
  isRemoving: boolean;
  isLast: boolean;
  colors: ReturnType<typeof useAppTheme>['colors'];
  styles: ReturnType<typeof createStyles>;
  reducedMotion: boolean;
  spring: ReturnType<typeof useMotionConfig>['spring'];
  haptic: ReturnType<typeof useHaptic>;
  t: (key: string, options?: Record<string, unknown>) => string;
}) {
  const contentHeight = useSharedValue(0);
  const animatedHeight = useSharedValue(0);
  const rotate = useSharedValue(0);

  useEffect(() => {
    if (reducedMotion) {
      animatedHeight.value = isExpanded ? contentHeight.value : 0;
      rotate.value = isExpanded ? 1 : 0;
    } else {
      animatedHeight.value = withSpring(isExpanded ? contentHeight.value : 0, spring.entrance);
      rotate.value = withSpring(isExpanded ? 1 : 0, spring.press);
    }
  }, [isExpanded, reducedMotion, spring, animatedHeight, rotate, contentHeight]);

  const heightStyle = useAnimatedStyle(() => ({
    height: animatedHeight.value,
    opacity: interpolate(animatedHeight.value, [0, 10], [0, 1], Extrapolation.CLAMP) }));

  const chevronStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${interpolate(rotate.value, [0, 1], [0, 180])}deg` }] }));

  const weightMeta = WEIGHT_META[topic.weight];
  const weightLabel = WEIGHT_LABEL_FN[topic.weight](t);
  const sourceLabel = SOURCE_LABEL_FN[topic.source](t);

  return (
    <View>
      <Pressable
        style={[styles.topicRow, !isLast && { borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth }]}
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityLabel={`${topic.label}, ${topic.category}, ${t('topics.influenceWeight')} ${weightLabel}, ${sourceLabel}`}
        accessibilityHint={isExpanded ? 'Collapses topic controls' : 'Expands to show weight and remove controls'}
        accessibilityState={{ expanded: isExpanded }}
      >
        <View style={styles.topicMain}>
          <Text style={[styles.topicLabel, { color: colors.textPrimary }]} numberOfLines={1}>
            {topic.label}
          </Text>
          <View style={styles.topicMetaRow}>
            <Text style={[styles.topicCategory, { color: colors.textMuted }]} numberOfLines={1}>
              {topic.category}
            </Text>
            <View style={styles.topicMetaGap} />
            {/* Weight indicator — dots, not colour alone */}
            <View style={styles.weightDots}>
              {[1, 2, 3].map((n) => (
                <View
                  key={n}
                  style={[
                    styles.weightDot,
                    {
                      backgroundColor: n <= weightMeta.dotCount ? colors.textPrimary : colors.border },
                  ]}
                />
              ))}
            </View>
            <Text style={[styles.topicSource, { color: colors.textMuted }]}>
              {SOURCE_LABEL_FN[topic.source](t)}
            </Text>
          </View>
        </View>

        <View style={styles.topicRight}>
          {!topic.removable && (
            <Ionicons
              name="lock-closed"
              size={16}
              color={colors.textMuted}
              accessibilityLabel="Kept for trust, influence can be paused"
            />
          )}
          <Reanimated.View style={chevronStyle}>
            <Ionicons name="chevron-down" size={18} color={colors.textMuted} />
          </Reanimated.View>
        </View>
      </Pressable>

      <Reanimated.View style={heightStyle} pointerEvents={isExpanded ? 'auto' : 'none'}>
        <View
          onLayout={(e) => {
            contentHeight.value = e.nativeEvent.layout.height;
            if (isExpanded) animatedHeight.value = e.nativeEvent.layout.height;
          }}
          style={styles.topicExpandedContent}
        >
          {/* Weight selector */}
          <Text style={[styles.controlLabel, { color: colors.textMuted }]}>
            Influence weight
          </Text>
          <View
            style={styles.weightSelector}
            accessibilityRole="radiogroup"
            accessibilityLabel="Influence weight"
          >
            {WEIGHT_ORDER.map((w) => {
              const selected = topic.weight === w;
              return (
                <Pressable
                  key={w}
                  style={[
                    styles.weightOption,
                    {
                      backgroundColor: selected ? colors.brand : 'transparent',
                      borderColor: selected ? colors.brand : colors.border },
                  ]}
                  onPress={() => onWeightChange(w)}
                  disabled={isUpdating}
                  accessibilityRole="radio"
                  accessibilityLabel={`${WEIGHT_LABEL_FN[w](t)} weight`}
                  accessibilityState={{ selected, disabled: isUpdating }}
                >
                  <Text
                    style={[
                      styles.weightOptionText,
                      { color: selected ? colors.textInverse : colors.textPrimary },
                    ]}
                  >
                    {WEIGHT_LABEL_FN[w](t)}
                  </Text>
                </Pressable>
              );
            })}
            {isUpdating && <ActivityIndicator size="small" color={colors.textMuted} style={styles.weightUpdating} />}
          </View>

          {/* Remove / lock hint */}
          {topic.removable ? (
            <Pressable
              style={styles.removeBtn}
              onPress={onRemove}
              disabled={isRemoving}
              accessibilityRole="button"
              accessibilityLabel={`Remove ${topic.label}`}
              accessibilityHint="Removes this topic from your algorithm profile"
              accessibilityState={{ disabled: isRemoving }}
            >
              {isRemoving ? (
                <ActivityIndicator size="small" color={colors.danger} />
              ) : (
                <>
                  <Ionicons name="trash-outline" size={16} color={colors.danger} />
                  <Text style={[styles.removeBtnText, { color: colors.danger }]}>
                    Remove topic
                  </Text>
                </>
              )}
            </Pressable>
          ) : (
            <View style={styles.lockHint}>
              <Ionicons name="lock-closed-outline" size={16} color={colors.textMuted} />
              <Text style={[styles.lockHintText, { color: colors.textMuted }]}>
                Kept for trust and accounting. You can pause its influence on your feed.
              </Text>
            </View>
          )}
        </View>
      </Reanimated.View>
    </View>
  );
}

// ─── Signal row (compact) ────────────────────────────────────────────────────
function SignalRow({
  signal,
  isLast,
  colors,
  styles,
  t }: {
  signal: AlgorithmSignal;
  isLast: boolean;
  colors: ReturnType<typeof useAppTheme>['colors'];
  styles: ReturnType<typeof createStyles>;
  t: (key: string) => string;
}) {
  const timeLabel = useMemo(() => {
    try {
      const d = new Date(signal.lastSeen);
      const now = new Date();
      const diffMs = now.getTime() - d.getTime();
      const diffH = Math.floor(diffMs / 3_600_000);
      if (diffH < 1) return 'Just now';
      if (diffH < 24) return `${diffH}h ago`;
      const diffD = Math.floor(diffH / 24);
      return `${diffD}d ago`;
    } catch {
      return '';
    }
  }, [signal.lastSeen]);

  return (
    <View
      style={[styles.signalRow, !isLast && { borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth }]}
      accessibilityRole="text"
      accessibilityLabel={`${signal.label}, ${SOURCE_LABEL_FN[signal.type](t)}, ${timeLabel}`}
    >
      <View style={styles.signalMain}>
        <Text style={[styles.signalLabel, { color: colors.textPrimary }]} numberOfLines={2}>
          {signal.label}
        </Text>
        <Text style={[styles.signalMeta, { color: colors.textMuted }]}>
          {SOURCE_LABEL_FN[signal.type](t)} · {timeLabel}
        </Text>
      </View>
      {/* Weight bar — relative influence, not a percentage */}
      <View style={styles.signalWeightBar}>
        <View
          style={[
            styles.signalWeightFill,
            { width: `${Math.round(signal.weight * 100)}%`, backgroundColor: colors.textPrimary },
          ]}
        />
      </View>
    </View>
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
    <View>
      {/* Summary skeleton */}
      <View style={styles.summaryStrip}>
        {[0, 1, 2].map((i) => (
          <View key={i} style={styles.skeletonSummaryItem}>
            <View style={[styles.skeletonLine, styles.skeletonValue, { backgroundColor: colors.surfaceAlt }]} />
            <View style={[styles.skeletonLine, styles.skeletonLabel, { backgroundColor: colors.surfaceAlt }]} />
          </View>
        ))}
      </View>

      {/* How it works skeleton */}
      <View style={[styles.howItWorksWrap, { borderBottomColor: colors.border }]}>
        <View style={styles.howItWorksHeader}>
          <View style={[styles.skeletonLine, { width: 120, height: 16, backgroundColor: colors.surfaceAlt }]} />
        </View>
      </View>

      {/* Topic list skeleton */}
      <View style={styles.sectionWrap}>
        <View style={[styles.skeletonLine, { width: 200, height: 18, backgroundColor: colors.surfaceAlt }]} />
        <View style={styles.topicList}>
          {[0, 1, 2, 3, 4].map((i) => (
            <View
              key={i}
              style={[styles.topicRow, i < 4 && { borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth }]}
            >
              <View style={styles.topicMain}>
                <View style={[styles.skeletonLine, { width: 140, height: 16, backgroundColor: colors.surfaceAlt }]} />
                <View style={[styles.skeletonLine, { width: 90, height: 12, marginTop: Space.xs, backgroundColor: colors.surfaceAlt }]} />
              </View>
            </View>
          ))}
        </View>
      </View>
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
      <View style={[styles.errorIconCircle, { backgroundColor: colors.surfaceAlt }]}>
        <Ionicons name="alert-circle-outline" size={28} color={colors.textMuted} />
      </View>
      <Text style={[styles.errorTitle, { color: colors.textPrimary }]}>
        Couldn't load your algorithm
      </Text>
      <Text style={[styles.errorSubtitle, { color: colors.textSecondary }]}>
        We couldn't fetch your algorithm profile. Check your connection and try again.
      </Text>
      <AnimatedPressable
        onPress={onRetry}
        scaleValue={0.96}
        hapticFeedback="light"
        style={[styles.retryBtn, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}
        accessibilityRole="button"
        accessibilityLabel="Retry"
        accessibilityHint="Tries loading your algorithm profile again"
      >
        <Text style={[styles.retryBtnText, { color: colors.textPrimary }]}>Retry</Text>
      </AnimatedPressable>
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────
function createStyles(colors: ReturnType<typeof useAppTheme>['colors']) {
  return StyleSheet.create({
    // Demo banner
    demoBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs,
      paddingHorizontal: Space.md,
      paddingVertical: Space.sm,
      borderRadius: Radius.md,
      marginBottom: Space.md },
    demoBannerText: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      letterSpacing: TypographyV2.meta.letterSpacing,
      lineHeight: TypographyV2.meta.lineHeight,
      color: colors.textSecondary,
      flex: 1 },

    // Offline banner
    offlineBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs,
      paddingHorizontal: Space.md,
      paddingVertical: Space.sm,
      borderRadius: Radius.md,
      marginBottom: Space.md },
    offlineBannerText: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      letterSpacing: TypographyV2.meta.letterSpacing,
      lineHeight: TypographyV2.meta.lineHeight,
      color: colors.textSecondary,
      flex: 1 },

    // Summary strip — flat, hairline-separated
    summaryStrip: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: Space.md,
      marginBottom: Space.sm },
    summaryStat: {
      flex: 1,
      alignItems: 'center' },
    summaryValue: {
      fontSize: TypographyV2.sectionTitle.size,
      fontFamily: TypographyV2.sectionTitle.fontFamily,
      letterSpacing: TypographyV2.sectionTitle.letterSpacing,
      lineHeight: TypographyV2.sectionTitle.lineHeight },
    summaryLabel: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      letterSpacing: TypographyV2.meta.letterSpacing,
      lineHeight: TypographyV2.meta.lineHeight,
      marginTop: Space.xs / 2 },
    summaryDivider: {
      width: StyleSheet.hairlineWidth,
      height: Space.xl },

    // How it works
    howItWorksWrap: {
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
      marginBottom: Space.lg },
    howItWorksHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: Space.md,
      minHeight: Control.hit },
    howItWorksTitle: {
      fontSize: TypographyV2.bodyStrong.size,
      fontFamily: TypographyV2.bodyStrong.fontFamily,
      letterSpacing: TypographyV2.bodyStrong.letterSpacing,
      lineHeight: TypographyV2.bodyStrong.lineHeight },
    howItWorksContent: {
      paddingBottom: Space.md,
      position: 'absolute',
      left: 0,
      right: 0,
      top: 0 },
    howItWorksBody: {
      fontSize: TypographyV2.body.size,
      fontFamily: TypographyV2.body.fontFamily,
      letterSpacing: TypographyV2.body.letterSpacing,
      lineHeight: TypographyV2.body.lineHeight,
      marginBottom: Space.sm },
    howItWorksDemo: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      letterSpacing: TypographyV2.meta.letterSpacing,
      lineHeight: TypographyV2.meta.lineHeight,
      marginTop: Space.xs },

    // Sections
    sectionWrap: {
      marginBottom: Space.lg },
    sectionTitle: {
      fontSize: TypographyV2.bodyStrong.size,
      fontFamily: TypographyV2.bodyStrong.fontFamily,
      letterSpacing: TypographyV2.bodyStrong.letterSpacing,
      lineHeight: TypographyV2.bodyStrong.lineHeight,
      marginBottom: Space.xs },
    sectionCaption: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      letterSpacing: TypographyV2.meta.letterSpacing,
      lineHeight: TypographyV2.meta.lineHeight,
      marginBottom: Space.md },

    // Topic list — the dominant panel (flat with hairlines)
    topicList: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border },
    topicRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: Space.md,
      minHeight: Control.hit + Space.sm,
      gap: Space.sm },
    topicMain: {
      flex: 1,
      minWidth: 0 },
    topicLabel: {
      fontSize: TypographyV2.body.size,
      fontFamily: TypographyV2.body.fontFamily,
      letterSpacing: TypographyV2.body.letterSpacing,
      lineHeight: TypographyV2.body.lineHeight },
    topicMetaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: Space.xs },
    topicCategory: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      letterSpacing: TypographyV2.meta.letterSpacing,
      lineHeight: TypographyV2.meta.lineHeight },
    topicMetaGap: {
      width: Space.sm },
    weightDots: {
      flexDirection: 'row',
      gap: Space.xs },
    weightDot: {
      width: Space.xs + 2,
      height: Space.xs + 2,
      borderRadius: Radius.sm },
    topicSource: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      letterSpacing: TypographyV2.meta.letterSpacing,
      lineHeight: TypographyV2.meta.lineHeight,
      marginLeft: Space.sm },
    topicRight: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.sm },
    topicExpandedContent: {
      paddingBottom: Space.md,
      position: 'absolute',
      left: 0,
      right: 0,
      top: 0 },
    controlLabel: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      letterSpacing: TypographyV2.meta.letterSpacing,
      lineHeight: TypographyV2.meta.lineHeight,
      textTransform: 'uppercase',
      marginBottom: Space.sm },
    weightSelector: {
      flexDirection: 'row',
      gap: Space.sm,
      marginBottom: Space.md },
    weightOption: {
      paddingVertical: Space.sm,
      paddingHorizontal: Space.md,
      borderRadius: Radius.md,
      borderWidth: Stroke.standard,
      minHeight: Control.hit - Space.sm,
      alignItems: 'center',
      justifyContent: 'center' },
    weightOptionText: {
      fontSize: TypographyV2.body.size,
      fontFamily: TypographyV2.body.fontFamily,
      letterSpacing: TypographyV2.body.letterSpacing },
    weightUpdating: {
      marginLeft: Space.xs },
    removeBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs,
      paddingVertical: Space.sm,
      minHeight: Control.hit },
    removeBtnText: {
      fontSize: TypographyV2.body.size,
      fontFamily: TypographyV2.body.fontFamily,
      letterSpacing: TypographyV2.body.letterSpacing },
    lockHint: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs,
      paddingVertical: Space.sm },
    lockHintText: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      letterSpacing: TypographyV2.meta.letterSpacing,
      lineHeight: TypographyV2.meta.lineHeight,
      color: colors.textMuted,
      flex: 1 },

    // Signal list
    signalList: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border },
    signalRow: {
      paddingVertical: Space.md,
      minHeight: Control.hit },
    signalMain: {
      marginBottom: Space.xs },
    signalLabel: {
      fontSize: TypographyV2.body.size,
      fontFamily: TypographyV2.body.fontFamily,
      letterSpacing: TypographyV2.body.letterSpacing,
      lineHeight: TypographyV2.body.lineHeight },
    signalMeta: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      letterSpacing: TypographyV2.meta.letterSpacing,
      lineHeight: TypographyV2.meta.lineHeight,
      marginTop: Space.xs / 2 },
    signalWeightBar: {
      height: Space.xs - 1,
      borderRadius: Radius.sm,
      backgroundColor: colors.border,
      overflow: 'hidden' },
    signalWeightFill: {
      height: '100%',
      borderRadius: Radius.sm },

    // Add topic
    addTopicRow: {
      flexDirection: 'row',
      gap: Space.sm,
      marginBottom: Space.sm },
    topicInput: {
      flex: 1,
      height: Control.hit + Space.sm,
      borderRadius: Radius.lg,
      borderWidth: Stroke.standard,
      paddingHorizontal: Space.md,
      fontSize: TypographyV2.body.size,
      fontFamily: TypographyV2.body.fontFamily,
      letterSpacing: TypographyV2.body.letterSpacing },
    categoryPicker: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      height: Control.hit + Space.sm,
      borderRadius: Radius.lg,
      borderWidth: Stroke.standard,
      paddingHorizontal: Space.md,
      marginBottom: Space.sm },
    categoryPickerLabel: {
      fontSize: TypographyV2.body.size,
      fontFamily: TypographyV2.body.fontFamily,
      letterSpacing: TypographyV2.body.letterSpacing,
      flex: 1 },
    categoryList: {
      borderRadius: Radius.lg,
      borderWidth: Stroke.standard,
      maxHeight: 240,
      marginBottom: Space.sm,
      overflow: 'hidden' },
    categoryOption: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: Space.md,
      paddingHorizontal: Space.md,
      minHeight: Control.hit },
    categoryOptionText: {
      fontSize: TypographyV2.body.size,
      fontFamily: TypographyV2.body.fontFamily,
      letterSpacing: TypographyV2.body.letterSpacing },
    addBtn: {
      height: Control.hit + Space.sm,
      borderRadius: Radius.full,
      alignItems: 'center',
      justifyContent: 'center' },
    addBtnText: {
      fontSize: TypographyV2.bodyStrong.size,
      fontFamily: TypographyV2.bodyStrong.fontFamily,
      letterSpacing: TypographyV2.bodyStrong.letterSpacing },

    // Empty state
    emptyStateWrap: {
      alignItems: 'center',
      paddingVertical: Space.xl,
      paddingHorizontal: Space.md },
    emptyIconCircle: {
      width: Space.xl * 2,
      height: Space.xl * 2,
      borderRadius: Radius.full,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: Space.md },
    emptyTitle: {
      fontSize: TypographyV2.sectionTitle.size,
      fontFamily: TypographyV2.sectionTitle.fontFamily,
      letterSpacing: TypographyV2.sectionTitle.letterSpacing,
      lineHeight: TypographyV2.sectionTitle.lineHeight,
      marginBottom: Space.xs },
    emptySubtitle: {
      fontSize: TypographyV2.body.size,
      fontFamily: TypographyV2.body.fontFamily,
      letterSpacing: TypographyV2.body.letterSpacing,
      lineHeight: TypographyV2.body.lineHeight,
      textAlign: 'center' },

    // Error state
    errorWrap: {
      alignItems: 'center',
      paddingVertical: Space.xl,
      paddingHorizontal: Space.md },
    errorIconCircle: {
      width: Space.xl * 2,
      height: Space.xl * 2,
      borderRadius: Radius.full,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: Space.md },
    errorTitle: {
      fontSize: TypographyV2.sectionTitle.size,
      fontFamily: TypographyV2.sectionTitle.fontFamily,
      letterSpacing: TypographyV2.sectionTitle.letterSpacing,
      lineHeight: TypographyV2.sectionTitle.lineHeight,
      marginBottom: Space.xs },
    errorSubtitle: {
      fontSize: TypographyV2.body.size,
      fontFamily: TypographyV2.body.fontFamily,
      letterSpacing: TypographyV2.body.letterSpacing,
      lineHeight: TypographyV2.body.lineHeight,
      textAlign: 'center',
      marginBottom: Space.lg },
    retryBtn: {
      paddingHorizontal: Space.lg,
      paddingVertical: Space.smMd,
      borderRadius: Radius.full,
      borderWidth: Stroke.standard },
    retryBtnText: {
      fontSize: TypographyV2.body.size,
      fontFamily: TypographyV2.body.fontFamily,
      letterSpacing: TypographyV2.body.letterSpacing },

    // Skeleton
    skeletonLine: {
      borderRadius: Radius.sm },
    skeletonSummaryItem: {
      flex: 1,
      alignItems: 'center' },
    skeletonValue: {
      width: Space.xxl,
      height: Space.md + Space.xs },
    skeletonLabel: {
      width: Space.xl * 2,
      height: Space.md - Space.xs,
      marginTop: Space.xs } });
}
