/**
 * CoOwnAssetDossier — the Galleria-quality provenance/condition/storage/
 * insurance/appraisal panel.
 *
 * Four sections, each with a header and rows. Appraisal shows value + date
 * + method + valuer + range + next update. A stale appraisal (>180d) gets
 * a "Stale appraisal" badge — more trustworthy than silently rolling forward.
 *
 * See docs/coown/flagship-exchange-upgrade/04 §A7 + 03 §2.10.
 */

import React from 'react';
import { View, Text, StyleSheet, Pressable, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme/ThemeContext';
import { Space, Radius } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { formatCoOwnIze } from '../../utils/currency';
import { CoOwnNumericText } from '../ui/CoOwnNumericText';

export interface CoOwnDossierProvenanceEvent {
  event: string;
  date: string;
  note?: string;
}

export interface CoOwnDossierCondition {
  grade: string;
  reportUri?: string;
  inspectedAt?: string;
}

export interface CoOwnDossierStorage {
  location: string;
  custodian: string;
  insured: boolean;
  policyRef?: string;
}

export interface CoOwnDossierAppraisal {
  value: number;
  currency: '1ZE' | 'GBP';
  valuedAt: string;
  method?: string;
  valuer?: string;
  rangeLow?: number;
  rangeHigh?: number;
  nextScheduled?: string;
}

/** Wave A trust split — who holds and insures the physical asset.
 *  Distinct from money protection: custody of the asset, not of funds. */
export interface CoOwnDossierAssetProtection {
  custodian?: string | null;
  location?: string | null;
  insured?: boolean;
  insurer?: string | null;
  policyRef?: string | null;
  coverageGbp?: number | null;
}

/** Wave A trust split — how buyer funds are held and protected.
 *  Distinct from asset protection: escrow/safeguarding of money, not
 *  custody of the physical asset. */
export interface CoOwnDossierMoneyProtection {
  safeguarded?: boolean;
  safeguardingPartner?: string | null;
  escrowPartner?: string | null;
  buyerProtection?: boolean;
}

export interface CoOwnAssetDossierProps {
  provenance?: CoOwnDossierProvenanceEvent[];
  condition?: CoOwnDossierCondition;
  storage?: CoOwnDossierStorage;
  appraisal?: CoOwnDossierAppraisal;
  /** Wave A: asset-side protection (custodian, insurance, coverage). */
  assetProtection?: CoOwnDossierAssetProtection;
  /** Wave A: money-side protection (safeguarding, escrow, buyer
   *  protection). Kept visually separate from asset protection so the
   *  buyer can tell "who holds the asset" from "who holds the money". */
  moneyProtection?: CoOwnDossierMoneyProtection;
}

/** Check if an appraisal date is stale (>180 days). */
function isStaleAppraisal(valuedAt: string): boolean {
  const date = new Date(valuedAt);
  const now = new Date();
  const diffDays = (now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24);
  return diffDays > 180;
}

/** A section header with icon. */
function SectionHeader({
  icon,
  title,
  colors,
  badge,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  title: string;
  colors: ReturnType<typeof useAppTheme>['colors'];
  badge?: string;
}) {
  return (
    <View style={styles.sectionHeader}>
      <Ionicons name={icon} size={15} color={colors.textMuted} />
      <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>{title}</Text>
      {badge && (
        <View style={[styles.badge, { backgroundColor: colors.warningSubtle }]}>
          <Text style={[styles.badgeText, { color: colors.warning }]} numberOfLines={1}>
            {badge}
          </Text>
        </View>
      )}
    </View>
  );
}

/** A label-value row. */
function InfoRow({
  label,
  value,
  colors,
  onPress,
  valueColor,
}: {
  label: string;
  value: string;
  colors: ReturnType<typeof useAppTheme>['colors'];
  onPress?: () => void;
  valueColor?: string;
}) {
  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        style={styles.infoRow}
        accessibilityRole="link"
        accessibilityLabel={`${label}: ${value}`}
      >
        <Text style={[styles.infoLabel, { color: colors.textMuted }]}>{label}</Text>
        <View style={styles.infoValueRow}>
          <Text style={[styles.infoValue, { color: valueColor ?? colors.textPrimary }]} numberOfLines={1}>
            {value}
          </Text>
          <Ionicons name="open-outline" size={11} color={colors.textMuted} />
        </View>
      </Pressable>
    );
  }

  return (
    <View style={styles.infoRow}>
      <Text style={[styles.infoLabel, { color: colors.textMuted }]}>{label}</Text>
      <Text style={[styles.infoValue, { color: valueColor ?? colors.textPrimary }]} numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
}

export function CoOwnAssetDossier({
  provenance,
  condition,
  storage,
  appraisal,
  assetProtection,
  moneyProtection,
}: CoOwnAssetDossierProps) {
  const { colors } = useAppTheme();
  const hasAssetProtection = Boolean(
    assetProtection && (
      assetProtection.custodian ||
      assetProtection.location ||
      assetProtection.insured != null ||
      assetProtection.insurer ||
      assetProtection.policyRef ||
      assetProtection.coverageGbp != null
    ),
  );
  const hasMoneyProtection = Boolean(
    moneyProtection && (
      moneyProtection.safeguarded != null ||
      moneyProtection.safeguardingPartner ||
      moneyProtection.escrowPartner ||
      moneyProtection.buyerProtection != null
    ),
  );
  const hasAny = provenance?.length || condition || storage || appraisal
    || hasAssetProtection || hasMoneyProtection;
  if (!hasAny) return null;

  // Flat composition — no rounded card. The parent CommerceDetailSection
  // provides the section context; this renders as quiet sub-sections with
  // hairline dividers. Spec 02: "no card-on-card composition."
  return (
    <View style={styles.root}>
      {/* ── Provenance ── */}
      {provenance && provenance.length > 0 && (
        <View style={styles.section}>
          <SectionHeader icon="time-outline" title="Provenance" colors={colors} />
          <View style={styles.provenanceTimeline}>
            {provenance.map((event, i) => (
              <View key={i} style={styles.provenanceItem}>
                <View style={[styles.provenanceDot, { backgroundColor: colors.borderSubtle }]} />
                <View style={styles.provenanceContent}>
                  <Text style={[styles.provenanceEvent, { color: colors.textPrimary }]}>
                    {event.event}
                  </Text>
                  <Text style={[styles.provenanceDate, { color: colors.textMuted }]}>
                    {event.date}
                  </Text>
                  {event.note && (
                    <Text style={[styles.provenanceNote, { color: colors.textSecondary }]} numberOfLines={2}>
                      {event.note}
                    </Text>
                  )}
                </View>
              </View>
            ))}
          </View>
        </View>
      )}

      {/* ── Condition ── */}
      {condition && (
        <View style={styles.section}>
          <SectionHeader icon="checkmark-circle-outline" title="Condition" colors={colors} />
          <InfoRow
            label="Grade"
            value={condition.grade}
            colors={colors}
            onPress={condition.reportUri ? () => Linking.openURL(condition.reportUri!) : undefined}
          />
          {condition.inspectedAt && (
            <InfoRow label="Inspected" value={condition.inspectedAt} colors={colors} />
          )}
        </View>
      )}

      {/* ── Storage ── */}
      {storage && (
        <View style={styles.section}>
          <SectionHeader icon="lock-closed-outline" title="Storage" colors={colors} />
          <InfoRow label="Location" value={storage.location} colors={colors} />
          <InfoRow label="Custodian" value={storage.custodian} colors={colors} />
          <InfoRow
            label="Insured"
            value={storage.insured ? 'Yes' : 'Not insured'}
            colors={colors}
            valueColor={storage.insured ? colors.success : colors.danger}
          />
          {storage.policyRef && (
            <InfoRow label="Policy ref" value={storage.policyRef} colors={colors} />
          )}
        </View>
      )}

      {/* ── Appraisal ── */}
      {appraisal && (
        <View style={styles.section}>
          <SectionHeader
            icon="analytics-outline"
            title="Appraisal"
            colors={colors}
            badge={isStaleAppraisal(appraisal.valuedAt) ? 'Stale appraisal' : undefined}
          />
          <View style={styles.appraisalValueRow}>
            <CoOwnNumericText
              value={appraisal.value}
              unit={appraisal.currency}
              size="priceList"
              align="left"
            />
            <Text style={[styles.appraisalDate, { color: colors.textMuted }]}>
              {appraisal.valuedAt}
            </Text>
          </View>
          {appraisal.method ? <InfoRow label="Method" value={appraisal.method} colors={colors} /> : null}
          {appraisal.valuer && (
            <InfoRow label="Valuer" value={appraisal.valuer} colors={colors} />
          )}
          {(appraisal.rangeLow != null && appraisal.rangeHigh != null) && (
            <View style={styles.infoRow}>
              <Text style={[styles.infoLabel, { color: colors.textMuted }]}>Range</Text>
              <Text style={[styles.infoValue, { color: colors.textSecondary, fontVariant: ['tabular-nums'] as ['tabular-nums'] }]}>
                {appraisal.rangeLow.toLocaleString('en-GB')} – {appraisal.rangeHigh.toLocaleString('en-GB')} {appraisal.currency}
              </Text>
            </View>
          )}
          {appraisal.nextScheduled && (
            <InfoRow label="Next appraisal" value={appraisal.nextScheduled} colors={colors} />
          )}
        </View>
      )}

      {/* ── Asset protection — who holds/insures the physical asset ──
          Wave A: split from money protection so the buyer can tell
          "who holds the asset" from "who holds the money". Rows render
          only when the contract supplies data. */}
      {hasAssetProtection && assetProtection && (
        <View style={styles.section}>
          <SectionHeader icon="lock-closed-outline" title="Asset protection" colors={colors} />
          {assetProtection.custodian ? (
            <InfoRow label="Custodian" value={assetProtection.custodian} colors={colors} />
          ) : null}
          {assetProtection.location ? (
            <InfoRow label="Location" value={assetProtection.location} colors={colors} />
          ) : null}
          {assetProtection.insured != null && (
            <InfoRow
              label="Insured"
              value={assetProtection.insured ? 'Insured' : 'Not insured'}
              colors={colors}
              valueColor={assetProtection.insured ? colors.success : colors.danger}
            />
          )}
          {assetProtection.insurer ? (
            <InfoRow label="Insurer" value={assetProtection.insurer} colors={colors} />
          ) : null}
          {assetProtection.policyRef ? (
            <InfoRow label="Policy ref" value={assetProtection.policyRef} colors={colors} />
          ) : null}
          {assetProtection.coverageGbp != null && (
            <InfoRow label="Coverage" value={formatCoOwnIze(assetProtection.coverageGbp)} colors={colors} />
          )}
        </View>
      )}

      {/* ── Money protection — how buyer funds are safeguarded ──
          Rendered last: the dossier sheet appends the escrow/
          safeguarding/buyer-protection document chips directly after
          this component so they group under this heading. */}
      {hasMoneyProtection && moneyProtection && (
        <View style={styles.section}>
          <SectionHeader icon="wallet-outline" title="Money protection" colors={colors} />
          {moneyProtection.safeguarded != null && (
            <InfoRow
              label="Safeguarded"
              value={moneyProtection.safeguarded ? 'Safeguarded' : 'Not safeguarded'}
              colors={colors}
              valueColor={moneyProtection.safeguarded ? colors.success : colors.danger}
            />
          )}
          {moneyProtection.safeguardingPartner ? (
            <InfoRow label="Safeguarding partner" value={moneyProtection.safeguardingPartner} colors={colors} />
          ) : null}
          {moneyProtection.escrowPartner ? (
            <InfoRow label="Escrow partner" value={moneyProtection.escrowPartner} colors={colors} />
          ) : null}
          {moneyProtection.buyerProtection != null && (
            <InfoRow
              label="Buyer protection"
              value={moneyProtection.buyerProtection ? 'Included' : 'Not included'}
              colors={colors}
            />
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    gap: Space.md,
  },
  section: {
    gap: Space.sm,
    paddingVertical: Space.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'transparent',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
  },
  sectionTitle: {
    fontSize: TypographyV2.bodyStrong.size,
    lineHeight: TypographyV2.bodyStrong.lineHeight,
    fontFamily: TypographyV2.bodyStrong.fontFamily,
    letterSpacing: TypographyV2.bodyStrong.letterSpacing,
    flex: 1,
  },
  badge: {
    paddingHorizontal: Space.sm,
    paddingVertical: 2,
    borderRadius: Radius.full,
  },
  badgeText: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: TypographyV2.meta.fontFamily,
    letterSpacing: TypographyV2.meta.letterSpacing,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: Space.md,
    minHeight: 20,
  },
  infoLabel: {
    fontSize: TypographyV2.body.size,
    lineHeight: TypographyV2.body.lineHeight,
    fontFamily: TypographyV2.body.fontFamily,
    letterSpacing: TypographyV2.body.letterSpacing,
    flexShrink: 0,
  },
  infoValue: {
    fontSize: TypographyV2.body.size,
    lineHeight: TypographyV2.body.lineHeight,
    fontFamily: TypographyV2.body.fontFamily,
    letterSpacing: TypographyV2.body.letterSpacing,
    textAlign: 'right',
    flex: 1,
  },
  infoValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
    flex: 1,
    justifyContent: 'flex-end',
  },
  // Provenance timeline
  provenanceTimeline: {
    gap: Space.sm,
  },
  provenanceItem: {
    flexDirection: 'row',
    gap: Space.sm,
  },
  provenanceDot: {
    width: 6,
    height: 6,
    borderRadius: Radius.sm,
    marginTop: 6,
  },
  provenanceContent: {
    flex: 1,
    gap: 1,
  },
  provenanceEvent: {
    fontSize: TypographyV2.body.size,
    lineHeight: TypographyV2.body.lineHeight,
    fontFamily: TypographyV2.body.fontFamily,
    letterSpacing: TypographyV2.body.letterSpacing,
  },
  provenanceDate: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: TypographyV2.meta.fontFamily,
    letterSpacing: TypographyV2.meta.letterSpacing,
    fontVariant: ['tabular-nums'] as ['tabular-nums'],
  },
  provenanceNote: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: TypographyV2.meta.fontFamily,
    letterSpacing: TypographyV2.meta.letterSpacing,
    marginTop: 2,
  },
  // Appraisal
  appraisalValueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: Space.sm,
  },
  appraisalDate: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: TypographyV2.meta.fontFamily,
    letterSpacing: TypographyV2.meta.letterSpacing,
    fontVariant: ['tabular-nums'] as ['tabular-nums'],
  },
});

export default CoOwnAssetDossier;
