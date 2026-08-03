import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme/ThemeContext';
import { Space, Type, Typography } from '../../theme/designTokens';

export interface CoOwnTrustPanelProps {
  authenticityStatus?: 'unverified' | 'pending' | 'verified' | null;
  authenticityMethod?: string | null;
  buyerProtection?: boolean;
  buyerProtectionTermsUrl?: string | null;
  custodianName?: string | null;
  custodianLocation?: string | null;
  custodyInsured?: boolean;
  custodyInsurer?: string | null;
  custodyCoverageGbp?: number | null;
  custodyPolicyRef?: string | null;
  legalVehicleType?: 'spv' | 'llc' | 'trust' | 'series_llc' | 'none' | null;
  legalVehicleName?: string | null;
  legalVehicleJurisdiction?: string | null;
}

export function CoOwnTrustPanel({
  authenticityStatus,
  authenticityMethod,
  buyerProtection,
  buyerProtectionTermsUrl,
  custodianName,
  custodianLocation,
  custodyInsured,
  custodyInsurer,
  custodyCoverageGbp,
  custodyPolicyRef,
  legalVehicleType,
  legalVehicleName,
  legalVehicleJurisdiction,
}: CoOwnTrustPanelProps) {
  const { colors } = useAppTheme();

  const items: Array<{ icon: React.ComponentProps<typeof Ionicons>['name']; label: string; value: string; positive: boolean }> = [];

  // Legal vehicle — equity-market front-cover pattern: the legal wrapper
  // is the first trust signal. 'none' is shown truthfully (not hidden).
  if (legalVehicleType && legalVehicleType !== 'none') {
    const vehicleLabel = legalVehicleType === 'spv' ? 'SPV'
      : legalVehicleType === 'series_llc' ? 'Series LLC'
      : legalVehicleType === 'llc' ? 'LLC'
      : legalVehicleType === 'trust' ? 'Trust'
      : legalVehicleType;
    const vehicleValue = legalVehicleName
      ? legalVehicleJurisdiction
        ? `${vehicleLabel} · ${legalVehicleName} · ${legalVehicleJurisdiction}`
        : `${vehicleLabel} · ${legalVehicleName}`
      : vehicleLabel;
    items.push({ icon: 'business-outline', label: 'Legal vehicle', value: vehicleValue, positive: true });
  } else if (legalVehicleType === 'none') {
    items.push({ icon: 'business-outline', label: 'Legal vehicle', value: 'None declared', positive: false });
  }

  if (authenticityStatus === 'verified') {
    const value = authenticityMethod ? `Verified · ${authenticityMethod}` : 'Verified';
    items.push({ icon: 'shield-checkmark', label: 'Authenticity', value, positive: true });
  } else if (authenticityStatus === 'pending') {
    items.push({ icon: 'hourglass-outline', label: 'Authenticity', value: 'Verification pending', positive: false });
  } else if (authenticityStatus === 'unverified') {
    // Fail closed — don't show a chip for unverified. The absence is the signal.
  }

  if (buyerProtection) {
    const value = buyerProtectionTermsUrl ? 'Included · terms available' : 'Included';
    items.push({ icon: 'checkmark-circle', label: 'Buyer protection', value, positive: true });
  }

  if (custodianName) {
    const value = custodianLocation ? `${custodianName} · ${custodianLocation}` : custodianName;
    items.push({ icon: 'cube-outline', label: 'Custodian', value, positive: true });
  }

  if (custodyInsured && custodyInsurer) {
    // Equity-market pattern: disclose insurer, coverage amount, and
    // policy reference — not just the boolean "insured."
    const coverageStr = custodyCoverageGbp != null
      ? ` · £${custodyCoverageGbp.toLocaleString()} coverage`
      : '';
    const policyStr = custodyPolicyRef ? ` · policy ${custodyPolicyRef}` : '';
    items.push({
      icon: 'shield-checkmark-outline',
      label: 'Insurance',
      value: `${custodyInsurer}${coverageStr}${policyStr}`,
      positive: true,
    });
  }

  if (items.length === 0) return null;

  const a11yLabel = `Trust and protection. ${items.map((i) => `${i.label}: ${i.value}`).join('. ')}`;

  // Flat composition — no rounded card. The parent CommerceDetailSection
  // provides the section context; this renders as quiet rows inside it.
  // Spec 02: "no card-on-card composition."
  return (
    <View
      accessibilityRole="summary"
      accessibilityLabel={a11yLabel}
    >
      <View style={styles.itemsList}>
        {items.map((item, i) => (
          <View key={`${item.label}-${i}`} style={[styles.itemRow, i < items.length - 1 && { borderBottomColor: colors.borderSubtle }]}>
            <Ionicons name={item.icon} size={16} color={item.positive ? colors.brand : colors.textMuted} />
            <View style={styles.itemBody}>
              <Text style={[styles.itemLabel, { color: colors.textMuted }]}>{item.label}</Text>
              <Text style={[styles.itemValue, { color: item.positive ? colors.textPrimary : colors.textSecondary }]}>
                {item.value}
              </Text>
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  itemsList: {
    gap: 0,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    paddingVertical: Space.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  itemBody: {
    flex: 1,
    gap: 2,
  },
  itemLabel: {
    fontSize: Type.meta.size,
    fontFamily: Typography.family.medium,
    letterSpacing: 0.2,
    textTransform: 'uppercase',
  },
  itemValue: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.semibold,
  },
});
