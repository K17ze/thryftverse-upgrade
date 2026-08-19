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
import { View, Text, StyleSheet, ScrollView, RefreshControl, TextInput } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAppTheme } from '../theme/ThemeContext';
import type { ThemeColors } from '../theme/ThemeContext';
import { RootStackParamList } from '../navigation/types';
import { Space, Radius, Type, Typography, DockConstants, Stroke, LetterSpacing } from '../theme/designTokens';
import { haptics } from '../utils/haptics';
import {
  CoOwnStickyActionDock,
  CoOwnCorporateActionRow,
  CoOwnStateCanvas,
  type CoOwnCorporateActionType,
  type CoOwnCorporateActionStatus,
} from '../components/coown';
import { FlagshipScreen, FlagshipHeader } from '../components/flagship';
import { CoOwnAssetDetailSkeleton } from '../components/coown/CoOwnSkeletons';
import { AppButton } from '../components/ui/AppButton';
import { fetchCoOwnAssetCorporateActions, fetchGovernanceVotes, castGovernanceVote, type CoOwnCorporateAction } from '../services/marketApi';
import { useToast } from '../context/ToastContext';

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
  vote: 'A holder vote on a specified resolution.',
};

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatAmount(minor: number | null): string | null {
  if (minor === null || minor === undefined) return null;
  const major = minor / 100;
  const sign = major >= 0 ? '+' : '−';
  return `${sign}£${Math.abs(major).toFixed(2)}`;
}

export default function CorporateActionDetailScreen() {
  const navigation = useNavigation<NavT>();
  const route = useRoute<RouteT>();
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const styles = React.useMemo(() => createStyles(colors), [colors]);

  const {
    assetId,
    actionType,
    dateLabel,
    effectLabel,
    amountLabel,
    status,
    recordDateLabel,
    paymentDateLabel,
    actionId,
  } = route.params;

  const [fetchedAction, setFetchedAction] = React.useState<CoOwnCorporateAction | null>(null);
  const [loading, setLoading] = React.useState(!!actionId);
  const [refreshing, setRefreshing] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Governance voting state
  const { show: showToast } = useToast();
  const [voteSummary, setVoteSummary] = React.useState<{ vote: string; votingPowerUnits: number; voteCount: number }[]>([]);
  const [totalVotingPower, setTotalVotingPower] = React.useState(0);
  const [myVote, setMyVote] = React.useState<'for' | 'against' | 'abstain' | null>(null);
  const [voteRationale, setVoteRationale] = React.useState('');
  const [submittingVote, setSubmittingVote] = React.useState(false);
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
    try {
      const result = await fetchGovernanceVotes(actionId);
      setVoteSummary(result.summary);
      setTotalVotingPower(result.totalVotingPower);
      setMyVote(result.myVote);
    } catch {
      // Silent — voting is supplementary
    }
  }, [actionId, isGovernanceAction]);

  React.useEffect(() => {
    void loadVotes();
  }, [loadVotes]);

  const handleCastVote = React.useCallback(async (vote: 'for' | 'against' | 'abstain') => {
    if (!actionId || !assetId) return;
    setSubmittingVote(true);
    try {
      await castGovernanceVote(actionId, { assetId, vote, rationale: voteRationale.trim() || undefined });
      haptics.success();
      showToast('Vote submitted', 'success');
      await loadVotes();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to submit vote';
      showToast(message, 'error');
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
                <View style={[styles.voteHeaderIcon, { backgroundColor: colors.brand }]}>
                  <Ionicons name="checkmark-circle" size={20} color={colors.textInverse} />
                </View>
                <View style={styles.voteHeaderText}>
                  <Text style={[styles.sectionTitle, { color: colors.textPrimary, marginBottom: 2 }]}>Cast your vote</Text>
                  <Text style={[styles.voteHeaderSubtitle, { color: colors.textSecondary }]}>
                    {myVote ? 'Change your vote while the poll is open' : 'Your voting power is proportional to your holdings'}
                  </Text>
                </View>
              </View>

              {/* Vote results — tally bars with semantic colours */}
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

              {/* Rationale input */}
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
                accessibilityLabel="Vote rationale"
              />

              {/* Vote buttons — semantic colours */}
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
                      disabled={submittingVote}
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
    gap: Space.md,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  section: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    paddingTop: Space.md,
  },
  sectionTitle: {
    fontSize: Type.subtitle.size,
    fontFamily: Typography.family.semibold,
    letterSpacing: LetterSpacing.tight + LetterSpacing.wide,
    marginBottom: Space.sm,
  },
  sectionBody: {
    fontSize: Type.body.size,
    lineHeight: Type.body.lineHeight + 2,
    fontFamily: Typography.family.regular,
    letterSpacing: Type.body.letterSpacing,
  },
  dateRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Space.xs,
  },
  dateLabel: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.regular,
    letterSpacing: Type.body.letterSpacing,
  },
  dateValue: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.medium,
    letterSpacing: Type.body.letterSpacing,
    fontVariant: ['tabular-nums'],
  },
  amountLabel: {
    fontSize: Type.priceHero.size,
    fontFamily: Typography.family.bold,
    letterSpacing: Type.priceHero.letterSpacing,
    marginTop: Space.sm,
  },
  totalLabel: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.regular,
    letterSpacing: Type.caption.letterSpacing,
    marginTop: Space.xs,
  },
  voteResults: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radius.md,
    padding: Space.md,
    marginBottom: Space.md,
    gap: Space.sm,
  },
  voteResultsTitle: {
    fontSize: Type.meta.size,
    fontFamily: Typography.family.semibold,
    textTransform: 'uppercase',
    letterSpacing: LetterSpacing.caps,
    marginBottom: Space.xs,
  },
  voteResultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
  },
  voteResultLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
    width: Space.xxl + Space.lg,
  },
  voteResultDot: {
    width: Space.xs + 2,
    height: Space.xs + 2,
    borderRadius: Radius.sm,
  },
  voteResultLabel: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.medium,
  },
  voteResultBar: {
    flex: 1,
    height: Space.sm,
    borderRadius: Radius.sm,
    backgroundColor: 'rgba(128,128,128,0.15)',
    overflow: 'hidden',
  },
  voteResultFill: {
    height: '100%',
    borderRadius: Radius.sm,
  },
  voteResultPct: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.semibold,
    width: Space.xxl,
    textAlign: 'right',
    fontVariant: ['tabular-nums'],
  },
  voteTotalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: Space.sm,
    marginTop: Space.xs,
    justifyContent: 'center',
  },
  voteTotal: {
    fontSize: Type.meta.size,
    fontFamily: Typography.family.regular,
    fontVariant: ['tabular-nums'],
  },
  voteHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
    marginBottom: Space.md,
  },
  voteHeaderIcon: {
    width: Space.xl + Space.sm,
    height: Space.xl + Space.sm,
    borderRadius: Radius.full,
    justifyContent: 'center',
    alignItems: 'center',
  },
  voteHeaderText: { flex: 1 },
  voteHeaderSubtitle: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.regular,
    lineHeight: Type.caption.lineHeight + 2,
  },
  myVoteBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
    paddingHorizontal: Space.sm,
    paddingVertical: Space.xs,
    borderRadius: Radius.full,
    alignSelf: 'flex-start',
    marginBottom: Space.sm,
  },
  myVoteText: {
    fontSize: Type.meta.size,
    fontFamily: Typography.family.semibold,
  },
  inputLabel: {
    fontSize: Type.meta.size,
    fontFamily: Typography.family.medium,
    marginBottom: Space.xs,
  },
  voteInput: {
    borderWidth: Stroke.standard,
    borderRadius: Radius.md,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
    fontSize: Type.body.size,
    fontFamily: Typography.family.regular,
    minHeight: Space.xxl + Space.sm + Space.xs,
    maxHeight: Space.xxl + Space.xxl + Space.lg,
    marginBottom: Space.md,
  },
  voteButtons: {
    flexDirection: 'row',
    gap: Space.sm,
  },
});
}
