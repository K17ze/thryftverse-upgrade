/**
 * CorporateActionDetailScreen — detail view for a single corporate action event.
 *
 * Spec 10 §7: corporate actions (distributions, votes, buyouts, etc.) must be
 * first-class timeline entries with detail views. When an actionId is provided,
 * this screen fetches the full record from the backend /co-own/corporate-actions
 * endpoint. When no actionId is available, it falls back to route params.
 *
 * Governance actions that are still open deep-link to the dedicated
 * 'CorporateActionVote' ballot ({ actionId, assetId }) — this screen stays
 * the event record, the ballot owns the mutation. Money-mutating context is
 * never implied here: voting eligibility and actor matching are enforced
 * server-side.
 *
 * Per AGENTS.md §11: no fabricated data. Missing fields are omitted.
 */

import React from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { RouteProp, useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAppTheme } from '../theme/ThemeContext';
import type { ThemeColors } from '../theme/ThemeContext';
import { RootStackParamList } from '../navigation/types';
import { Space, Radius, Control, DockConstants } from '../theme/designTokens';
import { TypographyV2 } from '../theme/typography.v2';
import { haptics } from '../utils/haptics';
import {
  CoOwnStickyActionDock,
  CoOwnStateCanvas,
  CoOwnOfflineBanner } from '../components/coown';
import { FlagshipScreen, FlagshipHeader } from '../components/flagship';
import { AppButton } from '../components/ui/AppButton';
import {
  fetchCoOwnAssetCorporateActions,
  fetchCoOwnHoldings,
  fetchGovernanceVotes,
  type CoOwnCorporateAction,
  type GovernanceVoteResult } from '../services/marketApi';
import { useStore } from '../store/useStore';
import { useFormattedPrice } from '../hooks/useFormattedPrice';
import { useConnectivity } from '../hooks/useConnectivity';
import { useSafeOpenURL } from '../hooks/useSafeOpenURL';
import { useScreenCaptureProtection } from '../platform/screenCapture';

type RouteT = RouteProp<RootStackParamList, 'CorporateActionDetail'>;
type NavT = NativeStackNavigationProp<RootStackParamList>;

const ACTION_TYPE_LABELS: Record<string, string> = {
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
  vote: 'Governance vote',
  governance: 'Governance vote' };

const ACTION_DESCRIPTIONS: Record<string, string> = {
  distribution: 'A cash distribution to unit-holders, proportional to settled units on the record date.',
  operating_cost: 'Operating costs deducted from the asset vehicle, reducing net asset value.',
  new_issuance: 'Additional units issued by the vehicle, increasing authorised or issued supply.',
  split: 'A unit split — existing units divided into more units at a fixed ratio.',
  consolidation: 'A unit consolidation — existing units merged into fewer units at a fixed ratio.',
  buyback: 'The vehicle operator repurchases units from holders at a stated price.',
  compulsory_buyout: 'A compulsory acquisition of remaining units by a majority holder.',
  revaluation: 'An independent revaluation of the underlying asset.',
  insurance_proceeds: 'Insurance proceeds distributed to unit-holders.',
  liquidation: 'Wind-down of the asset vehicle and distribution of remaining proceeds.',
  vote: 'A holder vote on a specified resolution.',
  governance: 'A holder vote on a specified resolution.' };

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pending',
  announced: 'Announced',
  open: 'Open',
  effective: 'Effective',
  completed: 'Completed',
  cancelled: 'Cancelled' };

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return '—';
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** Formats a voting deadline ISO string, appending a relative "closes in"
 *  suffix when the deadline is within 7 days. Returns "—" for null. */
function formatDeadline(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  const diffDays = Math.ceil((d.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  const formatted = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  if (diffDays <= 0) return `${formatted} · closed`;
  if (diffDays === 1) return `${formatted} · closes in 1 day`;
  if (diffDays <= 7) return `${formatted} · closes in ${diffDays} days`;
  return formatted;
}

function statusLabel(status: string): string {
  return STATUS_LABELS[status] ?? status.charAt(0).toUpperCase() + status.slice(1);
}

function voteLabel(vote: string): string {
  return vote === 'for' ? 'For' : vote === 'against' ? 'Against' : 'Abstain';
}

interface ProposalDocument {
  title: string;
  url: string;
}

/** Extracts proposal documents (attachments / rationale docs) from the
 *  corporate action's metadata JSONB field. Fail-closed: returns [] when
 *  metadata is absent or the attachments array is missing or malformed. */
function extractDocuments(metadata: Record<string, unknown> | null): ProposalDocument[] {
  if (!metadata) return [];
  const raw = metadata.attachments ?? metadata.documents;
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (d): d is ProposalDocument =>
      typeof d === 'object' && d !== null &&
      typeof (d as Record<string, unknown>).title === 'string' &&
      typeof (d as Record<string, unknown>).url === 'string',
  );
}

/** Extracts a finite number from metadata, or null. */
function extractNumber(metadata: Record<string, unknown> | null, key: string): number | null {
  if (!metadata) return null;
  const value = metadata[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** Extracts a non-empty string from metadata, or null. */
function extractString(metadata: Record<string, unknown> | null, key: string): string | null {
  if (!metadata) return null;
  const value = metadata[key];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

export default function CorporateActionDetailScreen() {
  useScreenCaptureProtection();
  const navigation = useNavigation<NavT>();
  const route = useRoute<RouteT>();
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const { formatFromFiat } = useFormattedPrice();
  const { isOffline } = useConnectivity();
  const openURL = useSafeOpenURL();
  const currentUser = useStore((state) => state.currentUser);

  const {
    assetId,
    actionType,
    dateLabel,
    effectLabel,
    amountLabel,
    status,
    recordDateLabel,
    paymentDateLabel,
    actionId } = route.params;

  const [fetchedAction, setFetchedAction] = React.useState<CoOwnCorporateAction | null>(null);
  const [loading, setLoading] = React.useState(!!actionId);
  const [refreshing, setRefreshing] = React.useState(false);
  const [notFound, setNotFound] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Governance summary — read-only context for the ballot affordance. Vote
  // casting lives on the dedicated CorporateActionVote screen.
  const [votes, setVotes] = React.useState<GovernanceVoteResult | null>(null);
  // U49: vote fetch errors are surfaced with retry, not swallowed.
  const [voteError, setVoteError] = React.useState<string | null>(null);
  const [voteLoading, setVoteLoading] = React.useState(false);

  // Holder position for the effect-on-holding explainer. Null = unknown
  // (fetch failed or signed out) — the explainer degrades, never asserts zero.
  const [myUnits, setMyUnits] = React.useState<number | null>(null);

  const isGovernanceAction = (fetchedAction?.actionType ?? actionType) === 'governance'
    || (fetchedAction?.actionType ?? actionType) === 'vote';

  const loadVotes = React.useCallback(async () => {
    if (!actionId || !isGovernanceAction) return;
    setVoteLoading(true);
    setVoteError(null);
    try {
      setVotes(await fetchGovernanceVotes(actionId));
    } catch (err) {
      setVoteError(err instanceof Error ? err.message : 'Failed to load votes');
    } finally {
      setVoteLoading(false);
    }
  }, [actionId, isGovernanceAction]);

  const loadAction = React.useCallback(async () => {
    if (!actionId) return;
    try {
      setError(null);
      setNotFound(false);
      const actions = await fetchCoOwnAssetCorporateActions(assetId, { limit: 100 });
      const found = actions.find((a) => a.id === actionId) ?? null;
      setFetchedAction(found);
      if (!found) setNotFound(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load corporate action');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [actionId, assetId]);

  React.useEffect(() => {
    void loadAction();
  }, [loadAction]);

  // Holder position for the effect explainer — independent of the action
  // fetch so a holdings failure never blocks the event record.
  React.useEffect(() => {
    if (!currentUser?.id) return;
    let cancelled = false;
    fetchCoOwnHoldings(currentUser.id)
      .then((holdings) => {
        if (cancelled) return;
        setMyUnits(holdings.find((h) => h.assetId === assetId)?.unitsOwned ?? 0);
      })
      .catch(() => { /* null = unknown; explainer fails closed */ });
    return () => { cancelled = true; };
  }, [currentUser?.id, assetId]);

  React.useEffect(() => {
    void loadVotes();
  }, [loadVotes]);

  // Refresh the tally when returning from the ballot so "You voted …" and
  // the counts reflect the cast made on the vote screen.
  useFocusEffect(
    React.useCallback(() => {
      void loadVotes();
    }, [loadVotes]),
  );

  const handleRefresh = React.useCallback(() => {
    haptics.tap();
    setRefreshing(true);
    void loadAction();
    void loadVotes();
  }, [loadAction, loadVotes]);

  // Use fetched data if available, otherwise fall back to route params
  const displayActionType = fetchedAction?.actionType ?? actionType;
  const displayStatus = fetchedAction?.status ?? status;
  const displayDateLabel = fetchedAction ? formatDate(fetchedAction.createdAt) : dateLabel;
  const displayTitle = fetchedAction?.title ?? ACTION_TYPE_LABELS[displayActionType] ?? actionType;

  // Proposal metadata — quorum, pass threshold, and voting deadline prefer
  // the Wave 10/11 top-level contract fields and fall back to the metadata
  // JSONB for older projections. All fields fail closed when absent.
  const metadata = fetchedAction?.metadata ?? null;
  const quorumUnits = fetchedAction?.quorumUnits ?? extractNumber(metadata, 'quorumUnits');
  const passThresholdPct = fetchedAction?.passThresholdPct ?? extractNumber(metadata, 'passThresholdPct');
  const votingDeadline = fetchedAction?.votingDeadline ?? extractString(metadata, 'votingDeadline');
  const proposalDocuments = React.useMemo(() => extractDocuments(metadata), [metadata]);

  const deadlineMs = votingDeadline ? Date.parse(votingDeadline) : null;
  const deadlinePassed = deadlineMs != null && Number.isFinite(deadlineMs) && deadlineMs <= Date.now();
  const voteOpen = displayStatus === 'open' && !deadlinePassed;
  const eligibility = votes?.eligibility ?? null;
  const myVote = votes?.myVote ?? null;
  const totalVotingPower = votes?.totalVotingPower ?? 0;
  const quorumPct = quorumUnits != null && quorumUnits > 0
    ? Math.min(100, (totalVotingPower / quorumUnits) * 100)
    : null;
  const canVote = isGovernanceAction && !!actionId && voteOpen && eligibility?.eligible !== false;

  const perUnitMajor = fetchedAction?.perUnitValueGbpMinor != null
    ? fetchedAction.perUnitValueGbpMinor / 100 : null;
  const totalMajor = fetchedAction?.totalValueGbpMinor != null
    ? fetchedAction.totalValueGbpMinor / 100 : null;
  // Estimated effect = per-unit value × the holder's settled units. Rendered
  // only when both inputs are real contract data — never extrapolated.
  const estimatedEffect = myUnits != null && myUnits > 0 && perUnitMajor != null
    ? myUnits * perUnitMajor : null;

  const scrollBottomPadding = Math.max(insets.bottom, Space.md) + DockConstants.singleActionHeight;

  const handleBack = React.useCallback(() => {
    if (navigation.canGoBack()) { navigation.goBack(); return; }
    if (assetId) navigation.replace('AssetDetail', { assetId });
    else navigation.navigate('CoOwnHub');
  }, [navigation, assetId]);

  const statusChip = (
    <View
      style={[
        styles.statusChip,
        { backgroundColor: displayStatus === 'open' ? colors.successSubtle : colors.surfaceAlt },
      ]}
      accessibilityLabel={`Status: ${statusLabel(displayStatus)}`}
    >
      <Text
        maxFontSizeMultiplier={1.4}
        style={[styles.statusChipText, { color: displayStatus === 'open' ? colors.success : colors.textSecondary }]}
      >
        {statusLabel(displayStatus)}
      </Text>
    </View>
  );

  const header = (
    <FlagshipHeader
      title="Corporate action"
      subtitle={displayDateLabel}
      onBack={handleBack}
      rightAction={statusChip}
    />
  );

  // ── Loading ──
  if (loading) {
    return (
      <FlagshipScreen header={header} scrollEnabled={false}>
        <CoOwnStateCanvas variant="loading" title="Loading event" />
      </FlagshipScreen>
    );
  }

  // ── Offline with no data yet ──
  if (isOffline && !fetchedAction && actionId) {
    return (
      <FlagshipScreen header={header} scrollEnabled={false}>
        <CoOwnStateCanvas
          variant="offline"
          actionLabel="Retry"
          onAction={() => { haptics.tap(); setLoading(true); void loadAction(); }}
        />
      </FlagshipScreen>
    );
  }

  // ── Fetch error ──
  if (error && !fetchedAction) {
    return (
      <FlagshipScreen header={header} scrollEnabled={false}>
        <CoOwnStateCanvas
          variant="error"
          title="Couldn't load corporate action"
          subtitle={error}
          actionLabel="Retry"
          onAction={() => { haptics.tap(); setLoading(true); void loadAction(); }}
        />
      </FlagshipScreen>
    );
  }

  // ── Not found ──
  if (notFound) {
    return (
      <FlagshipScreen header={header} scrollEnabled={false}>
        <CoOwnStateCanvas
          variant="unavailable"
          title="Event not found"
          subtitle="This corporate action no longer exists or isn't available for this asset."
          actionLabel="Back to asset"
          onAction={() => { haptics.tap(); handleBack(); }}
        />
      </FlagshipScreen>
    );
  }

  const renderRow = (label: string, value: string, opts?: { danger?: boolean }) => (
    <View style={styles.row} key={label}>
      <Text maxFontSizeMultiplier={1.5} style={[styles.rowLabel, { color: colors.textMuted }]}>{label}</Text>
      <Text maxFontSizeMultiplier={1.5} style={[styles.rowValue, { color: opts?.danger ? colors.danger : colors.textPrimary }]}>
        {value}
      </Text>
    </View>
  );

  return (
    <FlagshipScreen header={header} scrollEnabled={false}>
      <CoOwnOfflineBanner isOffline={isOffline} />
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: scrollBottomPadding }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          actionId ? (
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={colors.textSecondary}
            />
          ) : undefined
        }
      >
        {/* Event identity — type eyebrow + record title. The eyebrow is
            suppressed when the title itself is just the type label. */}
        <View style={styles.identity}>
          {displayTitle !== (ACTION_TYPE_LABELS[displayActionType] ?? displayActionType) && (
            <Text maxFontSizeMultiplier={1.4} style={[styles.typeEyebrow, { color: colors.textMuted }]}>
              {ACTION_TYPE_LABELS[displayActionType] ?? displayActionType}
            </Text>
          )}
          <Text maxFontSizeMultiplier={1.3} style={[styles.eventTitle, { color: colors.textPrimary }]}>
            {displayTitle}
          </Text>
        </View>

        {/* About — the record's own description first; the generic type
            explainer fills in when the record carries none. */}
        {(fetchedAction?.description ?? effectLabel ?? ACTION_DESCRIPTIONS[displayActionType]) && (
          <View style={styles.section}>
            <Text maxFontSizeMultiplier={1.5} style={[styles.sectionTitle, { color: colors.textPrimary }]}>About this event</Text>
            <Text maxFontSizeMultiplier={1.6} style={[styles.body, { color: colors.textSecondary }]}>
              {fetchedAction?.description ?? effectLabel ?? ACTION_DESCRIPTIONS[displayActionType]}
            </Text>
          </View>
        )}

        {/* Key facts — only rows backed by real data render */}
        <View style={styles.section}>
          <Text maxFontSizeMultiplier={1.5} style={[styles.sectionTitle, { color: colors.textPrimary }]}>Details</Text>
          {renderRow('Event date', displayDateLabel)}
          {perUnitMajor != null && renderRow('Per-unit value', formatFromFiat(perUnitMajor))}
          {totalMajor != null && renderRow('Total value', formatFromFiat(totalMajor))}
          {fetchedAction?.recordDate != null && renderRow('Record date', formatDate(fetchedAction.recordDate))}
          {fetchedAction?.exDate != null && renderRow('Ex-date', formatDate(fetchedAction.exDate))}
          {fetchedAction?.payableDate != null && renderRow('Payable date', formatDate(fetchedAction.payableDate))}
          {!fetchedAction && recordDateLabel ? renderRow('Record date', recordDateLabel) : null}
          {!fetchedAction && paymentDateLabel ? renderRow('Payable date', paymentDateLabel) : null}
          {!fetchedAction && amountLabel ? renderRow('Amount', amountLabel) : null}
          {votingDeadline != null && renderRow('Voting deadline', formatDeadline(votingDeadline), { danger: deadlinePassed })}
        </View>

        {/* Effect on your holding — per-unit × units explainer, rendered
            only when both the contract value and the position are known. */}
        {(estimatedEffect != null || (myUnits != null && perUnitMajor != null)) && (
          <View style={styles.section}>
            <Text maxFontSizeMultiplier={1.5} style={[styles.sectionTitle, { color: colors.textPrimary }]}>Effect on your holding</Text>
            {renderRow('Your units', `${(myUnits ?? 0).toLocaleString()} units`)}
            {perUnitMajor != null && renderRow('Per-unit value', formatFromFiat(perUnitMajor))}
            {estimatedEffect != null && renderRow('Estimated effect', `≈ ${formatFromFiat(estimatedEffect)}`)}
            {estimatedEffect != null && (
              <Text maxFontSizeMultiplier={1.5} style={[styles.explainerNote, { color: colors.textMuted }]}>
                Per-unit value × your units at the record date.
              </Text>
            )}
          </View>
        )}

        {/* Proposal documents — attachments / rationale docs from metadata */}
        {proposalDocuments.length > 0 && (
          <View style={styles.section}>
            <Text maxFontSizeMultiplier={1.5} style={[styles.sectionTitle, { color: colors.textPrimary }]}>Proposal documents</Text>
            {proposalDocuments.map((doc, index) => (
              <Pressable
                key={`${doc.title}-${index}`}
                onPress={() => { haptics.tap(); openURL(doc.url, doc.title); }}
                style={({ pressed }) => [
                  styles.docRow,
                  { borderColor: colors.borderSubtle, opacity: pressed ? 0.7 : 1 },
                ]}
                accessibilityRole="link"
                accessibilityLabel={`Open document: ${doc.title}`}
              >
                <Ionicons name="document-text-outline" size={20} color={colors.textSecondary} />
                <Text maxFontSizeMultiplier={1.5} style={[styles.docTitle, { color: colors.textPrimary }]} numberOfLines={1}>
                  {doc.title}
                </Text>
                <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
              </Pressable>
            ))}
          </View>
        )}

        {/* Governance — read-only ballot context + the vote affordance.
            Casting happens on the dedicated CorporateActionVote screen. */}
        {isGovernanceAction && actionId && (
          <View style={styles.section}>
            <Text maxFontSizeMultiplier={1.5} style={[styles.sectionTitle, { color: colors.textPrimary }]}>
              Voting
            </Text>

            {/* Votes needed to pass — quorum/threshold/deadline from the
                contract. Fails closed when absent. */}
            {quorumUnits != null && (
              <>
                {renderRow(
                  'Quorum',
                  `${totalVotingPower.toLocaleString()} of ${quorumUnits.toLocaleString()} units voted${quorumPct != null ? ` (${quorumPct.toFixed(1)}%)` : ''}`,
                )}
                <View
                  style={[styles.meterTrack, { backgroundColor: colors.surfaceAlt }]}
                  accessibilityRole="progressbar"
                  accessibilityValue={{ min: 0, max: 100, now: Math.round(quorumPct ?? 0) }}
                  accessibilityLabel="Quorum progress"
                >
                  <View style={[styles.meterFill, { width: `${quorumPct ?? 0}%`, backgroundColor: colors.brand }]} />
                </View>
              </>
            )}
            {passThresholdPct != null && renderRow('Pass threshold', `${passThresholdPct.toFixed(0)}% of votes cast`)}
            {eligibility && renderRow('Your voting power', `${eligibility.votingPowerUnits.toLocaleString()} units`)}

            {/* Current tally — live region so updates announce. */}
            {votes && votes.summary.length > 0 && totalVotingPower > 0 && (
              <View style={styles.tally} accessibilityLiveRegion="polite">
                {(['for', 'against', 'abstain'] as const).map((v) => {
                  const entry = votes.summary.find((s) => s.vote === v);
                  const power = entry?.votingPowerUnits ?? 0;
                  const pct = totalVotingPower > 0 ? (power / totalVotingPower) * 100 : 0;
                  const color = v === 'for' ? colors.success : v === 'against' ? colors.danger : colors.textMuted;
                  return (
                    <View key={v} style={styles.tallyRow}>
                      <Text maxFontSizeMultiplier={1.5} style={[styles.tallyLabel, { color: colors.textSecondary }]}>
                        {voteLabel(v)}
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

            {/* My vote / eligibility / closed notes — honest states. */}
            {myVote && (
              <View style={[styles.note, { backgroundColor: colors.successSubtle }]} accessibilityLiveRegion="polite">
                <Ionicons name="checkmark-circle" size={16} color={colors.success} aria-hidden={true} />
                <Text maxFontSizeMultiplier={1.5} style={[styles.noteText, { color: colors.textPrimary }]}>
                  {`You voted ${voteLabel(myVote)}${eligibility ? ` · ${eligibility.votingPowerUnits.toLocaleString()} units voting power` : ''}`}
                </Text>
              </View>
            )}
            {!voteOpen && (
              <View style={[styles.note, { backgroundColor: colors.surfaceAlt }]}>
                <Ionicons name="lock-closed-outline" size={16} color={colors.textMuted} aria-hidden={true} />
                <Text maxFontSizeMultiplier={1.5} style={[styles.noteText, { color: colors.textPrimary }]}>
                  Voting closed
                </Text>
              </View>
            )}
            {voteOpen && eligibility && !eligibility.eligible && (
              <View style={[styles.note, { backgroundColor: colors.warningSubtle }]}>
                <Ionicons name="lock-closed-outline" size={16} color={colors.warning} aria-hidden={true} />
                <Text maxFontSizeMultiplier={1.5} style={[styles.noteText, { color: colors.textPrimary }]}>
                  {eligibility.reason || 'You are not eligible to vote on this action'}
                </Text>
              </View>
            )}

            {/* Vote fetch error — surfaced with retry, not swallowed. */}
            {voteError && (
              <View style={styles.voteError}>
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
          </View>
        )}
      </ScrollView>

      <CoOwnStickyActionDock>
        {canVote ? (
          <View style={styles.dockRow}>
            <AppButton
              title="Back"
              onPress={() => { haptics.tap(); handleBack(); }}
              variant="secondary"
              size="lg"
              accessibilityLabel="Go back"
              style={{ flex: 1 }}
            />
            <AppButton
              title={myVote ? 'Change vote' : 'Vote'}
              onPress={() => {
                haptics.press();
                navigation.navigate('CorporateActionVote', { actionId, assetId });
              }}
              variant="primary"
              size="lg"
              icon={<Ionicons name="podium-outline" size={16} color={colors.textInverse} />}
              accessibilityLabel={myVote ? 'Change your vote' : 'Vote on this action'}
              accessibilityHint="Opens the ballot"
              style={{ flex: 2 }}
            />
          </View>
        ) : (
          <AppButton
            title="Back to asset"
            onPress={() => { haptics.tap(); handleBack(); }}
            variant="secondary"
            size="lg"
            icon={<Ionicons name="arrow-back" size={16} color={colors.textPrimary} />}
            accessibilityLabel="Go back to asset detail"
            style={{ flex: 1 }}
          />
        )}
      </CoOwnStickyActionDock>
    </FlagshipScreen>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
  content: {
    paddingHorizontal: Space.md,
    paddingTop: Space.md },
  identity: {
    paddingBottom: Space.md },
  typeEyebrow: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    letterSpacing: TypographyV2.captionElevated.letterSpacing,
    textTransform: 'uppercase',
    marginBottom: Space.xs },
  eventTitle: {
    fontSize: TypographyV2.screenTitle.size,
    fontFamily: TypographyV2.screenTitle.fontFamily,
    letterSpacing: TypographyV2.screenTitle.letterSpacing,
    lineHeight: TypographyV2.screenTitle.lineHeight },
  section: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    paddingTop: Space.md,
    marginTop: Space.md,
    paddingBottom: Space.xs },
  sectionTitle: {
    fontSize: TypographyV2.sectionTitle.size,
    fontFamily: TypographyV2.sectionTitle.fontFamily,
    letterSpacing: TypographyV2.sectionTitle.letterSpacing,
    marginBottom: Space.xs },
  body: {
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily,
    letterSpacing: TypographyV2.body.letterSpacing,
    lineHeight: TypographyV2.body.lineHeight + 2 },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Space.xs,
    gap: Space.sm },
  rowLabel: {
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily,
    letterSpacing: TypographyV2.body.letterSpacing },
  rowValue: {
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.bodyStrong.fontFamily,
    letterSpacing: TypographyV2.body.letterSpacing,
    textAlign: 'right',
    flexShrink: 1,
    fontVariant: ['tabular-nums'] },
  explainerNote: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    letterSpacing: TypographyV2.meta.letterSpacing,
    marginTop: Space.xs },
  statusChip: {
    paddingHorizontal: Space.sm,
    paddingVertical: Space.xs / 2,
    borderRadius: Radius.sm,
    alignSelf: 'center' },
  statusChipText: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    letterSpacing: TypographyV2.meta.letterSpacing },
  meterTrack: {
    height: 6,
    borderRadius: Radius.full,
    overflow: 'hidden',
    marginTop: Space.xs,
    marginBottom: Space.xs },
  meterFill: {
    height: '100%',
    borderRadius: Radius.full },
  tally: {
    marginTop: Space.sm,
    gap: Space.xs / 2 },
  tallyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    paddingVertical: Space.xs / 2 },
  tallyLabel: {
    width: 56,
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily,
    letterSpacing: TypographyV2.body.letterSpacing },
  tallyBar: {
    flex: 1,
    height: 6,
    borderRadius: Radius.full,
    overflow: 'hidden' },
  tallyFill: {
    height: '100%',
    borderRadius: Radius.full },
  tallyPct: {
    width: 44,
    textAlign: 'right',
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.numericMeta.fontFamily,
    letterSpacing: TypographyV2.numericMeta.letterSpacing,
    fontVariant: ['tabular-nums'] },
  tallyTotal: {
    marginTop: Space.xs,
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    letterSpacing: TypographyV2.meta.letterSpacing,
    fontVariant: ['tabular-nums'] },
  note: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    borderRadius: Radius.md,
    paddingHorizontal: Space.smMd,
    paddingVertical: Space.sm,
    marginTop: Space.sm },
  noteText: {
    flex: 1,
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily,
    letterSpacing: TypographyV2.body.letterSpacing },
  voteError: {
    marginTop: Space.sm,
    gap: Space.sm,
    alignItems: 'flex-start' },
  errorText: {
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily,
    letterSpacing: TypographyV2.body.letterSpacing },
  docRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    paddingVertical: Space.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    minHeight: Control.hit },
  docTitle: {
    flex: 1,
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily,
    letterSpacing: TypographyV2.body.letterSpacing },
  dockRow: {
    flexDirection: 'row',
    gap: Space.sm,
    flex: 1 } });
}
