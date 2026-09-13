import React from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../../theme/ThemeContext';
import { Space, PressScale, Control } from '../../../theme/designTokens';
import { TypographyV2 } from '../../../theme/typography.v2';
import { BottomSheet } from '../../BottomSheet';
import { FullscreenMediaViewer } from '../../product';
import { SaveToCollectionModal } from '../../closet/SaveToCollectionModal';
import { ShareSheet } from '../../ShareSheet';
import {
  CoOwnFirstTradeGuide,
  CoOwnRightsSheet,
  CoOwnRiskDisclosure,
  CoOwnSupplySheet,
  CoOwnOverflowSheet,
  CoOwnPriceAlertForm,
  CoOwnAssetDossier,
  type CoOwnRightsRow,
} from '..';
import { CoOwnAssetProspectus } from '../CoOwnAssetProspectus';
import { formatCoOwnIze } from '../../../utils/currency';
import type { MarketCoOwnAsset } from '../../../services/marketApi';

export interface AssetDetailModalsProps {
  asset: MarketCoOwnAsset;
  images: string[];
  fullscreenIndex: number;
  onActiveFullscreenIndexChange: (index: number) => void;
  fullscreenVisible: boolean;
  guideVisible: boolean;
  /** Full pending trade draft preserved through the education guide. */
  pendingTradeSide: { side: 'buy' | 'sell'; limitPrice?: number } | null;
  rightsSheetVisible: boolean;
  riskDisclosureVisible: boolean;
  supplySheetVisible: boolean;
  overflowVisible: boolean;
  dossierSheetVisible: boolean;
  /** Wave A: prospectus sheet — issuer/vehicle/economics/fees/
   *  conflicts/key risks/documents. */
  prospectusSheetVisible: boolean;
  priceAlertVisible: boolean;
  alertTargetPrice: string;
  alertCondition: 'above' | 'below';
  alertSubmitting: boolean;
  /** U52: Denomination currency code. */
  alertDenomination?: string;
  /** U52: Trigger basis for the price alert. */
  alertTriggerBasis?: 'last_trade' | 'reference';
  /** U52: Current observed price in GBP major units. */
  alertCurrentPriceGbp?: number | null;
  yourUnits: number | null;
  totalUnits: number;
  availableUnits: number;
  allocatedPct: number;
  viewerPct: number | null;
  feePct: number;
  rightsRows: CoOwnRightsRow[];
  isWatched: boolean;
  social: {
    collectionModalVisible: boolean;
    closeCollectionPicker: () => void;
    shareVisible: boolean;
    closeShare: () => void;
    isLiked: boolean;
    openShare: () => void;
  };
  onCloseSheet: (sheet: 'fullscreen' | 'guide' | 'rights' | 'riskDisclosure' | 'supply' | 'overflow' | 'dossier' | 'prospectus') => void;
  onClearPendingTradeSide: () => void;
  onGuideComplete: () => void;
  onGuideContinueToTrade: () => void;
  onToggleFav: () => void;
  onToggleWatch: (assetId: string) => void;
  onClosePriceAlert: () => void;
  onAlertTargetPriceChange: (val: string) => void;
  onAlertConditionChange: (val: 'above' | 'below') => void;
  onCreatePriceAlert: () => void;
  onNavigateOrderHistory: () => void;
  onNavigatePriceAlerts: () => void;
  onNavigateIssue: () => void;
  /** Pillar 2: Opens the full due diligence screen (separate from
   *  issue reporting). The dossier sheet's "Full due diligence" link
   *  uses this — not onNavigateIssue. */
  onOpenDiligence: () => void;
  /** Pillar 2: Opens the risk disclosure sheet from the dossier sheet. */
  onOpenRiskDisclosure: () => void;
  /** Wave A: Opens the asset prospectus sheet (from the dossier sheet
   *  and the Overview "Ownership rights & prospectus" row). */
  onOpenProspectus?: () => void;
  /** Wave A: Whether the viewer has acknowledged the risk disclosure.
   *  Forwarded to CoOwnRiskDisclosure when onAcknowledgeRisk is set. */
  riskAcknowledged?: boolean;
  /** Wave A: Marks the risk disclosure as acknowledged. */
  onAcknowledgeRisk?: () => void;
}

export const AssetDetailModals = React.memo(function AssetDetailModals({
  asset,
  images,
  fullscreenIndex,
  onActiveFullscreenIndexChange,
  fullscreenVisible,
  guideVisible,
  pendingTradeSide,
  rightsSheetVisible,
  riskDisclosureVisible,
  supplySheetVisible,
  overflowVisible,
  dossierSheetVisible,
  prospectusSheetVisible,
  priceAlertVisible,
  alertTargetPrice,
  alertCondition,
  alertSubmitting,
  alertDenomination = 'GBP',
  alertTriggerBasis = 'last_trade',
  alertCurrentPriceGbp = null,
  yourUnits,
  totalUnits,
  availableUnits,
  allocatedPct,
  viewerPct,
  feePct,
  rightsRows,
  isWatched,
  social,
  onCloseSheet,
  onClearPendingTradeSide,
  onGuideComplete,
  onGuideContinueToTrade,
  onToggleFav,
  onToggleWatch,
  onClosePriceAlert,
  onAlertTargetPriceChange,
  onAlertConditionChange,
  onCreatePriceAlert,
  onNavigateOrderHistory,
  onNavigatePriceAlerts,
  onNavigateIssue,
  onOpenDiligence,
  onOpenRiskDisclosure,
  onOpenProspectus,
  riskAcknowledged,
  onAcknowledgeRisk,
}: AssetDetailModalsProps) {
  const { colors } = useAppTheme();

  return (
    <>
      {/* Save to collection + share */}
      <SaveToCollectionModal
        visible={social.collectionModalVisible}
        itemId={asset.id}
        onClose={social.closeCollectionPicker}
      />
      <ShareSheet
        visible={social.shareVisible}
        onDismiss={social.closeShare}
        url={`https://thryftverse.com/asset/${asset.id}`}
        title={asset.title}
      />

      {/* Fullscreen media viewer */}
      <FullscreenMediaViewer
        images={images}
        initialIndex={fullscreenIndex}
        visible={fullscreenVisible}
        onActiveIndexChange={onActiveFullscreenIndexChange}
        onClose={() => onCloseSheet('fullscreen')}
      />

      {/* First-trade guided education */}
      <CoOwnFirstTradeGuide
        visible={guideVisible}
        onClose={() => {
          onCloseSheet('guide');
          onClearPendingTradeSide();
        }}
        onComplete={onGuideComplete}
        onContinueToTrade={pendingTradeSide ? onGuideContinueToTrade : undefined}
      />

      {/* Rights & risks sheet — 13-row modal */}
      <CoOwnRightsSheet
        visible={rightsSheetVisible}
        onClose={() => onCloseSheet('rights')}
        disclosureVersion={
          asset.rights
            ? asset.rights.version
              ? `Rights v${asset.rights.version}`
              : 'Version not available'
            : 'Unpublished'
        }
        rights={rightsRows}
      />

      {/* Risk disclosure bottom sheet */}
      <BottomSheet
        visible={riskDisclosureVisible}
        onDismiss={() => onCloseSheet('riskDisclosure')}
        snapPoint={0.7}
      >
        <View style={[styles.riskDisclosureSheetHeader, { borderBottomColor: colors.borderSubtle }]}>
          <Text style={[styles.riskDisclosureSheetTitle, { color: colors.textPrimary }]} maxFontSizeMultiplier={1.3}>
            Risk disclosure
          </Text>
          <Pressable
            onPress={() => onCloseSheet('riskDisclosure')}
            hitSlop={12}
            style={({ pressed }) => [styles.sheetCloseTarget, pressed && { opacity: 0.85, transform: [{ scale: PressScale.gentle }] }]}
            accessibilityLabel="Close risk disclosure"
            accessibilityRole="button"
          >
            <Ionicons name="close" size={22} color={colors.textSecondary} />
          </Pressable>
        </View>
        <ScrollView style={styles.riskDisclosureSheetScroll} contentContainerStyle={styles.riskDisclosureSheetContent}>
          <CoOwnRiskDisclosure
            disclosures={asset.riskDisclosures ?? null}
            acknowledged={riskAcknowledged}
            onAcknowledge={onAcknowledgeRisk}
            onReportIssue={() => {
              onCloseSheet('riskDisclosure');
              onNavigateIssue();
            }}
          />
        </ScrollView>
      </BottomSheet>

      {/* Asset dossier sheet — provenance, custody, valuation, fees.
          Pillar 2: consolidates the former inline provenance grid,
          condition/custody rows, and fee section into one tappable
          sheet. Reuses CoOwnAssetDossier for the structured rows. */}
      <BottomSheet
        visible={dossierSheetVisible}
        onDismiss={() => onCloseSheet('dossier')}
        snapPoint={0.82}
      >
        <View style={[styles.riskDisclosureSheetHeader, { borderBottomColor: colors.borderSubtle }]}>
          <Text style={[styles.riskDisclosureSheetTitle, { color: colors.textPrimary }]} maxFontSizeMultiplier={1.3}>
            Asset dossier
          </Text>
          <Pressable
            onPress={() => onCloseSheet('dossier')}
            hitSlop={12}
            style={({ pressed }) => [styles.sheetCloseTarget, pressed && { opacity: 0.85, transform: [{ scale: PressScale.gentle }] }]}
            accessibilityLabel="Close asset dossier"
            accessibilityRole="button"
          >
            <Ionicons name="close" size={22} color={colors.textSecondary} />
          </Pressable>
        </View>
        <ScrollView style={styles.riskDisclosureSheetScroll} contentContainerStyle={styles.riskDisclosureSheetContent}>
          <CoOwnAssetDossierSheetContent
            asset={asset}
            onOpenDiligence={onOpenDiligence}
            onOpenRiskDisclosure={onOpenRiskDisclosure}
            onOpenProspectus={onOpenProspectus}
          />
        </ScrollView>
      </BottomSheet>

      {/* Asset prospectus sheet — Wave A trust composition. The legal
          wrapper (issuer, vehicle, economics, fees, conflicts, key
          risks, documents) stated plainly in one flat sheet. */}
      <BottomSheet
        visible={prospectusSheetVisible}
        onDismiss={() => onCloseSheet('prospectus')}
        snapPoint={0.85}
      >
        <View style={[styles.riskDisclosureSheetHeader, { borderBottomColor: colors.borderSubtle }]}>
          <Text style={[styles.riskDisclosureSheetTitle, { color: colors.textPrimary }]} maxFontSizeMultiplier={1.3} accessibilityRole="header">
            Asset prospectus
          </Text>
          <Pressable
            onPress={() => onCloseSheet('prospectus')}
            hitSlop={12}
            style={({ pressed }) => [styles.sheetCloseTarget, pressed && { opacity: 0.85, transform: [{ scale: PressScale.gentle }] }]}
            accessibilityLabel="Close asset prospectus"
            accessibilityRole="button"
          >
            <Ionicons name="close" size={22} color={colors.textSecondary} />
          </Pressable>
        </View>
        <ScrollView style={styles.riskDisclosureSheetScroll} contentContainerStyle={styles.riskDisclosureSheetContent}>
          <CoOwnAssetProspectus
            asset={asset}
            onOpenRiskDisclosure={onOpenRiskDisclosure}
          />
        </ScrollView>
      </BottomSheet>

      {/* Supply and cap table sheet */}
      <CoOwnSupplySheet
        visible={supplySheetVisible}
        onClose={() => onCloseSheet('supply')}
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
        supply={{
          authorised: null,
          issued: null,
          publicFloat: null,
          treasury: null,
        }}
        rightsVersion={asset.rights?.version ? `v${asset.rights.version}` : undefined}
      />

      {/* Overflow sheet — lower-frequency actions */}
      <CoOwnOverflowSheet
        visible={overflowVisible}
        onClose={() => onCloseSheet('overflow')}
        onShare={social.openShare}
        onOrderHistory={onNavigateOrderHistory}
        onToggleFav={onToggleFav}
        isFav={social.isLiked}
        onWatch={() => {
          onToggleWatch(asset.id);
          onCloseSheet('overflow');
        }}
        isWatched={isWatched}
        onPriceAlert={() => {
          onCloseSheet('overflow');
          onNavigatePriceAlerts();
        }}
        onReport={() => {
          onCloseSheet('overflow');
          onNavigateIssue();
        }}
      />

      {/* Price alert creation modal */}
      <CoOwnPriceAlertForm
        visible={priceAlertVisible}
        onClose={onClosePriceAlert}
        alertTargetPrice={alertTargetPrice}
        onAlertTargetPriceChange={onAlertTargetPriceChange}
        alertCondition={alertCondition}
        onAlertConditionChange={onAlertConditionChange}
        alertSubmitting={alertSubmitting}
        onSubmit={onCreatePriceAlert}
        denomination={alertDenomination}
        triggerBasis={alertTriggerBasis}
        currentPriceGbp={alertCurrentPriceGbp}
      />
    </>
  );
});

/** Maps the asset contract to CoOwnAssetDossier props and renders the
 *  dossier content inside the sheet. Also renders the provenance text,
 *  document chips, fee schedule, risk disclosure, and due diligence
 *  link that were formerly inline on the Overview tab. */
function CoOwnAssetDossierSheetContent({
  asset,
  onOpenDiligence,
  onOpenRiskDisclosure,
  onOpenProspectus,
}: {
  asset: MarketCoOwnAsset;
  onOpenDiligence: () => void;
  onOpenRiskDisclosure: () => void;
  onOpenProspectus?: () => void;
}) {
  const { colors } = useAppTheme();

  // Map asset contract → CoOwnAssetDossier structured props.
  // NOTE: the asset contract only exposes a freeform `provenance` string,
  // not a structured timeline of dated events. Forcing it into the
  // CoOwnAssetDossier timeline (which expects {event, date, note})
  // would invent acquisition events/dates the issuer never supplied.
  // Instead we render provenance as an honest freeform text block
  // below the structured dossier, and only pass condition/protection/
  // appraisal (which ARE structured on the contract) into the dossier.
  const condition = asset.conditionGrade
    ? { grade: asset.conditionGrade }
    : undefined;
  // Wave A: custody is split into two honest groups — "Asset
  // protection" (who holds/insures the physical asset) and "Money
  // protection" (how buyer funds are safeguarded). The former `storage`
  // prop is retained on CoOwnAssetDossier for the due-diligence screen;
  // the dossier sheet uses the split props. Fields the issuer did not
  // publish keep the existing "not published" fallback labels.
  const hasAssetProtectionData =
    Boolean(asset.custodianName || asset.custodianLocation) ||
    asset.custodyInsured != null ||
    Boolean(asset.custodyInsurer) ||
    Boolean(asset.custodyPolicyRef) ||
    asset.custodyCoverageGbp != null;
  const assetProtection = hasAssetProtectionData
    ? {
        custodian: asset.custodianName ?? 'Custodian not published',
        location: asset.custodianLocation ?? 'Location not published',
        insured: asset.custodyInsured,
        insurer: asset.custodyInsurer ?? undefined,
        policyRef: asset.custodyPolicyRef ?? undefined,
        coverageGbp: asset.custodyCoverageGbp ?? undefined,
      }
    : undefined;
  const moneyProtection =
    asset.safeguarded != null ||
    Boolean(asset.safeguardingPartner) ||
    Boolean(asset.escrowPartner) ||
    asset.buyerProtection != null
      ? {
          safeguarded: asset.safeguarded,
          safeguardingPartner: asset.safeguardingPartner ?? undefined,
          escrowPartner: asset.escrowPartner ?? undefined,
          buyerProtection: asset.buyerProtection,
        }
      : undefined;
  const appraisal = asset.appraisalValueGbp != null
    ? {
        value: asset.appraisalValueGbp,
        currency: '1ZE' as const,
        valuedAt: asset.appraisalValuedAt ?? 'Date not published',
        valuer: asset.appraisalValuer ?? undefined,
      }
    : undefined;

  // Document references — surfaced as tappable chips inside the sheet
  const dossierDocuments: { label: string; url: string; accessibilityLabel: string }[] = [];
  if (asset.escrowTermsUrl) dossierDocuments.push({ label: 'Escrow terms', url: asset.escrowTermsUrl, accessibilityLabel: 'Open escrow terms' });
  if (asset.safeguardingEvidenceUrl) dossierDocuments.push({ label: 'Safeguarding evidence', url: asset.safeguardingEvidenceUrl, accessibilityLabel: 'Open safeguarding evidence' });
  if (asset.safeguardingTermsUrl) dossierDocuments.push({ label: 'Safeguarding terms', url: asset.safeguardingTermsUrl, accessibilityLabel: 'Open safeguarding terms' });
  if (asset.buyerProtectionTermsUrl) dossierDocuments.push({ label: 'Buyer protection', url: asset.buyerProtectionTermsUrl, accessibilityLabel: 'Open buyer protection terms' });
  const hasDocuments = dossierDocuments.length > 0;

  return (
    <View>
      {/* Provenance — freeform text from the asset contract, rendered
       *  honestly as a text block rather than forced into a structured
       *  timeline with invented event/date fields. */}
      {asset.provenance ? (
        <View style={dossierStyles.provenanceBlock}>
          <Text style={[dossierStyles.provenanceHeader, { color: colors.textPrimary }]}>
            Provenance
          </Text>
          <Text style={[dossierStyles.provenanceText, { color: colors.textSecondary }]}>
            {asset.provenance}
          </Text>
        </View>
      ) : null}

      <CoOwnAssetDossier
        condition={condition}
        appraisal={appraisal}
        assetProtection={assetProtection}
        moneyProtection={moneyProtection}
      />

      {/* Document chips — only when documents exist. Rendered directly
       *  after the dossier, whose last section is "Money protection",
       *  so the chips group under that heading. */}
      {hasDocuments && (
        <View style={dossierStyles.documentsStrip}>
          {dossierDocuments.map((doc, idx) => (
            <Pressable
              key={idx}
              onPress={() => void Linking.openURL(doc.url)}
              hitSlop={8}
              style={({ pressed }) => [dossierStyles.docChip, pressed && { opacity: 0.7 }]}
              accessibilityRole="link"
              accessibilityLabel={doc.accessibilityLabel}
            >
              <Ionicons name="document-text-outline" size={12} color={colors.brand} />
              <Text style={[dossierStyles.docChipText, { color: colors.brand }]} numberOfLines={1}>
                {doc.label}
              </Text>
            </Pressable>
          ))}
        </View>
      )}

      {/* Fee schedule — flat rows, no separate card. Renders the
       *  structured feeSchedule (Wave 10/11) when present, plus the
       *  trading fee rate and rights/operating cost text. Missing
       *  structured fields are explicitly labelled "Not published"
       *  rather than silently omitted, so buyers can see what the
       *  issuer has and has not committed to. */}
      {(() => {
        const fs = asset.feeSchedule;
        const hasStructuredFees = fs != null && (
          fs.managementFeePct != null ||
          fs.performanceFeePct != null ||
          fs.platformFeePct != null ||
          fs.sourcingFeeGbp != null
        );
        const hasAnyFee =
          asset.tradingFeeRate != null ||
          Boolean(asset.rights?.feeRights) ||
          hasStructuredFees;
        if (!hasAnyFee) return null;
        const fmtPct = (v: number | null | undefined) =>
          v == null ? 'Not published' :
          `${(v * 100).toFixed(2).replace(/\.00$/, '')}%`;
        const fmtGbp = (v: number | null | undefined) =>
          v == null ? 'Not published' : formatCoOwnIze(v);
        return (
          <View style={dossierStyles.feeBlock}>
            <Text style={[dossierStyles.feeHeader, { color: colors.textPrimary }]}>
              Fees
            </Text>
            {asset.tradingFeeRate != null && (
              <View style={dossierStyles.feeRow}>
                <Text style={[dossierStyles.feeLabel, { color: colors.textMuted }]}>
                  Platform trading fee
                </Text>
                <Text style={[dossierStyles.feeValue, { color: colors.textPrimary }]}>
                  {(asset.tradingFeeRate * 100).toFixed(2).replace(/\.00$/, '')}% per execution
                </Text>
              </View>
            )}
            {fs?.managementFeePct != null && (
              <View style={dossierStyles.feeRow}>
                <Text style={[dossierStyles.feeLabel, { color: colors.textMuted }]}>
                  Management fee
                </Text>
                <Text style={[dossierStyles.feeValue, { color: colors.textPrimary }]}>
                  {fmtPct(fs.managementFeePct)} per year
                </Text>
              </View>
            )}
            {fs?.performanceFeePct != null && (
              <View style={dossierStyles.feeRow}>
                <Text style={[dossierStyles.feeLabel, { color: colors.textMuted }]}>
                  Performance fee
                </Text>
                <Text style={[dossierStyles.feeValue, { color: colors.textPrimary }]}>
                  {fmtPct(fs.performanceFeePct)} of profit
                </Text>
              </View>
            )}
            {fs?.platformFeePct != null && (
              <View style={dossierStyles.feeRow}>
                <Text style={[dossierStyles.feeLabel, { color: colors.textMuted }]}>
                  Platform fee
                </Text>
                <Text style={[dossierStyles.feeValue, { color: colors.textPrimary }]}>
                  {fmtPct(fs.platformFeePct)}
                </Text>
              </View>
            )}
            {fs?.sourcingFeeGbp != null && (
              <View style={dossierStyles.feeRow}>
                <Text style={[dossierStyles.feeLabel, { color: colors.textMuted }]}>
                  Sourcing fee
                </Text>
                <Text style={[dossierStyles.feeValue, { color: colors.textPrimary }]}>
                  {fmtGbp(fs.sourcingFeeGbp)}
                </Text>
              </View>
            )}
            {asset.rights?.feeRights && (
              <View style={dossierStyles.feeRow}>
                <Text style={[dossierStyles.feeLabel, { color: colors.textMuted }]}>
                  Rights / operating costs
                </Text>
                <Text style={[dossierStyles.feeValue, { color: colors.textPrimary }]}>
                  {asset.rights.feeRights}
                </Text>
              </View>
            )}
          </View>
        );
      })()}

      {/* Asset prospectus link — Wave A: the legal wrapper,
          economics, fees, conflicts and key risks in one sheet. */}
      {onOpenProspectus ? (
        <Pressable
          onPress={onOpenProspectus}
          hitSlop={8}
          style={({ pressed }) => [dossierStyles.diligenceLink, pressed && { opacity: 0.7 }]}
          accessibilityRole="button"
          accessibilityLabel="View asset prospectus"
        >
          <Text style={[dossierStyles.diligenceLinkText, { color: colors.brand }]}>
            View asset prospectus
          </Text>
          <Ionicons name="chevron-forward" size={14} color={colors.brand} />
        </Pressable>
      ) : null}

      {/* Risk disclosure row — opens the risk disclosure sheet */}
      <Pressable
        onPress={onOpenRiskDisclosure}
        hitSlop={8}
        style={({ pressed }) => [dossierStyles.diligenceLink, pressed && { opacity: 0.7 }]}
        accessibilityRole="button"
        accessibilityLabel="Open risk disclosure"
      >
        <Text style={[dossierStyles.diligenceLinkText, { color: colors.brand }]}>
          Risk disclosure
        </Text>
        <Ionicons name="chevron-forward" size={14} color={colors.brand} />
      </Pressable>

      {/* Full due diligence link — navigates to the due diligence screen */}
      <Pressable
        onPress={onOpenDiligence}
        hitSlop={8}
        style={({ pressed }) => [dossierStyles.diligenceLink, pressed && { opacity: 0.7 }]}
        accessibilityRole="button"
        accessibilityLabel="Open full due diligence"
      >
        <Text style={[dossierStyles.diligenceLinkText, { color: colors.brand }]}>
          Full due diligence
        </Text>
        <Ionicons name="chevron-forward" size={14} color={colors.brand} />
      </Pressable>
    </View>
  );
}

const dossierStyles = StyleSheet.create({
  provenanceBlock: {
    gap: Space.xs,
    paddingVertical: Space.sm,
  },
  provenanceHeader: {
    fontSize: TypographyV2.bodyStrong.size,
    lineHeight: TypographyV2.bodyStrong.lineHeight,
    fontFamily: TypographyV2.bodyStrong.fontFamily,
    letterSpacing: TypographyV2.bodyStrong.letterSpacing,
  },
  provenanceText: {
    fontSize: TypographyV2.body.size,
    lineHeight: TypographyV2.body.lineHeight * 1.15,
    fontFamily: TypographyV2.body.fontFamily,
  },
  documentsStrip: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Space.xs,
    paddingVertical: Space.sm,
  },
  docChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  docChipText: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    lineHeight: TypographyV2.meta.lineHeight,
  },
  feeBlock: {
    gap: Space.sm,
    paddingVertical: Space.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'transparent',
  },
  feeHeader: {
    fontSize: TypographyV2.bodyStrong.size,
    lineHeight: TypographyV2.bodyStrong.lineHeight,
    fontFamily: TypographyV2.bodyStrong.fontFamily,
    letterSpacing: TypographyV2.bodyStrong.letterSpacing,
  },
  feeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: Space.md,
  },
  feeLabel: {
    fontSize: TypographyV2.body.size,
    lineHeight: TypographyV2.body.lineHeight,
    fontFamily: TypographyV2.body.fontFamily,
    flexShrink: 0,
  },
  feeValue: {
    fontSize: TypographyV2.body.size,
    lineHeight: TypographyV2.body.lineHeight,
    fontFamily: TypographyV2.body.fontFamily,
    textAlign: 'right',
    flex: 1,
  },
  diligenceLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
    paddingVertical: Space.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'transparent',
  },
  diligenceLinkText: {
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily,
  },
});

const styles = StyleSheet.create({
  riskDisclosureSheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Space.md,
    paddingVertical: Space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  sheetCloseTarget: {
    width: Control.hit,
    height: Control.hit,
    alignItems: 'center',
    justifyContent: 'center',
  },
  riskDisclosureSheetTitle: {
    fontSize: TypographyV2.sectionTitle.size,
    fontFamily: TypographyV2.sectionTitle.fontFamily,
    lineHeight: TypographyV2.sectionTitle.lineHeight,
  },
  riskDisclosureSheetScroll: {
    flex: 1,
  },
  riskDisclosureSheetContent: {
    padding: Space.md,
  },
});
