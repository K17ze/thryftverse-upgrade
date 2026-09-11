/**
 * CorporateActionDetailScreen — detail view for a single corporate action event.
 *
 * Spec 10 §7: corporate actions (distributions, votes, buyouts, etc.) must be
 * first-class timeline entries with detail views. When an actionId is provided,
 * this screen fetches the full record from the backend /co-own/corporate-actions
 * endpoint. When no actionId is available, it falls back to route params.
 *
 * Per AGENTS.md §11: no fabricated data. Missing fields show "—".
 */

import React from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, TextInput, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAppTheme } from '../theme/ThemeContext';
import type { ThemeColors } from '../theme/ThemeContext';
import { RootStackParamList } from '../navigation/types';
import { Space, Radius, DockConstants, Stroke, LetterSpacing } from '../theme/designTokens';
import { TypographyV2 } from '../theme/typography.v2';
import { haptics } from '../utils/haptics';
import {
  CoOwnStickyActionDock,
  CoOwnCorporateActionRow,
  CoOwnStateCanvas,
  type CoOwnCorporateActionType,
  type CoOwnCorporateActionStatus } from '../components/coown';
import { FlagshipScreen, FlagshipHeader } from '../components/flagship';
import { CoOwnAssetDetailSkeleton } from '../components/coown/CoOwnSkeletons';
import { AppButton } from '../components/ui/AppButton';
import { fetchCoOwnAssetCorporateActions, fetchGovernanceVotes, castGovernanceVote, type CoOwnCorporateAction } from '../services/marketApi';
import { useToast } from '../context/ToastContext';
import { useFormattedPrice } from '../hooks/useFormattedPrice';
import { useSafeOpenURL } from '../hooks/useSafeOpenURL';

type RouteT = RouteProp<RootStackParamList, 'CorporateActionDetail'>;
type NavT = NativeStackNavigationProp<RootStackParamList>;

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
  vote: 'A holder vote on a specified resolution.' };

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** Formats a voting deadline ISO string, appending a relative "closes in"
 *  suffix when the deadline is within 7 days. Returns "—" for null. */
function formatDeadline(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  const now = new Date();
  const diffMs = d.getTime() - now.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  const formatted = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  if (diffDays <= 0) return `${formatted} · closed`;
  if (diffDays === 1) return `${formatted} · closes in 1 day`;
  if (diffDays <= 7) return `${formatted} · closes in ${diffDays} days`;
  return formatted;
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
  const navigation = useNavigation<NavT>();
  const route = useRoute<RouteT>();
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const { currencySymbol } = useFormattedPrice();
  const openURL = useSafeOpenURL();

  const formatAmount = React.useCallback(
    (minor: number | null): string | null => {
      if (minor === null || minor === undefined) return null;
      const major = minor / 100;
      const sign = major >= 0 ? '+' : '−';
      return `${sign}${currencySymbol}${Math.abs(major).toFixed(2)}`;
    },
    [currencySymbol],
  );

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
  const [error, setError] = React.useState<string | null>(null);

  // Governance voting state
  const { show: showToast } = useToast();
  const [voteSummary, setVoteSummary] = React.useState<{ vote: string; votingPowerUnits: number; voteCount: number }[]>([]);
  const [totalVotingPower, setTotalVotingPower] = React.useState(0);
  const [myVote, setMyVote] = React.useState<'for' | 'against' | 'abstain' | null>(null);
  // U49: vote fetch errors are surfaced with retry, not swallowed.
  const [voteError, setVoteError] = React.useState<string | null>(null);
  const [voteLoading, setVoteLoading] = React.useState(false);
  // U49: uncertain-submit reconciliation. A network error on cast leaves
  // the user unsure whether the vote was recorded.
  const [voteUncertain, setVoteUncertain] = React.useState(false);
  // U48: server-authoritative eligibility from the votes endpoint.
  const [voteEligibility, setVoteEligibility] = React.useState<{
    eligible: boolean;
    reason: string;
    votingPowerUnits: number;
    recordDate: string | null;
    status: string;
  } | null>(null);
  const [voteRationale, setVoteRationale] = React.useState('');
  const [submittingVote, setSubmittingVote] = React.useState(false);
  // Vote receipt — confirmation state shown after a successful vote cast.
  // Auto-clears on navigation (component unmount); user-dismissable via X.
  const [voteReceipt, setVoteReceipt] = React.useState<{
    vote: string;
    votingPowerUnits: number;
    createdAt: string;
  } | null>(null);
  const isGovernanceAction = (fetchedAction?.actionType ?? actionType) === 'governance' || (fetchedAction?.actionType ?? actionType) === 'vote';

  const loadAction = React.useCallback(async () => {
    if (!actionId) return;
    try {
      setError(null);
      const actions = await fetchCoOwnAssetCorporateActions(assetId, { limit: 100 });
      const found = actions.find((a) => a.id === actionId);
      if (found) {
        setFetchedAction(found);
      } else {
        setError('Corporate action not found');
      }
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

  // Load governance votes when action is a governance type
  const loadVotes = React.useCallback(async () => {
    if (!actionId || !isGovernanceAction) return;
    setVoteLoading(true);
    setVoteError(null);
    try {
      const result = await fetchGovernanceVotes(actionId);
      setVoteSummary(result.summary);
      setTotalVotingPower(result.totalVotingPower);
      setMyVote(result.myVote);
      setVoteEligibility(result.eligibility ?? null);
    } catch (err) {
      // U49: surface the error with a retry affordance instead of
      // swallowing it silently.
      setVoteError(err instanceof Error ? err.message : 'Failed to load votes');
    } finally {
      setVoteLoading(false);
    }
  }, [actionId, isGovernanceAction]);

  React.useEffect(() => {
    void loadVotes();
  }, [loadVotes]);

  const handleCastVote = React.useCallback(async (vote: 'for' | 'against' | 'abstain') => {
    if (!actionId || !assetId) return;
    setSubmittingVote(true);
    try {
      const result = await castGovernanceVote(actionId, { assetId, vote, rationale: voteRationale.trim() || undefined });
      setVoteReceipt({ vote: result.vote, votingPowerUnits: result.votingPowerUnits, createdAt: result.createdAt });
      haptics.success();
      showToast('Vote submitted', 'success');
      setVoteUncertain(false);
      // U49: refresh the tally after voting so the user sees their vote
      // reflected in the current results.
      await loadVotes();
    } catch (err) {
      const isNetworkError = err instanceof Error && /network|fetch|timeout/i.test(err.message);
      if (isNetworkError) {
        // U49: the request may have been recorded — do not claim failure.
        setVoteUncertain(true);
        showToast('Vote not confirmed — check back', 'info');
      } else {
        setVoteUncertain(false);
        const message = err instanceof Error ? err.message : 'Failed to submit vote';
        showToast(message, 'error');
      }
    } finally {
      setSubmittingVote(false);
    }
  }, [actionId, assetId, voteRationale, showToast, loadVotes]);

  const handleRefresh = React.useCallback(() => {
    haptics.tap();
    setRefreshing(true);
    void loadAction();
  }, [loadAction]);

  // Use fetched data if available, otherwise fall back to route params
  const displayActionType = fetchedAction?.actionType ?? actionType;
  const displayStatus = fetchedAction?.status ?? status;
  const displayDateLabel = fetchedAction ? formatDate(fetchedAction.createdAt) : dateLabel;
  const displayEffectLabel = fetchedAction?.description ?? effectLabel;
  const displayAmountLabel = fetchedAction
    ? formatAmount(fetchedAction.perUnitValueGbpMinor) ?? amountLabel ?? null
    : amountLabel;
  const displayRecordDate = fetchedAction ? formatDate(fetchedAction.recordDate) : (recordDateLabel ?? null);
  const displayPaymentDate = fetchedAction ? formatDate(fetchedAction.payableDate) : (paymentDateLabel ?? null);
  const displayTitle = fetchedAction?.title ?? actionType;

  // Proposal metadata — quorum, pass threshold, voting deadline, and
  // proposal documents are sourced from the corporate action's metadata
  // JSONB field. All fields are optional; the UI fails closed (hides
  // sections) when data is absent.
  const metadata = fetchedAction?.metadata ?? null;
  const quorumUnits = extractNumber(metadata, 'quorumUnits');
  const passThresholdPct = extractNumber(metadata, 'passThresholdPct');
  const votingDeadline = extractString(metadata, 'votingDeadline');
  const proposalDocuments = React.useMemo(() => extractDocuments(metadata), [metadata]);

  const typedActionType = displayActionType as CoOwnCorporateActionType;
  const typedStatus = displayStatus as CoOwnCorporateActionStatus;
  const description = ACTION_DESCRIPTIONS[displayActionType] ?? fetchedAction?.description ?? '—';
  const scrollBottomPadding = Math.max(insets.bottom, Space.md) + DockConstants.singleActionHeight;

  const handleBack = React.useCallback(() => {
    if (navigation.canGoBack()) { navigation.goBack(); return; }
    if (assetId) navigation.replace('AssetDetail', { assetId });
    else navigation.navigate('CoOwnHub');
  }, [navigation, assetId]);

  if (loading) {
    return (
      <FlagshipScreen
        header={
          <FlagshipHeader
            title="Corporate action"
            subtitle={dateLabel}
            onBack={handleBack}
          />
        }
        scrollEnabled={false}
      >
        <View style={styles.loadingContainer}>
          <CoOwnAssetDetailSkeleton />
        </View>
      </FlagshipScreen>
    );
  }

  if (error && !fetchedAction) {
    return (
      <FlagshipScreen
        header={
          <FlagshipHeader
            title="Corporate action"
            subtitle={dateLabel}
            onBack={handleBack}
          />
        }
        scrollEnabled={false}
      >
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

  return (
    <FlagshipScreen
      header={
        <FlagshipHeader
          title="Corporate action"
          subtitle={displayDateLabel}
          onBack={handleBack}
        />
      }
      scrollEnabled={false}
    >
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
        {/* Event summary — the corporate action row as a non-interactive card */}
        <View>
          <CoOwnCorporateActionRow
            type={typedActionType}
            status={typedStatus}
            dateLabel={displayDateLabel}
            effectLabel={displayEffectLabel}
            amountLabel={displayAmountLabel ?? undefined}
            recordDateLabel={displayRecordDate ?? undefined}
            paymentDateLabel={displayPaymentDate ?? undefined}
            hasDocuments={proposalDocuments.length > 0}
          />
        </View>

        {/* Title (from backend if available) */}
        {fetchedAction && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>{displayTitle}</Text>
          </View>
        )}

        {/* Description */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>About this event</Text>
          <Text style={[styles.sectionBody, { color: colors.textSecondary }]}>
            {description}
          </Text>
        </View>

        {/* Proposal documents — attachments / rationale docs from metadata */}
        {proposalDocuments.length > 0 && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Proposal documents</Text>
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
                <Text style={[styles.docTitle, { color: colors.textPrimary }]} numberOfLines={1}>
                  {doc.title}
                </Text>
                <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
              </Pressable>
            ))}
          </View>
        )}

        {/* Key dates */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Key dates</Text>
          <View style={styles.dateRow}>
            <Text style={[styles.dateLabel, { color: colors.textMuted }]}>Event date</Text>
            <Text style={[styles.dateValue, { color: colors.textPrimary }]}>{displayDateLabel}</Text>
          </View>
          {displayRecordDate && (
            <View style={styles.dateRow}>
              <Text style={[styles.dateLabel, { color: colors.textMuted }]}>Record date</Text>
              <Text style={[styles.dateValue, { color: colors.textPrimary }]}>{displayRecordDate}</Text>
            </View>
          )}
          {displayPaymentDate && (
            <View style={styles.dateRow}>
              <Text style={[styles.dateLabel, { color: colors.textMuted }]}>Payment date</Text>
              <Text style={[styles.dateValue, { color: colors.textPrimary }]}>{displayPaymentDate}</Text>
            </View>
          )}
          {fetchedAction?.exDate && (
            <View style={styles.dateRow}>
              <Text style={[styles.dateLabel, { color: colors.textMuted }]}>Ex-date</Text>
              <Text style={[styles.dateValue, { color: colors.textPrimary }]}>{formatDate(fetchedAction.exDate)}</Text>
            </View>
          )}
        </View>

        {/* Effect */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Effect on your position</Text>
          <Text style={[styles.sectionBody, { color: colors.textSecondary }]}>
            {displayEffectLabel}
          </Text>
          {displayAmountLabel && (
            <Text style={[styles.amountLabel, { color: displayAmountLabel.startsWith('+') ? colors.success : displayAmountLabel.startsWith('−') ? colors.danger : colors.textPrimary }]}>
              {displayAmountLabel}
            </Text>
          )}
          {fetchedAction?.totalValueGbpMinor !== null && fetchedAction?.totalValueGbpMinor !== undefined && (
            <Text style={[styles.totalLabel, { color: colors.textMuted }]}>
              Total: {formatAmount(fetchedAction.totalValueGbpMinor) ?? '—'}
            </Text>
          )}
        </View>

        {/* Status */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Status</Text>
          <Text style={[styles.sectionBody, { color: colors.textSecondary }]}>
            {displayStatus === 'pending' && 'This event is pending and has not yet taken effect.'}
            {displayStatus === 'announced' && 'This event has been announced and is awaiting the record date.'}
            {displayStatus === 'effective' && 'This event is effective — it has been applied to your position.'}
            {displayStatus === 'completed' && 'This event is completed.'}
            {displayStatus === 'cancelled' && 'This event was cancelled and will not take effect.'}
            {displayStatus === 'open' && 'This vote is open for participation.'}
            {!['pending', 'announced', 'effective', 'completed', 'cancelled', 'open'].includes(displayStatus) && displayStatus}
          </Text>
        </View>

        {/* Governance voting — flagship treatment with tally bars, quorum, voting power */}
        {isGovernanceAction && actionId && (
          <View style={styles.section}>
            <View style={styles.voteHeaderRow}>
                <View style={styles.voteHeaderIcon}>
                  <Ionicons name="checkmark-circle" size={24} color={colors.brand} />
                </View>
                <View style={styles.voteHeaderText}>
                  <Text style={[styles.sectionTitle, { color: colors.textPrimary, marginBottom: 2 }]}>Cast your vote</Text>
                  <Text style={[styles.voteHeaderSubtitle, { color: colors.textSecondary }]}>
                    {myVote ? 'Change your vote while the poll is open' : 'Your voting power is proportional to your holdings'}
                  </Text>
                </View>
              </View>

              {/* Vote receipt — success confirmation after a successful cast */}
              {voteReceipt && (
                <View style={[styles.voteReceiptBanner, { backgroundColor: colors.successSubtle, borderColor: colors.successBorder }]}>
                  <View style={styles.voteReceiptContent}>
                    <Ionicons name="checkmark-circle" size={20} color={colors.success} />
                    <View style={styles.voteReceiptText}>
                      <Text style={[styles.voteReceiptTitle, { color: colors.success }]}>Vote recorded</Text>
                      <Text style={[styles.voteReceiptDetail, { color: colors.textSecondary }]}>
                        {voteReceipt.vote === 'for' ? 'For' : voteReceipt.vote === 'against' ? 'Against' : 'Abstain'} · {voteReceipt.votingPowerUnits.toLocaleString()} units applied
                      </Text>
                      <Text style={[styles.voteReceiptMeta, { color: colors.textMuted }]}>
                        {formatDate(voteReceipt.createdAt)}
                      </Text>
                    </View>
                  </View>
                  <Pressable
                    onPress={() => { haptics.tap(); setVoteReceipt(null); }}
                    hitSlop={12}
                    accessibilityLabel="Dismiss vote confirmation"
                    accessibilityRole="button"
                    style={styles.voteReceiptDismiss}
                  >
                    <Ionicons name="close" size={16} color={colors.textMuted} />
                  </Pressable>
                </View>
              )}

              {/* U48: record-date power + opening/deadline summary */}
              {voteEligibility && (
                <View style={[styles.voteEligibility, { borderColor: colors.borderSubtle }]}>
                  {voteEligibility.recordDate && (
                    <View style={styles.voteEligibilityRow}>
                      <Text style={[styles.voteEligibilityLabel, { color: colors.textMuted }]}>Record date</Text>
                      <Text style={[styles.voteEligibilityValue, { color: colors.textPrimary }]}>
                        {formatDate(voteEligibility.recordDate)}
                      </Text>
                    </View>
                  )}
                  <View style={styles.voteEligibilityRow}>
                    <Text style={[styles.voteEligibilityLabel, { color: colors.textMuted }]}>Your voting power</Text>
                    <Text style={[styles.voteEligibilityValue, { color: colors.textPrimary }]}>
                      {voteEligibility.votingPowerUnits.toLocaleString()} units
                    </Text>
                  </View>
                  <View style={styles.voteEligibilityRow}>
                    <Text style={[styles.voteEligibilityLabel, { color: colors.textMuted }]}>Status</Text>
                    <Text style={[styles.voteEligibilityValue, { color: voteEligibility.status === 'open' ? colors.success : colors.textMuted }]}>
                      {voteEligibility.status === 'open' ? 'Open' : voteEligibility.status === 'completed' ? 'Closed' : voteEligibility.status}
                    </Text>
                  </View>
                </View>
              )}

              {/* Quorum / pass threshold / voting deadline — sourced from
                  corporate action metadata. Fails closed when absent. */}
              {(quorumUnits !== null || passThresholdPct !== null || votingDeadline !== null) && (
                <View style={[styles.voteThresholdBox, { borderColor: colors.borderSubtle }]}>
                  <Text style={[styles.voteThresholdTitle, { color: colors.textMuted }]}>Votes needed to pass</Text>
                  {quorumUnits !== null && (
                    <View style={styles.voteThresholdRow}>
                      <Text style={[styles.voteThresholdLabel, { color: colors.textMuted }]}>Quorum</Text>
                      <Text style={[styles.voteThresholdValue, { color: colors.textPrimary }]}>
                        {totalVotingPower.toLocaleString()} of {quorumUnits.toLocaleString()} units ({quorumUnits > 0 ? Math.min(100, (totalVotingPower / quorumUnits) * 100).toFixed(1) : '0'}%)
                      </Text>
                    </View>
                  )}
                  {passThresholdPct !== null && (
                    <View style={styles.voteThresholdRow}>
                      <Text style={[styles.voteThresholdLabel, { color: colors.textMuted }]}>Pass threshold</Text>
                      <Text style={[styles.voteThresholdValue, { color: colors.textPrimary }]}>
                        {passThresholdPct.toFixed(0)}%
                      </Text>
                    </View>
                  )}
                  {votingDeadline !== null && (
                    <View style={styles.voteThresholdRow}>
                      <Text style={[styles.voteThresholdLabel, { color: colors.textMuted }]}>Voting deadline</Text>
                      <Text style={[styles.voteThresholdValue, { color: colors.textPrimary }]}>
                        {formatDeadline(votingDeadline)}
                      </Text>
                    </View>
                  )}
                </View>
              )}

              {/* U48: ineligibility reason — the form stays visible but disabled */}
              {voteEligibility && !voteEligibility.eligible && (
                <View style={[styles.voteIneligibleNote, { backgroundColor: colors.warningSubtle }]}>
                  <Ionicons name="lock-closed-outline" size={16} color={colors.warning} />
                  <Text style={[styles.voteIneligibleText, { color: colors.textPrimary }]}>
                    {voteEligibility.reason || 'You are not eligible to vote on this action.'}
                  </Text>
                </View>
              )}

              {/* U49: vote fetch error — surfaced with retry, not swallowed */}
              {voteError && (
                <View style={[styles.voteErrorBox, { borderColor: colors.borderSubtle }]}>
                  <Text style={[styles.voteErrorText, { color: colors.danger }]}>{voteError}</Text>
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

              {/* U49: uncertain-submit reconciliation */}
              {voteUncertain && !voteError && (
                <View style={[styles.voteIneligibleNote, { backgroundColor: colors.warningSubtle }]}>
                  <Ionicons name="cloud-offline-outline" size={16} color={colors.warning} />
                  <Text style={[styles.voteIneligibleText, { color: colors.textPrimary }]}>
                    Vote not confirmed — check back.
                  </Text>
                </View>
              )}

              {/* Vote results — tally bars with semantic colours (read-only) */}
              {voteSummary.length > 0 && totalVotingPower > 0 && (
                <View style={[styles.voteResults, { borderColor: colors.borderSubtle }]} key={`votes-${myVote}-${totalVotingPower}`}>
                  <Text style={[styles.voteResultsTitle, { color: colors.textMuted }]}>Current tally</Text>
                  {(['for', 'against', 'abstain'] as const).map((v) => {
                    const entry = voteSummary.find((s) => s.vote === v);
                    const power = entry?.votingPowerUnits ?? 0;
                    const pct = totalVotingPower > 0 ? (power / totalVotingPower) * 100 : 0;
                    const label = v === 'for' ? 'For' : v === 'against' ? 'Against' : 'Abstain';
                    const color = v === 'for' ? colors.success : v === 'against' ? colors.danger : colors.textMuted;
                    const isMyVote = myVote === v;
                    return (
                      <View key={v} style={styles.voteResultRow}>
                        <View style={styles.voteResultLabelRow}>
                          {isMyVote && (
                            <View style={[styles.voteResultDot, { backgroundColor: color }]} />
                          )}
                          <Text style={[styles.voteResultLabel, { color: colors.textSecondary }]}>{label}</Text>
                        </View>
                        <View style={styles.voteResultBar}>
                          <View style={[styles.voteResultFill, { width: `${pct}%`, backgroundColor: color }]} />
                        </View>
                        <Text style={[styles.voteResultPct, { color }]}>
                          {pct.toFixed(1)}%
                        </Text>
                      </View>
                    );
                  })}
                  <View style={[styles.voteTotalRow, { borderTopColor: colors.borderSubtle }]}>
                    <Ionicons name="people-outline" size={12} color={colors.textMuted} />
                    <Text style={[styles.voteTotal, { color: colors.textMuted }]}>
                      {totalVotingPower.toLocaleString()} units voted
                    </Text>
                  </View>
                </View>
              )}

              {/* My vote indicator — elevated badge */}
              {myVote && (
                <View style={[styles.myVoteBadge, { backgroundColor: (myVote === 'for' ? colors.success : myVote === 'against' ? colors.danger : colors.textMuted) + '18' }]}>
                  <Ionicons
                    name={myVote === 'for' ? 'checkmark-circle' : myVote === 'against' ? 'close-circle' : 'ellipse-outline'}
                    size={16}
                    color={myVote === 'for' ? colors.success : myVote === 'against' ? colors.danger : colors.textMuted}
                  />
                  <Text style={[styles.myVoteText, { color: myVote === 'for' ? colors.success : myVote === 'against' ? colors.danger : colors.textMuted }]}>
                    You voted {myVote}
                  </Text>
                </View>
              )}

              {/* Rationale input — disabled when ineligible */}
              <Text style={[styles.inputLabel, { color: colors.textSecondary, marginTop: Space.sm }]}>
                Rationale (optional)
              </Text>
              <TextInput
                style={[styles.voteInput, { backgroundColor: colors.background, borderColor: colors.border, color: colors.textPrimary }]}
                value={voteRationale}
                onChangeText={setVoteRationale}
                placeholder="Explain your reasoning…"
                placeholderTextColor={colors.textMuted}
                multiline
                maxLength={2000}
                editable={voteEligibility?.eligible !== false}
                accessibilityLabel="Vote rationale"
              />

              {/* Vote buttons — disabled (not hidden) when ineligible */}
              <View style={styles.voteButtons}>
                {(['for', 'against', 'abstain'] as const).map((v) => {
                  const label = v === 'for' ? 'For' : v === 'against' ? 'Against' : 'Abstain';
                  const variant = v === 'for' ? 'primary' : 'secondary';
                  const icon: React.ComponentProps<typeof Ionicons>['name'] = v === 'for' ? 'thumbs-up-outline' : v === 'against' ? 'thumbs-down-outline' : 'remove-circle-outline';
                  return (
                    <AppButton
                      key={v}
                      title={label}
                      onPress={() => { haptics.tap(); void handleCastVote(v); }}
                      variant={variant}
                      size="sm"
                      disabled={submittingVote || voteEligibility?.eligible === false}
                      icon={<Ionicons name={icon} size={16} color={variant === 'primary' ? colors.textInverse : colors.textPrimary} />}
                      style={{ flex: 1 }}
                    />
                  );
                })}
              </View>
            </View>
        )}
      </ScrollView>

      <CoOwnStickyActionDock>
        <AppButton
          title="Back to asset"
          onPress={() => { haptics.tap(); handleBack(); }}
          variant="secondary"
          size="lg"
          icon={<Ionicons name="arrow-back" size={16} color={colors.textPrimary} />}
          accessibilityLabel="Go back to asset detail"
          style={{ flex: 1 }}
        />
      </CoOwnStickyActionDock>
    </FlagshipScreen>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
  content: {
    paddingHorizontal: Space.md,
    paddingTop: Space.md,
    gap: Space.md },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center' },
  section: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    paddingTop: Space.md },
  sectionTitle: {
    fontSize: TypographyV2.sectionTitle.size,
    fontFamily: TypographyV2.sectionTitle.fontFamily,
    letterSpacing: LetterSpacing.tight + LetterSpacing.wide,
    marginBottom: Space.sm },
  sectionBody: {
    fontSize: TypographyV2.body.size,
    lineHeight: TypographyV2.body.lineHeight + 2,
    fontFamily: TypographyV2.body.fontFamily,
    letterSpacing: TypographyV2.body.letterSpacing },
  dateRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Space.xs },
  dateLabel: {
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily,
    letterSpacing: TypographyV2.body.letterSpacing },
  dateValue: {
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily,
    letterSpacing: TypographyV2.body.letterSpacing,
    fontVariant: ['tabular-nums'] },
  amountLabel: {
    fontSize: TypographyV2.priceHero.size,
    fontFamily: TypographyV2.priceHero.fontFamily,
    fontVariant: ['tabular-nums'],
    letterSpacing: TypographyV2.priceHero.letterSpacing,
    marginTop: Space.sm },
  totalLabel: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    fontVariant: ['tabular-nums'],
    letterSpacing: TypographyV2.meta.letterSpacing,
    marginTop: Space.xs },
  voteResults: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radius.md,
    padding: Space.md,
    marginBottom: Space.md,
    gap: Space.sm },
  voteResultsTitle: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    textTransform: 'uppercase',
    letterSpacing: LetterSpacing.caps,
    marginBottom: Space.xs },
  voteResultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm },
  voteResultLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
    width: Space.xxl + Space.lg },
  voteResultDot: {
    width: Space.xs + 2,
    height: Space.xs + 2,
    borderRadius: Radius.sm },
  voteResultLabel: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily },
  voteResultBar: {
    flex: 1,
    height: Space.sm,
    borderRadius: Radius.sm,
    backgroundColor: colors.surfaceAlt,
    overflow: 'hidden' },
  voteResultFill: {
    height: '100%',
    borderRadius: Radius.sm },
  voteResultPct: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    width: Space.xxl,
    textAlign: 'right',
    fontVariant: ['tabular-nums'] },
  voteTotalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: Space.sm,
    marginTop: Space.xs,
    justifyContent: 'center' },
  voteTotal: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    fontVariant: ['tabular-nums'] },
  voteHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
    marginBottom: Space.md },
  voteHeaderIcon: {
    width: Space.xl + Space.sm,
    height: Space.xl + Space.sm,
    justifyContent: 'center',
    alignItems: 'center' },
  voteHeaderText: { flex: 1 },
  voteHeaderSubtitle: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    lineHeight: TypographyV2.meta.lineHeight + 2 },
  myVoteBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
    paddingHorizontal: Space.sm,
    paddingVertical: Space.xs,
    borderRadius: Radius.full,
    alignSelf: 'flex-start',
    marginBottom: Space.sm },
  myVoteText: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily },
  inputLabel: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    marginBottom: Space.xs },
  voteInput: {
    borderWidth: Stroke.standard,
    borderRadius: Radius.md,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily,
    minHeight: Space.xxl + Space.sm + Space.xs,
    maxHeight: Space.xxl + Space.xxl + Space.lg,
    marginBottom: Space.md },
  voteButtons: {
    flexDirection: 'row',
    gap: Space.sm },
  // U48: eligibility summary
  voteEligibility: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radius.md,
    padding: Space.sm,
    marginBottom: Space.sm,
    gap: Space.xs },
  voteEligibilityRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center' },
  voteEligibilityLabel: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily },
  voteEligibilityValue: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    fontVariant: ['tabular-nums'] },
  // U48/U49: ineligibility + uncertain notes
  voteIneligibleNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
    paddingHorizontal: Space.sm,
    paddingVertical: Space.sm,
    borderRadius: Radius.md,
    marginBottom: Space.sm },
  voteIneligibleText: {
    flex: 1,
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    lineHeight: TypographyV2.meta.lineHeight + 2 },
  // U49: vote fetch error
  voteErrorBox: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radius.md,
    padding: Space.sm,
    marginBottom: Space.sm,
    gap: Space.sm,
    alignItems: 'center' },
  voteErrorText: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily },
  // Proposal documents
  docRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    paddingVertical: Space.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    minHeight: 44 },
  docTitle: {
    flex: 1,
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily,
    letterSpacing: TypographyV2.body.letterSpacing },
  // Vote receipt banner
  voteReceiptBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Space.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radius.md,
    paddingHorizontal: Space.sm,
    paddingVertical: Space.sm,
    marginBottom: Space.sm },
  voteReceiptContent: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Space.xs,
    flex: 1 },
  voteReceiptText: { flex: 1, gap: 2 },
  voteReceiptTitle: {
    fontSize: TypographyV2.bodyStrong.size,
    fontFamily: TypographyV2.bodyStrong.fontFamily,
    letterSpacing: TypographyV2.bodyStrong.letterSpacing },
  voteReceiptDetail: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    fontVariant: ['tabular-nums'] },
  voteReceiptMeta: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily },
  voteReceiptDismiss: {
    padding: Space.xs,
    minHeight: 44,
    minWidth: 44,
    alignItems: 'center',
    justifyContent: 'center' },
  // Quorum / pass threshold / deadline
  voteThresholdBox: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radius.md,
    padding: Space.sm,
    marginBottom: Space.sm,
    gap: Space.xs },
  voteThresholdTitle: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    textTransform: 'uppercase',
    letterSpacing: LetterSpacing.caps,
    marginBottom: Space.xs },
  voteThresholdRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center' },
  voteThresholdLabel: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily },
  voteThresholdValue: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    fontVariant: ['tabular-nums'] } });
}
