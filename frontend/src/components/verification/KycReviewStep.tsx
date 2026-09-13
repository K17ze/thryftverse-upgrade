import React from 'react';
import { View, Text, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme/ThemeContext';
import { SettingsInfoBanner } from '../settings/SettingsInfoBanner';
import { VerificationFlowNav } from './VerificationFlowNav';
import { createVerificationScreenStyles } from './verificationScreenStyles';
import {
  kycDocumentTypeLabel,
  type KycDocumentType } from '../../domain/verification';

export interface KycReviewStepProps {
  fullName: string;
  dob: string;
  addressLine: string;
  city: string;
  postcode: string;
  documentType: KycDocumentType;
  documentUri: string | null;
  isSubmitting: boolean;
  onBack: () => void;
  onSubmit: () => void;
}

/** KYC step 3 — review the entered details and submit verification. */
export function KycReviewStep({
  fullName,
  dob,
  addressLine,
  city,
  postcode,
  documentType,
  documentUri,
  isSubmitting,
  onBack,
  onSubmit }: KycReviewStepProps) {
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createVerificationScreenStyles(colors), [colors]);
  return (
    <>
      <View style={styles.reviewRow}>
        <Text style={[styles.reviewLabel, { color: colors.textMuted }]}>Name</Text>
        <Text style={[styles.reviewValue, { color: colors.textPrimary }]}>{fullName}</Text>
      </View>
      <View style={styles.reviewRow}>
        <Text style={[styles.reviewLabel, { color: colors.textMuted }]}>Date of birth</Text>
        <Text style={[styles.reviewValue, { color: colors.textPrimary }]}>{dob}</Text>
      </View>
      <View style={styles.reviewRow}>
        <Text style={[styles.reviewLabel, { color: colors.textMuted }]}>Address</Text>
        <Text style={[styles.reviewValue, { color: colors.textPrimary }]} numberOfLines={2}>
          {addressLine}, {city}, {postcode}
        </Text>
      </View>
      <View style={styles.reviewRow}>
        <Text style={[styles.reviewLabel, { color: colors.textMuted }]}>Document</Text>
        <Text style={[styles.reviewValue, { color: colors.textPrimary }]}>
          {kycDocumentTypeLabel(documentType)}
        </Text>
      </View>
      {documentUri ? (
        <View style={styles.reviewDocumentPreview}>
          <Image
            source={{ uri: documentUri }}
            style={styles.reviewDocumentImage}
            resizeMode="cover"
            accessibilityLabel="Uploaded document preview"
          />
          <View style={styles.reviewDocumentInfo}>
            <Ionicons name="checkmark-circle" size={16} color={colors.success} />
            <Text style={[styles.reviewDocumentText, { color: colors.textSecondary }]}>
              Document photo attached
            </Text>
          </View>
        </View>
      ) : null}
      <SettingsInfoBanner
        icon="lock-closed-outline"
        text="Your data is encrypted and used only for identity verification. It is deleted after review."
      />
      <VerificationFlowNav
        onBack={onBack}
        backLabel="Back"
        backAccessibilityLabel="Back to document upload"
        onPrimary={onSubmit}
        primaryLabel="Submit verification"
        primaryAccessibilityLabel="Submit verification"
        primaryLoading={isSubmitting}
      />
    </>
  );
}
