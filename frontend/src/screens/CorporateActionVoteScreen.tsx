/**
 * CorporateActionVoteScreen — dedicated ballot for a governance corporate
 * action.
 *
 * Route: 'CorporateActionVote' — params { actionId, assetId }.
 *
 * Data path (backend is authoritative, per AGENTS.md §11):
 *   - GET /co-own/assets/:assetId/corporate-actions → the action record
 *     (title, values, key dates, quorumUnits, passThresholdPct,
 *     votingDeadline). Fetched via fetchCoOwnAssetCorporateActions and
 *     matched by actionId — there is no single-action endpoint.
 *   - GET /co-own/corporate-actions/:actionId/votes → summary tally,
 *     totalVotingPower, myVote, and server-computed eligibility.
 *   - POST /co-own/corporate-actions/:actionId/vote → upserts the caller's
 *     vote while the action is open, so an existing vote can be changed.
 *
 * Missing data fails closed: absent quorum/threshold/deadline fields are
 * omitted, ineligible users see the server-supplied reason, and a closed
 * ballot never renders an interactive form.
 */

import React from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAppTheme } from '../theme/ThemeContext';
import type { ThemeColors } from '../theme/ThemeContext';
import { RootStackParamList } from '../navigation/types';
import { Space, Radius, Control, Stroke } from '../theme/designTokens';
import { TypographyV2 } from '../theme/typography.v2';
import { haptics } from '../utils/haptics';
import { CoOwnStateCanvas, CoOwnOfflineBanner } from '../components/coown';
import { FlagshipScreen, FlagshipHeader } from '../components/flagship';
import { AppButton } from '../components/ui/AppButton';
import {
  fetchCoOwnAssetCorporateActions,
  fetchGovernanceVotes,
  castGovernanceVote,
  type CoOwnCorporateAction,
  type GovernanceVoteResult,
} from '../services/marketApi';
import { useToast } from '../context/ToastContext';
import { useFormattedPrice } from '../hooks/useFormattedPrice';
import { useConnectivity } from '../hooks/useConnectivity';
import { useScreenCaptureProtection } from '../platform/screenCapture';

type RouteT = RouteProp<RootStackParamList, 'CorporateActionVote'>;
type NavT = NativeStackNavigationProp<RootStackParamList>;

type VoteChoice = 'for' | 'against' | 'abstain';

const VOTE_OPTIONS: { value: VoteChoice; label: string; icon: React.ComponentProps<typeof Ionicons>['name'] }[] = [
  { value: 'for', label: 'For', icon: 'thumbs-up-outline' },
  { value: 'against', label: 'Against', icon: 'thumbs-down-outline' },
  { value: 'abstain', label: 'Abstain', icon: 'remove-circle-outline' },
];

const ACTION_TYPE_LABELS: Record<string, string> = {
  governance: 'Governance',
  vote: 'Governance',
  distribution: 'Distribution',
  operating_cost: 'Operating cost',
  new_issuance: 'New issuance',
  split: 'Unit split',
  consolidation: 'Consolidation',
  buyback: 'Buyback',
  compulsory_buyout: 'Compulsory buyout',
  revaluation: 'Revaluation',
  insurance_proceeds: 'Insurance proceeds',
  liquidation: 'Liquidation',
};

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return '—';
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** Voting deadline label with an honest "closes in N days" suffix when the
 *  deadline is within 7 days, and "closed" once it has passed. */
function formatDeadline(iso: string): string {
  const d = new Date(iso);
  const formatted = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  const diffDays = Math.ceil((d.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  if (diffDays <= 0) return `${formatted} · closed`;
  if (diffDays === 1) return `${formatted} · closes in 1 day`;
  if (diffDays <= 7) return `${formatted} · closes in ${diffDays} days`;
  return formatted;
}

function voteLabel(vote: VoteChoice): string {
  return vote === 'for' ? 'For' : vote === 'against' ? 'Against' : 'Abstain';
}

function statusLabel(status: string): string {
  if (status === 'open') return 'Open';
  if (status === 'completed') return 'Closed';
  return status.charAt(0).toUpperCase() + status.slice(1);
}

export default function CorporateActionVoteScreen() {
  useScreenCaptureProtection();
  const navigation = useNavigation<NavT>();
  const route = useRoute<RouteT>();
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const { formatFromFiat } = useFormattedPrice();
  const { isOffline } = useConnectivity();
  const { show: showToast } = useToast();

  const { actionId, assetId } = route.params;

  const [action, setAction] = React.useState<CoOwnCorporateAction | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);
  const [notFound, setNotFound] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const [votes, setVotes] = React.useState<GovernanceVoteResult | null>(null);
  const [voteError, setVoteError] = React.useState<string | null>(null);
  const [voteLoading, setVoteLoading] = React.useState(false);

  const [selectedVote, setSelectedVote] = React.useState<VoteChoice | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  // Uncertain-submit reconciliation: a network error on cast may still have
  // been recorded server-side, so we don't claim failure.
  const [castUncertain, setCastUncertain] = React.useState(false);
  const [receipt, setReceipt] = React.useState<{
    vote: string;
    votingPowerUnits: number;
    createdAt: string;
  } | null>(null);

  const loadVotes = React.useCallback(async () => {
    setVoteLoading(true);
    setVoteError(null);
    try {
      const result = await fetchGovernanceVotes(actionId);
      setVotes(result);
    } catch (err) {
      setVoteError(err instanceof Error ? err.message : 'Failed to load votes');
    } finally {
      setVoteLoading(false);
    }
  }, [actionId]);

  const load = React.useCallback(async () => {
    setError(null);
    setNotFound(false);
    // Fetch both in parallel — the votes endpoint is independent of the
    // action listing, so a slow action fetch must not delay the tally.
    const [actionsResult] = await Promise.all([
      fetchCoOwnAssetCorporateActions(assetId, { limit: 100 })
        .then((items) => ({ items, error: null as string | null }))
        .catch((err): { items: null; error: string } => ({
          items: null,
          error: err instanceof Error ? err.message : 'Failed to load corporate action',
        })),
      loadVotes(),
    ]);
    if (actionsResult.items === null) {
      setError(actionsResult.error);
    } else {
      const found = actionsResult.items.find((a) => a.id === actionId) ?? null;
      setAction(found);
      if (!found) setNotFound(true);
    }
    setLoading(false);
    setRefreshing(false);
  }, [actionId, assetId, loadVotes]);

  React.useEffect(() => {
    void load();
  }, [load]);

  // Preselect the user's existing vote once tallies arrive (change-vote UX —
  // the backend upserts while the action is open).
  const myVote = votes?.myVote ?? null;
  React.useEffect(() => {
    if (myVote && selectedVote === null) setSelectedVote(myVote);
  }, [myVote, selectedVote]);

  const eligibility = votes?.eligibility ?? null;
  const deadlineMs = action?.votingDeadline ? Date.parse(action.votingDeadline) : null;
  const deadlinePassed = deadlineMs != null && Number.isFinite(deadlineMs) && deadlineMs <= Date.now();
  const statusOpen = (eligibility?.status ?? action?.status) === 'open';
  const voteOpen = statusOpen && !deadlinePassed;
  const canVote = voteOpen && eligibility?.eligible !== false;

  const totalVotingPower = votes?.totalVotingPower ?? 0;
  const quorumUnits = action?.quorumUnits ?? null;
  const passThresholdPct = action?.passThresholdPct ?? null;
  const quorumPct = quorumUnits != null && quorumUnits > 0
    ? Math.min(100, (totalVotingPower / quorumUnits) * 100)
    : null;

  const handleCastVote = React.useCallback(async () => {
    if (!selectedVote || submitting) return;
    setSubmitting(true);
    try {
      const result = await castGovernanceVote(actionId, { assetId, vote: selectedVote });
      setReceipt({
        vote: result.vote,
        votingPowerUnits: result.votingPowerUnits,
        createdAt: result.createdAt,
      });
      setCastUncertain(false);
      haptics.success();
      showToast('Vote submitted', 'success');
      // Refresh tallies so the user's vote is reflected in the results.
      await loadVotes();
    } catch (err) {
      const isNetworkError = err instanceof Error && /network|fetch|timeout/i.test(err.message);
      if (isNetworkError) {
        // The request may have been recorded — do not claim failure.
        setCastUncertain(true);
        showToast('Vote not confirmed — check back', 'info');
      } else {
        setCastUncertain(false);
        haptics.error();
        showToast(err instanceof Error ? err.message : 'Failed to submit vote', 'error');
      }
    } finally {
      setSubmitting(false);
    }
  }, [actionId, assetId, selectedVote, submitting, showToast, loadVotes]);

  const handleBack = React.useCallback(() => {
    if (navigation.canGoBack()) { navigation.goBack(); return; }
    if (assetId) navigation.replace('AssetDetail', { assetId });
    else navigation.navigate('CoOwnHub');
  }, [navigation, assetId]);

  const actionTypeLabel = action ? (ACTION_TYPE_LABELS[action.actionType] ?? action.actionType) : undefined;

  const statusChip = action ? (
    <View
      style={[
        styles.statusChip,
        action.status === 'open'
          ? { backgroundColor: colors.successSubtle }
          : { backgroundColor: colors.surfaceAlt },
      ]}
      accessibilityLabel={`Status: ${statusLabel(action.status)}`}
    >
      <Text
        maxFontSizeMultiplier={1.4}
        style={[
          styles.statusChipText,
          { color: action.status === 'open' ? colors.success : colors.textSecondary },
        ]}
      >
        {statusLabel(action.status)}
      </Text>
    </View>
  ) : undefined;

  const header = (
    <FlagshipHeader
      title={action?.title ?? 'Governance vote'}
      subtitle={actionTypeLabel}
      onBack={handleBack}
      rightAction={statusChip}
    />
  );

  // ── Loading ──
  if (loading) {
    return (
      <FlagshipScreen header={header} scrollEnabled={false}>
        <CoOwnStateCanvas variant="loading" title="Loading vote" />
      </FlagshipScreen>
    );
  }

  // ── Offline with no data yet ──
  if (isOffline && !action && !votes) {
    return (
      <FlagshipScreen header={header} scrollEnabled={false}>
        <CoOwnStateCanvas
          variant="offline"
          actionLabel="Retry"
          onAction={() => { haptics.tap(); setLoading(true); void load(); }}
        />
      </FlagshipScreen>
    );
  }

  // ── Fetch error ──
  if (error && !action) {
    return (
      <FlagshipScreen header={header} scrollEnabled={false}>
        <CoOwnStateCanvas
          variant="error"
          title="Couldn't load this vote"
          subtitle={error}
          actionLabel="Retry"
          onAction={() => { haptics.tap(); setLoading(true); void load(); }}
        />
      </FlagshipScreen>
    );
  }

  // ── Action not found ──
  if (notFound || !action) {
    return (
      <FlagshipScreen header={header} scrollEnabled={false}>
        <CoOwnStateCanvas
          variant="unavailable"
          title="Vote not found"
          subtitle="This corporate action no longer exists or isn't available for this asset."
          actionLabel="Back to asset"
          onAction={() => { haptics.tap(); handleBack(); }}
        />
      </FlagshipScreen>
    );
  }

  const myVotePower = receipt?.votingPowerUnits ?? eligibility?.votingPowerUnits ?? null;

  return (
    <FlagshipScreen
      header={header}
      scrollEnabled={false}
      stickyFooter={
        canVote ? (
          <AppButton
            title={myVote ? 'Update vote' : 'Cast vote'}
            onPress={() => { haptics.tap(); void handleCastVote(); }}
            variant="primary"
            size="lg"
            loading={submitting}
            disabled={!selectedVote || submitting}
            accessibilityLabel={myVote ? 'Update vote' : 'Cast vote'}
            accessibilityHint={selectedVote ? `Submits your ${voteLabel(selectedVote)} vote` : 'Select an option first'}
          />
        ) : undefined
      }
    >
      <CoOwnOfflineBanner isOffline={isOffline} />
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom, Space.md) + Space.xl }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { haptics.tap(); setRefreshing(true); void load(); }}
            tintColor={colors.textSecondary}
          />
        }
      >
        {/* Resolution */}
        {action.description ? (
          <View style={styles.section}>
            <Text maxFontSizeMultiplier={1.6} style={[styles.body, { color: colors.textSecondary }]}>
              {action.description}
            </Text>
          </View>
        ) : null}

        {/* Effect + key dates — only rows with real data render */}
        <View style={styles.section}>
          {action.perUnitValueGbpMinor != null && (
            <View style={styles.row}>
              <Text maxFontSizeMultiplier={1.5} style={[styles.rowLabel, { color: colors.textMuted }]}>Per-unit value</Text>
              <Text maxFontSizeMultiplier={1.5} style={[styles.rowValue, { color: colors.textPrimary }]}>
                {formatFromFiat(action.perUnitValueGbpMinor / 100)}
              </Text>
            </View>
          )}
          {action.totalValueGbpMinor != null && (
            <View style={styles.row}>
              <Text maxFontSizeMultiplier={1.5} style={[styles.rowLabel, { color: colors.textMuted }]}>Total value</Text>
              <Text maxFontSizeMultiplier={1.5} style={[styles.rowValue, { color: colors.textPrimary }]}>
                {formatFromFiat(action.totalValueGbpMinor / 100)}
              </Text>
            </View>
          )}
          {action.recordDate != null && (
            <View style={styles.row}>
              <Text maxFontSizeMultiplier={1.5} style={[styles.rowLabel, { color: colors.textMuted }]}>Record date</Text>
              <Text maxFontSizeMultiplier={1.5} style={[styles.rowValue, { color: colors.textPrimary }]}>{formatDate(action.recordDate)}</Text>
            </View>
          )}
          {action.exDate != null && (
            <View style={styles.row}>
              <Text maxFontSizeMultiplier={1.5} style={[styles.rowLabel, { color: colors.textMuted }]}>Ex-date</Text>
              <Text maxFontSizeMultiplier={1.5} style={[styles.rowValue, { color: colors.textPrimary }]}>{formatDate(action.exDate)}</Text>
            </View>
          )}
          {action.payableDate != null && (
            <View style={styles.row}>
              <Text maxFontSizeMultiplier={1.5} style={[styles.rowLabel, { color: colors.textMuted }]}>Payable date</Text>
              <Text maxFontSizeMultiplier={1.5} style={[styles.rowValue, { color: colors.textPrimary }]}>{formatDate(action.payableDate)}</Text>
            </View>
          )}
          {action.votingDeadline != null && (
            <View style={styles.row}>
              <Text maxFontSizeMultiplier={1.5} style={[styles.rowLabel, { color: colors.textMuted }]}>Voting deadline</Text>
              <Text maxFontSizeMultiplier={1.5} style={[styles.rowValue, { color: deadlinePassed ? colors.danger : colors.textPrimary }]}>
                {formatDeadline(action.votingDeadline)}
              </Text>
            </View>
          )}
        </View>

        {/* Governance meter — votes cast vs quorum. Omitted when the action
            carries no quorum configuration. */}
        {(quorumUnits != null || passThresholdPct != null) && (
          <View style={styles.section}>
            <Text maxFontSizeMultiplier={1.5} style={[styles.sectionTitle, { color: colors.textPrimary }]}>
              Votes needed to pass
            </Text>
            {quorumUnits != null && (
              <>
                <View style={styles.row}>
                  <Text maxFontSizeMultiplier={1.5} style={[styles.rowLabel, { color: colors.textMuted }]}>Quorum</Text>
                  <Text maxFontSizeMultiplier={1.5} style={[styles.rowValue, { color: colors.textPrimary }]}>
                    {`${totalVotingPower.toLocaleString()} of ${quorumUnits.toLocaleString()} units voted${quorumPct != null ? ` (${quorumPct.toFixed(1)}%)` : ''}`}
                  </Text>
                </View>
                <View
                  style={[styles.meterTrack, { backgroundColor: colors.surfaceAlt }]}
                  accessibilityRole="progressbar"
                  accessibilityValue={{ min: 0, max: 100, now: Math.round(quorumPct ?? 0) }}
                >
                  <View style={[styles.meterFill, { width: `${quorumPct ?? 0}%`, backgroundColor: colors.brand }]} />
                </View>
              </>
            )}
            {passThresholdPct != null && (
              <View style={styles.row}>
                <Text maxFontSizeMultiplier={1.5} style={[styles.rowLabel, { color: colors.textMuted }]}>Pass threshold</Text>
                <Text maxFontSizeMultiplier={1.5} style={[styles.rowValue, { color: colors.textPrimary }]}>
                  {`${passThresholdPct.toFixed(0)}% of votes cast`}
                </Text>
              </View>
            )}
          </View>
        )}

        {/* Current tally — live region so screen readers announce updates
            after a vote is cast or tallies refresh. */}
        {votes && votes.summary.length > 0 && totalVotingPower > 0 && (
          <View style={styles.section} accessibilityLiveRegion="polite">
            <Text maxFontSizeMultiplier={1.5} style={[styles.sectionTitle, { color: colors.textPrimary }]}>
              Current tally
            </Text>
            {VOTE_OPTIONS.map((opt) => {
              const entry = votes.summary.find((s) => s.vote === opt.value);
              const power = entry?.votingPowerUnits ?? 0;
              const pct = totalVotingPower > 0 ? (power / totalVotingPower) * 100 : 0;
              const color = opt.value === 'for' ? colors.success : opt.value === 'against' ? colors.danger : colors.textMuted;
              return (
                <View key={opt.value} style={styles.tallyRow}>
                  <Text maxFontSizeMultiplier={1.5} style={[styles.tallyLabel, { color: colors.textSecondary }]}>
                    {opt.label}
                  </Text>
                  <View style={[styles.tallyBar, { backgroundColor: colors.surfaceAlt }]}>
                    <View style={[styles.tallyFill, { width: `${pct}%`, backgroundColor: color }]} />
                  </View>
                  <Text maxFontSizeMultiplier={1.5} style={[styles.tallyPct, { color }]}>
                    {pct.toFixed(1)}%
                  </Text>
                </View>
              );
            })}
            <Text maxFontSizeMultiplier={1.5} style={[styles.tallyTotal, { color: colors.textMuted }]}>
              {totalVotingPower.toLocaleString()} units voted
            </Text>
          </View>
        )}

        {/* Vote fetch error — surfaced with retry, not swallowed. */}
        {voteError && (
          <View style={styles.section}>
            <Text maxFontSizeMultiplier={1.5} style={[styles.errorText, { color: colors.danger }]}>{voteError}</Text>
            <AppButton
              title="Retry"
              onPress={() => { haptics.tap(); void loadVotes(); }}
              variant="secondary"
              size="sm"
              disabled={voteLoading}
              accessibilityLabel="Retry loading votes"
            />
          </View>
        )}

        {/* My vote state — receipt after cast, persisted state on load. */}
        {(receipt || myVote) && (
          <View
            style={[styles.myVoteNote, { backgroundColor: colors.successSubtle }]}
            accessibilityLiveRegion="polite"
          >
            <Ionicons name="checkmark-circle" size={16} color={colors.success} aria-hidden={true} />
            <Text maxFontSizeMultiplier={1.5} style={[styles.myVoteText, { color: colors.textPrimary }]}>
              {`You voted ${voteLabel((receipt?.vote ?? myVote) as VoteChoice)}${myVotePower != null ? ` · ${myVotePower.toLocaleString()} units voting power` : ''}`}
            </Text>
          </View>
        )}

        {/* Uncertain-submit reconciliation */}
        {castUncertain && !voteError && (
          <View style={[styles.myVoteNote, { backgroundColor: colors.warningSubtle }]}>
            <Ionicons name="cloud-offline-outline" size={16} color={colors.warning} aria-hidden={true} />
            <Text maxFontSizeMultiplier={1.5} style={[styles.myVoteText, { color: colors.textPrimary }]}>
              Vote not confirmed — check back.
            </Text>
          </View>
        )}

        {/* Voting closed — honest state, no interactive ballot. */}
        {!voteOpen && (
          <View style={[styles.myVoteNote, { backgroundColor: colors.surfaceAlt }]}>
            <Ionicons name="lock-closed-outline" size={16} color={colors.textMuted} aria-hidden={true} />
            <Text maxFontSizeMultiplier={1.5} style={[styles.myVoteText, { color: colors.textPrimary }]}>
              Voting closed
            </Text>
          </View>
        )}

        {/* Ineligible — server-supplied reason, generic fallback. */}
        {voteOpen && eligibility && !eligibility.eligible && (
          <View style={[styles.myVoteNote, { backgroundColor: colors.warningSubtle }]}>
            <Ionicons name="lock-closed-outline" size={16} color={colors.warning} aria-hidden={true} />
            <Text maxFontSizeMultiplier={1.5} style={[styles.myVoteText, { color: colors.textPrimary }]}>
              {eligibility.reason || 'You are not eligible to vote on this action'}
            </Text>
          </View>
        )}

        {/* Ballot — radio-style single select. The confirm action lives in
            the sticky footer so it stays reachable regardless of scroll. */}
        {canVote && (
          <View style={styles.section} accessibilityRole="radiogroup" accessibilityLabel="Vote options">
            <Text maxFontSizeMultiplier={1.5} style={[styles.sectionTitle, { color: colors.textPrimary }]}>
              {myVote ? 'Change your vote' : 'Cast your vote'}
            </Text>
            {eligibility && (
              <Text maxFontSizeMultiplier={1.5} style={[styles.powerNote, { color: colors.textMuted }]}>
                Your voting power: {eligibility.votingPowerUnits.toLocaleString()} units
              </Text>
            )}
            {VOTE_OPTIONS.map((opt) => {
              const selected = selectedVote === opt.value;
              return (
                <Pressable
                  key={opt.value}
                  onPress={() => { haptics.selection(); setSelectedVote(opt.value); }}
                  style={({ pressed }) => [
                    styles.option,
                    {
                      borderColor: selected ? colors.brand : colors.border,
                      backgroundColor: selected ? colors.brandSubtle : 'transparent',
                      opacity: pressed ? 0.7 : 1,
                    },
                  ]}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  accessibilityLabel={`Vote ${opt.label}`}
                >
                  <Ionicons
                    name={opt.icon}
                    size={20}
                    color={selected ? colors.brand : colors.textSecondary}
                    aria-hidden={true}
                  />
                  <Text maxFontSizeMultiplier={1.5} style={[styles.optionLabel, { color: colors.textPrimary }]}>
                    {opt.label}
                  </Text>
                  <Ionicons
                    name={selected ? 'radio-button-on' : 'radio-button-off'}
                    size={20}
                    color={selected ? colors.brand : colors.textMuted}
                    aria-hidden={true}
                  />
                </Pressable>
              );
            })}
          </View>
        )}
      </ScrollView>
    </FlagshipScreen>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    content: {
      paddingHorizontal: Space.md,
      paddingTop: Space.md,
    },
    section: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
      paddingTop: Space.md,
      marginTop: Space.md,
    },
    sectionTitle: {
      fontSize: TypographyV2.sectionTitle.size,
      fontFamily: TypographyV2.sectionTitle.fontFamily,
      letterSpacing: TypographyV2.sectionTitle.letterSpacing,
      marginBottom: Space.xs,
    },
    body: {
      fontSize: TypographyV2.body.size,
      fontFamily: TypographyV2.body.fontFamily,
      letterSpacing: TypographyV2.body.letterSpacing,
      lineHeight: TypographyV2.body.lineHeight + 2,
    },
    row: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: Space.xs,
      gap: Space.sm,
    },
    rowLabel: {
      fontSize: TypographyV2.body.size,
      fontFamily: TypographyV2.body.fontFamily,
      letterSpacing: TypographyV2.body.letterSpacing,
    },
    rowValue: {
      fontSize: TypographyV2.body.size,
      fontFamily: TypographyV2.bodyStrong.fontFamily,
      letterSpacing: TypographyV2.body.letterSpacing,
      textAlign: 'right',
      flexShrink: 1,
    },
    statusChip: {
      paddingHorizontal: Space.sm,
      paddingVertical: Space.xs / 2,
      borderRadius: Radius.sm,
      alignSelf: 'center',
    },
    statusChipText: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      letterSpacing: TypographyV2.meta.letterSpacing,
    },
    meterTrack: {
      height: 6,
      borderRadius: Radius.full,
      overflow: 'hidden',
      marginTop: Space.xs,
    },
    meterFill: {
      height: '100%',
      borderRadius: Radius.full,
    },
    tallyRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.sm,
      paddingVertical: Space.xs / 2,
    },
    tallyLabel: {
      width: 56,
      fontSize: TypographyV2.body.size,
      fontFamily: TypographyV2.body.fontFamily,
      letterSpacing: TypographyV2.body.letterSpacing,
    },
    tallyBar: {
      flex: 1,
      height: 6,
      borderRadius: Radius.full,
      overflow: 'hidden',
    },
    tallyFill: {
      height: '100%',
      borderRadius: Radius.full,
    },
    tallyPct: {
      width: 44,
      textAlign: 'right',
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.numericMeta.fontFamily,
      letterSpacing: TypographyV2.numericMeta.letterSpacing,
    },
    tallyTotal: {
      marginTop: Space.xs,
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      letterSpacing: TypographyV2.meta.letterSpacing,
    },
    errorText: {
      fontSize: TypographyV2.body.size,
      fontFamily: TypographyV2.body.fontFamily,
      letterSpacing: TypographyV2.body.letterSpacing,
      marginBottom: Space.sm,
    },
    myVoteNote: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.sm,
      borderRadius: Radius.md,
      paddingHorizontal: Space.smMd,
      paddingVertical: Space.sm,
      marginTop: Space.md,
    },
    myVoteText: {
      flex: 1,
      fontSize: TypographyV2.body.size,
      fontFamily: TypographyV2.body.fontFamily,
      letterSpacing: TypographyV2.body.letterSpacing,
    },
    powerNote: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      letterSpacing: TypographyV2.meta.letterSpacing,
      marginBottom: Space.sm,
    },
    option: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.smMd,
      minHeight: Control.hit,
      borderWidth: Stroke.standard,
      borderRadius: Radius.md,
      paddingHorizontal: Space.smMd,
      marginTop: Space.sm,
    },
    optionLabel: {
      flex: 1,
      fontSize: TypographyV2.body.size,
      fontFamily: TypographyV2.bodyStrong.fontFamily,
      letterSpacing: TypographyV2.body.letterSpacing,
    },
  });
}
