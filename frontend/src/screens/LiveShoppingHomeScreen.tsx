/**
 * LiveShoppingHomeScreen — live commerce discovery.
 *
 * Flat canvas + hairlines + type hierarchy. Session media is the object;
 * text lives on the canvas below it. Every element renders only data the
 * session contract carries — viewer counts, watcher counts and bids render
 * only when the backend reports them (see components/live/SessionCards).
 *
 * Category filtering is derived from the categories actually present in the
 * loaded sessions — when the backend contract carries no categories the
 * filter strip is hidden rather than rendered as a dead control.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAppTheme, type ThemeColors } from '../theme/ThemeContext';
import { Space, Radius, Stroke } from '../theme/designTokens';
import { TypographyV2 } from '../theme/typography.v2';
import { RootStackParamList } from '../navigation/types';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { HorizontalRail } from '../components/HorizontalRail';
import { OfflineBanner } from '../components/OfflineBanner';
import {
  FlagshipScreen,
  FlagshipHeader,
  FlagshipState,
  SkeletonBlock,
  SkeletonTextLine } from '../components/flagship';
import {
  LiveSessionCard,
  UpcomingSessionRow,
  ReplaySessionCard,
  LIVE_CARD_WIDTH,
  UPCOMING_THUMB_SIZE } from '../components/live/SessionCards';
import { useHaptic } from '../hooks/useHaptic';
import { useFormattedPrice } from '../hooks/useFormattedPrice';
import {
  fetchLiveSessions,
  type LiveSessionSummary } from '../services/liveShoppingApi';
import { useAppTranslation } from '../i18n/useAppTranslation';

type NavT = NativeStackNavigationProp<RootStackParamList>;

const ALL_CATEGORY = 'All';

// ── Category tab (flat underline strip — text, not pills) ────────────────────
const CategoryTab = React.memo(function CategoryTab({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  const { colors } = useAppTheme();
  return (
    <AnimatedPressable
      style={styles.categoryTab}
      onPress={onPress}
      hapticFeedback="selection"
      scaleValue={0.97}
      accessibilityRole="tab"
      accessibilityState={{ selected }}
      accessibilityLabel={`${label} category${selected ? ', selected' : ''}`}
    >
      <Text
        style={[
          styles.categoryTabText,
          { color: selected ? colors.textPrimary : colors.textMuted },
        ]}
      >
        {label}
      </Text>
      <View
        style={[
          styles.categoryTabRule,
          { backgroundColor: selected ? colors.brand : 'transparent' },
        ]}
      />
    </AnimatedPressable>
  );
});

// ── Section header — title + count, type hierarchy only ──────────────────────
function SectionHeader({ title, meta }: { title: string; meta?: string }) {
  const styles = useSectionStyles();
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle} accessibilityRole="header">{title}</Text>
      {meta ? <Text style={styles.sectionMeta}>{meta}</Text> : null}
    </View>
  );
}

function useSectionStyles() {
  const { colors } = useAppTheme();
  return React.useMemo(
    () =>
      StyleSheet.create({
        sectionHeader: {
          flexDirection: 'row',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          paddingHorizontal: Space.md,
          marginBottom: Space.sm },
        sectionTitle: {
          fontSize: TypographyV2.sectionTitle.size,
          fontFamily: TypographyV2.sectionTitle.fontFamily,
          letterSpacing: TypographyV2.sectionTitle.letterSpacing,
          color: colors.textPrimary },
        sectionMeta: {
          fontSize: TypographyV2.meta.size,
          fontFamily: TypographyV2.meta.fontFamily,
          color: colors.textMuted,
          fontVariant: ['tabular-nums'] } }),
    [colors],
  );
}

// ── Loading skeleton — matches the final layout geometry ─────────────────────
function LiveHomeSkeleton() {
  const { colors } = useAppTheme();
  return (
    <View style={{ gap: Space.lg, paddingTop: Space.md }}>
      <View style={{ flexDirection: 'row', paddingHorizontal: Space.md, gap: Space.md }}>
        {Array.from({ length: 3 }).map((_, i) => (
          <View key={`live-skel-${i}`} style={{ width: LIVE_CARD_WIDTH }}>
            <SkeletonBlock width={LIVE_CARD_WIDTH} height={220} radius={Radius.lg} />
            <View style={{ paddingTop: Space.sm, gap: Space.xs }}>
              <SkeletonTextLine width="60%" height={12} />
              <SkeletonTextLine width="90%" height={16} />
            </View>
          </View>
        ))}
      </View>
      <View style={{ paddingHorizontal: Space.md }}>
        {Array.from({ length: 3 }).map((_, i) => (
          <View
            key={`upcoming-skel-${i}`}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: Space.sm,
              paddingVertical: Space.sm,
              borderBottomWidth: StyleSheet.hairlineWidth,
              borderBottomColor: colors.border }}
          >
            <SkeletonBlock width={UPCOMING_THUMB_SIZE} height={UPCOMING_THUMB_SIZE} radius={Radius.md} />
            <View style={{ flex: 1, gap: Space.xs }}>
              <SkeletonTextLine width="40%" height={11} />
              <SkeletonTextLine width="80%" height={16} />
              <SkeletonTextLine width="55%" height={11} />
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

// ── Main screen ──
export default function LiveShoppingHomeScreen() {
  const { colors } = useAppTheme();
  const styles = useStyles();
  const navigation = useNavigation<NavT>();
  const haptic = useHaptic();
  const { formatFromFiat } = useFormattedPrice();
  const { t } = useAppTranslation('liveShopping');

  const [summary, setSummary] = useState<LiveSessionSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>(ALL_CATEGORY);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);
    try {
      const result = await fetchLiveSessions();
      setSummary(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('error.loadFailed'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  // Categories are derived from what the contract actually returns — the
  // backend session model carries no category today, so on real data the
  // strip collapses to "All" and is hidden instead of being a dead control.
  const categories = useMemo(() => {
    if (!summary) return [ALL_CATEGORY];
    const seen = new Set<string>();
    for (const session of summary.sessions) {
      if (session.category && session.category !== ALL_CATEGORY) {
        seen.add(session.category);
      }
    }
    return [ALL_CATEGORY, ...Array.from(seen).sort()];
  }, [summary]);

  const filteredSessions = useMemo(() => {
    const sessions = summary?.sessions ?? [];
    if (selectedCategory === ALL_CATEGORY) return sessions;
    return sessions.filter((s) => s.category === selectedCategory);
  }, [summary, selectedCategory]);

  const liveSessions = useMemo(
    () => filteredSessions.filter((s) => s.status === 'live'),
    [filteredSessions],
  );
  const upcomingSessions = useMemo(
    () => filteredSessions.filter((s) => s.status === 'upcoming'),
    [filteredSessions],
  );
  const endedSessions = useMemo(
    () => filteredSessions.filter((s) => s.status === 'ended'),
    [filteredSessions],
  );

  const formatBid = useCallback(
    (gbp: number) => formatFromFiat(gbp, 'GBP') ?? '',
    [formatFromFiat],
  );

  const formatScheduled = useCallback((iso: string) => {
    const date = new Date(iso);
    const diffMs = date.getTime() - Date.now();
    const diffMin = Math.round(diffMs / 60_000);
    const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    if (diffMin <= 0) return t('upcoming.startingSoon');
    if (diffMin < 60) return t('scheduled.inMinutes', { minutes: diffMin, time: timeStr });
    const diffHr = Math.floor(diffMin / 60);
    const remMin = diffMin % 60;
    if (diffHr < 24) return t('scheduled.inHours', { hours: diffHr, minutes: remMin, time: timeStr });
    const dayStr = date.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' });
    return t('scheduled.inDays', { day: dayStr, time: timeStr });
  }, [t]);

  const handleCategoryPress = useCallback(
    (cat: string) => {
      haptic.selection();
      setSelectedCategory(cat);
    },
    [haptic],
  );

  const openSession = useCallback(
    (sessionId: string) => {
      navigation.navigate('LiveStreamViewer', { sessionId });
    },
    [navigation],
  );

  const handleRetry = useCallback(() => {
    void load();
  }, [load]);

  const showLoading = loading && !summary;
  const showError = !loading && error && !summary;
  const showEmpty = !loading && !error && summary != null && summary.sessions.length === 0;
  const showContent = !loading && !error && summary != null && summary.sessions.length > 0;

  return (
    <FlagshipScreen
      testID="live-shopping-screen"
      header={
        <FlagshipHeader
          title={t('header.title')}
          onBack={() => navigation.goBack()}
        />
      }
      scrollEnabled={false}
      contentStyle={styles.contentFlush}
    >
      <OfflineBanner onRetry={handleRetry} />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void load(true)}
            tintColor={colors.brand}
          />
        }
      >
        {/* ── Category filter — only when the contract carries categories ── */}
        {showContent && categories.length > 1 && (
          <View style={[styles.categoryStrip, { borderBottomColor: colors.border }]}>
            <HorizontalRail
              contentContainerStyle={styles.categoryStripContent}
              accessibilityLabel="Live shopping categories"
            >
              {categories.map((cat) => (
                <CategoryTab
                  key={cat}
                  label={cat}
                  selected={selectedCategory === cat}
                  onPress={() => handleCategoryPress(cat)}
                />
              ))}
            </HorizontalRail>
          </View>
        )}

        {/* ── Loading ── */}
        {showLoading && <LiveHomeSkeleton />}

        {/* ── Error ── */}
        {showError && (
          <FlagshipState
            variant="error"
            title={t('error.title')}
            subtitle={error ?? t('error.subtitle')}
            actionLabel={t('error.retry')}
            onAction={handleRetry}
          />
        )}

        {/* ── Empty ── */}
        {showEmpty && (
          <FlagshipState
            variant="empty"
            icon="videocam-outline"
            title={t('empty.title')}
            subtitle={t('empty.subtitle')}
            actionLabel={t('empty.goToSellerHub')}
            onAction={() => navigation.navigate('MyListings')}
          />
        )}

        {/* ── Populated ── */}
        {showContent && (
          <View style={styles.sectionsWrap}>
            {/* Live now — dominant media rail */}
            {liveSessions.length > 0 ? (
              <View>
                <SectionHeader
                  title={t('sections.liveNow')}
                  meta={t('sections.streaming', { count: liveSessions.length })}
                />
                <HorizontalRail
                  contentContainerStyle={styles.railContent}
                  decelerationRate="fast"
                  snapToInterval={LIVE_CARD_WIDTH + Space.md}
                  accessibilityLabel="Live now sessions"
                >
                  {liveSessions.map((session) => (
                    <LiveSessionCard
                      key={session.id}
                      session={session}
                      formatBid={formatBid}
                      onPress={() => openSession(session.id)}
                    />
                  ))}
                </HorizontalRail>
              </View>
            ) : (
              <View style={styles.noLiveStrip}>
                <Text style={styles.noLiveText}>{t('noLive.text')}</Text>
              </View>
            )}

            {/* Coming up — flat hairline list */}
            {upcomingSessions.length > 0 && (
              <View>
                <SectionHeader
                  title={t('sections.comingUp')}
                  meta={t('sections.scheduled', { count: upcomingSessions.length })}
                />
                <View style={styles.upcomingList}>
                  {upcomingSessions.map((session) => (
                    <UpcomingSessionRow
                      key={session.id}
                      session={session}
                      formatScheduled={formatScheduled}
                    />
                  ))}
                </View>
              </View>
            )}

            {/* Past events — replay rail */}
            {endedSessions.length > 0 && (
              <View>
                <SectionHeader
                  title={t('sections.pastEvents')}
                  meta={t('sections.replays', { count: endedSessions.length })}
                />
                <HorizontalRail
                  contentContainerStyle={styles.railContent}
                  decelerationRate="fast"
                  accessibilityLabel="Past event replays"
                >
                  {endedSessions.map((session) => (
                    <ReplaySessionCard
                      key={session.id}
                      session={session}
                      onPress={() => openSession(session.id)}
                    />
                  ))}
                </HorizontalRail>
              </View>
            )}
          </View>
        )}
      </ScrollView>
    </FlagshipScreen>
  );
}

// ── Static styles (no theme-dependent values) ──
const styles = StyleSheet.create({
  categoryTab: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: Space.smMd },
  categoryTabText: {
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily,
    letterSpacing: TypographyV2.body.letterSpacing },
  categoryTabRule: {
    height: Stroke.emphasis,
    marginTop: Space.xs,
    borderRadius: Stroke.emphasis / 2 } });

// ── Theme-aware styles factory ──
function useStyles() {
  const { colors } = useAppTheme();
  return React.useMemo(
    () =>
      StyleSheet.create({
        contentFlush: {
          paddingHorizontal: 0,
          paddingTop: 0 },
        scrollContent: {
          paddingBottom: Space.xxl },
        categoryStrip: {
          borderBottomWidth: StyleSheet.hairlineWidth },
        categoryStripContent: {
          paddingHorizontal: Space.xs,
          gap: Space.xs },
        sectionsWrap: {
          gap: Space.lg,
          paddingTop: Space.md },
        railContent: {
          paddingHorizontal: Space.md,
          gap: Space.md },
        upcomingList: {
          paddingHorizontal: Space.md },
        noLiveStrip: {
          alignItems: 'center',
          paddingVertical: Space.lg },
        noLiveText: {
          fontSize: TypographyV2.body.size,
          fontFamily: TypographyV2.body.fontFamily,
          color: colors.textMuted } }),
    [colors],
  );
}
