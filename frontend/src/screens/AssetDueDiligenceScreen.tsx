import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  Pressable,
  Linking,
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
import { Space, FontFamily, DockConstants, Stroke, Control, LetterSpacing, Numeric } from '../theme/designTokens';
import { TypographyV2 } from '../theme/typography.v2';
import { RadiusRoleValue } from '../theme/surfaceRadiusRules';
import {
  fetchCoOwnAssetById,
  fetchCoOwnRecourseStatus,
  refreshCoOwnAppraisal,
  createVerificationDemand,
  type MarketCoOwnAsset,
  type CoOwnRecourseStatus,
} from '../services/marketApi';
import { parseApiError } from '../lib/apiClient';
import { useToast } from '../context/ToastContext';
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
  CoOwnAssetDossier,
  CoOwnRiskDisclosure,
  CoOwnRightsSheet,
  CoOwnSupplySheet,
  CoOwnStateCanvas,
  CoOwnAssetDetailSkeleton,
  CANONICAL_RIGHTS_LABELS,
  type CoOwnRightsRow,
} from '../components/coown';
import { useConnectivity } from '../hooks/useConnectivity';
import { useReducedMotion } from '../hooks/useReducedMotion';

type RouteT = RouteProp<RootStackParamList, 'AssetDueDiligence'>;
type NavT = NativeStackNavigationProp<RootStackParamList>;

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
  const { isOffline } = useConnectivity();
  const reducedMotion = useReducedMotion();
  const insets = useSafeAreaInsets();
  const currentUser = useStore((state) => state.currentUser);
  const { formatFromFiat } = useFormattedPrice();
  const { show } = useToast();

  const assetId = route.params?.assetId;

  const [asset, setAsset] = React.useState<MarketCoOwnAsset | null>(null);
  const [isRefreshingAppraisal, setIsRefreshingAppraisal] = React.useState(false);
  const [recourseStatus, setRecourseStatus] = React.useState<CoOwnRecourseStatus | null>(null);
  const [verificationDemandLoading, setVerificationDemandLoading] = React.useState(false);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isError, setIsError] = React.useState(false);
  const [refreshing, setRefreshing] = React.useState(false);
  const [rightsSheetVisible, setRightsSheetVisible] = React.useState(false);
  const [supplySheetVisible, setSupplySheetVisible] = React.useState(false);

  // ── Data loading ──
  React.useEffect(() => {
    if (!assetId) { setIsLoading(false); setIsError(true); return; }
    let cancelled = false;
    setIsLoading(true);
    setIsError(false);

    void Promise.allSettled([
      fetchCoOwnAssetById(assetId),
      fetchCoOwnRecourseStatus(assetId).catch(() => null),
    ]).then(([assetResult, recourseResult]) => {
      if (cancelled) return;
      if (assetResult.status === 'rejected') {
        const parsed = parseApiError(assetResult.reason, 'Unable to load asset');
        show(parsed.message, 'error');
        setIsError(true);
        setIsLoading(false);
        return;
      }
      setAsset(assetResult.value);
      if (recourseResult.status === 'fulfilled' && recourseResult.value) {
        setRecourseStatus(recourseResult.value);
      }
      setIsLoading(false);
    });

    return () => { cancelled = true; };
  }, [assetId, show]);

  const handleRefresh = React.useCallback(() => {
    if (!assetId) return;
    setRefreshing(true);
    void Promise.allSettled([
      fetchCoOwnAssetById(assetId),
      fetchCoOwnRecourseStatus(assetId).catch(() => null),
    ]).then(([assetResult, recourseResult]) => {
      if (assetResult.status === 'fulfilled') setAsset(assetResult.value);
      if (recourseResult.status === 'fulfilled' && recourseResult.value) {
        setRecourseStatus(recourseResult.value);
      }
      setRefreshing(false);
    });
  }, [assetId]);

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
  const isHolder = currentUser?.id != null && recourseStatus != null;
  const totalUnits = asset.totalUnits;
  const availableUnits = asset.availableUnits;
  const navPerUnitGbp = asset.appraisalValueGbp && totalUnits > 0
    ? asset.appraisalValueGbp / totalUnits
    : null;
  const referenceVsNavPct = navPerUnitGbp && navPerUnitGbp > 0
    ? ((asset.unitPriceGbp - navPerUnitGbp) / navPerUnitGbp) * 100
    : null;
  const allocatedPct = totalUnits > 0 ? Math.round(((totalUnits - availableUnits) / totalUnits) * 100) : 0;
  const feePct = Math.round(CO_OWN_FEE_RATE * 100);

  // Dossier evidence groups — derived from the trust profile.
  const dossierEvidenceGroups = resolveEvidenceGroups({
    category: null,
    condition: asset.conditionGrade ?? null,
    description: asset.provenance ?? null,
  });

  // Rights rows — fail closed to "To be confirmed" when the backend
  // hasn't published per-label rights answers.
  const rightsTbcReason = asset.rights?.tbcReason ?? null;
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
    };
  });

  const hasProvenance = Boolean(asset.provenance?.length);
  const hasCondition = Boolean(asset.conditionGrade);
  const hasStorage = Boolean(asset.custodianLocation);
  const hasAppraisal = asset.appraisalValueGbp != null;
  const hasAboutAsset = hasProvenance || hasCondition;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar style={isDark ? 'light' : 'dark'} />

      {/* ── Header ──
          Quiet, standard back header. No large rounded containers. */}
      <View style={[styles.header, { borderBottomColor: colors.borderSubtle, paddingTop: insets.top }]}>
        <Pressable
          onPress={() => navigation.goBack()}
          hitSlop={12}
          style={({ pressed }) => [styles.headerBack, pressed && { opacity: 0.5 }]}
          accessibilityRole="button"
          accessibilityLabel="Back to asset"
        >
          <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
        </Pressable>
        <View style={styles.headerTitleWrap}>
          <Text style={[styles.headerTitle, { color: colors.textPrimary }]} numberOfLines={1}>
            Due diligence
          </Text>
          <Text style={[styles.headerSubtitle, { color: colors.textSecondary }]} numberOfLines={1}>
            {asset.title}
          </Text>
        </View>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, Space.lg) + Space.lg }}
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
        {/* ── About this asset ──
            Story/description (provenance), condition. */}
        <CommerceDetailSection label="About this asset" variant="editorial">
          {hasAboutAsset ? (
            <>
              {asset.provenance && (
                <Text style={[styles.storyText, { color: colors.textSecondary }]}>
                  {asset.provenance}
                </Text>
              )}
              {asset.conditionGrade && (
                <CommerceDetailMetricRow
                  label="Condition"
                  value={asset.conditionGrade}
                />
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
        </CommerceDetailSection>

        {/* ── Authentication ── */}
        <CommerceDetailSection label="Authentication" divider variant="editorial">
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
          {asset.authenticityVerifiedAt && (
            <CommerceDetailMetricRow
              label="Verified at"
              value={new Date(asset.authenticityVerifiedAt).toLocaleDateString(undefined, {
                year: 'numeric', month: 'short', day: 'numeric',
              })}
            />
          )}
        </CommerceDetailSection>

        {/* ── Custody & insurance ──
            Detailed custodian/insurance/policy disclosure. */}
        {(asset.custodianName || asset.custodyInsured || asset.custodianLocation) && (
          <CommerceDetailSection label="Custody & insurance" divider variant="editorial">
            {asset.custodianName && (
              <CommerceDetailMetricRow
                label="Custodian"
                value={asset.custodianName}
              />
            )}
            {asset.custodianLocation && (
              <CommerceDetailMetricRow
                label="Location"
                value={asset.custodianLocation}
              />
            )}
            {asset.custodyInsured && (
              <>
                <CommerceDetailMetricRow
                  label="Insured"
                  value={asset.custodyInsurer ? `Yes · ${asset.custodyInsurer}` : 'Yes'}
                />
                {asset.custodyCoverageGbp != null && (
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
              </>
            )}
          </CommerceDetailSection>
        )}

        {/* ── Valuation ──
            Appraisal value, NAV, reference vs NAV, next report. */}
        <CommerceDetailSection label="Valuation" divider variant="editorial">
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
                          const updated = await fetchCoOwnAssetById(assetId);
                          setAsset(updated);
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
          <CommerceDetailMetricRow
            label="Full-asset buyout"
            value="Not available"
            muted
          />
          <CommerceDetailDisclosureRow
            label="Rights"
            count={CANONICAL_RIGHTS_LABELS.length}
            summary={asset.rights?.version ? formatRightsVersion(`v${asset.rights.version}`) : undefined}
            onPress={() => setRightsSheetVisible(true)}
            leadingIcon="document-text-outline"
          />
        </CommerceDetailSection>

        {/* ── Fees & settlement ── */}
        <CommerceDetailSection label="Fees & settlement" divider variant="editorial">
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
              onPress={() => Linking.openURL(asset.escrowTermsUrl!)}
              accessibilityRole="link"
              accessibilityLabel="View escrow terms"
            >
              <Text style={[styles.linkText, { color: colors.brand }]}>View escrow terms</Text>
              <Ionicons name="open-outline" size={14} color={colors.brand} />
            </Pressable>
          )}
          {asset.safeguarded && (
            <CommerceDetailMetricRow
              label="Safeguarded"
              value={asset.safeguardingPartner ? `Yes · ${asset.safeguardingPartner}` : 'Yes'}
            />
          )}
          {asset.safeguardingEvidenceUrl && (
            <Pressable
              style={({ pressed }) => [styles.linkRow, pressed && { opacity: 0.5 }]}
              onPress={() => Linking.openURL(asset.safeguardingEvidenceUrl!)}
              accessibilityRole="link"
              accessibilityLabel="View safeguarding evidence"
            >
              <Text style={[styles.linkText, { color: colors.brand }]}>View safeguarding evidence</Text>
              <Ionicons name="open-outline" size={14} color={colors.brand} />
            </Pressable>
          )}
        </CommerceDetailSection>

        {/* ── Seller accountability ──
            Recourse agreement, personal liability, verification demands. */}
        <CommerceDetailSection label="Seller accountability" divider variant="editorial">
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
                const updated = await fetchCoOwnRecourseStatus(assetId);
                setRecourseStatus(updated);
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

        {/* ── Full dossier (provenance/condition/storage/appraisal detail) ── */}
        {(asset.provenance || asset.conditionGrade || asset.custodianLocation || asset.appraisalValueGbp) && (
          <CommerceDetailSection label="Asset dossier" divider variant="editorial">
            <CoOwnAssetDossier
              provenance={asset.provenance ? [{ event: 'Provenance', date: '', note: asset.provenance }] : undefined}
              condition={asset.conditionGrade ? { grade: asset.conditionGrade } : undefined}
              storage={asset.custodianLocation ? {
                location: asset.custodianLocation,
                custodian: asset.custodianName ?? '—',
                insured: asset.custodyInsured ?? false,
                policyRef: asset.custodyPolicyRef ?? undefined,
              } : undefined}
              appraisal={asset.appraisalValueGbp != null ? {
                value: asset.appraisalValueGbp,
                currency: 'GBP',
                valuedAt: asset.appraisalValuedAt ?? '',
                method: '—',
                valuer: asset.appraisalValuer ?? undefined,
              } : undefined}
            />
          </CommerceDetailSection>
        )}
      </ScrollView>

      {/* Rights sheet — 13-row modal */}
      <CoOwnRightsSheet
        visible={rightsSheetVisible}
        onClose={() => setRightsSheetVisible(false)}
        disclosureVersion={asset.rights?.version ? `Rights v${asset.rights.version}` : 'Rights v1'}
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
        viewerUnits={null}
        viewerPct={null}
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
  // ── Header ──
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Space.sm,
    paddingBottom: Space.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerBack: {
    width: Control.hit,
    height: Control.hit,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitleWrap: {
    flex: 1,
    alignItems: 'center',
    gap: 1,
  },
  headerTitle: {
    fontSize: TypographyV2.sectionTitle.size,
    lineHeight: TypographyV2.sectionTitle.lineHeight,
    fontFamily: FontFamily.semibold,
    letterSpacing: TypographyV2.sectionTitle.letterSpacing,
  },
  headerSubtitle: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: FontFamily.regular,
    letterSpacing: TypographyV2.meta.letterSpacing,
  },
  headerSpacer: {
    width: Control.hit,
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
});
