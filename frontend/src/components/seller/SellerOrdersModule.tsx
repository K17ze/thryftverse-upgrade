/**
 * SellerOrdersModule — Orders pillar of the Seller Hub overview.
 *
 * Composition (flat canvas, no card chrome — the thumbnail image IS the surface):
 *   1. Section header — semantic glyph + "Orders" + pending-to-ship count + "View all".
 *   2. Media rail — horizontal rail of real selling orders (96dp thumbnails,
 *      price, status) with SLA chips computed from shipByDate.
 *   3. Flat task rows — hairline-separated non-order tasks (offers, listing
 *      issues, catalogue, payout holds) with SLA due labels.
 *   4. Honest empty state — "All clear", qualified when sources are stale.
 *
 * Per Design.md + AGENTS.md anti-AI policy: no spinners (skeleton rail while
 * loading), no decorative chrome, tabular figures on every number.
 */

import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { Space, Radius, FontFamily, Control } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { AnimatedPressable } from '../AnimatedPressable';
import { AppIcon } from '../common/AppIcon';
import { CachedImage } from '../CachedImage';
import { IconSize, type IconConcept, type SemanticIconName } from '../../theme/iconTokens';
import type { SellerHubTask, SellerHubTaskType } from '../../services/sellerHubApi';

export interface SellerOrderPreview {
  id: string;
  title: string;
  imageUri: string | null;
  totalGbp: number;
  status: string;
  createdAt: string;
  shipByDate: string | null;
}

export interface SellerOrdersModuleProps {
  orders: SellerOrderPreview[];
  isOrdersLoading?: boolean;
  tasks: SellerHubTask[];
  topTask: SellerHubTask | null;
  pendingOrdersCount: number;
  /** Sum of evidenced consequence amounts across tasks. Zero omits money language. */
  atStakeGbp?: number;
  orders30dCount: number;
  tasksStale?: boolean;
  formatMoney: (value: number | null | undefined) => string;
  onOpenOrder: (orderId: string) => void;
  onNavigateToTask: (task: SellerHubTask) => void;
  onViewAllOrders: () => void;
}

const TASK_ICON: Record<SellerHubTaskType, { concept?: IconConcept; name?: SemanticIconName }> = {
  ship_order: { concept: 'package' },
  respond_offer: { concept: 'chat' },
  listing_issue: { concept: 'edit' },
  catalogue_awaiting: { name: 'download' },
  payout_hold: { concept: 'wallet' },
};

interface OrderSla {
  label: string;
  tone: 'danger' | 'soon';
}

/** Ship-by SLA for an order preview — null when no deadline or comfortably outside the window. */
function orderSla(shipByDate: string | null): OrderSla | null {
  if (!shipByDate) return null;
  const due = new Date(shipByDate);
  if (isNaN(due.getTime())) return null;
  const diffHours = (due.getTime() - Date.now()) / (1000 * 60 * 60);
  if (diffHours < 0) return { label: 'Overdue', tone: 'danger' };
  if (diffHours < 24) return { label: `${Math.ceil(diffHours)}h to ship`, tone: 'danger' };
  if (diffHours < 48) return { label: `${Math.ceil(diffHours / 24)}d to ship`, tone: 'soon' };
  return null;
}

function formatDueAt(dueAt: string | null): string | null {
  if (!dueAt) return null;
  const due = new Date(dueAt);
  if (isNaN(due.getTime())) return null;
  const diffMs = due.getTime() - Date.now();
  const diffHours = diffMs / (1000 * 60 * 60);
  if (diffHours < 0) return 'Overdue SLA';
  if (diffHours < 12) return `Critical SLA · ${Math.ceil(diffHours)}h left`;
  if (diffHours < 24) return `SLA: ${Math.ceil(diffHours)}h remaining`;
  const diffDays = Math.ceil(diffHours / 24);
  return `Due in ${diffDays}d`;
}

function taskTitle(task: SellerHubTask): string {
  return task.count > 1 ? `${task.count} ${task.actionLabel.toLowerCase()}` : task.actionLabel;
}

function isUrgentDue(dueLabel: string | null): boolean {
  return !!dueLabel && (dueLabel.includes('Overdue') || dueLabel.includes('Critical'));
}

function consequenceCopy(task: SellerHubTask): string {
  if (task.type === 'ship_order') return 'Payout held.';
  switch (task.consequence?.kind) {
    case 'money':
      return 'Payout held.';
    case 'buyer':
      return 'Buyer waiting.';
    case 'trust':
      return 'Affects rating.';
    case 'listing':
      return 'Visibility restricted.';
    default:
      return 'Respond soon.';
  }
}

export const SellerOrdersModule: React.FC<SellerOrdersModuleProps> = ({
  orders,
  isOrdersLoading = false,
  tasks,
  topTask,
  pendingOrdersCount,
  atStakeGbp = 0,
  orders30dCount,
  tasksStale = false,
  formatMoney,
  onOpenOrder,
  onNavigateToTask,
  onViewAllOrders,
}) => {
  const { colors } = useAppTheme();
  const styles = createStyles(colors);

  // Non-order tasks only — ship_order work is carried by the media rail above.
  const nonShipTasks = tasks.filter((task) => task.type !== 'ship_order');
  const orderedTasks =
    topTask && topTask.type !== 'ship_order'
      ? [topTask, ...nonShipTasks.filter((task) => task.id !== topTask.id)]
      : nonShipTasks;
  const visibleTasks = orderedTasks.slice(0, 4);

  const ordersEmpty = !isOrdersLoading && orders.length === 0;
  const showClearRow = !ordersEmpty && visibleTasks.length === 0;

  return (
    <View style={styles.container}>
      {/* ── Section header ── */}
      <View style={styles.headerRow}>
        <View style={styles.headerLead}>
          <AppIcon concept="package" size={IconSize.xs} color="textSecondary" accessible={false} />
          <Text style={styles.sectionTitle}>Orders</Text>
          {pendingOrdersCount > 0 ? (
            <Text style={styles.pendingCount}>{pendingOrdersCount} to ship</Text>
          ) : null}
        </View>
        <AnimatedPressable
          onPress={onViewAllOrders}
          activeOpacity={0.7}
          scaleValue={0.97}
          hapticFeedback="light"
          accessibilityRole="button"
          accessibilityLabel={`View all orders, ${orders30dCount} in the last 30 days`}
          style={styles.viewAllHit}
        >
          <Text style={styles.viewAllText}>View all</Text>
        </AnimatedPressable>
      </View>

      {/* ── Triage summary — the seller's next action, stated once ── */}
      {(pendingOrdersCount > 0 || atStakeGbp > 0) && (
        <Text style={styles.triageLine} accessibilityRole="text">
          {pendingOrdersCount > 0 ? (
            <Text style={[styles.triageShip, { color: colors.danger }]}>
              {pendingOrdersCount} to ship
            </Text>
          ) : null}
          {pendingOrdersCount > 0 && atStakeGbp > 0 ? (
            <Text style={{ color: colors.textMuted }}> · </Text>
          ) : null}
          {atStakeGbp > 0 ? (
            <Text style={{ color: colors.textSecondary }}>
              {formatMoney(atStakeGbp)} at stake
            </Text>
          ) : null}
        </Text>
      )}

      {/* ── Media rail (skeleton while loading) ── */}
      {isOrdersLoading ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.railContent}
        >
          {[0, 1, 2].map((i) => (
            <View key={i} style={styles.skeletonCard}>
              <View style={styles.skeletonThumb} />
              <View style={[styles.skeletonLine, { width: 84 }]} />
              <View style={[styles.skeletonLine, { width: 52 }]} />
            </View>
          ))}
        </ScrollView>
      ) : orders.length > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.railContent}
        >
          {orders.map((order) => {
            const sla = orderSla(order.shipByDate);
            return (
              <AnimatedPressable
                key={order.id}
                style={styles.orderCard}
                onPress={() => onOpenOrder(order.id)}
                activeOpacity={0.7}
                scaleValue={0.97}
                hapticFeedback="light"
                accessibilityRole="button"
                accessibilityLabel={`Order ${order.title}, ${formatMoney(order.totalGbp)}${order.status ? `, ${order.status}` : ''}`}
              >
                <View style={styles.thumbWrap}>
                  {order.imageUri ? (
                    <CachedImage
                      uri={order.imageUri}
                      style={styles.thumb}
                      contentFit="cover"
                      downscaleWidth={264}
                    />
                  ) : (
                    <View style={[styles.thumb, styles.thumbEmpty]}>
                      <AppIcon concept="package" size={IconSize.sm} color="textMuted" accessible={false} />
                    </View>
                  )}
                  {sla ? (
                    <View
                      style={[
                        styles.slaChip,
                        { backgroundColor: sla.tone === 'danger' ? colors.dangerSubtle : colors.surfaceAlt },
                      ]}
                    >
                      <Text
                        style={[
                          styles.slaChipText,
                          { color: sla.tone === 'danger' ? colors.danger : colors.textSecondary },
                        ]}
                      >
                        {sla.label}
                      </Text>
                    </View>
                  ) : null}
                </View>
                <Text style={styles.orderTitle} numberOfLines={1}>
                  {order.title}
                </Text>
                <Text style={styles.orderPrice}>{formatMoney(order.totalGbp)}</Text>
                {order.status ? (
                  <Text style={styles.orderStatus} numberOfLines={1}>
                    {order.status}
                  </Text>
                ) : null}
              </AnimatedPressable>
            );
          })}
        </ScrollView>
      ) : null}

      {/* ── Orders-only empty state ── */}
      {!isOrdersLoading && orders.length === 0 ? (
        <View style={styles.clearRow}>
          <View style={[styles.taskIconWrap, { backgroundColor: colors.surfaceAlt }]}>
            <AppIcon concept="package" size={IconSize.xs} color="textMuted" accessible={false} />
          </View>
          <View style={styles.taskInfo}>
            <Text style={styles.clearTitle}>No orders yet</Text>
          </View>
        </View>
      ) : null}

      {/* ── Flat task rows ── */}
      {visibleTasks.length > 0 ? (
        <View style={styles.taskList}>
          {visibleTasks.map((task) => {
            const dueLabel = formatDueAt(task.dueAt);
            const urgent = isUrgentDue(dueLabel);
            const critical = task.priority === 'critical';
            const subtitle =
              task.consequence?.amountGbp != null && task.consequence.amountGbp > 0
                ? `${formatMoney(task.consequence.amountGbp)} at stake · ${consequenceCopy(task)}`
                : consequenceCopy(task);
            return (
              <AnimatedPressable
                key={task.id}
                style={styles.taskRow}
                onPress={() => onNavigateToTask(task)}
                activeOpacity={0.7}
                scaleValue={0.985}
                hapticFeedback="light"
                accessibilityRole="button"
                accessibilityLabel={`${taskTitle(task)}${dueLabel ? `, ${dueLabel}` : ''}`}
              >
                <View style={styles.taskIconWrap}>
                  <AppIcon
                    concept={TASK_ICON[task.type].concept}
                    name={TASK_ICON[task.type].name}
                    size={IconSize.xs}
                    color={critical ? 'danger' : 'brand'}
                    accessible={false}
                  />
                </View>
                <View style={styles.taskInfo}>
                  <Text style={[styles.taskTitle, { color: critical ? colors.danger : colors.textPrimary }]}>
                    {taskTitle(task)}
                  </Text>
                  <Text style={styles.taskConsequence} numberOfLines={1}>
                    {subtitle}
                  </Text>
                </View>
                {dueLabel ? (
                  <Text style={[styles.taskDue, { color: urgent ? colors.danger : colors.textMuted }]}>
                    {dueLabel}
                  </Text>
                ) : null}
                <AppIcon concept="forward" size={IconSize.xs} color="textMuted" accessible={false} />
              </AnimatedPressable>
            );
          })}
        </View>
      ) : showClearRow ? (
        /* ── Clear state — honest, and qualified when sources are stale ── */
        <View style={styles.clearRow}>
          <View style={[styles.taskIconWrap, { backgroundColor: colors.successSubtle }]}>
            <AppIcon concept="check" size={IconSize.xs} color="success" accessible={false} />
          </View>
          <View style={styles.taskInfo}>
            <Text style={styles.clearTitle}>All clear</Text>
            <Text style={styles.clearSub}>
              {tasksStale ? 'Status may be out of date — pull to refresh' : 'Nothing waiting on you'}
            </Text>
          </View>
        </View>
      ) : null}
    </View>
  );
};

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: {
      marginTop: Space.lg,
    },

    // ── Section header ──
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: Space.md,
      marginBottom: Space.xs,
    },
    headerLead: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.sm,
    },
    sectionTitle: {
      fontSize: TypographyV2.sectionTitle.size,
      lineHeight: TypographyV2.sectionTitle.lineHeight,
      fontFamily: FontFamily.bold,
      letterSpacing: TypographyV2.sectionTitle.letterSpacing,
      color: colors.textPrimary,
    },
    pendingCount: {
      fontSize: TypographyV2.meta.size,
      lineHeight: TypographyV2.meta.lineHeight,
      fontFamily: FontFamily.semibold,
      fontVariant: ['tabular-nums'],
      color: colors.danger,
    },
    viewAllHit: {
      minHeight: Control.hit,
      justifyContent: 'center',
      paddingLeft: Space.sm,
    },
    viewAllText: {
      fontSize: TypographyV2.caption.size,
      lineHeight: TypographyV2.caption.lineHeight,
      fontFamily: FontFamily.semibold,
      color: colors.brand,
    },
    triageLine: {
      paddingHorizontal: Space.md,
      marginTop: Space.xxs,
      fontSize: TypographyV2.meta.size,
      lineHeight: TypographyV2.meta.lineHeight,
      fontFamily: FontFamily.semibold,
      fontVariant: ['tabular-nums'],
    },
    triageShip: {
      fontVariant: ['tabular-nums'],
    },

    // ── Media rail — flat canvas, image radius IS the containment ──
    railContent: {
      paddingHorizontal: Space.md,
      gap: Space.sm,
      paddingVertical: Space.xxs,
    },
    orderCard: {
      width: 140,
    },
    thumbWrap: {
      width: 132,
      height: 132,
    },
    thumb: {
      width: 132,
      height: 132,
      borderRadius: Radius.md,
    },
    thumbEmpty: {
      backgroundColor: colors.surfaceAlt,
      alignItems: 'center',
      justifyContent: 'center',
    },
    slaChip: {
      position: 'absolute',
      top: Space.xs,
      left: Space.xs,
      borderRadius: Radius.full,
      paddingHorizontal: Space.xs,
      paddingVertical: Space.xxs,
    },
    slaChipText: {
      fontSize: TypographyV2.meta.size,
      lineHeight: TypographyV2.meta.lineHeight,
      fontFamily: FontFamily.semibold,
      fontVariant: ['tabular-nums'],
      letterSpacing: TypographyV2.meta.letterSpacing,
    },
    orderTitle: {
      marginTop: Space.xs,
      fontSize: TypographyV2.caption.size,
      lineHeight: TypographyV2.caption.lineHeight,
      fontFamily: FontFamily.medium,
      letterSpacing: TypographyV2.caption.letterSpacing,
      color: colors.textPrimary,
    },
    orderPrice: {
      marginTop: Space.xxs,
      fontSize: TypographyV2.meta.size,
      lineHeight: TypographyV2.meta.lineHeight,
      fontFamily: FontFamily.semibold,
      letterSpacing: TypographyV2.meta.letterSpacing,
      fontVariant: ['tabular-nums'],
      color: colors.textPrimary,
    },
    orderStatus: {
      marginTop: Space.xxs,
      fontSize: TypographyV2.meta.size,
      lineHeight: TypographyV2.meta.lineHeight,
      fontFamily: FontFamily.regular,
      letterSpacing: TypographyV2.meta.letterSpacing,
      color: colors.textMuted,
    },

    // ── Flat task rows — hairline separated, no card chrome ──
    taskList: {
      paddingHorizontal: Space.md,
    },
    taskRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.sm,
      paddingVertical: Space.sm,
      minHeight: Control.hit,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.borderSubtle,
    },
    taskIconWrap: {
      width: 30,
      height: 30,
      borderRadius: Radius.full,
      backgroundColor: colors.surfaceAlt,
      alignItems: 'center',
      justifyContent: 'center',
    },
    taskInfo: {
      flex: 1,
      gap: 1,
    },
    taskTitle: {
      fontSize: TypographyV2.caption.size,
      lineHeight: TypographyV2.caption.lineHeight,
      fontFamily: FontFamily.medium,
    },
    taskConsequence: {
      fontSize: TypographyV2.meta.size,
      lineHeight: TypographyV2.meta.lineHeight,
      fontFamily: FontFamily.regular,
      letterSpacing: TypographyV2.meta.letterSpacing,
      color: colors.textMuted,
    },
    taskDue: {
      fontSize: TypographyV2.meta.size,
      lineHeight: TypographyV2.meta.lineHeight,
      fontFamily: FontFamily.semibold,
      fontVariant: ['tabular-nums'],
    },

    // ── Clear state ──
    clearRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.sm,
      paddingHorizontal: Space.md,
      paddingVertical: Space.sm,
      minHeight: Control.hit,
    },
    clearTitle: {
      fontSize: TypographyV2.caption.size,
      lineHeight: TypographyV2.caption.lineHeight,
      fontFamily: FontFamily.semibold,
      color: colors.textPrimary,
    },
    clearSub: {
      fontSize: TypographyV2.meta.size,
      lineHeight: TypographyV2.meta.lineHeight,
      fontFamily: FontFamily.regular,
      letterSpacing: TypographyV2.meta.letterSpacing,
      color: colors.textMuted,
    },

    // ── Skeletons — media-shaped, no spinners ──
    skeletonCard: {
      width: 140,
    },
    skeletonThumb: {
      width: 132,
      height: 132,
      borderRadius: Radius.md,
      backgroundColor: colors.surfaceAlt,
    },
    skeletonLine: {
      height: 10,
      marginTop: Space.xs,
      borderRadius: Radius.sm,
      backgroundColor: colors.surfaceAlt,
    },
  });
}
