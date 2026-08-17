import React, { useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useAppTheme, type ThemeColors } from '../theme/ThemeContext';
import { Space, Radius, Type, Typography, Stroke, Control } from '../theme/designTokens';
import { RootStackParamList } from '../navigation/types';
import { useStore } from '../store/useStore';
import { useToast } from '../context/ToastContext';
import { useHaptic } from '../hooks/useHaptic';
import { parseApiError } from '../lib/apiClient';
import { requestDataExport, type DataExportResult } from '../services/accountApi';
import { AppButton } from '../components/ui/AppButton';
import { FlagshipScreen, FlagshipHeader } from '../components/flagship';

type Props = NativeStackScreenProps<RootStackParamList, 'DataExport'>;

type ExportState = 'idle' | 'loading' | 'success' | 'error';

const DATA_CATEGORIES: { icon: React.ComponentProps<typeof Ionicons>['name']; label: string; description: string }[] = [
  { icon: 'person-outline', label: 'Profile', description: 'Username, display name, bio, avatar' },
  { icon: 'pricetag-outline', label: 'Listings', description: 'Items you have listed for sale' },
  { icon: 'bag-outline', label: 'Orders', description: 'Purchase and sale order history' },
  { icon: 'chatbubble-outline', label: 'Messages', description: 'Conversations and message metadata' },
  { icon: 'wallet-outline', label: 'Wallet transactions', description: 'Payouts, balance and transaction records' },
  { icon: 'star-outline', label: 'Reviews', description: 'Reviews you have given and received' },
  { icon: 'location-outline', label: 'Addresses', description: 'Saved delivery addresses' },
  { icon: 'card-outline', label: 'Payment methods', description: 'Saved cards and bank accounts' },
];

export default function DataExportScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const currentUser = useStore((state) => state.currentUser);
  const { show } = useToast();
  const haptic = useHaptic();
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [exportState, setExportState] = React.useState<ExportState>('idle');
  const [exportResult, setExportResult] = React.useState<DataExportResult | null>(null);
  const [exportError, setExportError] = React.useState<string | null>(null);

  const handleRequestExport = useCallback(async () => {
    if (!currentUser?.id) {
      show('Sign in before requesting a data export.', 'error');
      return;
    }
    setExportState('loading');
    setExportError(null);
    try {
      const result = await requestDataExport();
      setExportResult(result);
      setExportState('success');
      haptic.medium();
      show('Data export generated successfully.', 'success');
    } catch (error) {
      const parsed = parseApiError(error, 'Unable to export account data right now.');
      setExportError(parsed.message);
      setExportState('error');
      haptic.light();
    }
  }, [currentUser?.id, show, haptic]);

  const handleRetry = useCallback(() => {
    setExportState('idle');
    setExportError(null);
    setExportResult(null);
  }, []);

  return (
    <FlagshipScreen
      header={
        <FlagshipHeader
          title="Download my data"
          onBack={() => navigation.goBack()}
        />
      }
    >
      {/* ── Hero ── */}
        <View style={[styles.heroCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.heroRow}>
            <View style={[styles.heroIcon, { backgroundColor: colors.surfaceAlt }]}>
              <Ionicons name="download-outline" size={20} color={colors.textPrimary} />
            </View>
            <View style={styles.heroText}>
              <Text style={[styles.heroTitle, { color: colors.textPrimary }]}>
                Your data, your right
              </Text>
              <Text style={[styles.heroSubtitle, { color: colors.textSecondary }]}>
                Export a copy of everything Thryftverse holds about you
              </Text>
            </View>
          </View>
        </View>

      {/* ── What's included ── */}
        <Text style={[styles.sectionLabel, { color: colors.textPrimary }]}>
          What's included
        </Text>
        <View style={[styles.categoryCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          {DATA_CATEGORIES.map((category, i) => (
            <View
              key={category.label}
              style={[
                styles.categoryRow,
                i < DATA_CATEGORIES.length - 1 && {
                  borderBottomColor: colors.border,
                  borderBottomWidth: StyleSheet.hairlineWidth,
                },
              ]}
            >
              <View style={styles.categoryIcon}>
                <Ionicons name={category.icon} size={18} color={colors.textMuted} />
              </View>
              <View style={styles.categoryText}>
                <Text style={[styles.categoryLabel, { color: colors.textPrimary }]}>
                  {category.label}
                </Text>
                <Text style={[styles.categoryDesc, { color: colors.textMuted }]}>
                  {category.description}
                </Text>
              </View>
            </View>
          ))}
        </View>

      {/* ── State-specific content ── */}
        {/* Loading state */}
        {exportState === 'loading' ? (
          <View style={[styles.stateCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <ActivityIndicator size="large" color={colors.brand} />
            <Text style={[styles.stateTitle, { color: colors.textPrimary }]}>
              Generating your export
            </Text>
            <Text style={[styles.stateSubtitle, { color: colors.textSecondary }]}>
              We're collecting your data. This usually takes a few seconds.
            </Text>
          </View>
        ) : null}

        {/* Success state */}
        {exportState === 'success' && exportResult ? (
          <View style={[styles.successCard, { backgroundColor: `${colors.success}10`, borderColor: `${colors.success}30` }]}>
            <View style={styles.successHeader}>
              <View style={[styles.successIcon, { backgroundColor: colors.success }]}>
                <Ionicons name="checkmark" size={20} color="#FFFFFF" />
              </View>
              <View style={styles.successHeaderText}>
                <Text style={[styles.successTitle, { color: colors.success }]}>
                  Export ready
                </Text>
                <Text style={[styles.successSubtitle, { color: colors.textSecondary }]}>
                  Your data export has been generated
                </Text>
              </View>
            </View>
            <View style={[styles.detailRow, { borderBottomColor: colors.border }]}>
              <Text style={[styles.detailLabel, { color: colors.textMuted }]}>Request ID</Text>
              <Text style={[styles.detailValue, { color: colors.textPrimary }]}>
                {exportResult.requestId}
              </Text>
            </View>
            {exportResult.exportedAt ? (
              <View style={[styles.detailRow, { borderBottomColor: colors.border }]}>
                <Text style={[styles.detailLabel, { color: colors.textMuted }]}>Exported at</Text>
                <Text style={[styles.detailValue, { color: colors.textPrimary }]}>
                  {new Date(exportResult.exportedAt).toLocaleString()}
                </Text>
              </View>
            ) : null}
            {exportResult.estimatedRecords > 0 ? (
              <View style={styles.detailRow}>
                <Text style={[styles.detailLabel, { color: colors.textMuted }]}>Records</Text>
                <Text style={[styles.detailValue, { color: colors.textPrimary }]}>
                  {exportResult.estimatedRecords}
                </Text>
              </View>
            ) : null}
            <Text style={[styles.successFootnote, { color: colors.textSecondary }]}>
              A copy of your export has been sent to your registered email address. Request a new export at any time too.
            </Text>
          </View>
        ) : null}

        {/* Error state */}
        {exportState === 'error' ? (
          <View style={[styles.errorCard, { backgroundColor: `${colors.danger}10`, borderColor: `${colors.danger}30` }]}>
            <View style={styles.errorHeader}>
              <View style={[styles.errorIcon, { backgroundColor: colors.danger }]}>
                <Ionicons name="alert-circle" size={20} color="#FFFFFF" />
              </View>
              <View style={styles.errorHeaderText}>
                <Text style={[styles.errorTitle, { color: colors.danger }]}>
                  Export failed
                </Text>
                <Text style={[styles.errorSubtitle, { color: colors.textSecondary }]}>
                  {exportError ?? 'Something went wrong while generating your export.'}
                </Text>
              </View>
            </View>
          </View>
        ) : null}

      {/* ── Actions ── */}
        <View style={[styles.actionSection, { paddingBottom: insets.bottom + Space.lg }]}>
          {exportState === 'loading' ? (
            <AppButton
              title="Generating..."
              variant="secondary"
              size="lg"
              disabled
              accessibilityLabel="Export is being generated"
              style={styles.fullWidth}
            />
          ) : exportState === 'error' ? (
            <>
              <AppButton
                title="Try again"
                variant="primary"
                size="lg"
                onPress={handleRequestExport}
                hapticFeedback="medium"
                accessibilityLabel="Retry data export"
                style={styles.fullWidth}
              />
              <AppButton
                title="Reset"
                variant="ghost"
                size="md"
                onPress={handleRetry}
                hapticFeedback="light"
                accessibilityLabel="Reset and go back to start"
                style={styles.fullWidth}
              />
            </>
          ) : exportState === 'success' ? (
            <>
              <AppButton
                title="Request a new export"
                variant="secondary"
                size="lg"
                onPress={handleRequestExport}
                hapticFeedback="medium"
                accessibilityLabel="Request a new data export"
                style={styles.fullWidth}
              />
              <AppButton
                title="Done"
                variant="ghost"
                size="md"
                onPress={() => navigation.goBack()}
                hapticFeedback="light"
                accessibilityLabel="Go back to settings"
                style={styles.fullWidth}
              />
            </>
          ) : (
            <AppButton
              title="Request export"
              variant="primary"
              size="lg"
              onPress={handleRequestExport}
              hapticFeedback="medium"
              accessibilityLabel="Request data export"
              accessibilityHint="Generates a copy of your account data and sends it to your email"
              style={styles.fullWidth}
            />
          )}
        </View>
    </FlagshipScreen>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    heroCard: {
      borderRadius: Radius.lg,
      borderWidth: StyleSheet.hairlineWidth,
      padding: Space.md,
      marginBottom: Space.lg,
    },
    heroRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.md,
    },
    heroIcon: {
      width: Space.xl + 8,
      height: Space.xl + 8,
      borderRadius: Radius.full,
      alignItems: 'center',
      justifyContent: 'center',
    },
    heroText: {
      flex: 1,
    },
    heroTitle: {
      fontSize: Type.bodyEmphasis.size,
      fontFamily: Typography.family.semibold,
      letterSpacing: Type.bodyEmphasis.letterSpacing,
      lineHeight: Type.bodyEmphasis.lineHeight,
    },
    heroSubtitle: {
      fontSize: Type.caption.size,
      fontFamily: Typography.family.regular,
      marginTop: Space.xs - 2,
      letterSpacing: Type.caption.letterSpacing,
      lineHeight: Type.caption.lineHeight,
    },
    sectionLabel: {
      fontSize: Type.subtitle.size,
      fontFamily: Typography.family.semibold,
      letterSpacing: Type.subtitle.letterSpacing,
      lineHeight: Type.subtitle.lineHeight,
      marginBottom: Space.sm,
    },
    categoryCard: {
      borderRadius: Radius.lg,
      borderWidth: StyleSheet.hairlineWidth,
      overflow: 'hidden',
      marginBottom: Space.lg,
    },
    categoryRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: Space.sm + 2,
      paddingHorizontal: Space.md,
      gap: Space.sm,
      minHeight: Space.xxl,
    },
    categoryIcon: {
      width: Space.lg,
      alignItems: 'center',
      justifyContent: 'center',
    },
    categoryText: {
      flex: 1,
    },
    categoryLabel: {
      fontSize: Type.body.size,
      fontFamily: Typography.family.semibold,
      letterSpacing: Type.body.letterSpacing,
      lineHeight: Type.body.lineHeight,
    },
    categoryDesc: {
      fontSize: Type.caption.size,
      fontFamily: Typography.family.regular,
      marginTop: Space.xs - 3,
      letterSpacing: Type.caption.letterSpacing,
      lineHeight: Type.caption.lineHeight,
    },
    stateCard: {
      borderRadius: Radius.lg,
      borderWidth: StyleSheet.hairlineWidth,
      padding: Space.xl,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: Space.lg,
      gap: Space.sm,
    },
    stateTitle: {
      fontSize: Type.bodyEmphasis.size,
      fontFamily: Typography.family.semibold,
      letterSpacing: Type.bodyEmphasis.letterSpacing,
      lineHeight: Type.bodyEmphasis.lineHeight,
    },
    stateSubtitle: {
      fontSize: Type.body.size,
      fontFamily: Typography.family.regular,
      letterSpacing: Type.body.letterSpacing,
      lineHeight: Type.body.lineHeight,
      textAlign: 'center',
    },
    successCard: {
      borderRadius: Radius.lg,
      borderWidth: Stroke.standard,
      padding: Space.md,
      marginBottom: Space.lg,
    },
    successHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.sm,
      marginBottom: Space.md,
    },
    successIcon: {
      width: Control.chrome,
      height: Control.chrome,
      borderRadius: Radius.full,
      alignItems: 'center',
      justifyContent: 'center',
    },
    successHeaderText: {
      flex: 1,
    },
    successTitle: {
      fontSize: Type.bodyEmphasis.size,
      fontFamily: Typography.family.semibold,
      letterSpacing: Type.bodyEmphasis.letterSpacing,
      lineHeight: Type.bodyEmphasis.lineHeight,
    },
    successSubtitle: {
      fontSize: Type.caption.size,
      fontFamily: Typography.family.regular,
      marginTop: Space.xs - 3,
      letterSpacing: Type.caption.letterSpacing,
      lineHeight: Type.caption.lineHeight,
    },
    detailRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: Space.sm,
      borderBottomWidth: StyleSheet.hairlineWidth,
      gap: Space.md,
    },
    detailLabel: {
      fontSize: Type.caption.size,
      fontFamily: Typography.family.regular,
      letterSpacing: Type.caption.letterSpacing,
    },
    detailValue: {
      fontSize: Type.body.size,
      fontFamily: Typography.family.semibold,
      letterSpacing: Type.body.letterSpacing,
      flexShrink: 1,
      textAlign: 'right',
    },
    successFootnote: {
      fontSize: Type.caption.size,
      fontFamily: Typography.family.regular,
      lineHeight: Type.caption.lineHeight + 2,
      letterSpacing: Type.caption.letterSpacing,
      marginTop: Space.md,
    },
    errorCard: {
      borderRadius: Radius.lg,
      borderWidth: Stroke.standard,
      padding: Space.md,
      marginBottom: Space.lg,
    },
    errorHeader: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: Space.sm,
    },
    errorIcon: {
      width: Control.chrome,
      height: Control.chrome,
      borderRadius: Radius.full,
      alignItems: 'center',
      justifyContent: 'center',
    },
    errorHeaderText: {
      flex: 1,
    },
    errorTitle: {
      fontSize: Type.bodyEmphasis.size,
      fontFamily: Typography.family.semibold,
      letterSpacing: Type.bodyEmphasis.letterSpacing,
      lineHeight: Type.bodyEmphasis.lineHeight,
    },
    errorSubtitle: {
      fontSize: Type.body.size,
      fontFamily: Typography.family.regular,
      marginTop: Space.xs,
      letterSpacing: Type.body.letterSpacing,
      lineHeight: Type.body.lineHeight + 2,
    },
    actionSection: {
      gap: Space.sm,
      marginTop: Space.sm,
    },
    fullWidth: {
      width: '100%',
    },
  });
}
