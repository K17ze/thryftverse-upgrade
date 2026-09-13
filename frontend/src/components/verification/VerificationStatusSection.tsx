import React from 'react';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme/ThemeContext';
import { SettingsSection } from '../settings/SettingsSection';
import { SettingsRow } from '../settings/SettingsRow';
import { SettingsInfoBanner } from '../settings/SettingsInfoBanner';
import { resolveEmailRowCopy, resolveIdentityRowCopy } from '../../domain/verification';
import type { VerificationTierInfo } from '../../platform/product/listingDetailContract';

export interface VerificationStatusSectionProps {
  /** Banner tier info (verified tier or the unverified fallback). */
  tierInfo: VerificationTierInfo;
  emailVerified: boolean;
  kycVerified: boolean;
  kycPending: boolean;
  /** Identity-row press — starts the KYC flow (toast-guarded when verified). */
  onStartKyc: () => void;
}

/**
 * The top-of-screen verification status surface: the tier banner plus the
 * "Verification steps" rows for email and identity.
 */
export function VerificationStatusSection({
  tierInfo,
  emailVerified,
  kycVerified,
  kycPending,
  onStartKyc }: VerificationStatusSectionProps) {
  const { colors } = useAppTheme();
  const emailCopy = resolveEmailRowCopy(emailVerified);
  const identityCopy = resolveIdentityRowCopy(kycVerified, kycPending);
  return (
    <>
      <SettingsInfoBanner
        icon={tierInfo.icon as keyof typeof Ionicons.glyphMap}
        title={tierInfo.label}
        description={tierInfo.description}
        tone={kycVerified ? 'success' : 'info'}
      />
      <SettingsSection title="Verification steps">
        <SettingsRow
          icon="mail-outline"
          iconColor={emailVerified ? colors.brand : colors.textMuted}
          title="Email verified"
          subtitle={emailCopy.subtitle}
          value={emailCopy.value}
          isFirst
        />
        <SettingsRow
          icon="card-outline"
          iconColor={kycVerified ? colors.brand : kycPending ? colors.warning : colors.textMuted}
          title="Identity verification"
          subtitle={identityCopy.subtitle}
          value={identityCopy.value}
          onPress={onStartKyc}
          isLast
        />
      </SettingsSection>
    </>
  );
}
