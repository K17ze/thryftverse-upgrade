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
  Alert,
  TextInput,
} from 'react-native';
import { KeyboardAwareScrollView } from '../platform/keyboard/KeyboardProvider';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { useAppTheme } from '../theme/ThemeContext';
import type { ThemeColors } from '../theme/ThemeContext';
import { Space, Radius, Type, Typography, Stroke } from '../theme/designTokens';
import { haptics } from '../utils/haptics';
import { useToast } from '../context/ToastContext';
import { FlagshipScreen, FlagshipHeader } from '../components/flagship';
import { BuyerProtectionSkeleton } from '../components/skeletons/BuyerProtectionSkeleton';
import { AppButton } from '../components/ui/AppButton';
import {
  fetchBuyerProtection,
  createBuyerProtectionClaim,
  type BuyerProtectionInfo,
} from '../services/commerceApi';

type Props = NativeStackScreenProps<RootStackParamList, 'BuyerProtection'>;

function formatGbp(minor: number): string {
  return `£${(minor / 100).toFixed(2)}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export default function BuyerProtectionScreen({ navigation, route }: Props) {
  const { colors, isDark } = useAppTheme();
  const { show } = useToast();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
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

    Alert.alert(
      'Submit claim?',
      'This will create a support ticket with our team. We respond as quickly as we can.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Submit',
          onPress: async () => {
            setSubmitting(true);
            try {
              await createBuyerProtectionClaim(orderId, {
                reason: reason.trim(),
                description: description.trim(),
              });
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
        },
      ]
    );
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
        {/* Coverage summary */}
          <View style={styles.coverageCard}>
            <View style={styles.coverageHeader}>
              <View style={[styles.coverageIcon, { backgroundColor: isCovered ? colors.successSubtle : colors.surfaceAlt }]}>
                <Ionicons name="checkmark-circle" size={24} color={isCovered ? colors.success : colors.textMuted} />
              </View>
              <View style={styles.coverageHeaderText}>
                <Text style={styles.coverageTitle}>
                  {isCovered ? 'You\'re protected' : 'Not covered'}
                </Text>
                <Text style={styles.coverageSubtitle}>
                  {isCovered ? `Coverage up to ${formatGbp(protection!.coverageAmountGbpMinor)}` : 'No buyer protection fee was paid'}
                </Text>
              </View>
            </View>

            {isCovered && (
              <View style={styles.coverageDetails}>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Protection fee paid</Text>
                  <Text style={styles.detailValue}>{formatGbp(protection!.feeGbpMinor)}</Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Coverage amount</Text>
                  <Text style={styles.detailValue}>{formatGbp(protection!.coverageAmountGbpMinor)}</Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Eligible until</Text>
                  <Text style={styles.detailValue}>{formatDate(protection!.eligibleUntil)}</Text>
                </View>
              </View>
            )}
          </View>

        {/* What's covered */}
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>What's covered</Text>
            <View style={styles.coverageList}>
              <View style={styles.coverageItem}>
                <Ionicons name="checkmark-circle" size={18} color={colors.success} />
                <Text style={styles.coverageItemText}>Item not as described</Text>
              </View>
              <View style={styles.coverageItem}>
                <Ionicons name="checkmark-circle" size={18} color={colors.success} />
                <Text style={styles.coverageItemText}>Item not received</Text>
              </View>
              <View style={styles.coverageItem}>
                <Ionicons name="checkmark-circle" size={18} color={colors.success} />
                <Text style={styles.coverageItemText}>Counterfeit or fake items</Text>
              </View>
              <View style={styles.coverageItem}>
                <Ionicons name="checkmark-circle" size={18} color={colors.success} />
                <Text style={styles.coverageItemText}>Damaged in transit</Text>
              </View>
            </View>
          </View>

        {/* Claims history */}
        {protection && protection.claims.length > 0 && (
            <View style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>Claims history</Text>
              {protection.claims.map((claim, idx) => (
                <View key={claim.ticketId} style={[styles.claimRow, idx < protection.claims.length - 1 && styles.claimRowBorder]}>
                  <View style={styles.claimHeader}>
                    <Ionicons
                      name={claim.status === 'open' ? 'hourglass-outline' : claim.status === 'resolved' ? 'checkmark-circle-outline' : 'alert-circle-outline'}
                      size={18}
                      color={claim.status === 'open' ? colors.warning : claim.status === 'resolved' ? colors.success : colors.textMuted}
                    />
                    <Text style={styles.claimTopic}>{claim.topic.replace(/_/g, ' ')}</Text>
                    <Text style={styles.claimDate}>{formatDate(claim.createdAt)}</Text>
                  </View>
                  <Text style={styles.claimStatus}>{claim.status.charAt(0).toUpperCase() + claim.status.slice(1)}</Text>
                </View>
              ))}
            </View>
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
                icon={<Ionicons name="shield-outline" size={18} color={colors.textInverse} />}
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
    </FlagshipScreen>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    scrollContent: {
      paddingBottom: Space.xxl,
    },
    errorContainer: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: Space.xl,
    },
    errorTitle: {
      fontSize: Type.body.size,
      fontFamily: Typography.family.semibold,
      color: colors.textPrimary,
      marginTop: Space.md,
    },
    errorBody: {
      fontSize: Type.caption.size,
      fontFamily: Typography.family.regular,
      color: colors.textSecondary,
      textAlign: 'center',
      marginTop: Space.xs,
    },
    coverageCard: {
      padding: Space.lg,
      marginHorizontal: Space.md,
      marginTop: Space.md,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.borderSubtle,
    },
    coverageHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.md,
    },
    coverageIcon: {
      width: Space.xxl,
      height: Space.xxl,
      borderRadius: Radius.full,
      justifyContent: 'center',
      alignItems: 'center',
    },
    coverageHeaderText: {
      flex: 1,
    },
    coverageTitle: {
      fontSize: Type.subtitle.size,
      fontFamily: Typography.family.semibold,
      color: colors.textPrimary,
    },
    coverageSubtitle: {
      fontSize: Type.caption.size,
      fontFamily: Typography.family.regular,
      color: colors.textSecondary,
      marginTop: Space.xs / 2,
    },
    coverageDetails: {
      marginTop: Space.md,
      gap: Space.sm,
    },
    detailRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    detailLabel: {
      fontSize: Type.caption.size,
      fontFamily: Typography.family.regular,
      color: colors.textMuted,
    },
    detailValue: {
      fontSize: Type.caption.size,
      fontFamily: Typography.family.semibold,
      color: colors.textPrimary,
    },
    sectionCard: {
      padding: Space.md,
      marginHorizontal: Space.md,
      marginTop: Space.md,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.borderSubtle,
    },
    sectionTitle: {
      fontSize: Type.body.size,
      fontFamily: Typography.family.semibold,
      color: colors.textPrimary,
      marginBottom: Space.sm,
    },
    coverageList: {
      gap: Space.sm,
    },
    coverageItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.sm,
    },
    coverageItemText: {
      fontSize: Type.caption.size,
      fontFamily: Typography.family.regular,
      color: colors.textSecondary,
    },
    claimRow: {
      paddingVertical: Space.sm,
    },
    claimRowBorder: {
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.borderSubtle,
    },
    claimHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.sm,
    },
    claimTopic: {
      fontSize: Type.caption.size,
      fontFamily: Typography.family.medium,
      color: colors.textPrimary,
      flex: 1,
      textTransform: 'capitalize',
    },
    claimDate: {
      fontSize: Type.meta.size,
      fontFamily: Typography.family.regular,
      color: colors.textMuted,
    },
    claimStatus: {
      fontSize: Type.meta.size,
      fontFamily: Typography.family.regular,
      color: colors.textSecondary,
      marginTop: Space.xs,
      marginLeft: Space.xl + Space.sm,
    },
    claimForm: {
      padding: Space.md,
      marginHorizontal: Space.md,
      marginTop: Space.md,
    },
    inputLabel: {
      fontSize: Type.meta.size,
      fontFamily: Typography.family.medium,
      color: colors.textSecondary,
      marginTop: Space.sm,
      marginBottom: Space.xs,
    },
    input: {
      borderRadius: Radius.md,
      borderWidth: Stroke.standard,
      paddingHorizontal: Space.md,
      paddingVertical: Space.sm,
      fontSize: Type.body.size,
      fontFamily: Typography.family.regular,
    },
    textArea: {
      minHeight: Space.xxl * 2 + Space.xs,
      paddingTop: Space.sm,
    },
    claimFormActions: {
      flexDirection: 'row',
      marginTop: Space.md,
    },
  });
}
