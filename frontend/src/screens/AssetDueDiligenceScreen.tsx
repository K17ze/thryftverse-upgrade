import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  Pressable,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAppTheme } from '../theme/ThemeContext';
import { RootStackParamList } from '../navigation/types';
import { useStore } from '../store/useStore';
import { useFormattedPrice } from '../hooks/useFormattedPrice';
import { Space, FontFamily, Stroke, Control, Numeric, Radius } from '../theme/designTokens';
import { TypographyV2 } from '../theme/typography.v2';
import { RadiusRoleValue } from '../theme/surfaceRadiusRules';
import {
  refreshCoOwnAppraisal,
  createVerificationDemand,
} from '../services/marketApi';
import { parseApiError } from '../lib/apiClient';
import { useToast } from '../context/ToastContext';
import {
  useCoOwnAssetQuery,
  useCoOwnRecourseQuery,
  useCoOwnHoldingsQuery,
} from '../platform/server/useCoOwnQueries';
import { CO_OWN_FEE_RATE } from '../utils/tradeFlow';
import { formatCoOwnIze } from '../utils/currency';
import { CategoryEvidence } from '../components/commerce';
import {
  CommerceDetailSection,
  CommerceDetailMetricRow,
  CommerceDetailDisclosureRow,
  CommerceDetailUnavailableInline,
} from '../components/commerce/detail';
import { resolveEvidenceGroups } from '../platform/commerce/categoryEvidence';
import {
  CoOwnTrustPanel,
  CoOwnRecoursePanel,
  CoOwnRiskDisclosure,
  CoOwnRightsSheet,
  CoOwnSupplySheet,
  CoOwnStateCanvas,
  CoOwnAssetDetailSkeleton,
  CANONICAL_RIGHTS_LABELS,
  type CoOwnRightsRow,
} from '../components/coown';
import { ScreenHeader } from '../components/ui/ScreenHeader';
import { useHaptic } from '../hooks/useHaptic';
import { useConnectivity } from '../hooks/useConnectivity';
import { useSafeOpenURL } from '../hooks/useSafeOpenURL';
import { OfflineBanner } from '../components/OfflineBanner';

type RouteT = RouteProp<RootStackParamList, 'AssetDueDiligence'>;
type NavT = NativeStackNavigationProp<RootStackParamList>;

const DOCK_HEIGHT = 52;

/** Format rights version for the badge — normalises raw strings. */
function formatRightsVersion(raw: string): string {
  if (raw.includes('·')) return raw;
  const versionMatch = raw.match(/v\d+/i);
  const version = versionMatch ? versionMatch[0].toLowerCase() : raw;
  return version;
}

/**
 * Layer 3 — Due Diligence screen.
 *
 * A dedicated full-height pushed screen for prolonged due-diligence review.
 * Groups all legal/compliance/valuation/provenance depth into clear
 * subsections so it does not compete with the asset story or market data
 * on the main Asset Detail screen.
 *
 * IA (per spec 09):
 *   About this asset (Story, Provenance, Condition)
 *   Authentication
 *   Custody & insurance
 *   Valuation
 *   Ownership structure (Legal vehicle, Supply, Rights)
 *   Fees & settlement
 *   Risk disclosure
 *   Audit history
 */
export default function AssetDueDiligenceScreen() {
  const navigation = useNavigation<NavT>();
  const route = useRoute<RouteT>();
  const { colors, isDark } = useAppTheme();
  const insets = useSafeAreaInsets();
  const haptic = useHaptic();
  const { isOffline } = useConnectivity();
  const safeOpenURL = useSafeOpenURL();
  const currentUser = useStore((state) => state.currentUser);
  const { formatFromFiat } = useFormattedPrice();
  const { show } = useToast();

  const assetId = route.params?.assetId;

  const [isRefreshingAppraisal, setIsRefreshingAppraisal] = React.useState(false);
  const [verificationDemandLoading, setVerificationDemandLoading] = React.useState(false);
  const [rightsSheetVisible, setRightsSheetVisible] = React.useState(false);
  const [supplySheetVisible, setSupplySheetVisible] = React.useState(false);

  // ── Data loading via shared cache (deduplicated with AssetDetailScreen) ──
  const assetQuery = useCoOwnAssetQuery(assetId);
  const recourseQuery = useCoOwnRecourseQuery(assetId);
  const holdingsQuery = useCoOwnHoldingsQuery(currentUser?.id);

  const asset = assetQuery.data ?? null;
  const recourseStatus = recourseQuery.data ?? null;
  const isLoading = assetQuery.isLoading;
  const isError = assetQuery.isError;
  const refreshing = assetQuery.isRefetching || recourseQuery.isRefetching;

  const yourHolding = holdingsQuery.data?.find((entry) => entry.assetId === assetId) ?? null;
  const yourUnits = currentUser?.id
    ? (holdingsQuery.data ? (yourHolding?.unitsOwned ?? 0) : null)
    : 0;

  // Show error toast on fetch failure
  React.useEffect(() => {
    if (assetQuery.error) {
      const parsed = parseApiError(assetQuery.error, 'Unable to load asset');
      show(parsed.message, 'error');
    }
  }, [assetQuery.error, show]);

  const handleRefresh = React.useCallback(() => {
    assetQuery.refetch();
    recourseQuery.refetch();
    if (currentUser?.id) holdingsQuery.refetch();
  }, [assetQuery, recourseQuery, holdingsQuery, currentUser?.id]);

  // ── Loading / error states ──
  if (isLoading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <StatusBar style={isDark ? 'light' : 'dark'} />
        <CoOwnAssetDetailSkeleton />
      </View>
    );
  }

  if (isError || !asset) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <StatusBar style={isDark ? 'light' : 'dark'} />
        <CoOwnStateCanvas
          variant="error"
          title="Due diligence unavailable"
          subtitle="This asset may have been delisted or could not be loaded."
          actionLabel="Back"
          onAction={() => navigation.goBack()}
        />
      </View>
    );
  }

  // ── Derived values ──
  const isIssuer = currentUser?.id === asset.issuerId;
  const isHolder = yourUnits != null && yourUnits > 0;
  const totalUnits = asset.totalUnits;
  const availableUnits = asset.availableUnits;
  const navPerUnitGbp = asset.appraisalValueGbp && totalUnits > 0
    ? asset.appraisalValueGbp / totalUnits
    : null;
  const referenceVsNavPct = navPerUnitGbp && navPerUnitGbp > 0
    ? ((asset.unitPriceGbp - navPerUnitGbp) / navPerUnitGbp) * 100
    : null;
  const allocatedPct = totalUnits > 0 ? Math.round(((totalUnits - availableUnits) / totalUnits) * 100) : 0;
  const viewerPct = yourUnits != null && totalUnits > 0
    ? Math.round((yourUnits / totalUnits) * 100 * 10) / 10
    : null;
  const feePct = Math.round((asset.tradingFeeRate ?? CO_OWN_FEE_RATE) * 100);

  // Dossier evidence groups — derived from the trust profile.
  const dossierEvidenceGroups = resolveEvidenceGroups({
    category: null,
    condition: asset.conditionGrade ?? null,
    description: asset.provenance ?? null,
  });

  // Rights rows — fail closed to "To be confirmed" when the backend
  // hasn't published per-label rights answers.
  const rightsTbcReason = asset.rights?.tbcReason ?? null;
  const rightsTbcEtaDate = asset.rights?.tbcEtaDate ?? null;
  const structuredRightsMap: Record<string, string | null> = {
    'Distributions': asset.rights?.economicRights ?? null,
    'Voting rights': asset.rights?.votingRights ?? null,
    'Exit & proceeds': asset.rights?.exitRights ?? null,
    'Operating costs': asset.rights?.feeRights ?? null,
  };
  const rightsRows: CoOwnRightsRow[] = CANONICAL_RIGHTS_LABELS.map((label) => {
    const structured = structuredRightsMap[label] ?? null;
    if (structured) {
      return { label, answer: structured, isTbc: false };
    }
    return {
      label,
      answer: rightsTbcReason ?? 'To be confirmed',
      isTbc: true,
      tbcReason: rightsTbcReason,
      tbcEtaDate: rightsTbcEtaDate,
    };
  });

  const hasProvenance = Boolean(asset.provenance?.length);
  const hasCondition = Boolean(asset.conditionGrade);
  const hasStorage = Boolean(asset.custodianLocation);
  const hasAppraisal = asset.appraisalValueGbp != null;
  const hasAboutAsset = hasProvenance || hasCondition;

  // ── Timeline events — all dated events combined chronologically ──
  const timelineEvents = (() => {
    const events: { event: string; date: Date; sortKey: number }[] = [];

    if (asset.authenticityVerifiedAt) {
      const d = new Date(asset.authenticityVerifiedAt);
      if (Number.isFinite(d.getTime())) {
        events.push({ event: 'Authenticity verified', date: d, sortKey: d.getTime() });
      }
    }
    if (asset.appraisalValuedAt) {
      const d = new Date(asset.appraisalValuedAt);
      if (Number.isFinite(d.getTime())) {
        events.push({ event: 'Appraisal completed', date: d, sortKey: d.getTime() });
      }
    }
    if (asset.trustAuditEvents) {
      asset.trustAuditEvents.forEach((evt) => {
        const d = new Date(evt.createdAt);
        if (Number.isFinite(d.getTime())) {
          events.push({ event: evt.eventType.replace(/_/g, ' '), date: d, sortKey: d.getTime() });
        }
      });
    }
    if (asset.marketAuditEvents) {
      asset.marketAuditEvents.forEach((evt) => {
        const d = new Date(evt.createdAt);
        if (Number.isFinite(d.getTime())) {
          events.push({ event: evt.eventType.replace(/_/g, ' '), date: d, sortKey: d.getTime() });
        }
      });
    }

    return events.sort((a, b) => b.sortKey - a.sortKey);
  })();

  // ── Document rows — legal/technical documents as flat rows ──
  const documentRows = (() => {
    const docs: { icon: string; title: string; subtitle: string | null; url: string | null; isLink: boolean }[] = [];

    if (asset.escrowTermsUrl) {
      docs.push({
        icon: 'checkmark-circle-outline',
        title: 'Escrow terms',
        subtitle: asset.escrowPartner ?? null,
        url: asset.escrowTermsUrl,
        isLink: true,
      });
    }
    if (asset.safeguardingEvidenceUrl) {
      docs.push({
        icon: 'lock-closed-outline',
        title: 'Safeguarding evidence',
        subtitle: asset.safeguardingPartner ?? null,
        url: asset.safeguardingEvidenceUrl,
        isLink: true,
      });
    }
    if (asset.safeguardingTermsUrl) {
      docs.push({
        icon: 'document-lock-outline',
        title: 'Safeguarding terms',
        subtitle: null,
        url: asset.safeguardingTermsUrl,
        isLink: true,
      });
    }
    if (asset.buyerProtectionTermsUrl) {
      docs.push({
        icon: 'checkmark-circle-outline',
        title: 'Buyer protection terms',
        subtitle: asset.buyerProtection ? 'Active' : null,
        url: asset.buyerProtectionTermsUrl,
        isLink: true,
      });
    }
    if (asset.custodyPolicyRef) {
      docs.push({
        icon: 'file-tray-stacked-outline',
        title: 'Custody policy',
        subtitle: asset.custodyPolicyRef,
        url: null,
        isLink: false,
      });
    }

    return docs;
  })();

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar style={isDark ? 'light' : 'dark'} />

      {/* ── Header ──
          Quiet, standard back header. No large rounded containers. */}
      <ScreenHeader
        title="Due diligence"
        subtitle={asset.title}
        onBack={() => navigation.goBack()}
        style={{
          paddingTop: insets.top,
          paddingHorizontal: Space.sm,
          paddingBottom: Space.sm,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: colors.borderSubtle,
        }}
      />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, Space.lg) + Space.lg + DOCK_HEIGHT }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={colors.brand}
            colors={[colors.brand]}
            progressBackgroundColor={colors.surfaceAlt}
          />
        }
      >
        {isOffline && <OfflineBanner onRetry={handleRefresh} />}

        {/* ── Evidence ──
            Provenance story, condition, category evidence, authentication. */}
        <CommerceDetailSection label="Evidence" variant="editorial">
          {hasAboutAsset ? (
            <>
              {asset.provenance && (
                <Text style={[styles.storyText, { color: colors.textSecondary }]}>
                  {asset.provenance}
                </Text>
              )}
              {asset.conditionGrade && (
                <Text style={[styles.conditionInline, { color: colors.textSecondary }]}>
                  Condition · {asset.conditionGrade}
                </Text>
              )}
              {dossierEvidenceGroups.length > 0 && (
                <CategoryEvidence groups={dossierEvidenceGroups} />
              )}
            </>
          ) : (
            <Text style={[styles.emptyText, { color: colors.textMuted }]}>
              No story or condition details published yet.
            </Text>
          )}

          {/* Authentication evidence */}
          <CoOwnTrustPanel
            authenticityStatus={asset.authenticityStatus ?? null}
            authenticityMethod={asset.authenticityMethod ?? null}
            buyerProtection={asset.buyerProtection ?? false}
            buyerProtectionTermsUrl={asset.buyerProtectionTermsUrl ?? null}
            custodianName={asset.custodianName ?? null}
            custodianLocation={asset.custodianLocation ?? null}
            custodyInsured={asset.custodyInsured ?? false}
            custodyInsurer={asset.custodyInsurer ?? null}
            custodyCoverageGbp={asset.custodyCoverageGbp ?? null}
            custodyPolicyRef={asset.custodyPolicyRef ?? null}
            legalVehicleType={asset.legalVehicleType ?? null}
            legalVehicleName={asset.legalVehicleName ?? null}
            legalVehicleJurisdiction={asset.legalVehicleJurisdiction ?? null}
          />
        </CommerceDetailSection>

        {/* ── Custody ──
            Concise custody facts with source/date drilldown. */}
        <CommerceDetailSection label="Custody" divider variant="editorial">
          {(asset.custodianName || asset.custodyInsured || asset.custodianLocation) ? (
            <View style={styles.custodyEvidence}>
              <CommerceDetailMetricRow
                label="Custodian"
                value={asset.custodianName ?? 'Not available'}
              />
              {asset.custodianLocation && (
                <CommerceDetailMetricRow
                  label="Location"
                  value={asset.custodianLocation}
                />
              )}
              <CommerceDetailMetricRow
                label="Insured"
                value={
                  asset.custodyInsured
                    ? asset.custodyInsurer
                      ? `Yes · ${asset.custodyInsurer}`
                      : 'Yes'
                    : 'No'
                }
              />
              {asset.custodyInsured && asset.custodyCoverageGbp != null && (
                <CommerceDetailMetricRow
                  label="Coverage"
                  value={formatCoOwnIze(asset.custodyCoverageGbp)}
                />
              )}
              {asset.custodyPolicyRef && (
                <CommerceDetailMetricRow
                  label="Policy ref"
                  value={asset.custodyPolicyRef}
                />
              )}
            </View>
          ) : (
            <Text style={[styles.emptyText, { color: colors.textMuted }]}>
              Custody details not available.
            </Text>
          )}
        </CommerceDetailSection>

        {/* ── Provenance timeline ──
            Chronological events with a vertical line and event dots.
            Combines authenticity, appraisal, trust audit and market audit
            events into one visual timeline. */}
        {timelineEvents.length > 0 ? (
          <CommerceDetailSection label="Timeline" divider variant="editorial">
            <View style={styles.timelineWrap}>
              {timelineEvents.map((evt, i) => {
                const isLast = i === timelineEvents.length - 1;
                return (
                  <View key={`${evt.sortKey}-${i}`} style={styles.timelineRow}>
                    <View style={styles.timelineDotCol}>
                      <View style={[styles.timelineDot, { backgroundColor: colors.brand }]} />
                      {!isLast ? (
                        <View style={[styles.timelineLine, { backgroundColor: colors.borderSubtle }]} />
                      ) : null}
                    </View>
                    <View style={styles.timelineContent}>
                      <Text style={[styles.timelineEvent, { color: colors.textPrimary }]}>
                        {evt.event}
                      </Text>
                      <Text style={[styles.timelineDate, { color: colors.textMuted }]}>
                        {evt.date.toLocaleDateString(undefined, {
                          year: 'numeric', month: 'short', day: 'numeric',
                        })}
                      </Text>
                    </View>
                  </View>
                );
              })}
            </View>
          </CommerceDetailSection>
        ) : null}

        {/* ── Documents ──
            Legal/technical documents as flat rows with icons.
            Links open externally; non-link rows show reference text. */}
        {documentRows.length > 0 ? (
          <CommerceDetailSection label="Documents" divider variant="editorial">
            <View style={styles.documentList}>
              {documentRows.map((doc, i) => (
                <Pressable
                  key={`${doc.title}-${i}`}
                  style={({ pressed }) => [
                    styles.documentRow,
                    { borderBottomColor: colors.borderSubtle },
                    pressed && { opacity: 0.5 },
                  ]}
                  onPress={doc.isLink && doc.url ? () => safeOpenURL(doc.url!, doc.title) : undefined}
                  disabled={!doc.isLink || !doc.url}
                  accessibilityRole={doc.isLink && doc.url ? 'link' : undefined}
                  accessibilityLabel={doc.isLink && doc.url ? `Open ${doc.title}` : doc.title}
                >
                  <Ionicons name={doc.icon as React.ComponentProps<typeof Ionicons>['name']} size={18} color={colors.textMuted} />
                  <View style={styles.documentInfo}>
                    <Text style={[styles.documentTitle, { color: colors.textPrimary }]} numberOfLines={1}>
                      {doc.title}
                    </Text>
                    {doc.subtitle ? (
                      <Text style={[styles.documentSubtitle, { color: colors.textMuted }]} numberOfLines={1}>
                        {doc.subtitle}
                      </Text>
                    ) : null}
                  </View>
                  {doc.isLink && doc.url ? (
                    <Ionicons name="open-outline" size={14} color={colors.brand} />
                  ) : null}
                </Pressable>
              ))}
            </View>
          </CommerceDetailSection>
        ) : null}

        {/* ── Appraisal ──
            Appraisal value, NAV, reference vs NAV, valuer, date. */}
        <CommerceDetailSection label="Appraisal" divider variant="editorial">
          {hasAppraisal ? (
            <>
              <View style={styles.valuationHero}>
                <Text style={[styles.valuationLabel, { color: colors.textSecondary }]}>
                  Latest appraisal
                </Text>
                <Text style={[styles.valuationValue, { color: colors.textPrimary }]}>
                  {formatCoOwnIze(asset.appraisalValueGbp!)}
                </Text>
                {asset.appraisalValuedAt && (
                  <Text style={[styles.valuationDate, { color: colors.textMuted }]}>
                    {new Date(asset.appraisalValuedAt).toLocaleDateString(undefined, {
                      year: 'numeric', month: 'short', day: 'numeric',
                    })}
                  </Text>
                )}
              </View>
              {asset.appraisalValuer && (
                <CommerceDetailMetricRow
                  label="Valuer"
                  value={asset.appraisalValuer}
                />
              )}
              {navPerUnitGbp != null && (
                <CommerceDetailMetricRow
                  label="NAV / unit"
                  value={formatFromFiat(navPerUnitGbp, 'GBP')}
                />
              )}
              {referenceVsNavPct != null && (
                <CommerceDetailMetricRow
                  label="Reference vs NAV"
                  value={`${referenceVsNavPct >= 0 ? '+' : ''}${referenceVsNavPct.toFixed(1)}%`}
                />
              )}
              {/* Stale appraisal — issuer can refresh */}
              {asset.appraisalStaleDays != null && asset.appraisalStaleDays > 180 && (
                <View style={styles.staleAppraisalRow}>
                  <CommerceDetailMetricRow
                    label="Appraisal"
                    value={`Stale · ${asset.appraisalStaleDays}d since last valuation`}
                  />
                  {isIssuer && (
                    <Pressable
                      style={[styles.refreshBtn, { borderColor: colors.border, opacity: isRefreshingAppraisal ? 0.5 : 1 }]}
                      disabled={isRefreshingAppraisal}
                      onPress={async () => {
                        if (isRefreshingAppraisal || !assetId) return;
                        setIsRefreshingAppraisal(true);
                        try {
                          await refreshCoOwnAppraisal(assetId, {
                            appraisalValueGbp: asset.appraisalValueGbp ?? 0,
                            appraisalValuer: 'Issuer refresh',
                          });
                          show('Appraisal refresh requested', 'success');
                          await assetQuery.refetch();
                        } catch {
                          show('Unable to refresh appraisal', 'error');
                        } finally {
                          setIsRefreshingAppraisal(false);
                        }
                      }}
                      accessibilityRole="button"
                      accessibilityLabel={isRefreshingAppraisal ? 'Refreshing appraisal' : 'Refresh appraisal'}
                    >
                      <Text style={[styles.refreshBtnText, { color: colors.brand }]}>
                        {isRefreshingAppraisal ? 'Refreshing…' : 'Refresh'}
                      </Text>
                    </Pressable>
                  )}
                </View>
              )}
            </>
          ) : (
            <Text style={[styles.emptyText, { color: colors.textMuted }]}>
              No appraisal published yet.
            </Text>
          )}
        </CommerceDetailSection>

        {/* ── Ownership structure ──
            Legal vehicle, supply, rights. */}
        <CommerceDetailSection label="Ownership structure" divider variant="editorial">
          {/* Legal vehicle */}
          {asset.legalVehicleType && asset.legalVehicleType !== 'none' && (
            <>
              <CommerceDetailMetricRow
                label="Legal vehicle"
                value={
                  asset.legalVehicleType === 'spv' ? 'SPV'
                  : asset.legalVehicleType === 'series_llc' ? 'Series LLC'
                  : asset.legalVehicleType === 'llc' ? 'LLC'
                  : asset.legalVehicleType === 'trust' ? 'Trust'
                  : asset.legalVehicleType
                }
              />
              {asset.legalVehicleName && (
                <CommerceDetailMetricRow
                  label="Vehicle name"
                  value={asset.legalVehicleName}
                />
              )}
              {asset.legalVehicleJurisdiction && (
                <CommerceDetailMetricRow
                  label="Jurisdiction"
                  value={asset.legalVehicleJurisdiction}
                />
              )}
            </>
          )}

          {/* Supply summary + disclosure */}
          <View style={styles.supplySummary}>
            <View style={styles.supplyMetric}>
              <Text style={[styles.supplyMetricLabel, { color: colors.textSecondary }]}>
                Available
              </Text>
              <Text style={[styles.supplyUnits, { color: colors.textPrimary }]}>
                {availableUnits} / {totalUnits} units
              </Text>
            </View>
            <View style={[styles.supplyMetric, styles.supplyMetricTrailing]}>
              <Text style={[styles.supplyMetricLabel, { color: colors.textSecondary }]}>
                Allocated
              </Text>
              <Text style={[styles.supplyAllocated, { color: colors.textPrimary }]}>
                {allocatedPct}%
              </Text>
            </View>
          </View>
          <View style={[styles.allocationBar, { backgroundColor: colors.surfaceAlt }]}>
            <View
              style={[
                styles.allocationFill,
                { backgroundColor: colors.brand, width: `${Math.min(100, allocatedPct)}%` },
              ]}
            />
          </View>
          {asset.holders != null && (
            <Text style={[styles.supplyHolders, { color: colors.textSecondary }]}>
              {asset.holders} holders
            </Text>
          )}
          <CommerceDetailDisclosureRow
            label="Supply"
            summary="Available · allocated · holders"
            onPress={() => setSupplySheetVisible(true)}
            leadingIcon="layers-outline"
          />

          {/* Rights */}
          <View style={styles.rightsSummary}>
            <Text style={[styles.rightsCriticalStatement, { color: colors.textPrimary }]}>
              You own units in the asset, not the physical item.
            </Text>
          </View>
          <CommerceDetailDisclosureRow
            label="Full-asset buyout"
            summary="Submit or review buyout offers"
            onPress={() => navigation.navigate('Buyout', { assetId: asset.id })}
            leadingIcon="briefcase-outline"
          />
          <CommerceDetailDisclosureRow
            label="Rights"
            count={CANONICAL_RIGHTS_LABELS.length}
            summary={
              asset.rights
                ? asset.rights.version
                  ? formatRightsVersion(`v${asset.rights.version}`)
                  : 'Version not available'
                : 'Unpublished'
            }
            onPress={() => setRightsSheetVisible(true)}
            leadingIcon="document-text-outline"
          />
        </CommerceDetailSection>

        {/* ── Rights ──
            Concise rights facts with version, key terms, and document drilldown. */}
        <CommerceDetailSection label="Rights" divider variant="editorial">
          <CommerceDetailMetricRow
            label="Version"
            value={
              asset.rights
                ? asset.rights.version
                  ? `v${asset.rights.version}`
                  : 'Version not available'
                : 'Unpublished'
            }
          />
          {asset.rights?.publishedAt && (
            <CommerceDetailMetricRow
              label="Published"
              value={new Date(asset.rights.publishedAt).toLocaleDateString(undefined, {
                year: 'numeric', month: 'short', day: 'numeric',
              })}
            />
          )}
          {asset.rights?.jurisdiction && (
            <CommerceDetailMetricRow
              label="Jurisdiction"
              value={asset.rights.jurisdiction}
            />
          )}
          {asset.rights?.governingLaw && (
            <CommerceDetailMetricRow
              label="Governing law"
              value={asset.rights.governingLaw}
            />
          )}
          {asset.rights?.economicRights && (
            <CommerceDetailMetricRow
              label="Distributions"
              value={asset.rights.economicRights}
            />
          )}
          {asset.rights?.votingRights && (
            <CommerceDetailMetricRow
              label="Voting rights"
              value={asset.rights.votingRights}
            />
          )}
          {asset.rights?.exitRights && (
            <CommerceDetailMetricRow
              label="Exit & proceeds"
              value={asset.rights.exitRights}
            />
          )}
          {asset.rights?.feeRights && (
            <CommerceDetailMetricRow
              label="Operating costs"
              value={asset.rights.feeRights}
            />
          )}
          <CommerceDetailDisclosureRow
            label="Full rights table"
            count={CANONICAL_RIGHTS_LABELS.length}
            summary={
              asset.rights
                ? asset.rights.version
                  ? formatRightsVersion(`v${asset.rights.version}`)
                  : 'Version not available'
                : 'Unpublished'
            }
            onPress={() => setRightsSheetVisible(true)}
            leadingIcon="document-text-outline"
          />
        </CommerceDetailSection>

        {/* ── Costs ── */}
        <CommerceDetailSection label="Costs" divider variant="editorial">
          <CommerceDetailMetricRow
            label="Trading fee"
            value={`${feePct}%`}
          />
          <CommerceDetailMetricRow
            label="Settlement mode"
            value={asset.settlementMode}
          />
          {asset.settlementEtaHours != null && (
            <CommerceDetailMetricRow
              label="Settlement time"
              value={asset.settlementEtaHours === 1 ? '~1 hour' : `~${asset.settlementEtaHours} hours`}
            />
          )}
          {asset.escrowPartner && (
            <CommerceDetailMetricRow
              label="Escrow partner"
              value={asset.escrowPartner}
            />
          )}
          {asset.escrowTermsUrl && (
            <Pressable
              style={({ pressed }) => [styles.linkRow, pressed && { opacity: 0.5 }]}
              onPress={() => safeOpenURL(asset.escrowTermsUrl!, 'Escrow terms')}
              accessibilityRole="link"
              accessibilityLabel="View escrow terms"
            >
              <Text style={[styles.linkText, { color: colors.brand }]}>View escrow terms</Text>
              <Ionicons name="open-outline" size={14} color={colors.brand} />
            </Pressable>
          )}
          {asset.safeguarded && asset.safeguardingEvidenceUrl && (
            <CommerceDetailMetricRow
              label="Safeguarded"
              value={asset.safeguardingPartner ? `Yes · ${asset.safeguardingPartner}` : 'Yes'}
            />
          )}
          {asset.safeguardingEvidenceUrl && (
            <Pressable
              style={({ pressed }) => [styles.linkRow, pressed && { opacity: 0.5 }]}
              onPress={() => safeOpenURL(asset.safeguardingEvidenceUrl!, 'Safeguarding evidence')}
              accessibilityRole="link"
              accessibilityLabel="View safeguarding evidence"
            >
              <Text style={[styles.linkText, { color: colors.brand }]}>View safeguarding evidence</Text>
              <Ionicons name="open-outline" size={14} color={colors.brand} />
            </Pressable>
          )}
        </CommerceDetailSection>

        {/* ── Recourse ──
            Recourse agreement, personal liability, verification demands. */}
        <CommerceDetailSection label="Recourse" divider variant="editorial">
          <CoOwnRecoursePanel
            recourseAgreementSigned={asset.recourseAgreementSigned ?? false}
            recourseStatus={asset.recourseStatus ?? 'pending'}
            totalTradedValueGbp={asset.totalTradedValueGbp}
            activeVerificationDemands={asset.activeVerificationDemands}
            agreement={recourseStatus?.agreement ?? null}
            sellerLiability={recourseStatus?.sellerLiability ?? null}
            verificationDemands={recourseStatus?.verificationDemands}
            isHolder={isHolder}
            isIssuer={isIssuer}
            onRequestVerification={async () => {
              if (!assetId) return;
              setVerificationDemandLoading(true);
              try {
                await createVerificationDemand(assetId, 'authenticity');
                show('Verification request sent to seller', 'success');
                await recourseQuery.refetch();
              } catch {
                show('Could not send verification request', 'error');
              } finally {
                setVerificationDemandLoading(false);
              }
            }}
            onRespondToVerification={(demandId) => {
              navigation.navigate('VerificationResponse', { assetId, demandId });
            }}
          />
        </CommerceDetailSection>

        {/* ── Risk disclosure ── */}
        <CommerceDetailSection label="Risks" divider variant="editorial">
          <CoOwnRiskDisclosure
            disclosures={asset.riskDisclosures ?? null}
            onReportIssue={() => navigation.navigate('CoOwnIssue', { assetId: asset.id })}
          />
        </CommerceDetailSection>

        {/* ── Audit history ──
            Trust audit trail + market audit trail. Deep evidence, not
            a primary scroll module — lives here in due diligence. */}
        <CommerceDetailSection label="Audit history" divider variant="editorial">
          {/* Trust audit trail */}
          {asset.trustAuditEvents && asset.trustAuditEvents.length > 0 ? (
            <View style={[styles.auditTrailWrap, { borderTopColor: colors.borderSubtle }]}>
              <Text style={[styles.auditTrailTitle, { color: colors.textSecondary }]}>
                Trust history
              </Text>
              {asset.trustAuditEvents.map((evt, i) => (
                <View key={i} style={styles.auditTrailRow}>
                  <Text style={[styles.auditTrailEvent, { color: colors.textMuted }]} numberOfLines={1}>
                    {evt.eventType.replace(/_/g, ' ')}
                  </Text>
                  <Text style={[styles.auditTrailDate, { color: colors.textMuted }]} numberOfLines={1}>
                    {new Date(evt.createdAt).toLocaleDateString(undefined, {
                      year: 'numeric', month: 'short', day: 'numeric',
                    })}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}

          {/* Market audit trail */}
          {asset.marketAuditEvents && asset.marketAuditEvents.length > 0 ? (
            <View style={[styles.auditTrailWrap, { borderTopColor: colors.borderSubtle }]}>
              <Text style={[styles.auditTrailTitle, { color: colors.textSecondary }]}>
                Market history
              </Text>
              {asset.marketAuditEvents.map((evt) => (
                <View key={evt.id} style={styles.auditTrailRow}>
                  <Text style={[styles.auditTrailEvent, { color: colors.textMuted }]} numberOfLines={1}>
                    {evt.eventType.replace(/_/g, ' ')}
                  </Text>
                  <Text style={[styles.auditTrailDate, { color: colors.textMuted }]} numberOfLines={1}>
                    {new Date(evt.createdAt).toLocaleDateString(undefined, {
                      year: 'numeric', month: 'short', day: 'numeric',
                    })}
                  </Text>
                </View>
              ))}
            </View>
          ) : (
            <View style={[styles.auditTrailWrap, { borderTopColor: colors.borderSubtle }]}>
              <Text style={[styles.auditTrailTitle, { color: colors.textSecondary }]}>
                Market history
              </Text>
              <Text style={[styles.auditTrailEvent, { color: colors.textMuted }]}>
                No market history yet
              </Text>
            </View>
          )}
        </CommerceDetailSection>

      </ScrollView>

      {/* ── Back-to-asset sticky dock ── */}
      <View
        style={[
          styles.backDock,
          {
            backgroundColor: colors.surface,
            borderTopColor: colors.borderSubtle,
            paddingBottom: Math.max(insets.bottom, Space.sm),
          },
        ]}
      >
        <Pressable
          style={({ pressed }) => [styles.backDockBtn, pressed && { opacity: 0.5 }]}
          onPress={() => { haptic.light(); navigation.goBack(); }}
          accessibilityRole="button"
          accessibilityLabel="Back to asset"
        >
          <Ionicons name="arrow-back" size={18} color={colors.brand} />
          <Text style={[styles.backDockLabel, { color: colors.brand }]}>
            Back to asset
          </Text>
        </Pressable>
      </View>

      {/* Rights sheet — 13-row modal */}
      <CoOwnRightsSheet
        visible={rightsSheetVisible}
        onClose={() => setRightsSheetVisible(false)}
        disclosureVersion={
          asset.rights
            ? asset.rights.version
              ? `Rights v${asset.rights.version}`
              : 'Version not available'
            : 'Unpublished'
        }
        rights={rightsRows}
      />

      {/* Supply structure sheet */}
      <CoOwnSupplySheet
        visible={supplySheetVisible}
        onClose={() => setSupplySheetVisible(false)}
        unitPriceLabel={formatCoOwnIze(asset.unitPriceGbp)}
        totalUnits={totalUnits}
        availableUnits={availableUnits}
        allocatedPct={allocatedPct}
        viewerUnits={yourUnits}
        viewerPct={viewerPct}
        settlementMode={asset.settlementMode}
        feePct={feePct}
        holderCount={asset.holders}
        status={asset.isOpen ? (availableUnits > 0 ? 'open' : 'closed') : 'paused'}
        supply={{ authorised: null, issued: null, publicFloat: null, treasury: null }}
        rightsVersion={asset.rights?.version ? `v${asset.rights.version}` : undefined}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  // ── Story text ──
  storyText: {
    fontSize: TypographyV2.body.size,
    lineHeight: TypographyV2.body.lineHeight,
    fontFamily: FontFamily.regular,
    letterSpacing: TypographyV2.body.letterSpacing,
    marginBottom: Space.md,
  },
  // ── Empty state ──
  emptyText: {
    fontSize: TypographyV2.body.size,
    lineHeight: TypographyV2.body.lineHeight,
    fontFamily: FontFamily.regular,
    fontStyle: 'italic',
  },
  // ── Valuation hero ──
  valuationHero: {
    gap: Space.xs,
    marginBottom: Space.md,
  },
  valuationLabel: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: FontFamily.regular,
    letterSpacing: TypographyV2.meta.letterSpacing,
  },
  valuationValue: {
    fontSize: Numeric.priceLarge.size,
    lineHeight: Numeric.priceLarge.lineHeight,
    fontFamily: FontFamily.bold,
    letterSpacing: Numeric.priceLarge.letterSpacing,
    fontVariant: ['tabular-nums'] as ['tabular-nums'],
  },
  valuationDate: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: FontFamily.regular,
    letterSpacing: TypographyV2.meta.letterSpacing,
  },
  // ── Stale appraisal ──
  staleAppraisalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Space.sm,
  },
  refreshBtn: {
    paddingVertical: Space.xs,
    paddingHorizontal: Space.sm,
    borderRadius: RadiusRoleValue.mediaThumbnail,
    borderWidth: Stroke.standard,
  },
  refreshBtnText: {
    fontSize: TypographyV2.meta.size,
    fontFamily: FontFamily.semibold,
  },
  // ── Supply summary ──
  supplySummary: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: Space.sm,
    marginBottom: Space.md,
    marginTop: Space.sm,
  },
  supplyMetric: {
    gap: Space.xs,
    flex: 1,
  },
  supplyMetricTrailing: {
    alignItems: 'flex-end',
  },
  supplyMetricLabel: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: FontFamily.regular,
    letterSpacing: TypographyV2.meta.letterSpacing,
  },
  supplyUnits: {
    fontSize: TypographyV2.sectionTitle.size,
    lineHeight: TypographyV2.sectionTitle.lineHeight,
    fontFamily: FontFamily.bold,
    letterSpacing: TypographyV2.sectionTitle.letterSpacing,
    fontVariant: ['tabular-nums'] as ['tabular-nums'],
  },
  supplyAllocated: {
    fontSize: TypographyV2.sectionTitle.size,
    lineHeight: TypographyV2.sectionTitle.lineHeight,
    fontFamily: FontFamily.bold,
    fontVariant: ['tabular-nums'] as ['tabular-nums'],
  },
  allocationBar: {
    height: Space.sm,
    borderRadius: RadiusRoleValue.pillAvatar,
    overflow: 'hidden',
  },
  allocationFill: {
    height: '100%',
    borderRadius: RadiusRoleValue.pillAvatar,
  },
  supplyHolders: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: FontFamily.regular,
    letterSpacing: TypographyV2.meta.letterSpacing,
    marginTop: Space.md,
  },
  // ── Rights summary ──
  rightsSummary: {
    paddingVertical: Space.md,
  },
  rightsCriticalStatement: {
    fontSize: TypographyV2.bodyStrong.size,
    lineHeight: TypographyV2.bodyStrong.lineHeight,
    fontFamily: FontFamily.semibold,
    letterSpacing: TypographyV2.bodyStrong.letterSpacing,
  },
  // ── Link rows ──
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
    paddingVertical: Space.sm,
    minHeight: Control.hit,
  },
  linkText: {
    fontSize: TypographyV2.body.size,
    lineHeight: TypographyV2.body.lineHeight,
    fontFamily: FontFamily.medium,
    letterSpacing: TypographyV2.body.letterSpacing,
  },
  // ── Audit trail ──
  auditTrailWrap: {
    gap: Space.sm,
    paddingTop: Space.lg,
    marginTop: Space.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  auditTrailTitle: {
    fontSize: TypographyV2.label.size,
    lineHeight: TypographyV2.label.lineHeight,
    fontFamily: FontFamily.semibold,
    letterSpacing: TypographyV2.label.letterSpacing,
    textTransform: 'uppercase',
    marginBottom: Space.xs,
  },
  auditTrailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: Space.sm,
    paddingVertical: Space.sm,
  },
  auditTrailEvent: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    textTransform: 'capitalize',
  },
  auditTrailDate: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: FontFamily.medium,
    fontVariant: ['tabular-nums'] as ['tabular-nums'],
  },
  conditionInline: {
    fontSize: TypographyV2.body.size,
    lineHeight: TypographyV2.body.lineHeight,
    fontFamily: FontFamily.regular,
    marginTop: Space.xs,
  },
  custodyEvidence: {
    gap: Space.xs,
  },
  // ── Timeline ──
  timelineWrap: {
    paddingVertical: Space.xs,
  },
  timelineRow: {
    flexDirection: 'row',
    gap: Space.sm,
  },
  timelineDotCol: {
    alignItems: 'center',
    width: Space.sm,
  },
  timelineDot: {
    width: Space.xs + 2,
    height: Space.xs + 2,
    borderRadius: Radius.full,
    marginTop: Space.xs + 1,
  },
  timelineLine: {
    flex: 1,
    width: StyleSheet.hairlineWidth,
    marginTop: Space.xs,
  },
  timelineContent: {
    flex: 1,
    paddingBottom: Space.md,
  },
  timelineEvent: {
    fontSize: TypographyV2.body.size,
    lineHeight: TypographyV2.body.lineHeight,
    fontFamily: FontFamily.medium,
    textTransform: 'capitalize',
  },
  timelineDate: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: FontFamily.regular,
    fontVariant: ['tabular-nums'] as ['tabular-nums'],
    marginTop: 1,
  },
  // ── Documents ──
  documentList: {
    paddingVertical: Space.xs,
  },
  documentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    paddingVertical: Space.sm + 2,
    minHeight: Control.hit,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  documentInfo: {
    flex: 1,
    gap: 1,
  },
  documentTitle: {
    fontSize: TypographyV2.body.size,
    lineHeight: TypographyV2.body.lineHeight,
    fontFamily: FontFamily.medium,
  },
  documentSubtitle: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
  },
  // ── Back-to-asset sticky dock ──
  backDock: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Space.md,
    paddingTop: Space.sm,
  },
  backDockBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space.xs,
    height: DOCK_HEIGHT,
    borderRadius: Radius.md,
    backgroundColor: 'transparent',
  },
  backDockLabel: {
    fontSize: TypographyV2.bodyStrong.size,
    lineHeight: TypographyV2.bodyStrong.lineHeight,
    fontFamily: FontFamily.semibold,
    letterSpacing: TypographyV2.bodyStrong.letterSpacing,
  },
});
