import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { useAppTheme, type ThemeColors } from '../theme/ThemeContext';
import { Space, Radius, Type, Typography, Stroke } from '../theme/designTokens';
import { RootStackParamList } from '../navigation/types';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { CachedImage } from '../components/CachedImage';
import { HorizontalRail } from '../components/HorizontalRail';
import { OfflineBanner } from '../components/OfflineBanner';
import { EmptyState } from '../components/EmptyState';
import { PremiumSkeletonTile } from '../components/discover/PremiumSkeletonTile';
import { useHaptic } from '../hooks/useHaptic';
import { useFormattedPrice } from '../hooks/useFormattedPrice';
import { useReducedMotion } from '../hooks/useReducedMotion';
import {
  fetchLiveSessions,
  LIVE_CATEGORIES,
  LIVE_SHOPPING_DEMO_MODE,
  type LiveSession,
  type LiveSessionSummary,
} from '../services/liveShoppingApi';

type NavT = NativeStackNavigationProp<RootStackParamList>;

// ── Layout constants ──
const FEATURED_CARD_WIDTH = 240;
const FEATURED_CARD_HEIGHT = 320;
const UPCOMING_THUMB_SIZE = 72;

// ── Live dot ──
function LivePulse({ size = 8, color }: { size?: number; color: string }) {
  const reducedMotion = useReducedMotion();
  const scale = useSharedValue(1);

  useEffect(() => {
    if (reducedMotion) {
      scale.value = 1;
      return;
    }
    // Subtle pulse: scale 1.0 → 1.3 → 1.0, looping infinitely.
    scale.value = withRepeat(
      withSequence(
        withTiming(1.3, { duration: 800, easing: Easing.inOut(Easing.ease) }),
        withTiming(1.0, { duration: 800, easing: Easing.inOut(Easing.ease) }),
      ),
      -1,
    );
  }, [reducedMotion, scale]);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Reanimated.View
      style={[{ width: size, height: size, borderRadius: size / 2, backgroundColor: color }, animStyle]}
    />
  );
}

// ── Live badge ──
function LiveBadge({ compact = false }: { compact?: boolean }) {
  const styles = useStyles();
  const { colors } = useAppTheme();
  return (
    <View style={[styles.liveBadge, compact && styles.liveBadgeCompact]}>
      <LivePulse size={compact ? 6 : 8} color={colors.danger} />
      <Text style={[styles.liveBadgeText, compact && styles.liveBadgeTextCompact]}>LIVE</Text>
    </View>
  );
}

// ── Viewer count chip ──
function ViewerChip({ count, compact = false }: { count: number; compact?: boolean }) {
  const styles = useStyles();
  const formatted = count >= 1000 ? `${(count / 1000).toFixed(1)}K` : String(count);
  return (
    <View style={[styles.viewerChip, compact && styles.viewerChipCompact]}>
      <Ionicons name="eye" size={16} color="#FFFFFF" />
      <Text style={[styles.viewerChipText, compact && styles.viewerChipTextCompact]}>{formatted}</Text>
    </View>
  );
}

// ── Featured live card (horizontal strip) ──
const FeaturedLiveCard = React.memo(function FeaturedLiveCard({
  session,
  formatBid,
  onPress,
}: {
  session: LiveSession;
  formatBid: (gbp: number) => string;
  onPress: () => void;
}) {
  const styles = useStyles();
  const { colors } = useAppTheme();
  const bidLabel = session.currentBid != null ? formatBid(session.currentBid) : null;

  return (
    <AnimatedPressable
      style={[styles.featuredCard, { width: FEATURED_CARD_WIDTH }]}
      onPress={onPress}
      activeOpacity={0.9}
      scaleValue={0.98}
      accessibilityRole="button"
      accessibilityLabel={`${session.title} by ${session.sellerName}. ${session.viewerCount} viewers${bidLabel ? `, current bid ${bidLabel}` : ''}. Tap to watch.`}
    >
      <View style={styles.featuredMediaWrap}>
        <CachedImage
          uri={session.thumbnail}
          style={StyleSheet.absoluteFill}
          containerStyle={StyleSheet.absoluteFill}
          contentFit="cover"
        />
        <LinearGradient
          colors={['transparent', 'rgba(0,0,0,0.78)']}
          locations={[0.4, 1]}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
        <View style={styles.featuredTopRow}>
          <LiveBadge />
          <ViewerChip count={session.viewerCount} />
        </View>
        <View style={styles.featuredBottomArea}>
          <View style={styles.featuredSellerRow}>
            <CachedImage
              uri={session.sellerAvatar}
              style={styles.featuredAvatar}
              contentFit="cover"
            />
            <View style={styles.featuredSellerText}>
              <View style={styles.featuredNameRow}>
                <Text style={styles.featuredSellerName} numberOfLines={1}>{session.sellerName}</Text>
                {session.sellerVerified && (
                  <Ionicons name="checkmark-circle" size={16} color="#3B9EFF" />
                )}
              </View>
              <Text style={styles.featuredCategory}>{session.category}</Text>
            </View>
          </View>
          <Text style={styles.featuredTitle} numberOfLines={2}>{session.title}</Text>
          {bidLabel && (
            <View style={styles.featuredBidRow}>
              <Text style={styles.featuredBidLabel}>Current bid</Text>
              <Text style={styles.featuredBidValue}>{bidLabel}</Text>
            </View>
          )}
        </View>
      </View>
    </AnimatedPressable>
  );
});

// ── Replay card (past events) ──
const ReplayCard = React.memo(function ReplayCard({
  session,
  onPress,
}: {
  session: LiveSession;
  onPress: () => void;
}) {
  const styles = useStyles();
  const { colors } = useAppTheme();

  const durationLabel = (() => {
    if (!session.startedAt || !session.endedAt) return '';
    const start = new Date(session.startedAt).getTime();
    const end = new Date(session.endedAt).getTime();
    const diffMin = Math.round((end - start) / 60_000);
    if (diffMin < 60) return `${diffMin}m`;
    return `${Math.floor(diffMin / 60)}h ${diffMin % 60}m`;
  })();

  const endedLabel = (() => {
    if (!session.endedAt) return '';
    const end = new Date(session.endedAt);
    const now = new Date();
    const diffHr = Math.round((now.getTime() - end.getTime()) / (60 * 60 * 1000));
    if (diffHr < 1) return 'Just ended';
    if (diffHr < 24) return `${diffHr}h ago`;
    return `${Math.floor(diffHr / 24)}d ago`;
  })();

  return (
    <AnimatedPressable
      style={styles.replayCard}
      onPress={onPress}
      activeOpacity={0.9}
      scaleValue={0.98}
      accessibilityRole="button"
      accessibilityLabel={`Replay: ${session.title} by ${session.sellerName}. ${endedLabel}${durationLabel ? `, duration ${durationLabel}` : ''}. Tap to watch replay.`}
    >
      <View style={styles.replayThumbWrap}>
        <CachedImage
          uri={session.thumbnail}
          style={StyleSheet.absoluteFill}
          containerStyle={StyleSheet.absoluteFill}
          contentFit="cover"
        />
        <LinearGradient
          colors={['transparent', 'rgba(0,0,0,0.6)']}
          locations={[0.5, 1]}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
        <View style={styles.replayPlayOverlay}>
          <Ionicons name="play" size={20} color="#FFFFFF" />
        </View>
        {durationLabel && (
          <View style={styles.replayDurationBadge}>
            <Text style={styles.replayDurationText}>{durationLabel}</Text>
          </View>
        )}
      </View>
      <View style={styles.replayBody}>
        <View style={styles.replaySellerRow}>
          <CachedImage
            uri={session.sellerAvatar}
            style={styles.replayAvatar}
            contentFit="cover"
          />
          <View style={styles.replaySellerText}>
            <View style={styles.replayNameRow}>
              <Text style={styles.replaySellerName} numberOfLines={1}>{session.sellerName}</Text>
              {session.sellerVerified && (
                <Ionicons name="checkmark-circle" size={12} color={colors.brand} />
              )}
            </View>
            <Text style={styles.replayEndedLabel}>{endedLabel}</Text>
          </View>
        </View>
        <Text style={styles.replayTitle} numberOfLines={2}>{session.title}</Text>
      </View>
    </AnimatedPressable>
  );
});

// ── Upcoming row ──
const UpcomingRow = React.memo(function UpcomingRow({
  session,
  onNotify,
  notified,
  formatScheduled,
}: {
  session: LiveSession;
  onNotify: () => void;
  notified: boolean;
  formatScheduled: (iso: string) => string;
}) {
  const styles = useStyles();
  const { colors } = useAppTheme();
  const scheduledLabel = session.scheduledAt ? formatScheduled(session.scheduledAt) : '';

  return (
    <View style={styles.upcomingRow}>
      <View
        style={styles.upcomingRowPress}
        accessibilityRole="image"
        accessibilityLabel={`${session.title} by ${session.sellerName}. Scheduled ${scheduledLabel}.`}
      >
        <View style={styles.upcomingThumbWrap}>
          <CachedImage
            uri={session.thumbnail}
            style={StyleSheet.absoluteFill}
            containerStyle={StyleSheet.absoluteFill}
            contentFit="cover"
          />
          <View style={styles.upcomingThumbOverlay}>
            <Ionicons name="time-outline" size={16} color="#FFFFFF" />
          </View>
        </View>
        <View style={styles.upcomingBody}>
          <Text style={styles.upcomingScheduled}>{scheduledLabel}</Text>
          <View style={styles.upcomingSellerRow}>
            <CachedImage
              uri={session.sellerAvatar}
              style={styles.upcomingAvatar}
              contentFit="cover"
            />
            <Text style={styles.upcomingSellerName} numberOfLines={1}>{session.sellerName}</Text>
            {session.sellerVerified && (
              <Ionicons name="checkmark-circle" size={14} color={colors.brand} />
            )}
          </View>
          <Text style={styles.upcomingTitle} numberOfLines={2}>{session.title}</Text>
          <View style={styles.upcomingMetaRow}>
            <Ionicons name="people-outline" size={16} color={styles.upcomingMetaText.color} />
            <Text style={styles.upcomingMetaText}>{session.watchers} waiting</Text>
          </View>
        </View>
      </View>
      <AnimatedPressable
        style={[
          styles.notifyBtn,
          notified && styles.notifyBtnActive,
        ]}
        onPress={onNotify}
        activeOpacity={0.8}
        scaleValue={0.95}
        hapticFeedback="selection"
        accessibilityRole="button"
        accessibilityLabel={notified ? `Notifications on for ${session.title}` : `Notify me when ${session.title} starts`}
      >
        <Ionicons
          name={notified ? 'notifications' : 'notifications-outline'}
          size={16}
          color={notified ? '#FFFFFF' : styles.notifyBtnText.color}
        />
        <Text style={[styles.notifyBtnText, notified && styles.notifyBtnTextActive]}>
          {notified ? 'Notified' : 'Notify me'}
        </Text>
      </AnimatedPressable>
    </View>
  );
});

// ── Category pill ──
const CategoryPill = React.memo(function CategoryPill({
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
      style={[
        styles.categoryPill,
        {
          backgroundColor: selected ? colors.brand : 'transparent',
          borderColor: selected ? colors.brand : colors.border,
        },
      ]}
      onPress={onPress}
      activeOpacity={0.8}
      scaleValue={0.97}
      hapticFeedback="selection"
      accessibilityRole="tab"
      accessibilityState={{ selected }}
      accessibilityLabel={`${label} category${selected ? ', selected' : ''}`}
    >
      <Text
        style={[
          styles.categoryPillText,
          { color: selected ? colors.background : colors.textPrimary },
        ]}
      >
        {label}
      </Text>
    </AnimatedPressable>
  );
});

// ── Skeleton for featured strip ──
function FeaturedSkeleton() {
  return (
    <HorizontalRail contentContainerStyle={{ paddingHorizontal: Space.md, gap: Space.md }}>
      {Array.from({ length: 3 }).map((_, i) => (
        <PremiumSkeletonTile
          key={`featured-skel-${i}`}
          width={FEATURED_CARD_WIDTH}
          height={FEATURED_CARD_HEIGHT}
          borderRadius={Radius.lg}
        />
      ))}
    </HorizontalRail>
  );
}

// ── Skeleton for upcoming list ──
function UpcomingSkeleton() {
  const styles = useStyles();
  return (
    <View style={{ paddingHorizontal: Space.md, gap: Space.sm }}>
      {Array.from({ length: 4 }).map((_, i) => (
        <View key={`upcoming-skel-${i}`} style={styles.upcomingRow}>
          <PremiumSkeletonTile width={UPCOMING_THUMB_SIZE} height={UPCOMING_THUMB_SIZE} borderRadius={Radius.md} />
          <View style={{ flex: 1, gap: 6 }}>
            <PremiumSkeletonTile width="60%" height={12} borderRadius={Radius.sm} />
            <PremiumSkeletonTile width="90%" height={16} borderRadius={Radius.sm} />
            <PremiumSkeletonTile width="40%" height={12} borderRadius={Radius.sm} />
          </View>
        </View>
      ))}
    </View>
  );
}

// ── Main screen ──
export default function LiveShoppingHomeScreen() {
  const { colors, isDark } = useAppTheme();
  const insets = useSafeAreaInsets();
  const styles = useStyles();
  const navigation = useNavigation<NavT>();
  const haptic = useHaptic();
  const { currencyCode, formatFromFiat } = useFormattedPrice();
  const { width } = useWindowDimensions();

  const [summary, setSummary] = useState<LiveSessionSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [notifiedIds, setNotifiedIds] = useState<Set<string>>(new Set());

  const load = useCallback(async (category: string, isRefresh = false) => {
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);
    try {
      const result = await fetchLiveSessions({ category });
      setSummary(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load live sessions');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load(selectedCategory);
  }, [load, selectedCategory]);

  const liveSessions = useMemo(
    () => summary?.sessions.filter((s) => s.status === 'live') ?? [],
    [summary],
  );
  const upcomingSessions = useMemo(
    () => summary?.sessions.filter((s) => s.status === 'upcoming') ?? [],
    [summary],
  );
  const endedSessions = useMemo(
    () => summary?.sessions.filter((s) => s.status === 'ended') ?? [],
    [summary],
  );

  const formatBid = useCallback(
    (gbp: number) => formatFromFiat(gbp, currencyCode) ?? '',
    [formatFromFiat, currencyCode],
  );

  const formatScheduled = useCallback((iso: string) => {
    const date = new Date(iso);
    const now = new Date();
    const diffMs = date.getTime() - now.getTime();
    const diffMin = Math.round(diffMs / 60_000);
    const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    if (diffMin <= 0) return 'Starting soon';
    if (diffMin < 60) return `In ${diffMin} min · ${timeStr}`;
    const diffHr = Math.floor(diffMin / 60);
    const remMin = diffMin % 60;
    if (diffHr < 24) return `In ${diffHr}h ${remMin}m · ${timeStr}`;
    const dayStr = date.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' });
    return `${dayStr} · ${timeStr}`;
  }, []);

  const handleNotify = useCallback(
    (sessionId: string) => {
      haptic.selection();
      setNotifiedIds((prev) => {
        const next = new Set(prev);
        if (next.has(sessionId)) {
          next.delete(sessionId);
        } else {
          next.add(sessionId);
        }
        return next;
      });
    },
    [haptic],
  );

  const handleCategoryPress = useCallback(
    (cat: string) => {
      haptic.selection();
      setSelectedCategory(cat);
    },
    [haptic],
  );

  const handleRetry = useCallback(() => {
    load(selectedCategory);
  }, [load, selectedCategory]);

  const showLoading = loading && !summary;
  const showError = !loading && error && !summary;
  const showEmpty = !loading && !error && summary && summary.sessions.length === 0;
  const showContent = !loading && !error && summary && summary.sessions.length > 0;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <StatusBar style={isDark ? 'light' : 'dark'} />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: insets.top + Space.sm, paddingBottom: Space.xxl }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => load(selectedCategory, true)}
            tintColor={colors.brand}
          />
        }
      >
        {/* ── Offline banner ── */}
        <OfflineBanner onRetry={handleRetry} />

        {/* ── Header ── */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Text style={styles.headerTitle}>Live</Text>
            <LivePulse size={10} color={colors.danger} />
            {LIVE_SHOPPING_DEMO_MODE && (
              <View style={styles.demoPill}>
                <Text style={styles.demoPillText}>DEMO</Text>
              </View>
            )}
          </View>
        </View>

        {/* ── Category filter ── */}
        <HorizontalRail
          contentContainerStyle={{ paddingHorizontal: Space.md, gap: Space.sm, paddingVertical: 2 }}
          accessibilityLabel="Live shopping categories"
        >
          {LIVE_CATEGORIES.map((cat) => (
            <CategoryPill
              key={cat}
              label={cat}
              selected={selectedCategory === cat}
              onPress={() => handleCategoryPress(cat)}
            />
          ))}
        </HorizontalRail>

        {/* ── Loading state ── */}
        {showLoading && (
          <View style={{ gap: Space.lg, paddingTop: Space.md }}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Live now</Text>
            </View>
            <FeaturedSkeleton />
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Coming up</Text>
            </View>
            <UpcomingSkeleton />
          </View>
        )}

        {/* ── Error state ── */}
        {showError && (
          <View style={{ paddingTop: Space.xxl }}>
            <EmptyState
              icon="cloud-offline-outline"
              title="Couldn't load live sessions"
              subtitle={error ?? 'Check your connection and try again.'}
              ctaLabel="Retry"
              onCtaPress={handleRetry}
            />
          </View>
        )}

        {/* ── Empty state ── */}
        {showEmpty && (
          <View style={{ paddingTop: Space.xxl }}>
            <EmptyState
              icon="videocam-outline"
              title="No live sessions right now"
              subtitle="Check back soon, or start your own session from the Seller Hub."
              ctaLabel="Go to Seller Hub"
              onCtaPress={() => navigation.navigate('MyListings')}
            />
          </View>
        )}

        {/* ── Populated content ── */}
        {showContent && (
          <View style={{ gap: Space.lg, paddingTop: Space.md }}>
            {/* Featured live strip */}
            {liveSessions.length > 0 ? (
              <View>
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>Live now</Text>
                  <Text style={styles.sectionCount}>{liveSessions.length} streaming</Text>
                </View>
                <HorizontalRail
                  contentContainerStyle={{ paddingHorizontal: Space.md, gap: Space.md }}
                  decelerationRate="fast"
                  snapToInterval={FEATURED_CARD_WIDTH + Space.md}
                  accessibilityLabel="Live now sessions"
                >
                  {liveSessions.map((session) => (
                    <FeaturedLiveCard
                      key={session.id}
                      session={session}
                      formatBid={formatBid}
                      onPress={() => navigation.navigate('LiveStreamViewer', { sessionId: session.id })}
                    />
                  ))}
                </HorizontalRail>
              </View>
            ) : (
              <View style={styles.noLiveStrip}>
                <Ionicons name="radio-button-off" size={20} color={colors.textMuted} />
                <Text style={styles.noLiveText}>No one is live right now</Text>
              </View>
            )}

            {/* Upcoming section */}
            {upcomingSessions.length > 0 && (
              <View>
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>Coming up</Text>
                  <Text style={styles.sectionCount}>{upcomingSessions.length} scheduled</Text>
                </View>
                <View style={{ paddingHorizontal: Space.md, gap: Space.xs }}>
                  {upcomingSessions.map((session, index) => (
                    <UpcomingRow
                      key={session.id}
                      session={session}
                      onNotify={() => handleNotify(session.id)}
                      notified={notifiedIds.has(session.id)}
                      formatScheduled={formatScheduled}
                    />
                  ))}
                </View>
              </View>
            )}

            {/* Past events / replays */}
            {endedSessions.length > 0 && (
              <View>
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>Past Events</Text>
                  <Text style={styles.sectionCount}>{endedSessions.length} replay{endedSessions.length === 1 ? '' : 's'}</Text>
                </View>
                <HorizontalRail
                  contentContainerStyle={{ paddingHorizontal: Space.md, gap: Space.md }}
                  decelerationRate="fast"
                  accessibilityLabel="Past event replays"
                >
                  {endedSessions.map((session) => (
                    <ReplayCard
                      key={session.id}
                      session={session}
                      onPress={() => navigation.navigate('LiveStreamViewer', { sessionId: session.id })}
                    />
                  ))}
                </HorizontalRail>
              </View>
            )}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

// ── Static styles (no theme-dependent values) ──
const styles = StyleSheet.create({
  categoryPill: {
    paddingVertical: Space.sm - 1,
    paddingHorizontal: Space.md - 2,
    borderRadius: Radius.full,
    borderWidth: Stroke.standard,
  },
  categoryPillText: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.semibold,
    letterSpacing: -0.1,
  },
});

// ── Theme-aware styles factory ──
function useStyles() {
  const { colors } = useAppTheme();
  return React.useMemo(
    () =>
      StyleSheet.create({
        header: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: Space.md,
          paddingBottom: Space.sm,
        },
        headerLeft: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: Space.sm,
        },
        headerTitle: {
          fontSize: Type.priceHero.size,
          fontFamily: Typography.family.bold,
          letterSpacing: -0.8,
          color: colors.textPrimary,
        },
        demoPill: {
          paddingHorizontal: Space.xs + 2,
          paddingVertical: 2,
          borderRadius: Radius.sm,
          backgroundColor: colors.warningSubtle,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: colors.warningBorder,
        },
        demoPillText: {
          fontSize: Type.meta.size - 2,
          fontFamily: Typography.family.bold,
          letterSpacing: Type.label.letterSpacing,
          color: colors.warning,
        },
        sectionHeader: {
          flexDirection: 'row',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          paddingHorizontal: Space.md,
          marginBottom: Space.sm,
        },
        sectionTitle: {
          fontSize: Type.priceList.size,
          fontFamily: Typography.family.bold,
          letterSpacing: Type.subtitle.letterSpacing,
          color: colors.textPrimary,
        },
        sectionCount: {
          fontSize: Type.caption.size,
          fontFamily: Typography.family.semibold,
          color: colors.textMuted,
          fontVariant: ['tabular-nums'],
        },
        noLiveStrip: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: Space.sm,
          paddingVertical: Space.lg,
        },
        noLiveText: {
          fontSize: Type.body.size,
          fontFamily: Typography.family.regular,
          color: colors.textMuted,
        },
        // Featured card
        featuredCard: {
          borderRadius: Radius.lg,
          overflow: 'hidden',
        },
        featuredMediaWrap: {
          width: '100%',
          height: FEATURED_CARD_HEIGHT,
        },
        featuredTopRow: {
          position: 'absolute',
          top: Space.sm,
          left: Space.sm,
          right: Space.sm,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
        },
        liveBadge: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: Space.xs,
          paddingHorizontal: Space.sm,
          paddingVertical: Space.xs,
          borderRadius: Radius.full,
          backgroundColor: 'rgba(255,59,48,0.92)',
        },
        liveBadgeCompact: {
          paddingHorizontal: Space.xs + 2,
          paddingVertical: Space.xs / 2 + 1,
          gap: Space.xs / 2 + 1,
        },
        liveBadgeText: {
          fontSize: Type.meta.size,
          fontFamily: Typography.family.bold,
          letterSpacing: Type.label.letterSpacing,
          color: colors.scrimTextPrimary,
        },
        liveBadgeTextCompact: {
          fontSize: Type.meta.size - 2,
          letterSpacing: 0.4,
        },
        viewerChip: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: Space.xs,
          paddingHorizontal: Space.sm,
          paddingVertical: Space.xs,
          borderRadius: Radius.full,
          backgroundColor: colors.overlay,
        },
        viewerChipCompact: {
          paddingHorizontal: Space.xs + 2,
          paddingVertical: Space.xs / 2 + 1,
          gap: Space.xs / 2 + 1,
        },
        viewerChipText: {
          fontSize: Type.caption.size,
          fontFamily: Typography.family.semibold,
          color: colors.scrimTextPrimary,
          letterSpacing: -0.1,
          fontVariant: ['tabular-nums'],
        },
        viewerChipTextCompact: {
          fontSize: Type.meta.size - 1,
          fontVariant: ['tabular-nums'],
        },
        featuredBottomArea: {
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          padding: Space.sm + 2,
          gap: Space.xs + 2,
        },
        featuredSellerRow: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: Space.xs,
        },
        featuredAvatar: {
          width: Space.lg + 4,
          height: Space.lg + 4,
          borderRadius: Radius.xl,
        },
        featuredSellerText: {
          flex: 1,
          gap: Space.xs / 4,
        },
        featuredNameRow: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: Space.xs,
        },
        featuredSellerName: {
          fontSize: Type.caption.size,
          fontFamily: Typography.family.semibold,
          color: colors.scrimTextPrimary,
          letterSpacing: -0.1,
        },
        featuredCategory: {
          fontSize: Type.meta.size,
          fontFamily: Typography.family.regular,
          color: colors.scrimTextSecondary,
          letterSpacing: 0.2,
        },
        featuredTitle: {
          fontSize: Type.body.size,
          fontFamily: Typography.family.bold,
          color: colors.scrimTextPrimary,
          letterSpacing: Type.body.letterSpacing,
          lineHeight: Type.body.lineHeight,
        },
        featuredBidRow: {
          flexDirection: 'row',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          marginTop: Space.xs / 2,
        },
        featuredBidLabel: {
          fontSize: Type.label.size,
          lineHeight: Type.label.lineHeight,
          fontFamily: Typography.family.semibold,
          color: colors.scrimTextSecondary,
          letterSpacing: Type.label.letterSpacing,
          textTransform: 'uppercase',
        },
        featuredBidValue: {
          fontSize: Type.priceList.size,
          lineHeight: Type.priceList.lineHeight,
          fontFamily: Typography.family.bold,
          color: colors.scrimTextPrimary,
          letterSpacing: Type.priceList.letterSpacing,
          fontVariant: ['tabular-nums'],
        },
        // Upcoming row
        upcomingRow: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: Space.sm,
          paddingVertical: Space.sm,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: colors.border,
        },
        upcomingRowPress: {
          flex: 1,
          flexDirection: 'row',
          alignItems: 'center',
          gap: Space.sm,
        },
        upcomingThumbWrap: {
          width: UPCOMING_THUMB_SIZE,
          height: UPCOMING_THUMB_SIZE,
          borderRadius: Radius.md,
          overflow: 'hidden',
        },
        upcomingThumbOverlay: {
          position: 'absolute',
          bottom: Space.xs,
          right: Space.xs,
          width: Space.sm + 6,
          height: Space.sm + 6,
          borderRadius: Radius.lg,
          backgroundColor: colors.overlay,
          alignItems: 'center',
          justifyContent: 'center',
        },
        upcomingBody: {
          flex: 1,
          gap: Space.xs / 2,
        },
        upcomingScheduled: {
          fontSize: Type.caption.size,
          fontFamily: Typography.family.semibold,
          color: colors.brand,
          letterSpacing: -0.1,
          fontVariant: ['tabular-nums'],
        },
        upcomingSellerRow: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: Space.xs,
        },
        upcomingAvatar: {
          width: Space.lg,
          height: Space.lg,
          borderRadius: Radius.full,
        },
        upcomingSellerName: {
          fontSize: Type.caption.size,
          fontFamily: Typography.family.regular,
          color: colors.textSecondary,
          letterSpacing: -0.1,
        },
        upcomingTitle: {
          fontSize: Type.bodyStrong.size,
          fontFamily: Typography.family.semibold,
          color: colors.textPrimary,
          letterSpacing: Type.bodyStrong.letterSpacing,
          lineHeight: Type.bodyStrong.lineHeight,
        },
        upcomingMetaRow: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: Space.xs,
          marginTop: Space.xs / 2,
        },
        upcomingMetaText: {
          fontSize: Type.meta.size,
          fontFamily: Typography.family.medium,
          color: colors.textMuted,
          letterSpacing: Type.caption.letterSpacing,
          fontVariant: ['tabular-nums'],
        },
        notifyBtn: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: Space.xs / 2 + 1,
          paddingHorizontal: Space.smMd,
          paddingVertical: Space.sm,
          borderRadius: Radius.full,
          borderWidth: Stroke.standard,
          borderColor: colors.border,
          backgroundColor: 'transparent',
        },
        notifyBtnActive: {
          backgroundColor: colors.brand,
          borderColor: colors.brand,
        },
        notifyBtnText: {
          fontSize: Type.caption.size,
          fontFamily: Typography.family.semibold,
          color: colors.textPrimary,
          letterSpacing: -0.1,
        },
        notifyBtnTextActive: {
          color: colors.background,
        },
        endedHint: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: Space.xs,
          paddingVertical: Space.md,
        },
        endedHintText: {
          fontSize: Type.caption.size,
          fontFamily: Typography.family.medium,
          color: colors.textMuted,
          fontVariant: ['tabular-nums'],
        },
        // ── Replay card ──
        replayCard: {
          width: FEATURED_CARD_WIDTH,
          borderRadius: Radius.lg,
          overflow: 'hidden',
          backgroundColor: colors.surface,
          borderWidth: Stroke.hairline,
          borderColor: colors.border,
        },
        replayThumbWrap: {
          width: '100%',
          height: 180,
          position: 'relative',
        },
        replayPlayOverlay: {
          position: 'absolute',
          bottom: Space.sm,
          left: Space.sm,
          width: Space.xl + Space.xs,
          height: Space.xl + Space.xs,
          borderRadius: Radius.full,
          backgroundColor: colors.overlay,
          alignItems: 'center',
          justifyContent: 'center',
        },
        replayDurationBadge: {
          position: 'absolute',
          bottom: Space.sm,
          right: Space.sm,
          backgroundColor: colors.overlay,
          paddingHorizontal: Space.xs + 2,
          paddingVertical: Space.xs / 2 + 1,
          borderRadius: Radius.sm,
        },
        replayDurationText: {
          fontSize: Type.meta.size,
          fontFamily: Typography.family.semibold,
          color: colors.scrimTextPrimary,
          fontVariant: ['tabular-nums'],
        },
        replayBody: {
          padding: Space.sm,
          gap: Space.xs,
        },
        replaySellerRow: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: Space.xs,
        },
        replayAvatar: {
          width: Space.lg + 2,
          height: Space.lg + 2,
          borderRadius: Radius.full,
        },
        replaySellerText: {
          flex: 1,
          gap: Space.xs / 4,
        },
        replayNameRow: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: Space.xs / 2,
        },
        replaySellerName: {
          fontSize: Type.caption.size,
          fontFamily: Typography.family.semibold,
          color: colors.textPrimary,
          letterSpacing: -0.1,
          flexShrink: 1,
        },
        replayEndedLabel: {
          fontSize: Type.meta.size,
          fontFamily: Typography.family.regular,
          color: colors.textMuted,
        },
        replayTitle: {
          fontSize: Type.body.size,
          fontFamily: Typography.family.semibold,
          color: colors.textPrimary,
          letterSpacing: Type.body.letterSpacing,
          lineHeight: Type.body.lineHeight,
        },
      }),
    [colors],
  );
}
