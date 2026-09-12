/**
 * CoOwnAssetProspectus — the asset prospectus sheet content.
 *
 * Wave A (trust composition): the equity-market front-cover pattern —
 * issuer, legal vehicle, economics, fees, conflicts, key risks, and
 * offering documents in one flat disclosure surface. Masterworks and
 * Arrived treat this as the first-scroll trust anchor; ThryftVerse
 * keeps it one tap from the Overview tab via the "Ownership rights &
 * prospectus" row and the dossier sheet.
 *
 * Anti-AI: flat canvas, hairline separators, type scale only. No cards,
 * no badges-as-decoration. Every row renders only when the contract
 * supplies the field — absence is honest, never padded.
 */

import React from 'react';
import { View, Text, StyleSheet, Pressable, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme/ThemeContext';
import { Space, PressScale } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { formatCoOwnIze } from '../../utils/currency';
import type { MarketCoOwnAsset } from '../../services/marketApi';
import { CoOwnFeeSchedule, type CoOwnFeeScheduleEntry } from './CoOwnFeeSchedule';

export interface CoOwnAssetProspectusProps {
  asset: MarketCoOwnAsset;
  /** Opens the full risk disclosure sheet. */
  onOpenRiskDisclosure?: () => void;
}

const VEHICLE_TYPE_LABELS: Record<string, string> = {
  spv: 'SPV',
  llc: 'LLC',
  series_llc: 'Series LLC',
  trust: 'Trust',
};

const ISSUER_TIER_LABELS: Record<string, string> = {
  email: 'Email verified',
  id: 'ID verified',
  seller: 'Verified seller',
};

/** 'pre_market' → 'Pre-market'; 'allocated' → 'Allocated'. */
function humanizeStatus(status: string): string {
  const words = status.replace(/_/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function formatRatePct(rate: number): string {
  return `${(rate * 100).toFixed(2).replace(/\.00$/, '')}%`;
}

/** Label/value row — same grammar as the dossier info rows. */
function Row({
  label,
  value,
  colors,
}: {
  label: string;
  value: string;
  colors: ReturnType<typeof useAppTheme>['colors'];
}) {
  return (
    <View style={styles.row}>
      <Text style={[styles.rowLabel, { color: colors.textMuted }]} maxFontSizeMultiplier={1.3}>
        {label}
      </Text>
      <Text style={[styles.rowValue, { color: colors.textPrimary }]} numberOfLines={2} maxFontSizeMultiplier={1.3}>
        {value}
      </Text>
    </View>
  );
}

function SectionTitle({
  title,
  colors,
  first,
}: {
  title: string;
  colors: ReturnType<typeof useAppTheme>['colors'];
  first?: boolean;
}) {
  return (
    <Text
      style={[styles.sectionTitle, { color: colors.textPrimary, borderTopColor: colors.borderSubtle }, first && styles.sectionTitleFirst]}
      accessibilityRole="header"
      maxFontSizeMultiplier={1.3}
    >
      {title}
    </Text>
  );
}

export function CoOwnAssetProspectus({ asset, onOpenRiskDisclosure }: CoOwnAssetProspectusProps) {
  const { colors } = useAppTheme();

  // ── Issuer block ──
  const issuerName = asset.issuer
    ? asset.issuer.displayName ?? (asset.issuer.username ? `@${asset.issuer.username}` : null)
    : null;
  const issuerVerificationLabel = asset.issuerVerification
    ? asset.issuerVerification.kycVerified
      ? 'ID verified'
      : ISSUER_TIER_LABELS[asset.issuerVerification.tier] ?? null
    : null;
  const hasIssuerBlock = Boolean(
    issuerName || issuerVerificationLabel || asset.issuerJurisdiction || asset.listingTier,
  );

  // ── Vehicle block ──
  const vehicleTypeLabel = asset.legalVehicleType && asset.legalVehicleType !== 'none'
    ? VEHICLE_TYPE_LABELS[asset.legalVehicleType] ?? asset.legalVehicleType
    : null;
  const vehicleValue = asset.legalVehicleType === 'none'
    ? 'None declared'
    : [asset.legalVehicleName, vehicleTypeLabel, asset.legalVehicleJurisdiction]
        .filter(Boolean)
        .join(' · ') || null;
  const hasVehicleBlock = Boolean(vehicleValue || asset.offeringStatus || asset.marketStatus);

  // ── Economics block ──
  const hasEconomicsBlock =
    asset.totalUnits != null ||
    asset.availableUnits != null ||
    asset.unitPriceGbp != null ||
    asset.tradingFeeRate != null;

  // ── Fees — map the structured contract onto CoOwnFeeSchedule entries.
  // No sourcing/markup fee is fabricated when the contract lacks one;
  // the conflicts row below covers platform remuneration honestly. ──
  const feeEntries: CoOwnFeeScheduleEntry[] = [];
  const fs = asset.feeSchedule;
  if (fs?.managementFeePct != null) {
    feeEntries.push({ label: 'Management fee', ratePct: fs.managementFeePct * 100, isRecurring: true, description: 'Per year' });
  }
  if (fs?.performanceFeePct != null) {
    feeEntries.push({ label: 'Performance fee', ratePct: fs.performanceFeePct * 100, description: 'Charged on profit' });
  }
  if (fs?.platformFeePct != null) {
    feeEntries.push({ label: 'Platform fee', ratePct: fs.platformFeePct * 100 });
  }
  if (fs?.sourcingFeeGbp != null) {
    feeEntries.push({ label: 'Sourcing fee', fixedGbp: fs.sourcingFeeGbp });
  }

  // ── Key risks — first three non-empty structured disclosures ──
  const rd = asset.riskDisclosures;
  const keyRisks: { title: string; body: string }[] = [];
  if (rd?.marketRisk) keyRisks.push({ title: 'Market risk', body: rd.marketRisk });
  if (rd?.liquidityRisk) keyRisks.push({ title: 'Liquidity risk', body: rd.liquidityRisk });
  if (rd?.custodyRisk) keyRisks.push({ title: 'Custody risk', body: rd.custodyRisk });
  const topRisks = keyRisks.slice(0, 3);
  const hasRiskSection = topRisks.length > 0 || onOpenRiskDisclosure != null;

  // ── Documents — same chip grammar as the dossier sheet ──
  const documents: { label: string; url: string; accessibilityLabel: string }[] = [];
  if (asset.escrowTermsUrl) documents.push({ label: 'Escrow terms', url: asset.escrowTermsUrl, accessibilityLabel: 'Open escrow terms' });
  if (asset.safeguardingEvidenceUrl) documents.push({ label: 'Safeguarding evidence', url: asset.safeguardingEvidenceUrl, accessibilityLabel: 'Open safeguarding evidence' });
  if (asset.safeguardingTermsUrl) documents.push({ label: 'Safeguarding terms', url: asset.safeguardingTermsUrl, accessibilityLabel: 'Open safeguarding terms' });
  if (asset.buyerProtectionTermsUrl) documents.push({ label: 'Buyer protection', url: asset.buyerProtectionTermsUrl, accessibilityLabel: 'Open buyer protection terms' });

  return (
    <View style={styles.root}>
      {hasIssuerBlock && (
        <View style={styles.section}>
          <SectionTitle title="Issuer" colors={colors} first />
          {issuerName ? <Row label="Issuer" value={issuerName} colors={colors} /> : null}
          {issuerVerificationLabel ? (
            <Row label="Verification" value={issuerVerificationLabel} colors={colors} />
          ) : null}
          {asset.issuerJurisdiction ? (
            <Row label="Jurisdiction" value={asset.issuerJurisdiction} colors={colors} />
          ) : null}
          {asset.listingTier ? (
            <Row label="Listing tier" value={humanizeStatus(asset.listingTier)} colors={colors} />
          ) : null}
        </View>
      )}

      {hasVehicleBlock && (
        <View style={styles.section}>
          <SectionTitle title="Legal vehicle" colors={colors} first={!hasIssuerBlock} />
          {vehicleValue ? <Row label="Vehicle" value={vehicleValue} colors={colors} /> : null}
          {asset.offeringStatus ? (
            <Row label="Offering" value={humanizeStatus(asset.offeringStatus)} colors={colors} />
          ) : null}
          {asset.marketStatus ? (
            <Row label="Market" value={humanizeStatus(asset.marketStatus)} colors={colors} />
          ) : null}
        </View>
      )}

      {hasEconomicsBlock && (
        <View style={styles.section}>
          <SectionTitle title="Economics" colors={colors} first={!hasIssuerBlock && !hasVehicleBlock} />
          {asset.totalUnits != null && (
            <Row label="Total units" value={asset.totalUnits.toLocaleString('en-GB')} colors={colors} />
          )}
          {asset.availableUnits != null && (
            <Row label="Available" value={asset.availableUnits.toLocaleString('en-GB')} colors={colors} />
          )}
          {asset.unitPriceGbp != null && (
            <Row label="Unit price" value={formatCoOwnIze(asset.unitPriceGbp)} colors={colors} />
          )}
          {asset.tradingFeeRate != null && (
            <Row label="Trading fee" value={`${formatRatePct(asset.tradingFeeRate)} per execution`} colors={colors} />
          )}
        </View>
      )}

      <View style={styles.section}>
        <SectionTitle
          title="Fees"
          colors={colors}
          first={!hasIssuerBlock && !hasVehicleBlock && !hasEconomicsBlock}
        />
        <CoOwnFeeSchedule fees={feeEntries} isEmpty={feeEntries.length === 0} />
      </View>

      {/* Conflicts — static honest disclosure. No contract field
          exists for platform remuneration, so this is stated once in
          plain language rather than implied by a fabricated fee row. */}
      <View style={[styles.conflictsBlock, { borderTopColor: colors.borderSubtle }]}>
        <Text style={[styles.conflictsText, { color: colors.textMuted }]} maxFontSizeMultiplier={1.3}>
          ThryftVerse and its affiliates may receive fees from this vehicle. The issuer controls asset decisions per the rights agreement.
        </Text>
      </View>

      {hasRiskSection && (
        <View style={styles.section}>
          <SectionTitle title="Key risks" colors={colors} />
          {topRisks.map((risk) => (
            <View key={risk.title} style={styles.riskRow}>
              <Text style={[styles.riskTitle, { color: colors.textPrimary }]} maxFontSizeMultiplier={1.3}>
                {risk.title}
              </Text>
              <Text style={[styles.riskBody, { color: colors.textSecondary }]} maxFontSizeMultiplier={1.3}>
                {risk.body}
              </Text>
            </View>
          ))}
          {onOpenRiskDisclosure ? (
            <Pressable
              onPress={onOpenRiskDisclosure}
              hitSlop={8}
              style={({ pressed }) => [styles.linkRow, pressed && { opacity: 0.7, transform: [{ scale: PressScale.gentle }] }]}
              accessibilityRole="button"
              accessibilityLabel="Open full risk disclosure"
            >
              <Text style={[styles.linkText, { color: colors.brand }]} maxFontSizeMultiplier={1.3}>
                Full risk disclosure
              </Text>
              <Ionicons
                name="chevron-forward"
                size={14}
                color={colors.brand}
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
              />
            </Pressable>
          ) : null}
        </View>
      )}

      {documents.length > 0 && (
        <View style={styles.section}>
          <SectionTitle title="Documents" colors={colors} />
          <View style={styles.documentsStrip}>
            {documents.map((doc) => (
              <Pressable
                key={doc.url}
                onPress={() => void Linking.openURL(doc.url)}
                hitSlop={8}
                style={({ pressed }) => [styles.docChip, pressed && { opacity: 0.7 }]}
                accessibilityRole="link"
                accessibilityLabel={doc.accessibilityLabel}
              >
                <Ionicons
                  name="document-text-outline"
                  size={12}
                  color={colors.brand}
                  accessibilityElementsHidden
                  importantForAccessibility="no-hide-descendants"
                />
                <Text style={[styles.docChipText, { color: colors.brand }]} numberOfLines={1} maxFontSizeMultiplier={1.3}>
                  {doc.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    gap: Space.xs,
  },
  section: {
    gap: Space.sm,
  },
  sectionTitle: {
    fontSize: TypographyV2.bodyStrong.size,
    lineHeight: TypographyV2.bodyStrong.lineHeight,
    fontFamily: TypographyV2.bodyStrong.fontFamily,
    letterSpacing: TypographyV2.bodyStrong.letterSpacing,
    paddingTop: Space.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  sectionTitleFirst: {
    paddingTop: 0,
    borderTopWidth: 0,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: Space.md,
    minHeight: 20,
  },
  rowLabel: {
    fontSize: TypographyV2.body.size,
    lineHeight: TypographyV2.body.lineHeight,
    fontFamily: TypographyV2.body.fontFamily,
    letterSpacing: TypographyV2.body.letterSpacing,
    flexShrink: 0,
  },
  rowValue: {
    fontSize: TypographyV2.body.size,
    lineHeight: TypographyV2.body.lineHeight,
    fontFamily: TypographyV2.body.fontFamily,
    letterSpacing: TypographyV2.body.letterSpacing,
    textAlign: 'right',
    flex: 1,
  },
  conflictsBlock: {
    paddingTop: Space.sm,
    marginTop: Space.xs,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  conflictsText: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight + 4,
    fontFamily: TypographyV2.meta.fontFamily,
    letterSpacing: TypographyV2.meta.letterSpacing,
  },
  riskRow: {
    gap: 2,
  },
  riskTitle: {
    fontSize: TypographyV2.body.size,
    lineHeight: TypographyV2.body.lineHeight,
    fontFamily: TypographyV2.bodyStrong.fontFamily,
    letterSpacing: TypographyV2.body.letterSpacing,
  },
  riskBody: {
    fontSize: TypographyV2.body.size,
    lineHeight: TypographyV2.body.lineHeight,
    fontFamily: TypographyV2.body.fontFamily,
    letterSpacing: TypographyV2.body.letterSpacing,
  },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
    minHeight: 44,
  },
  linkText: {
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily,
  },
  documentsStrip: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Space.xs,
  },
  docChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 10,
    minHeight: 32,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'transparent',
  },
  docChipText: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    lineHeight: TypographyV2.meta.lineHeight,
  },
});

export default CoOwnAssetProspectus;
