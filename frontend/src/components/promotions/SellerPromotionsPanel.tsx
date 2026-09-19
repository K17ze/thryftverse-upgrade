import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { Radius, Space } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { IconSize } from '../../theme/iconTokens';
import { FlagshipScreen, FlagshipHeader, FlagshipState, FlagshipMetricLine } from '../flagship';
import { AnimatedPressable } from '../AnimatedPressable';
import { AppIcon } from '../common/AppIcon';
import { CachedImage } from '../CachedImage';
import { ConfirmationSheet } from '../ConfirmationSheet';
import { EmptyState } from '../EmptyState';
import { useFormattedPrice } from '../../hooks/useFormattedPrice';
import { useHaptic } from '../../hooks/useHaptic';
import { useToast } from '../../context/ToastContext';
import { parseApiError } from '../../lib/apiClient';
import {
  fetchPromotionStats,
  type PromotionStats,
  type SellerPromotion,
} from '../../services/promotionsApi';
import type {
  SellerPromotionAction,
  SellerPromotionsController,
} from '../../hooks/inventory';

export interface SellerPromotionsPanelProps {
  visible: boolean;
  /**
   * Shared promotions controller from `useSellerPromotions` — the host
   * screen owns it so the same list powers the Sponsored state chips on
   * inventory rows.
   */
  controller: SellerPromotionsController;
  onClose: () => void;
}

// ── Status presentation ─────────────────────────────────────────────────────

type StatusTone = 'live' | 'warning' | 'danger' | 'muted';

/** Machine-readable paused_reason → truthful seller-facing copy. */
function pausedReasonCopy(reason: string | null | undefined): string | null {
  switch (reason) {
    case 'listing_unservable':
      return 'listing can’t be promoted';
    case 'seller_restricted':
      return 'account reach is limited';
    default:
      return reason ? 'paused by the system' : null;
  }
}

function statusLabel(p: SellerPromotion): { text: string; tone: StatusTone } {
  switch (p.status) {
    case 'active':
      return { text: 'Sponsored', tone: 'live' };
    case 'paused': {
      const reason = pausedReasonCopy(p.pausedReason);
      return { text: reason ? `Paused — ${reason}` : 'Paused', tone: 'warning' };
    }
    case 'exhausted':
      return { text: 'Stopped — balance ran out', tone: 'danger' };
    case 'ended':
    default:
      return { text: 'Ended', tone: 'muted' };
  }
}

function formatDay(iso: string): string {
  const d = new Date(iso);
  return isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

/** Integer counters from the stats payload — a malformed/partial value
 *  renders nothing rather than "NaN" or a TypeError on toLocaleString. */
function formatCount(n: number | null | undefined): string | null {
  return typeof n === 'number' && Number.isFinite(n) ? n.toLocaleString() : null;
}

// ── Promotion row ───────────────────────────────────────────────────────────

function PromotionRow({
  promotion,
  stats,
  pending,
  isLast,
  colors,
  styles,
  onAction,
  onConfirmEnd,
}: {
  promotion: SellerPromotion;
  stats: PromotionStats | undefined;
  pending: boolean;
  isLast: boolean;
  colors: ThemeColors;
  styles: PanelStyles;
  onAction: (p: SellerPromotion, action: SellerPromotionAction) => void;
  onConfirmEnd: (p: SellerPromotion) => void;
}) {
  const { formatFromFiat } = useFormattedPrice();
  const status = statusLabel(promotion);
  const statusColor =
    status.tone === 'live'
      ? colors.successText
      : status.tone === 'warning'
        ? colors.warningText
        : status.tone === 'danger'
          ? colors.dangerText
          : colors.textMuted;

  // Metrics line — every value traces to a real payload field: spend comes
  // from the list row, billed days / impressions / taps from the stats
  // endpoint (omitted entirely until stats land — never a placeholder 0).
  const metricParts: string[] = [
    `${formatFromFiat(promotion.dailyBudgetGbp ?? 0, 'GBP')}/day`,
    `Spent ${formatFromFiat((promotion.totalSpendMinor ?? 0) / 100, 'GBP')}`,
  ];
  if (stats) {
    const billed = formatCount(stats.chargedDays);
    const impressions = formatCount(stats.impressions);
    const taps = formatCount(stats.clicks);
    if (billed !== null) {
      metricParts.push(`${billed} day${stats.chargedDays === 1 ? '' : 's'} billed`);
    }
    if (impressions !== null) metricParts.push(`${impressions} impressions`);
    if (taps !== null) metricParts.push(`${taps} taps`);
  }
  metricParts.push(
    promotion.status === 'ended'
      ? `Ended ${formatDay(promotion.endsAt)}`
      : `Ends ${formatDay(promotion.endsAt)}`,
  );

  const canPause = promotion.status === 'active';
  const canResume = promotion.status === 'paused' || promotion.status === 'exhausted';
  const canEnd = promotion.status !== 'ended';

  return (
    <View style={[styles.row, !isLast && styles.rowBorder]}>
      {promotion.listingImageUrl ? (
        <CachedImage
          uri={promotion.listingImageUrl}
          style={styles.thumb}
          containerStyle={styles.thumbWrap}
          contentFit="cover"
        />
      ) : (
        <View style={[styles.thumbWrap, styles.thumbFallback]}>
          <AppIcon name="image" size={IconSize.sm} color="textMuted" opticalCenter accessible={false} />
        </View>
      )}

      <View style={styles.rowBody}>
        <Text style={styles.rowTitle} numberOfLines={1}>
          {promotion.listingTitle ?? 'Listing'}
        </Text>
        <Text style={[styles.statusText, { color: statusColor }]} numberOfLines={2}>
          {status.text}
        </Text>
        <Text style={styles.metricsText} numberOfLines={2}>
          {metricParts.join(' · ')}
        </Text>

        {canPause || canResume || canEnd ? (
          <View style={styles.actionsRow}>
            {pending ? (
              <ActivityIndicator size="small" color={colors.textMuted} />
            ) : (
              <>
                {canPause ? (
                  <RowAction
                    label="Pause"
                    onPress={() => onAction(promotion, 'pause')}
                    color={colors.textPrimary}
                  />
                ) : null}
                {canResume ? (
                  <RowAction
                    label="Resume"
                    onPress={() => onAction(promotion, 'resume')}
                    color={colors.brand}
                  />
                ) : null}
                {canEnd ? (
                  <RowAction
                    label="End"
                    onPress={() => onConfirmEnd(promotion)}
                    color={colors.dangerText}
                  />
                ) : null}
              </>
            )}
          </View>
        ) : null}
      </View>
    </View>
  );
}

function RowAction({
  label,
  onPress,
  color,
}: {
  label: string;
  onPress: () => void;
  color: string;
}) {
  return (
    <AnimatedPressable
      onPress={onPress}
      hitSlop={8}
      scaleValue={0.97}
      hapticFeedback="light"
      accessibilityRole="button"
      accessibilityLabel={`${label} promotion`}
      style={rowActionStyles.btn}
    >
      <Text style={[rowActionStyles.text, { color }]}>{label}</Text>
    </AnimatedPressable>
  );
}

const rowActionStyles = StyleSheet.create({
  btn: {
    paddingVertical: Space.xs,
    paddingRight: Space.md },
  text: {
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.bodyStrong.fontFamily },
});

type PanelStyles = ReturnType<typeof createStyles>;

// ── Panel ───────────────────────────────────────────────────────────────────

/**
 * SellerPromotionsPanel — the management surface for flat-fee promoted
 * listings. The create flow was the only surface before this: a seller
 * could commit up to £500/day × 30 days with no way to see spend, pause,
 * resume, or end. Every action hits the real /seller/promotions/:id/*
 * endpoints and the row re-renders from the fresh server row.
 *
 * Rendered as a full-screen modal (not a navigator route) so hosts that
 * can't extend the navigation param list can still surface it.
 */
export function SellerPromotionsPanel({
  visible,
  controller,
  onClose,
}: SellerPromotionsPanelProps) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { formatFromFiat } = useFormattedPrice();
  const haptic = useHaptic();
  const { show } = useToast();

  const { promotions, isLoading, error } = controller;
  const [statsById, setStatsById] = useState<Record<string, PromotionStats>>({});
  const attemptedStatsRef = useRef<Set<string>>(new Set());
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [confirmEnd, setConfirmEnd] = useState<SellerPromotion | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Fetch on open — silent when data already exists.
  useEffect(() => {
    if (visible) void controller.refresh();
  }, [visible, controller]);

  // Per-row stats — the list payload carries spend but not impressions,
  // clicks, or billed days; those come from GET /seller/promotions/:id/stats.
  const loadStats = useCallback(async (ids: string[]) => {
    const results = await Promise.all(
      ids.map(async (id) => {
        try {
          return await fetchPromotionStats(id);
        } catch {
          return null;
        }
      }),
    );
    setStatsById((prev) => {
      const next = { ...prev };
      for (const s of results) {
        if (s) next[s.promotionId] = s;
      }
      return next;
    });
  }, []);

  useEffect(() => {
    if (!visible || !promotions) return;
    const missing = promotions
      .map((p) => p.id)
      .filter((id) => !attemptedStatsRef.current.has(id));
    if (missing.length === 0) return;
    for (const id of missing) attemptedStatsRef.current.add(id);
    void loadStats(missing);
  }, [visible, promotions, loadStats]);

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    attemptedStatsRef.current.clear();
    try {
      const fresh = await controller.refresh();
      // Refetch stats for whatever the refreshed list contains.
      const ids = (fresh ?? []).map((p) => p.id);
      if (ids.length > 0) void loadStats(ids);
    } finally {
      setIsRefreshing(false);
    }
  }, [controller, loadStats]);

  const runAction = useCallback(
    async (p: SellerPromotion, action: SellerPromotionAction) => {
      if (pendingId) return;
      haptic.medium();
      setPendingId(p.id);
      try {
        await controller.runAction(p.id, action);
        show(
          action === 'pause'
            ? 'Promotion paused'
            : action === 'resume'
              ? 'Promotion resumed'
              : 'Promotion ended',
          'success',
        );
        // Resume can post today's charge — refetch this row's stats so the
        // spend figures stay truthful.
        attemptedStatsRef.current.delete(p.id);
        void loadStats([p.id]);
      } catch (err) {
        haptic.error();
        show(parseApiError(err, 'Could not update the promotion.').message, 'error');
      } finally {
        setPendingId(null);
      }
    },
    [controller, haptic, show, loadStats, pendingId],
  );

  // ── Aggregate ledger — real sums over the loaded list, never estimated ──
  const aggregates = useMemo(() => {
    if (!promotions || promotions.length === 0) return null;
    const live = promotions.filter((p) => p.status === 'active');
    const committedMinor = live.reduce(
      (sum, p) => sum + (Number.isFinite(p.dailyBudgetMinor) ? p.dailyBudgetMinor : 0),
      0,
    );
    const spentMinor = promotions.reduce((sum, p) => sum + (p.totalSpendMinor ?? 0), 0);
    return {
      liveCount: live.length,
      committedLabel: formatFromFiat(committedMinor / 100, 'GBP'),
      spentLabel: formatFromFiat(spentMinor / 100, 'GBP'),
    };
  }, [promotions, formatFromFiat]);

  const renderRow = useCallback(
    ({ item, index }: { item: SellerPromotion; index: number }) => (
      <PromotionRow
        promotion={item}
        stats={statsById[item.id]}
        pending={pendingId === item.id}
        isLast={index === (promotions?.length ?? 0) - 1}
        colors={colors}
        styles={styles}
        onAction={(p, action) => void runAction(p, action)}
        onConfirmEnd={setConfirmEnd}
      />
    ),
    [statsById, pendingId, promotions?.length, colors, styles, runAction],
  );

  const listHeader = aggregates ? (
    <View style={styles.ledger}>
      <FlagshipMetricLine
        label="Live"
        value={`${aggregates.liveCount} · ${aggregates.committedLabel}/day`}
      />
      <FlagshipMetricLine label="Spent to date" value={aggregates.spentLabel} separated />
    </View>
  ) : null;

  let content: React.ReactNode;
  if (isLoading && promotions === null) {
    content = <FlagshipState variant="loading" title="Loading promotions..." />;
  } else if (promotions === null && error) {
    content = (
      <FlagshipState
        variant="error"
        title="Could not load promotions"
        subtitle={error}
        actionLabel="Try again"
        onAction={() => void controller.refresh()}
      />
    );
  } else if (!promotions || promotions.length === 0) {
    content = (
      <View style={styles.emptyWrap}>
        <EmptyState
          icon="megaphone-outline"
          title="No promotions yet"
          subtitle="Promote a listing from your inventory — it gets a labelled Sponsored slot in discovery, charged daily from your balance."
        />
      </View>
    );
  } else {
    content = (
      <FlashList<SellerPromotion>
        data={promotions}
        keyExtractor={(p) => p.id}
        renderItem={renderRow}
        ListHeaderComponent={listHeader}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={() => void handleRefresh()}
            tintColor={colors.textMuted}
          />
        }
      />
    );
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      <FlagshipScreen
        header={
          <FlagshipHeader title="Promotions" variant="modal" onClose={onClose} />
        }
        scrollEnabled={false}
        contentStyle={{ paddingHorizontal: 0, paddingTop: 0 }}
      >
        {content}
      </FlagshipScreen>

      {/* End is permanent for the promotion — confirm before committing. */}
      <ConfirmationSheet
        visible={confirmEnd !== null}
        onDismiss={() => setConfirmEnd(null)}
        title="End promotion"
        message={
          confirmEnd
            ? `End the promotion for “${confirmEnd.listingTitle ?? 'this listing'}”? It stops serving immediately and can’t be restarted — you’d create a new one.`
            : undefined
        }
        confirmLabel="End promotion"
        cancelLabel="Keep it"
        variant="danger"
        onConfirm={() => {
          const target = confirmEnd;
          setConfirmEnd(null);
          if (target) void runAction(target, 'end');
        }}
      />
    </Modal>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    emptyWrap: {
      flex: 1,
      justifyContent: 'center' },
    ledger: {
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
      marginBottom: Space.xs },
    row: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: Space.sm,
      paddingHorizontal: Space.md,
      paddingVertical: Space.sm + 2 },
    rowBorder: {
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border },
    thumbWrap: {
      width: Space.xxl,
      height: Space.xxl,
      borderRadius: Radius.md,
      overflow: 'hidden' },
    thumb: {
      width: Space.xxl,
      height: Space.xxl },
    thumbFallback: {
      backgroundColor: colors.surfaceAlt,
      alignItems: 'center',
      justifyContent: 'center' },
    rowBody: {
      flex: 1,
      gap: Space.xs / 2,
      minWidth: 0 },
    rowTitle: {
      fontSize: TypographyV2.body.size,
      fontFamily: TypographyV2.body.fontFamily,
      letterSpacing: TypographyV2.body.letterSpacing,
      color: colors.textPrimary },
    statusText: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.bodyStrong.fontFamily,
      letterSpacing: TypographyV2.meta.letterSpacing },
    metricsText: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      color: colors.textMuted,
      lineHeight: TypographyV2.meta.lineHeight },
    actionsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: Space.xs,
      minHeight: Space.lg },
  });
