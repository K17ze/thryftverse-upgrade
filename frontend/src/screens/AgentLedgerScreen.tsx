/**
 * AgentLedgerScreen — server-backed durable agent run records.
 *
 * Phase 4 replaces the device-local activity log with real server-backed
 * run records from GET /agent-runs. Each row shows the bot, status,
 * trigger, token usage, timing, and (for failed runs) the error.
 *
 * Per AGENTS.md §4 (Anti-AI design):
 *  - Flat list with hairline separators, not grey cards.
 *  - Status as colored text, not decorative badges.
 *  - One icon family (Ionicons), consistent optical size.
 *  - Loading skeleton matching final row layout.
 *  - Complete state coverage: loading, empty, error+retry, populated.
 */

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { useAppTheme, type ThemeColors } from '../theme/ThemeContext';
import { useHaptic } from '../hooks/useHaptic';
import { FlagshipScreen, FlagshipHeader } from '../components/flagship';
import { Space, Radius, Control } from '../theme/designTokens';
import { TypographyV2 } from '../theme/typography.v2';
import { useStore } from '../store/useStore';
import { ConfirmationSheet } from '../components/ConfirmationSheet';
import type { AgentRunInfo, ApprovalRequestInfo } from '../services/botsApi';
import { useAppTranslation } from '../i18n/useAppTranslation';

type Props = NativeStackScreenProps<RootStackParamList, 'AgentLedger'>;

type RunStatus = AgentRunInfo['status'];

const STATUS_COLOR_KEY: Record<RunStatus, 'success' | 'danger' | 'social' | 'textMuted' | 'warning'> = {
  succeeded: 'success',
  failed: 'danger',
  running: 'social',
  queued: 'textMuted',
  cancelled: 'textMuted',
  timed_out: 'warning',
  unknown_outcome: 'warning',
  waiting_for_approval: 'warning',
  waiting_for_input: 'warning',
};

const STATUS_LABEL_KEY: Record<RunStatus, string> = {
  succeeded: 'status.succeeded',
  failed: 'status.failed',
  running: 'status.running',
  queued: 'status.queued',
  cancelled: 'status.cancelled',
  timed_out: 'status.timedOut',
  unknown_outcome: 'status.unknown',
  waiting_for_approval: 'status.awaitingApproval',
  waiting_for_input: 'status.awaitingInput',
};

const TRIGGER_ICON: Record<string, keyof typeof Ionicons.glyphMap> = {
  mention: 'at-outline',
  command: 'terminal-outline',
  always: 'infinite-outline',
  manual: 'hand-right-outline',
  test: 'flask-outline',
};

const CANCELLABLE: ReadonlySet<RunStatus> = new Set(['queued', 'running']);

export default function AgentLedgerScreen({ navigation }: Props) {
  const { colors } = useAppTheme();
  const haptic = useHaptic();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const { t } = useAppTranslation('agentLedger');

  const agentRuns = useStore((s) => s.agentRuns);
  const loadAgentRuns = useStore((s) => s.loadAgentRuns);
  const cancelAgentRun = useStore((s) => s.cancelAgentRun);
  const pendingApprovals = useStore((s) => s.pendingApprovals);
  const loadPendingApprovals = useStore((s) => s.loadPendingApprovals);
  const approveRequest = useStore((s) => s.approveRequest);
  const rejectRequest = useStore((s) => s.rejectRequest);
  const customBots = useStore((s) => s.customBots);
  const availableChatBots = useStore((s) => s.availableChatBots);

  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [refreshing, setRefreshing] = React.useState(false);
  const [cancellingId, setCancellingId] = React.useState<string | null>(null);
  const [approvingId, setApprovingId] = React.useState<string | null>(null);
  const [rejectingId, setRejectingId] = React.useState<string | null>(null);
  const [confirmSheet, setConfirmSheet] = React.useState<{
    visible: boolean;
    title: string;
    message: string;
    confirmLabel?: string;
    variant?: 'default' | 'danger';
    onConfirm: () => void;
  }>({ visible: false, title: '', message: '', onConfirm: () => {} });

  const botNameById = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const b of customBots) map.set(b.id, b.name);
    for (const b of availableChatBots) if (!map.has(b.id)) map.set(b.id, b.name);
    return map;
  }, [customBots, availableChatBots]);

  const load = React.useCallback(
    async (isRefresh: boolean) => {
      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setError(null);
      try {
        await Promise.all([
          loadAgentRuns({ limit: 100 }),
          loadPendingApprovals(),
        ]);
      } catch (e) {
        setError(e instanceof Error ? e.message : t('error.loadFailed'));
      } finally {
        if (isRefresh) setRefreshing(false);
        else setLoading(false);
      }
    },
    [loadAgentRuns, loadPendingApprovals]
  );

  React.useEffect(() => {
    load(false);
  }, [load]);

  const handleCancel = (run: AgentRunInfo) => {
    haptic.medium();
    setConfirmSheet({
      visible: true,
      title: t('cancel.confirmTitle'),
      message: t('cancel.confirmMessage', { botName: botNameById.get(run.botId) ?? run.botId }),
      confirmLabel: t('cancel.confirmLabel'),
      variant: 'danger',
      onConfirm: async () => {
        setCancellingId(run.id);
        try {
          await cancelAgentRun(run.id);
          haptic.selection();
        } catch (e) {
          haptic.heavy();
          setConfirmSheet({
            visible: true,
            title: t('cancel.errorTitle'),
            message: e instanceof Error ? e.message : t('cancel.errorMessage'),
            confirmLabel: t('common:buttons.ok'),
            variant: 'default',
            onConfirm: () => {},
          });
        } finally {
          setCancellingId(null);
        }
      },
    });
  };

  const handleApprove = (approval: ApprovalRequestInfo) => {
    haptic.medium();
    setApprovingId(approval.id);
    approveRequest(approval.id)
      .then(() => haptic.selection())
      .catch((e: unknown) => {
        haptic.heavy();
        setConfirmSheet({
          visible: true,
          title: t('approvals.errorApproveTitle'),
          message: e instanceof Error ? e.message : t('approvals.errorApproveMessage'),
          confirmLabel: t('common:buttons.ok'),
          variant: 'default',
          onConfirm: () => {},
        });
      })
      .finally(() => setApprovingId(null));
  };

  const handleReject = (approval: ApprovalRequestInfo) => {
    haptic.medium();
    setRejectingId(approval.id);
    rejectRequest(approval.id)
      .then(() => haptic.selection())
      .catch((e: unknown) => {
        haptic.heavy();
        setConfirmSheet({
          visible: true,
          title: t('approvals.errorRejectTitle'),
          message: e instanceof Error ? e.message : t('approvals.errorRejectMessage'),
          confirmLabel: t('common:buttons.ok'),
          variant: 'default',
          onConfirm: () => {},
        });
      })
      .finally(() => setRejectingId(null));
  };

  const formatToolArguments = (toolName: string, args: Record<string, unknown>): string => {
    switch (toolName) {
      case 'draft_reply': {
        const text = args.text;
        return typeof text === 'string' ? text : '';
      }
      case 'search_listings': {
        const query = args.query;
        return typeof query === 'string' ? t('tools.search', { query }) : '';
      }
      case 'get_listing_details': {
        const listingId = args.listingId;
        return typeof listingId === 'string' ? t('tools.listing', { listingId }) : '';
      }
      case 'check_price_history': {
        const query = args.query;
        return typeof query === 'string' ? t('tools.priceHistory', { query }) : '';
      }
      case 'read_conversation': {
        const limit = args.limit;
        const n = typeof limit === 'number' ? limit : 20;
        return t('tools.readMessages', { count: n });
      }
      default: {
        try {
          const entries = Object.entries(args);
          if (entries.length === 0) return '';
          return entries
            .map(([k, v]) => `${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`)
            .join(', ');
        } catch {
          return '';
        }
      }
    }
  };

  const formatDate = (iso: string): string => {
    try {
      const d = new Date(iso);
      const now = new Date();
      const diffMs = now.getTime() - d.getTime();
      const diffMin = Math.floor(diffMs / 60000);
      const diffHr = Math.floor(diffMin / 60);
      const diffDay = Math.floor(diffHr / 24);
      if (diffMin < 1) return t('time.justNow');
      if (diffMin < 60) return t('time.minutesAgo', { count: diffMin });
      if (diffHr < 24) return t('time.hoursAgo', { count: diffHr });
      if (diffDay < 7) return t('time.daysAgo', { count: diffDay });
      return d.toLocaleDateString();
    } catch {
      return iso;
    }
  };

  const formatDuration = (startedAt: string | null, completedAt: string | null): string | null => {
    if (!startedAt || !completedAt) return null;
    try {
      const ms = new Date(completedAt).getTime() - new Date(startedAt).getTime();
      if (ms < 0 || !isFinite(ms)) return null;
      if (ms < 1000) return `${ms}ms`;
      const s = Math.round(ms / 1000);
      if (s < 60) return `${s}s`;
      const m = Math.floor(s / 60);
      const rem = s % 60;
      return rem ? `${m}m ${rem}s` : `${m}m`;
    } catch {
      return null;
    }
  };

  const statusColor = (status: RunStatus): string => colors[STATUS_COLOR_KEY[status]];

  // --- Loading skeleton ---
  if (loading) {
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
        <View style={styles.list}>
          {[0, 1, 2, 3, 4].map((i) => (
            <View
              key={i}
              style={[
                styles.row,
                i < 4 && { borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth },
              ]}
            >
              <View style={[styles.skeletonIcon, { backgroundColor: colors.surfaceAlt }]} />
              <View style={styles.rowBody}>
                <View style={styles.rowHeader}>
                  <View style={[styles.skeletonBar, { backgroundColor: colors.surfaceAlt, width: 120 }]} />
                  <View style={[styles.skeletonBar, { backgroundColor: colors.surfaceAlt, width: 40 }]} />
                </View>
                <View style={[styles.skeletonBar, { backgroundColor: colors.surfaceAlt, width: 200, marginTop: Space.xs }]} />
                <View style={[styles.skeletonBar, { backgroundColor: colors.surfaceAlt, width: 140, marginTop: Space.xs / 2 }]} />
              </View>
            </View>
          ))}
        </View>
      </FlagshipScreen>
    );
  }

  // --- Error state ---
  if (error && agentRuns.length === 0) {
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
        <View style={styles.stateWrap}>
          <View style={[styles.stateIcon, { backgroundColor: colors.surfaceAlt }]}>
            <Ionicons name="cloud-offline-outline" size={28} color={colors.textMuted} />
          </View>
          <Text style={[styles.stateTitle, { color: colors.textPrimary }]}>
            {t('error.title')}
          </Text>
          <Text style={[styles.stateBody, { color: colors.textSecondary }]}>
            {error}
          </Text>
          <Pressable
            onPress={() => load(false)}
            hitSlop={8}
            style={({ pressed }) => [styles.retryBtn, { backgroundColor: colors.surfaceAlt, opacity: pressed ? 0.7 : 1 }]}
          >
            <Text style={[styles.retryText, { color: colors.textPrimary }]}>{t('error.retry')}</Text>
          </Pressable>
        </View>
      </FlagshipScreen>
    );
  }

  // --- Empty state ---
  if (agentRuns.length === 0) {
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
        <View style={styles.stateWrap}>
          <View style={[styles.stateIcon, { backgroundColor: colors.surfaceAlt }]}>
            <Ionicons name="flash-outline" size={28} color={colors.textMuted} />
          </View>
          <Text style={[styles.stateTitle, { color: colors.textPrimary }]}>
            {t('empty.title')}
          </Text>
          <Text style={[styles.stateBody, { color: colors.textSecondary }]}>
            {t('empty.body')}
          </Text>
        </View>
        <View style={styles.footerNote}>
          <Text style={[styles.footerNoteText, { color: colors.textMuted }]}>
            {t('footer.note')}
          </Text>
        </View>
      </FlagshipScreen>
    );
  }

  // --- Populated ---
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
        style={styles.scrollView}
        contentContainerStyle={styles.scrollViewContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => load(true)}
            tintColor={colors.textMuted}
          />
        }
      >
        {pendingApprovals.length > 0 ? (
          <View style={styles.list}>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
                {t('approvals.title')}
              </Text>
              <Text style={[styles.sectionCount, { color: colors.textMuted }]}>
                {pendingApprovals.length}
              </Text>
            </View>
            {pendingApprovals.map((approval, index) => {
              const isLast = index === pendingApprovals.length - 1;
              const botName = botNameById.get(approval.botId) ?? approval.botId;
              const isDraftReply = approval.toolName === 'draft_reply';
              const argsText = formatToolArguments(approval.toolName, approval.toolArguments);
              const isApproving = approvingId === approval.id;
              const isRejecting = rejectingId === approval.id;
              const isBusy = isApproving || isRejecting;
              return (
                <View
                  key={approval.id}
                  style={[
                    styles.row,
                    !isLast && { borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth },
                  ]}
                >
                  <View style={[styles.triggerIcon, { backgroundColor: colors.surfaceAlt }]}>
                    <Ionicons name="clipboard-outline" size={16} color={colors.textPrimary} />
                  </View>
                  <View style={styles.rowBody}>
                    <View style={styles.rowHeader}>
                      <Text style={[styles.botName, { color: colors.textPrimary }]} numberOfLines={1}>
                        {botName}
                      </Text>
                      <Text style={[styles.timeText, { color: colors.textMuted }]}>
                        {formatDate(approval.createdAt)}
                      </Text>
                    </View>

                    <Text style={[styles.toolNameText, { color: colors.textSecondary }]} numberOfLines={1}>
                      {approval.toolName}
                    </Text>

                    {argsText ? (
                      isDraftReply ? (
                        <View style={[styles.quoteWrap, { borderLeftColor: colors.border }]}>
                          <Text style={[styles.quoteText, { color: colors.textPrimary }]} numberOfLines={4}>
                            {argsText}
                          </Text>
                        </View>
                      ) : (
                        <Text style={[styles.argsText, { color: colors.textSecondary }]} numberOfLines={3}>
                          {argsText}
                        </Text>
                      )
                    ) : null}

                    <View style={styles.approvalActions}>
                      <Pressable
                        onPress={() => handleApprove(approval)}
                        disabled={isBusy}
                        hitSlop={8}
                        style={({ pressed }) => [
                          styles.actionBtn,
                          { opacity: isApproving ? 0.5 : pressed ? 0.7 : 1 },
                        ]}
                      >
                        <Text style={[styles.approveText, { color: colors.success }]}>
                          {isApproving ? t('approvals.approving') : t('approvals.approve')}
                        </Text>
                      </Pressable>
                      <Pressable
                        onPress={() => handleReject(approval)}
                        disabled={isBusy}
                        hitSlop={8}
                        style={({ pressed }) => [
                          styles.actionBtn,
                          { opacity: isRejecting ? 0.5 : pressed ? 0.7 : 1 },
                        ]}
                      >
                        <Text style={[styles.rejectText, { color: colors.danger }]}>
                          {isRejecting ? t('approvals.rejecting') : t('approvals.reject')}
                        </Text>
                      </Pressable>
                    </View>
                  </View>
                </View>
              );
            })}
          </View>
        ) : null}

        <View style={styles.list}>
          {agentRuns.map((run, index) => {
            const isLast = index === agentRuns.length - 1;
            const name = botNameById.get(run.botId) ?? run.botId;
            const duration = formatDuration(run.startedAt, run.completedAt);
            const canCancel = CANCELLABLE.has(run.status);
            const triggerIcon = TRIGGER_ICON[run.triggerType] ?? 'play-outline';
            return (
              <View
                key={run.id}
                style={[
                  styles.row,
                  !isLast && { borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth },
                ]}
              >
                <View style={[styles.triggerIcon, { backgroundColor: colors.surfaceAlt }]}>
                  <Ionicons name={triggerIcon} size={16} color={colors.textPrimary} />
                </View>
                <View style={styles.rowBody}>
                  <View style={styles.rowHeader}>
                    <Text style={[styles.botName, { color: colors.textPrimary }]} numberOfLines={1}>
                      {name}
                    </Text>
                    <Text style={[styles.timeText, { color: colors.textMuted }]}>
                      {formatDate(run.createdAt)}
                    </Text>
                  </View>

                  <View style={styles.metaLine}>
                    <Text style={[styles.statusText, { color: statusColor(run.status) }]}>
                      {t(STATUS_LABEL_KEY[run.status])}
                    </Text>
                    <Text style={[styles.dotSep, { color: colors.textMuted }]}>·</Text>
                    <Text style={[styles.triggerText, { color: colors.textSecondary }]} numberOfLines={1}>
                      {run.triggerType}
                    </Text>
                    {duration ? (
                      <>
                        <Text style={[styles.dotSep, { color: colors.textMuted }]}>·</Text>
                        <Text style={[styles.durationText, { color: colors.textMuted }]}>
                          {duration}
                        </Text>
                      </>
                    ) : null}
                  </View>

                  {(run.inputTokens > 0 || run.outputTokens > 0) ? (
                    <Text style={[styles.tokenText, { color: colors.textMuted }]}>
                      {t('tokens.usage', { input: run.inputTokens.toLocaleString(), output: run.outputTokens.toLocaleString() })}
                    </Text>
                  ) : null}

                  {run.status === 'failed' && run.errorMessage ? (
                    <Text style={[styles.errorText, { color: colors.danger }]} numberOfLines={2}>
                      {run.errorMessage}
                    </Text>
                  ) : null}

                  {canCancel ? (
                    <Pressable
                      onPress={() => handleCancel(run)}
                      disabled={cancellingId === run.id}
                      hitSlop={8}
                      style={({ pressed }) => [
                        styles.cancelBtn,
                        { borderColor: colors.danger, opacity: cancellingId === run.id ? 0.5 : pressed ? 0.7 : 1 },
                      ]}
                    >
                      <Text style={[styles.cancelBtnText, { color: colors.danger }]}>
                        {cancellingId === run.id ? t('cancel.cancelling') : t('cancel.cancel')}
                      </Text>
                    </Pressable>
                  ) : null}
                </View>
              </View>
            );
          })}
        </View>

        <View style={styles.footerNote}>
          <Text style={[styles.footerNoteText, { color: colors.textMuted }]}>
            {t('footer.note')}
          </Text>
        </View>
      </ScrollView>
      <ConfirmationSheet
        visible={confirmSheet.visible}
        onDismiss={() => setConfirmSheet((s) => ({ ...s, visible: false }))}
        title={confirmSheet.title}
        message={confirmSheet.message}
        confirmLabel={confirmSheet.confirmLabel ?? t('common:buttons.confirm')}
        variant={confirmSheet.variant ?? 'default'}
        onConfirm={() => { confirmSheet.onConfirm(); setConfirmSheet((s) => ({ ...s, visible: false })); }}
      />
    </FlagshipScreen>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    scrollView: {
      flex: 1,
    },
    scrollViewContent: {
      paddingBottom: Space.xl,
    },
    list: {
      backgroundColor: colors.surface,
    },
    row: {
      flexDirection: 'row',
      gap: Space.sm,
      paddingHorizontal: Space.md,
      paddingVertical: Space.md,
    },
    triggerIcon: {
      width: Control.chrome,
      height: Control.chrome,
      borderRadius: Radius.md,
      justifyContent: 'center',
      alignItems: 'center',
      flexShrink: 0,
    },
    rowBody: {
      flex: 1,
      minWidth: 0,
      gap: Space.xs / 2,
    },
    rowHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: Space.sm,
    },
    botName: {
      fontSize: TypographyV2.bodyStrong.size,
      fontFamily: TypographyV2.bodyStrong.fontFamily,
      letterSpacing: TypographyV2.body.letterSpacing,
      flex: 1,
      minWidth: 0,
    },
    timeText: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      letterSpacing: TypographyV2.meta.letterSpacing,
      flexShrink: 0,
    },
    metaLine: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs / 2,
      flexWrap: 'wrap',
    },
    statusText: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      letterSpacing: TypographyV2.meta.letterSpacing,
    },
    dotSep: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
    },
    triggerText: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      letterSpacing: TypographyV2.meta.letterSpacing,
    },
    durationText: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      letterSpacing: TypographyV2.meta.letterSpacing,
    },
    tokenText: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      letterSpacing: TypographyV2.meta.letterSpacing,
    },
    errorText: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      letterSpacing: TypographyV2.meta.letterSpacing,
      lineHeight: TypographyV2.meta.lineHeight,
    },
    cancelBtn: {
      alignSelf: 'flex-start',
      paddingHorizontal: Space.sm,
      paddingVertical: Space.xs / 2,
      borderRadius: Radius.sm,
      borderWidth: StyleSheet.hairlineWidth,
      marginTop: Space.xs / 2,
    },
    cancelBtnText: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      letterSpacing: TypographyV2.meta.letterSpacing,
    },
    // Approvals section
    sectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: Space.md,
      paddingTop: Space.md,
      paddingBottom: Space.sm,
    },
    sectionTitle: {
      fontSize: TypographyV2.bodyStrong.size,
      fontFamily: TypographyV2.bodyStrong.fontFamily,
      letterSpacing: TypographyV2.body.letterSpacing,
    },
    sectionCount: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      letterSpacing: TypographyV2.meta.letterSpacing,
    },
    toolNameText: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      letterSpacing: TypographyV2.meta.letterSpacing,
    },
    argsText: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      letterSpacing: TypographyV2.meta.letterSpacing,
      lineHeight: TypographyV2.meta.lineHeight,
    },
    quoteWrap: {
      borderLeftWidth: 2,
      paddingLeft: Space.sm,
      marginTop: Space.xs / 2,
    },
    quoteText: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      letterSpacing: TypographyV2.meta.letterSpacing,
      lineHeight: TypographyV2.meta.lineHeight,
      fontStyle: 'italic',
    },
    approvalActions: {
      flexDirection: 'row',
      gap: Space.lg,
      marginTop: Space.xs,
    },
    actionBtn: {
      paddingVertical: Space.xs / 2,
    },
    approveText: {
      fontSize: TypographyV2.bodyStrong.size,
      fontFamily: TypographyV2.bodyStrong.fontFamily,
      letterSpacing: TypographyV2.body.letterSpacing,
    },
    rejectText: {
      fontSize: TypographyV2.bodyStrong.size,
      fontFamily: TypographyV2.bodyStrong.fontFamily,
      letterSpacing: TypographyV2.body.letterSpacing,
    },
    // Skeleton
    skeletonIcon: {
      width: Control.chrome,
      height: Control.chrome,
      borderRadius: Radius.md,
      flexShrink: 0,
    },
    skeletonBar: {
      height: 12,
      borderRadius: Radius.sm,
    },
    // Empty / error state
    stateWrap: {
      alignItems: 'center',
      paddingVertical: Space.xxl,
      paddingHorizontal: Space.lg,
    },
    stateIcon: {
      width: Space.xxl,
      height: Space.xxl,
      borderRadius: Radius.full,
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: Space.md,
    },
    stateTitle: {
      fontSize: TypographyV2.sectionTitle.size,
      fontFamily: TypographyV2.sectionTitle.fontFamily,
      letterSpacing: TypographyV2.sectionTitle.letterSpacing,
      marginBottom: Space.xs,
    },
    stateBody: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      lineHeight: TypographyV2.meta.lineHeight + 2,
      letterSpacing: TypographyV2.meta.letterSpacing,
      textAlign: 'center',
    },
    retryBtn: {
      marginTop: Space.md,
      paddingHorizontal: Space.lg,
      paddingVertical: Space.sm,
      borderRadius: Radius.md,
    },
    retryText: {
      fontSize: TypographyV2.bodyStrong.size,
      fontFamily: TypographyV2.bodyStrong.fontFamily,
      letterSpacing: TypographyV2.body.letterSpacing,
    },
    footerNote: {
      paddingHorizontal: Space.md,
      paddingVertical: Space.lg,
    },
    footerNoteText: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      letterSpacing: TypographyV2.meta.letterSpacing,
      lineHeight: TypographyV2.meta.lineHeight,
    },
  });
}
