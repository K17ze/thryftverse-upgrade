/**
 * CoOwnAssetDossier — the Galleria-quality provenance/condition/custody/
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
import { Space, Radius, Type, Typography } from '../../theme/designTokens';
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

export interface CoOwnDossierCustody {
  location: string;
  custodian: string;
  insured: boolean;
  policyRef?: string;
}

export interface CoOwnDossierAppraisal {
  value: number;
  currency: '1ZE' | 'GBP';
  valuedAt: string;
  method: string;
  valuer?: string;
  rangeLow?: number;
  rangeHigh?: number;
  nextScheduled?: string;
}

export interface CoOwnAssetDossierProps {
  provenance?: CoOwnDossierProvenanceEvent[];
  condition?: CoOwnDossierCondition;
  custody?: CoOwnDossierCustody;
  appraisal?: CoOwnDossierAppraisal;
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
        <View style={[styles.badge, { backgroundColor: colors.warning + '22' }]}>
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
  custody,
  appraisal,
}: CoOwnAssetDossierProps) {
  const { colors } = useAppTheme();
  const hasAny = provenance?.length || condition || custody || appraisal;
  if (!hasAny) return null;

  return (
    <View style={[styles.root, { backgroundColor: colors.surface, borderColor: colors.border }]}>
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

      {/* ── Custody ── */}
      {custody && (
        <View style={styles.section}>
          <SectionHeader icon="shield-checkmark-outline" title="Custody" colors={colors} />
          <InfoRow label="Location" value={custody.location} colors={colors} />
          <InfoRow label="Custodian" value={custody.custodian} colors={colors} />
          <InfoRow
            label="Insured"
            value={custody.insured ? 'Yes' : 'Not insured'}
            colors={colors}
            valueColor={custody.insured ? colors.success : colors.danger}
          />
          {custody.policyRef && (
            <InfoRow label="Policy ref" value={custody.policyRef} colors={colors} />
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
          <InfoRow label="Method" value={appraisal.method} colors={colors} />
          {appraisal.valuer && (
            <InfoRow label="Valuer" value={appraisal.valuer} colors={colors} />
          )}
          {(appraisal.rangeLow != null && appraisal.rangeHigh != null) && (
            <View style={styles.infoRow}>
              <Text style={[styles.infoLabel, { color: colors.textMuted }]}>Range</Text>
              <Text style={[styles.infoValue, { color: colors.textSecondary }]}>
                {appraisal.rangeLow.toLocaleString('en-GB')} – {appraisal.rangeHigh.toLocaleString('en-GB')} {appraisal.currency}
              </Text>
            </View>
          )}
          {appraisal.nextScheduled && (
            <InfoRow label="Next appraisal" value={appraisal.nextScheduled} colors={colors} />
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    borderRadius: Radius.lg,
    borderWidth: 0.5,
    padding: Space.md,
    gap: Space.md,
  },
  section: {
    gap: Space.sm,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
  },
  sectionTitle: {
    fontSize: Type.bodyEmphasis.size,
    lineHeight: Type.bodyEmphasis.lineHeight,
    fontFamily: Typography.family.semibold,
    letterSpacing: Type.bodyEmphasis.letterSpacing,
    flex: 1,
  },
  badge: {
    paddingHorizontal: Space.sm,
    paddingVertical: 2,
    borderRadius: Radius.full,
  },
  badgeText: {
    fontSize: Type.meta.size,
    lineHeight: Type.meta.lineHeight,
    fontFamily: Typography.family.semibold,
    letterSpacing: Type.meta.letterSpacing,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: Space.md,
    minHeight: 20,
  },
  infoLabel: {
    fontSize: Type.body.size,
    lineHeight: Type.body.lineHeight,
    fontFamily: Typography.family.regular,
    letterSpacing: Type.body.letterSpacing,
    flexShrink: 0,
  },
  infoValue: {
    fontSize: Type.body.size,
    lineHeight: Type.body.lineHeight,
    fontFamily: Typography.family.medium,
    letterSpacing: Type.body.letterSpacing,
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
    borderRadius: 3,
    marginTop: 6,
  },
  provenanceContent: {
    flex: 1,
    gap: 1,
  },
  provenanceEvent: {
    fontSize: Type.body.size,
    lineHeight: Type.body.lineHeight,
    fontFamily: Typography.family.medium,
    letterSpacing: Type.body.letterSpacing,
  },
  provenanceDate: {
    fontSize: Type.meta.size,
    lineHeight: Type.meta.lineHeight,
    fontFamily: Typography.family.regular,
    letterSpacing: Type.meta.letterSpacing,
  },
  provenanceNote: {
    fontSize: Type.caption.size,
    lineHeight: Type.caption.lineHeight,
    fontFamily: Typography.family.regular,
    letterSpacing: Type.caption.letterSpacing,
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
    fontSize: Type.meta.size,
    lineHeight: Type.meta.lineHeight,
    fontFamily: Typography.family.regular,
    letterSpacing: Type.meta.letterSpacing,
  },
});

export default CoOwnAssetDossier;
