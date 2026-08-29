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
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { useAppTheme, type ThemeColors } from '../theme/ThemeContext';
import { useHaptic } from '../hooks/useHaptic';
import { FlagshipScreen, FlagshipHeader } from '../components/flagship';
import { Space, Radius, Type, Typography, Control } from '../theme/designTokens';
import { useStore } from '../store/useStore';
import { ConfirmationSheet } from '../components/ConfirmationSheet';
import type { AgentRunInfo, ApprovalRequestInfo } from '../services/botsApi';

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

const STATUS_LABEL: Record<RunStatus, string> = {
  succeeded: 'Succeeded',
  failed: 'Failed',
  running: 'Running',
  queued: 'Queued',
  cancelled: 'Cancelled',
  timed_out: 'Timed out',
  unknown_outcome: 'Unknown',
  waiting_for_approval: 'Awaiting approval',
  waiting_for_input: 'Awaiting input',
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
        setError(e instanceof Error ? e.message : 'Failed to load runs');
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
    Alert.alert(
      'Cancel agent run',
      `Cancel the run for ${botNameById.get(run.botId) ?? run.botId}?`,
      [
        { text: 'Keep running', style: 'cancel' },
        {
          text: 'Cancel run',
          style: 'destructive',
          onPress: async () => {
            setCancellingId(run.id);
            try {
              await cancelAgentRun(run.id);
              haptic.selection();
            } catch (e) {
              haptic.heavy();
              Alert.alert(
                'Could not cancel',
                e instanceof Error ? e.message : 'The run could not be cancelled.'
              );
            } finally {
              setCancellingId(null);
            }
          },
        },
      ]
    );
  };

  const handleApprove = (approval: ApprovalRequestInfo) => {
    haptic.medium();
    setApprovingId(approval.id);
    approveRequest(approval.id)
      .then(() => haptic.selection())
      .catch((e: unknown) => {
        haptic.heavy();
        Alert.alert(
          'Could not approve',
          e instanceof Error ? e.message : 'The request could not be approved.'
        );
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
        Alert.alert(
          'Could not reject',
          e instanceof Error ? e.message : 'The request could not be rejected.'
        );
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
        return typeof query === 'string' ? `Search: ${query}` : '';
      }
      case 'get_listing_details': {
        const listingId = args.listingId;
        return typeof listingId === 'string' ? `Listing: ${listingId}` : '';
      }
      case 'check_price_history': {
        const query = args.query;
        return typeof query === 'string' ? `Price history: ${query}` : '';
      }
      case 'read_conversation': {
        const limit = args.limit;
        const n = typeof limit === 'number' ? limit : 20;
        return `Read ${n} messages`;
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
      if (diffMin < 1) return 'Just now';
      if (diffMin < 60) return `${diffMin}m ago`;
      if (diffHr < 24) return `${diffHr}h ago`;
      if (diffDay < 7) return `${diffDay}d ago`;
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
            title="Agent runs"
            subtitle="Server-backed execution records"
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
            title="Agent runs"
            subtitle="Server-backed execution records"
            onBack={() => navigation.goBack()}
          />
        }
      >
        <View style={styles.stateWrap}>
          <View style={[styles.stateIcon, { backgroundColor: colors.surfaceAlt }]}>
            <Ionicons name="cloud-offline-outline" size={28} color={colors.textMuted} />
          </View>
          <Text style={[styles.stateTitle, { color: colors.textPrimary }]}>
            Couldn't load runs
          </Text>
          <Text style={[styles.stateBody, { color: colors.textSecondary }]}>
            {error}
          </Text>
          <Pressable
            onPress={() => load(false)}
            hitSlop={8}
            style={({ pressed }) => [styles.retryBtn, { backgroundColor: colors.surfaceAlt, opacity: pressed ? 0.7 : 1 }]}
          >
            <Text style={[styles.retryText, { color: colors.textPrimary }]}>Retry</Text>
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
            title="Agent runs"
            subtitle="Server-backed execution records"
            onBack={() => navigation.goBack()}
          />
        }
      >
        <View style={styles.stateWrap}>
          <View style={[styles.stateIcon, { backgroundColor: colors.surfaceAlt }]}>
            <Ionicons name="flash-outline" size={28} color={colors.textMuted} />
          </View>
          <Text style={[styles.stateTitle, { color: colors.textPrimary }]}>
            No agent runs yet
          </Text>
          <Text style={[styles.stateBody, { color: colors.textSecondary }]}>
            When agents execute — via mentions, commands, or schedules — their runs appear here with status, token usage, and timing.
          </Text>
        </View>
        <View style={styles.footerNote}>
          <Text style={[styles.footerNoteText, { color: colors.textMuted }]}>
            Previously shown local activity log has been replaced with server-backed run records.
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
          title="Agent runs"
          subtitle="Server-backed execution records"
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
                Pending approvals
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
                          {isApproving ? 'Approving…' : 'Approve'}
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
                          {isRejecting ? 'Rejecting…' : 'Reject'}
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
                      {STATUS_LABEL[run.status]}
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
                      {run.inputTokens.toLocaleString()} in · {run.outputTokens.toLocaleString()} out
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
                        {cancellingId === run.id ? 'Cancelling…' : 'Cancel'}
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
            Previously shown local activity log has been replaced with server-backed run records.
          </Text>
        </View>
      </ScrollView>
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
      fontSize: Type.bodyStrong.size,
      fontFamily: Typography.family.semibold,
      letterSpacing: Type.body.letterSpacing,
      flex: 1,
      minWidth: 0,
    },
    timeText: {
      fontSize: Type.meta.size,
      fontFamily: Typography.family.regular,
      letterSpacing: Type.meta.letterSpacing,
      flexShrink: 0,
    },
    metaLine: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs / 2,
      flexWrap: 'wrap',
    },
    statusText: {
      fontSize: Type.caption.size,
      fontFamily: Typography.family.semibold,
      letterSpacing: Type.caption.letterSpacing,
    },
    dotSep: {
      fontSize: Type.caption.size,
      fontFamily: Typography.family.regular,
    },
    triggerText: {
      fontSize: Type.caption.size,
      fontFamily: Typography.family.regular,
      letterSpacing: Type.caption.letterSpacing,
    },
    durationText: {
      fontSize: Type.caption.size,
      fontFamily: Typography.family.regular,
      letterSpacing: Type.caption.letterSpacing,
    },
    tokenText: {
      fontSize: Type.meta.size,
      fontFamily: Typography.family.regular,
      letterSpacing: Type.meta.letterSpacing,
    },
    errorText: {
      fontSize: Type.meta.size,
      fontFamily: Typography.family.regular,
      letterSpacing: Type.meta.letterSpacing,
      lineHeight: Type.caption.lineHeight,
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
      fontSize: Type.meta.size,
      fontFamily: Typography.family.semibold,
      letterSpacing: Type.meta.letterSpacing,
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
      fontSize: Type.bodyStrong.size,
      fontFamily: Typography.family.semibold,
      letterSpacing: Type.body.letterSpacing,
    },
    sectionCount: {
      fontSize: Type.meta.size,
      fontFamily: Typography.family.regular,
      letterSpacing: Type.meta.letterSpacing,
    },
    toolNameText: {
      fontSize: Type.caption.size,
      fontFamily: Typography.family.regular,
      letterSpacing: Type.caption.letterSpacing,
    },
    argsText: {
      fontSize: Type.meta.size,
      fontFamily: Typography.family.regular,
      letterSpacing: Type.meta.letterSpacing,
      lineHeight: Type.caption.lineHeight,
    },
    quoteWrap: {
      borderLeftWidth: 2,
      paddingLeft: Space.sm,
      marginTop: Space.xs / 2,
    },
    quoteText: {
      fontSize: Type.meta.size,
      fontFamily: Typography.family.regular,
      letterSpacing: Type.meta.letterSpacing,
      lineHeight: Type.caption.lineHeight,
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
      fontSize: Type.bodyStrong.size,
      fontFamily: Typography.family.semibold,
      letterSpacing: Type.body.letterSpacing,
    },
    rejectText: {
      fontSize: Type.bodyStrong.size,
      fontFamily: Typography.family.semibold,
      letterSpacing: Type.body.letterSpacing,
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
      fontSize: Type.subtitle.size,
      fontFamily: Typography.family.semibold,
      letterSpacing: Type.subtitle.letterSpacing,
      marginBottom: Space.xs,
    },
    stateBody: {
      fontSize: Type.caption.size,
      fontFamily: Typography.family.regular,
      lineHeight: Type.caption.lineHeight + 2,
      letterSpacing: Type.caption.letterSpacing,
      textAlign: 'center',
    },
    retryBtn: {
      marginTop: Space.md,
      paddingHorizontal: Space.lg,
      paddingVertical: Space.sm,
      borderRadius: Radius.md,
    },
    retryText: {
      fontSize: Type.bodyStrong.size,
      fontFamily: Typography.family.semibold,
      letterSpacing: Type.body.letterSpacing,
    },
    footerNote: {
      paddingHorizontal: Space.md,
      paddingVertical: Space.lg,
    },
    footerNoteText: {
      fontSize: Type.meta.size,
      fontFamily: Typography.family.regular,
      letterSpacing: Type.meta.letterSpacing,
      lineHeight: Type.caption.lineHeight,
    },
  });
}
