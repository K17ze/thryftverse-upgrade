import React, { useMemo, useCallback } from 'react';
import {
  View,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { File, Paths } from 'expo-file-system';
import Share from 'react-native-share';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useAppTheme, type ThemeColors } from '../theme/ThemeContext';
import { Space } from '../theme/designTokens';
import { RootStackParamList } from '../navigation/types';
import { useStore } from '../store/useStore';
import { useToast } from '../context/ToastContext';
import { useHaptic } from '../hooks/useHaptic';
import { parseApiError } from '../lib/apiClient';
import { requestDataExport, type DataExportResult } from '../services/accountApi';
import { AppButton } from '../components/ui/AppButton';
import { FlagshipScreen, FlagshipHeader, FlagshipState } from '../components/flagship';
import { SettingsSection } from '../components/settings/SettingsSection';
import { SettingsRow } from '../components/settings/SettingsRow';
import { SettingsInfoBanner } from '../components/settings/SettingsInfoBanner';

type Props = NativeStackScreenProps<RootStackParamList, 'DataExport'>;

type ExportState = 'idle' | 'loading' | 'success' | 'error';

const DATA_CATEGORIES: { icon: React.ComponentProps<typeof Ionicons>['name']; label: string; description: string }[] = [
  { icon: 'person-outline', label: 'Profile', description: 'Username, display name, bio, avatar' },
  { icon: 'bag-handle-outline', label: 'Listings', description: 'Items you have listed for sale' },
  { icon: 'bag-outline', label: 'Orders', description: 'Order history' },
  { icon: 'chatbubble-outline', label: 'Messages', description: 'Conversations and message metadata' },
  { icon: 'wallet-outline', label: 'Wallet activity', description: 'Payouts, balance and order records' },
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
  const [isDownloading, setIsDownloading] = React.useState(false);

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

  const handleDownload = useCallback(async () => {
    if (!exportResult?.exportPayload) {
      return;
    }
    setIsDownloading(true);
    try {
      const fileName = `thryftverse-export-${exportResult.requestId}.json`;
      const file = new File(Paths.cache, fileName);
      file.write(JSON.stringify(exportResult.exportPayload, null, 2));
      await Share.open({
        url: file.uri,
        failOnCancel: false,
        type: 'application/json',
        title: 'Download your data export',
      });
      haptic.medium();
    } catch (error) {
      const parsed = parseApiError(error, 'Unable to save the export file right now.');
      show(parsed.message, 'error');
      haptic.light();
    } finally {
      setIsDownloading(false);
    }
  }, [exportResult, show, haptic]);

  const exportedCategories = useMemo(() => {
    if (!exportResult?.categories) {
      return [];
    }
    return exportResult.categories.filter((c) => c.count > 0);
  }, [exportResult?.categories]);

  return (
    <FlagshipScreen
      header={
        <FlagshipHeader
          title="Download my data"
          onBack={() => navigation.goBack()}
        />
      }
    >
      {/* ── What's included — flat rows, no card wrapper ── */}
      {exportState !== 'success' ? (
        <SettingsSection
          title="What's included"
          description="Export a copy of everything Thryftverse holds about you"
        >
          {DATA_CATEGORIES.map((category, i) => (
            <SettingsRow
              key={category.label}
              icon={category.icon}
              title={category.label}
              subtitle={category.description}
              isFirst={i === 0}
              isLast={i === DATA_CATEGORIES.length - 1}
            />
          ))}
        </SettingsSection>
      ) : null}

      {/* ── State-specific content ── */}
      {/* Loading state */}
      {exportState === 'loading' ? (
        <FlagshipState
          variant="loading"
          title="Generating your export"
          subtitle="We're collecting your data. This usually takes a few seconds."
        />
      ) : null}

      {/* Success state — flat rows, no card or decorative icon circle */}
      {exportState === 'success' && exportResult ? (
        <>
          <SettingsInfoBanner
            tone="success"
            icon="checkmark-circle"
            title="Export ready"
            description="Your data export has been generated"
          />
          <SettingsSection
            title="Export summary"
            description={`${exportResult.estimatedRecords} records across ${exportedCategories.length} categories`}
          >
            <SettingsRow
              title="Request ID"
              subtitle={exportResult.requestId}
              isFirst
              isLast={exportedCategories.length === 0}
            />
            {exportedCategories.map((category, i) => (
              <SettingsRow
                key={category.key}
                title={category.label}
                value={String(category.count)}
                isFirst={false}
                isLast={i === exportedCategories.length - 1}
              />
            ))}
          </SettingsSection>
        </>
      ) : null}

      {/* Error state — flat, no card or decorative icon circle */}
      {exportState === 'error' ? (
        <>
          <SettingsInfoBanner
            tone="error"
            icon="alert-circle-outline"
            title="Export failed"
            description={exportError ?? 'Something went wrong'}
          />
          <SettingsSection title="Export failed">
            <SettingsRow
              icon="alert-circle-outline"
              iconColor={colors.danger}
              title={exportError ?? 'Something went wrong while generating your export.'}
              isFirst
              isLast
            />
          </SettingsSection>
        </>
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
                title={isDownloading ? 'Preparing file...' : 'Download JSON'}
                variant="primary"
                size="lg"
                onPress={handleDownload}
                loading={isDownloading}
                disabled={isDownloading}
                hapticFeedback="medium"
                accessibilityLabel="Download your data export as a JSON file"
                accessibilityHint="Saves a JSON file containing all your exported account data"
                style={styles.fullWidth}
              />
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
              accessibilityHint="Generates a copy of your account data"
              style={styles.fullWidth}
            />
          )}
        </View>
    </FlagshipScreen>
  );
}

function createStyles(_colors: ThemeColors) {
  return StyleSheet.create({
    actionSection: {
      gap: Space.sm,
      marginTop: Space.sm,
    },
    fullWidth: {
      width: '100%',
    },
  });
}
