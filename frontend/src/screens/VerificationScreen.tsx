import React from 'react';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RootStackParamList } from '../navigation/types';
import { Space } from '../theme/designTokens';
import { FlagshipScreen, FlagshipHeader } from '../components/flagship';
import {
  VerificationStatusSection,
  KycFlowCard,
  Dac7Section,
  VerificationFooter } from '../components/verification';
import { useVerificationStatus, useKycFlow, useDac7Flow } from '../hooks/verification';
import { deriveVerificationTierInfo } from '../domain/verification';
import { KeyboardAwareScrollView } from '../platform/keyboard/KeyboardProvider';

type Props = NativeStackScreenProps<RootStackParamList, 'Verification'>;

export default function VerificationScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();

  // Backend-authoritative compliance status (KYC + DAC7) — §11 truthfulness.
  const status = useVerificationStatus();
  const kycFlow = useKycFlow({
    kycVerified: status.kycVerified,
    refreshKycStatus: status.refreshKycStatus });
  const dac7Flow = useDac7Flow({ onSaved: status.applyDac7Info });

  // Derived tier info — identity/seller verification only, NOT email.
  const tierInfo = deriveVerificationTierInfo(status.kycVerified);

  return (
    <FlagshipScreen
      header={
        <FlagshipHeader
          title="Verification"
          onBack={() => navigation.goBack()}
        />
      }
      scrollEnabled={false}
      contentStyle={{ paddingHorizontal: 0, paddingTop: 0 }}
    >
      <KeyboardAwareScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={{ paddingHorizontal: Space.md, paddingTop: Space.sm, paddingBottom: Math.max(insets.bottom, Space.md) + Space.lg }}
      >
        {/* ── STATUS BANNER + VERIFICATION STEPS ── */}
        <VerificationStatusSection
          tierInfo={tierInfo}
          emailVerified={status.emailVerified}
          kycVerified={status.kycVerified}
          kycPending={status.kycPending}
          onStartKyc={kycFlow.start}
        />

        {/* ── KYC FLOW ── */}
        {kycFlow.step !== 'status' ? (
          <KycFlowCard flow={kycFlow} />
        ) : null}

        {/* ── DAC7 TAX INFORMATION ── */}
        <Dac7Section
          flow={dac7Flow}
          completed={status.dac7Completed}
          savedCountry={status.dac7Info?.taxResidenceCountry}
        />

        <VerificationFooter />
      </KeyboardAwareScrollView>
    </FlagshipScreen>
  );
}
