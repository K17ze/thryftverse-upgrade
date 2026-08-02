/**
 * CoOwnTaxDocumentsScreen — annual tax statement for Co-Own holdings.
 *
 * Generates a tax-year summary of purchases, sales, distributions, and
 * realized P&L. Supports UK tax year (April 6 – April 5).
 */

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  Share,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { StackScreenProps } from '@react-navigation/stack';
import { useAppTheme, type ThemeColors } from '../theme/ThemeContext';
import { Space, Radius, Type, Typography } from '../theme/designTokens';
import { useHaptic } from '../hooks/useHaptic';
import { useToast } from '../context/ToastContext';
import { ScreenHeader } from '../components/ui/ScreenHeader';
import { AppButton } from '../components/ui/AppButton';
import { EmptyState } from '../components/EmptyState';
import { fetchCoOwnTaxDocument, type CoOwnTaxDocument } from '../services/marketApi';
import { RootStackParamList } from '../navigation/types';

type Props = StackScreenProps<RootStackParamList, 'CoOwnTaxDocuments'>;

function formatGbp(minor: number): string {
  const sign = minor < 0 ? '-' : '';
  return `${sign}£${Math.abs(minor / 100).toFixed(2)}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function CoOwnTaxDocumentsScreen({ navigation }: Props) {
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const haptic = useHaptic();
  const { show } = useToast();

  const [doc, setDoc] = React.useState<CoOwnTaxDocument | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isRefreshing, setIsRefreshing] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    try {
      setError(null);
      const data = await fetchCoOwnTaxDocument();
      setDoc(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load tax document');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  const handleShare = async () => {
    if (!doc) return;
    haptic.light();
    const summary = `ThryftVerse Tax Statement ${doc.taxYear}\n\nPurchases: ${formatGbp(doc.summary.totalPurchasesGbpMinor)}\nSales: ${formatGbp(doc.summary.totalSalesGbpMinor)}\nDistributions: ${formatGbp(doc.summary.totalDistributionsGbpMinor)}\nRealized P&L: ${formatGbp(doc.summary.realizedPnlGbpMinor)}\n\nGenerated: ${formatDate(doc.generatedAt)}`;
    try {
      await Share.share({ message: summary, title: `ThryftVerse Tax Statement ${doc.taxYear}` });
    } catch {
      // User cancelled — silent
    }
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <ScreenHeader title="Tax Documents" onBack={() => navigation.goBack()} />
        <View style={styles.loadingBody}>
          <ActivityIndicator size="large" color={colors.brand} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScreenHeader title="Tax Documents" onBack={() => navigation.goBack()} />
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={() => { setIsRefreshing(true); void load(); }} tintColor={colors.textSecondary} />}
        showsVerticalScrollIndicator={false}
      >
        {error ? (
          <EmptyState
            icon="cloud-offline-outline"
            title="Couldn't load tax document"
            subtitle={error}
            ctaLabel="Retry"
            onCtaPress={() => { setIsLoading(true); void load(); }}
          />
        ) : !doc ? (
          <EmptyState
            icon="document-text-outline"
            title="No tax data available"
            subtitle="Your tax statement will appear here once you have Co-Own trading activity."
          />
        ) : (
          <>
            {/* Tax year header */}
            <View style={styles.yearCard}>
              <View style={styles.yearHeader}>
                <Ionicons name="document-text" size={24} color={colors.brand} />
                <View>
                  <Text style={styles.yearTitle}>Tax Year {doc.taxYear}</Text>
                  <Text style={styles.yearPeriod}>
                    {formatDate(doc.startDate)} – {formatDate(doc.endDate)}
                  </Text>
                </View>
              </View>
            </View>

            {/* Summary */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Summary</Text>
              <View style={styles.summaryCard}>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Total purchases</Text>
                  <Text style={styles.summaryValue}>{formatGbp(doc.summary.totalPurchasesGbpMinor)}</Text>
                </View>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Total sales</Text>
                  <Text style={styles.summaryValue}>{formatGbp(doc.summary.totalSalesGbpMinor)}</Text>
                </View>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Distributions received</Text>
                  <Text style={styles.summaryValue}>{formatGbp(doc.summary.totalDistributionsGbpMinor)}</Text>
                </View>
                <View style={[styles.summaryRow, styles.summaryTotalRow, { borderTopColor: colors.border }]}>
                  <Text style={styles.summaryTotalLabel}>Realized P&L</Text>
                  <Text
                    style={[
                      styles.summaryTotalValue,
                      { color: doc.summary.realizedPnlGbpMinor >= 0 ? colors.success : colors.danger },
                    ]}
                  >
                    {formatGbp(doc.summary.realizedPnlGbpMinor)}
                  </Text>
                </View>
              </View>
            </View>

            {/* Purchases breakdown */}
            {doc.purchases.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Purchases by Asset</Text>
                <View style={styles.breakdownCard}>
                  {doc.purchases.map((p, i) => (
                    <View key={p.assetId} style={[styles.breakdownRow, i < doc.purchases.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.borderSubtle }]}>
                      <View style={styles.breakdownInfo}>
                        <Text style={styles.breakdownAsset}>{p.assetId.slice(0, 16)}…</Text>
                        <Text style={styles.breakdownMeta}>{p.units} units · {p.executionCount} trades</Text>
                      </View>
                      <Text style={styles.breakdownValue}>{formatGbp(p.totalGbpMinor)}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}

            {/* Sales breakdown */}
            {doc.sales.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Sales by Asset</Text>
                <View style={styles.breakdownCard}>
                  {doc.sales.map((s, i) => (
                    <View key={s.assetId} style={[styles.breakdownRow, i < doc.sales.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.borderSubtle }]}>
                      <View style={styles.breakdownInfo}>
                        <Text style={styles.breakdownAsset}>{s.assetId.slice(0, 16)}…</Text>
                        <Text style={styles.breakdownMeta}>{s.units} units · {s.executionCount} trades</Text>
                      </View>
                      <Text style={styles.breakdownValue}>{formatGbp(s.totalGbpMinor)}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}

            {/* Distributions breakdown */}
            {doc.distributions.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Distributions by Asset</Text>
                <View style={styles.breakdownCard}>
                  {doc.distributions.map((d, i) => (
                    <View key={d.assetId} style={[styles.breakdownRow, i < doc.distributions.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.borderSubtle }]}>
                      <View style={styles.breakdownInfo}>
                        <Text style={styles.breakdownAsset}>{d.assetId.slice(0, 16)}…</Text>
                        <Text style={styles.breakdownMeta}>{d.count} payments</Text>
                      </View>
                      <Text style={styles.breakdownValue}>{formatGbp(d.totalGbpMinor)}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}

            {/* Disclaimer */}
            <View style={styles.disclaimer}>
              <Ionicons name="information-circle-outline" size={16} color={colors.textMuted} />
              <Text style={styles.disclaimerText}>
                This statement is for informational purposes only and does not constitute tax advice. Please consult a qualified tax professional for guidance on your specific circumstances.
              </Text>
            </View>

            <Text style={styles.generatedAt}>Generated {formatDate(doc.generatedAt)}</Text>

            {/* Share */}
            <AppButton
              title="Share summary"
              onPress={handleShare}
              variant="secondary"
              size="md"
              icon={<Ionicons name="share-outline" size={18} color={colors.textPrimary} />}
              style={{ marginTop: Space.md }}
            />

            <View style={{ height: 40 }} />
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    loadingBody: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    scrollContent: { paddingHorizontal: Space.md, paddingBottom: Space.xl },
    yearCard: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: colors.surface,
      borderRadius: Radius.lg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      padding: Space.md,
      marginTop: Space.md,
    },
    yearHeader: { flexDirection: 'row', alignItems: 'center', gap: Space.md },
    yearTitle: {
      fontSize: Type.subtitle.size,
      fontFamily: Typography.family.semibold,
      color: colors.textPrimary,
    },
    yearPeriod: {
      fontSize: Type.caption.size,
      fontFamily: Typography.family.regular,
      color: colors.textSecondary,
      marginTop: 2,
    },
    section: { marginTop: Space.lg },
    sectionTitle: {
      fontSize: Type.caption.size,
      fontFamily: Typography.family.semibold,
      color: colors.textSecondary,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      marginBottom: Space.sm,
    },
    summaryCard: {
      backgroundColor: colors.surface,
      borderRadius: Radius.lg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      padding: Space.md,
    },
    summaryRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: Space.sm,
    },
    summaryTotalRow: {
      borderTopWidth: 1,
      marginTop: Space.xs,
      paddingTop: Space.md,
    },
    summaryLabel: {
      fontSize: Type.body.size,
      fontFamily: Typography.family.regular,
      color: colors.textSecondary,
    },
    summaryValue: {
      fontSize: Type.body.size,
      fontFamily: Typography.family.semibold,
      color: colors.textPrimary,
    },
    summaryTotalLabel: {
      fontSize: Type.body.size,
      fontFamily: Typography.family.bold,
      color: colors.textPrimary,
    },
    summaryTotalValue: {
      fontSize: Type.subtitle.size,
      fontFamily: Typography.family.bold,
    },
    breakdownCard: {
      backgroundColor: colors.surface,
      borderRadius: Radius.lg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      padding: Space.md,
    },
    breakdownRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: Space.sm,
    },
    breakdownInfo: { flex: 1 },
    breakdownAsset: {
      fontSize: Type.caption.size,
      fontFamily: Typography.family.semibold,
      color: colors.textPrimary,
    },
    breakdownMeta: {
      fontSize: Type.meta.size,
      fontFamily: Typography.family.regular,
      color: colors.textMuted,
      marginTop: 2,
    },
    breakdownValue: {
      fontSize: Type.body.size,
      fontFamily: Typography.family.semibold,
      color: colors.textPrimary,
    },
    disclaimer: {
      flexDirection: 'row',
      gap: Space.xs,
      marginTop: Space.lg,
      paddingHorizontal: Space.sm,
    },
    disclaimerText: {
      fontSize: Type.meta.size,
      fontFamily: Typography.family.regular,
      color: colors.textMuted,
      lineHeight: 16,
      flex: 1,
    },
    generatedAt: {
      fontSize: Type.meta.size,
      fontFamily: Typography.family.regular,
      color: colors.textMuted,
      textAlign: 'center',
      marginTop: Space.md,
    },
  });
}
