/**
 * BuyerProtectionScreen — shows buyer protection status for an order.
 *
 * Displays coverage amount, eligibility window, and claim history.
 * Allows initiating a new protection claim with reason, description,
 * and evidence photos.
 */

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  RefreshControl,
  TextInput } from 'react-native';
import { KeyboardAwareScrollView } from '../platform/keyboard/KeyboardProvider';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { useAppTheme } from '../theme/ThemeContext';
import type { ThemeColors } from '../theme/ThemeContext';
import { Space, Radius, Stroke } from '../theme/designTokens';
import { TypographyV2 } from '../theme/typography.v2';
import { haptics } from '../utils/haptics';
import { useToast } from '../context/ToastContext';
import { FlagshipScreen, FlagshipHeader } from '../components/flagship';
import { SettingsSection } from '../components/settings/SettingsSection';
import { SettingsRow } from '../components/settings/SettingsRow';
import { SettingsInfoBanner } from '../components/settings/SettingsInfoBanner';
import { BuyerProtectionSkeleton } from '../components/skeletons/BuyerProtectionSkeleton';
import { AppButton } from '../components/ui/AppButton';
import { ConfirmationSheet } from '../components/ConfirmationSheet';
import {
  fetchBuyerProtection,
  createBuyerProtectionClaim,
  type BuyerProtectionInfo } from '../services/commerceApi';
import { useFormattedPrice } from '../hooks/useFormattedPrice';

type Props = NativeStackScreenProps<RootStackParamList, 'BuyerProtection'>;

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric' });
}

export default function BuyerProtectionScreen({ navigation, route }: Props) {
  const { colors, isDark } = useAppTheme();
  const { show } = useToast();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const { currencyCode, formatFromFiat } = useFormattedPrice();

  const formatGbp = React.useCallback(
    (minor: number) => formatFromFiat(minor / 100, 'GBP'),
    [formatFromFiat, currencyCode]
  );
  const { orderId } = route.params;

  const [protection, setProtection] = React.useState<BuyerProtectionInfo | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Claim form state
  const [showClaimForm, setShowClaimForm] = React.useState(false);
  const [reason, setReason] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [submitting, setSubmitting] = React.useState(false);
  const [confirmSheet, setConfirmSheet] = React.useState<{
    visible: boolean;
    title: string;
    message: string;
    confirmLabel: string;
    cancelLabel: string;
    onConfirm: () => void;
    variant: 'default' | 'danger';
  }>({ visible: false, title: '', message: '', confirmLabel: 'Confirm', cancelLabel: 'Cancel', onConfirm: () => {}, variant: 'default' });

  const loadProtection = React.useCallback(async () => {
    try {
      setError(null);
      const data = await fetchBuyerProtection(orderId);
      setProtection(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load protection info');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [orderId]);

  React.useEffect(() => {
    void loadProtection();
  }, [loadProtection]);

  const handleRefresh = () => {
    haptics.tap();
    setRefreshing(true);
    void loadProtection();
  };

  const handleSubmitClaim = async () => {
    if (reason.trim().length < 2) {
      show('Enter a reason', 'error');
      return;
    }
    if (description.trim().length < 10) {
      show('Describe the issue (at least 10 characters)', 'error');
      return;
    }

    setConfirmSheet({
      visible: true,
      title: 'Submit claim?',
      message: 'This will create a support ticket with our team. We respond as quickly as we can.',
      confirmLabel: 'Submit',
      cancelLabel: 'Cancel',
      onConfirm: async () => {
        setSubmitting(true);
        try {
          await createBuyerProtectionClaim(orderId, {
            reason: reason.trim(),
            description: description.trim() });
          haptics.success();
          show('Claim submitted. We respond as quickly as we can.', 'success');
          setShowClaimForm(false);
          setReason('');
          setDescription('');
          await loadProtection();
        } catch (err) {
          show(err instanceof Error ? err.message : 'Failed to submit claim', 'error');
        } finally {
          setSubmitting(false);
        }
      },
      variant: 'default' });
  };

  if (loading) {
    return (
      <FlagshipScreen header={<FlagshipHeader title="Buyer Protection" onBack={() => navigation.goBack()} />}>
        <BuyerProtectionSkeleton />
      </FlagshipScreen>
    );
  }

  if (error && !protection) {
    return (
      <FlagshipScreen header={<FlagshipHeader title="Buyer Protection" onBack={() => navigation.goBack()} />}>
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle-outline" size={40} color={colors.danger} />
          <Text style={styles.errorTitle}>Couldn't load protection info</Text>
          <Text style={styles.errorBody}>{error}</Text>
          <AppButton
            title="Retry"
            onPress={() => { haptics.tap(); setLoading(true); void loadProtection(); }}
            variant="primary"
            size="md"
            style={{ marginTop: Space.md }}
          />
        </View>
      </FlagshipScreen>
    );
  }

  const isCovered = protection?.status === 'covered';

  return (
    <FlagshipScreen header={<FlagshipHeader title="Buyer Protection" onBack={() => navigation.goBack()} />}>
      <KeyboardAwareScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.textSecondary} />}
        showsVerticalScrollIndicator={false}
      >
        {/* Coverage summary — status banner with circular icon */}
          <SettingsInfoBanner
            tone={isCovered ? 'success' : 'info'}
            icon="checkmark-circle-outline"
            title={isCovered ? 'You\'re protected' : 'Protection pending'}
            description={isCovered ? `Coverage up to ${formatGbp(protection!.coverageAmountGbpMinor)}` : 'No buyer protection fee was paid'}
          />

          {isCovered && (
            <SettingsSection title="Coverage details">
              <SettingsRow title="Protection fee paid" value={formatGbp(protection!.feeGbpMinor)} isFirst />
              <SettingsRow title="Coverage amount" value={formatGbp(protection!.coverageAmountGbpMinor)} />
              <SettingsRow title="Eligible until" value={formatDate(protection!.eligibleUntil)} isLast />
            </SettingsSection>
          )}

        {/* What's covered */}
          <SettingsSection title="What's covered">
            <SettingsRow title="Item not as described" icon="checkmark-circle-outline" iconColor={colors.success} isFirst />
            <SettingsRow title="Item not received" icon="checkmark-circle-outline" iconColor={colors.success} />
            <SettingsRow title="Counterfeit or fake items" icon="checkmark-circle-outline" iconColor={colors.success} />
            <SettingsRow title="Damaged in transit" icon="checkmark-circle-outline" iconColor={colors.success} isLast />
          </SettingsSection>

        {/* Claims history */}
        {protection && protection.claims.length > 0 && (
            <SettingsSection title="Claims history">
              {protection.claims.map((claim, idx) => (
                <SettingsRow
                  key={claim.ticketId}
                  title={claim.topic.replace(/_/g, ' ')}
                  subtitle={`Updated ${formatDate(claim.createdAt)}`}
                  value={claim.status.charAt(0).toUpperCase() + claim.status.slice(1)}
                  icon={claim.status === 'open' ? 'hourglass-outline' : claim.status === 'resolved' ? 'checkmark-circle-outline' : 'alert-circle-outline'}
                  iconColor={claim.status === 'open' ? colors.warning : claim.status === 'resolved' ? colors.success : colors.textMuted}
                  isFirst={idx === 0}
                  isLast={idx === protection.claims.length - 1}
                />
              ))}
            </SettingsSection>
        )}

        {/* Claim form */}
        {isCovered && (
          <>
            {!showClaimForm ? (
              <AppButton
                title="File a claim"
                onPress={() => { haptics.tap(); setShowClaimForm(true); }}
                variant="primary"
                size="lg"
                icon={<Ionicons name="checkmark-circle-outline" size={18} color={colors.textInverse} />}
                style={{ marginHorizontal: Space.md, marginTop: Space.md }}
              />
            ) : (
              <View style={styles.claimForm}>
                <Text style={styles.sectionTitle}>File a protection claim</Text>

                <Text style={styles.inputLabel}>Reason</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: colors.surfaceAlt, borderColor: colors.border, color: colors.textPrimary }]}
                  value={reason}
                  onChangeText={setReason}
                  placeholder="e.g. Item not as described"
                  placeholderTextColor={colors.textMuted}
                  maxLength={120}
                  accessibilityLabel="Claim reason"
                  accessibilityHint="Briefly describe the reason for your claim"
                />

                <Text style={styles.inputLabel}>Description</Text>
                <TextInput
                  style={[styles.input, styles.textArea, { backgroundColor: colors.surfaceAlt, borderColor: colors.border, color: colors.textPrimary }]}
                  value={description}
                  onChangeText={setDescription}
                  placeholder="Describe the issue in detail…"
                  placeholderTextColor={colors.textMuted}
                  multiline
                  numberOfLines={4}
                  maxLength={2000}
                  textAlignVertical="top"
                  accessibilityLabel="Claim description"
                  accessibilityHint="Describe the issue in detail, up to 2000 characters"
                />

                <View style={styles.claimFormActions}>
                  <AppButton
                    title="Cancel"
                    onPress={() => { haptics.tap(); setShowClaimForm(false); }}
                    variant="secondary"
                    size="md"
                    style={{ flex: 1, marginRight: Space.sm }}
                  />
                  <AppButton
                    title={submitting ? 'Submitting…' : 'Submit claim'}
                    onPress={handleSubmitClaim}
                    variant="primary"
                    size="md"
                    disabled={submitting}
                    loading={submitting}
                    style={{ flex: 1 }}
                  />
                </View>
              </View>
            )}
          </>
        )}

        <View style={{ height: 40 }} />
      </KeyboardAwareScrollView>

      <ConfirmationSheet
        visible={confirmSheet.visible}
        onDismiss={() => setConfirmSheet((prev) => ({ ...prev, visible: false }))}
        title={confirmSheet.title}
        message={confirmSheet.message}
        confirmLabel={confirmSheet.confirmLabel}
        cancelLabel={confirmSheet.cancelLabel}
        onConfirm={confirmSheet.onConfirm}
        variant={confirmSheet.variant}
      />
    </FlagshipScreen>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    scrollContent: {
      paddingBottom: Space.xxl },
    errorContainer: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: Space.xl },
    errorTitle: {
      fontSize: TypographyV2.body.size,
      fontFamily: TypographyV2.body.fontFamily,
      color: colors.textPrimary,
      marginTop: Space.md },
    errorBody: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      color: colors.textSecondary,
      textAlign: 'center',
      marginTop: Space.xs },
    sectionTitle: {
      fontSize: TypographyV2.body.size,
      fontFamily: TypographyV2.body.fontFamily,
      color: colors.textPrimary,
      marginBottom: Space.sm },
    claimForm: {
      padding: Space.md,
      marginHorizontal: Space.md,
      marginTop: Space.md },
    inputLabel: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      color: colors.textSecondary,
      marginTop: Space.sm,
      marginBottom: Space.xs },
    input: {
      borderRadius: Radius.md,
      borderWidth: Stroke.standard,
      paddingHorizontal: Space.md,
      paddingVertical: Space.sm,
      fontSize: TypographyV2.body.size,
      fontFamily: TypographyV2.body.fontFamily },
    textArea: {
      minHeight: Space.xxl * 2 + Space.xs,
      paddingTop: Space.sm },
    claimFormActions: {
      flexDirection: 'row',
      marginTop: Space.md } });
}
