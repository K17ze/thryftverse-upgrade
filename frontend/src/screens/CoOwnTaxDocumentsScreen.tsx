/**
 * CoOwnTaxDocumentsScreen — annual tax statement for Co-Own holdings.
 *
 * Generates a tax-year summary of purchases, sales, distributions, and
 * realized P&L. Supports UK tax year (April 6 – April 5).
 *
 * Per Design.md Component G: financial UI must be truthful and legible.
 * The realized P&L is the dominant number — prices dominate commerce
 * summaries. Tabular nums for all financial values.
 */

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  Share,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { StackScreenProps } from '@react-navigation/stack';
import Reanimated, { FadeInDown } from 'react-native-reanimated';
import { useAppTheme, type ThemeColors } from '../theme/ThemeContext';
import { Space, Radius, Type, Typography } from '../theme/designTokens';
import { useHaptic } from '../hooks/useHaptic';
import { useToast } from '../context/ToastContext';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { ScreenHeader } from '../components/ui/ScreenHeader';
import { CoOwnActivitySkeleton } from '../components/coown/CoOwnSkeletons';
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
  const reducedMotionEnabled = useReducedMotion();

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
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <CoOwnActivitySkeleton />
        </ScrollView>
      </SafeAreaView>
    );
  }

  const pnlPositive = (doc?.summary.realizedPnlGbpMinor ?? 0) >= 0;

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
            {/* Hero — tax year with P&L as dominant number */}
            <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(300)}>
              <View style={styles.heroCard}>
                <View style={styles.heroTop}>
                  <View style={styles.heroIconWrap}>
                    <Ionicons name="document-text" size={22} color={colors.textInverse} />
                  </View>
                  <View style={styles.heroYearWrap}>
                    <Text style={styles.heroYear}>Tax Year {doc.taxYear}</Text>
                    <Text style={styles.heroPeriod}>
                      {formatDate(doc.startDate)} – {formatDate(doc.endDate)}
                    </Text>
                  </View>
                </View>
                {/* P&L as the dominant number */}
                <View style={styles.heroPnlWrap}>
                  <Text style={styles.heroPnlLabel}>Realized P&L</Text>
                  <Text style={[styles.heroPnlValue, { color: pnlPositive ? colors.success : colors.danger }]}>
                    {formatGbp(doc.summary.realizedPnlGbpMinor)}
                  </Text>
                  <View style={[styles.heroPnlBadge, { backgroundColor: (pnlPositive ? colors.success : colors.danger) + '18' }]}>
                    <Ionicons
                      name={pnlPositive ? 'arrow-up' : 'arrow-down'}
                      size={12}
                      color={pnlPositive ? colors.success : colors.danger}
                    />
                    <Text style={[styles.heroPnlBadgeText, { color: pnlPositive ? colors.success : colors.danger }]}>
                      {pnlPositive ? 'Profit' : 'Loss'}
                    </Text>
                  </View>
                </View>
              </View>
            </Reanimated.View>

            {/* Summary breakdown */}
            <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(300).delay(80)}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Summary</Text>
              </View>
              <View style={styles.summaryCard}>
                <View style={styles.summaryRow}>
                  <View style={styles.summaryIconWrap}>
                    <Ionicons name="add-circle-outline" size={18} color={colors.textSecondary} />
                  </View>
                  <Text style={styles.summaryLabel}>Total purchases</Text>
                  <Text style={styles.summaryValue}>{formatGbp(doc.summary.totalPurchasesGbpMinor)}</Text>
                </View>
                <View style={[styles.summaryRow, styles.summaryRowBorder, { borderBottomColor: colors.borderSubtle }]}>
                  <View style={styles.summaryIconWrap}>
                    <Ionicons name="remove-circle-outline" size={18} color={colors.textSecondary} />
                  </View>
                  <Text style={styles.summaryLabel}>Total sales</Text>
                  <Text style={styles.summaryValue}>{formatGbp(doc.summary.totalSalesGbpMinor)}</Text>
                </View>
                <View style={styles.summaryRow}>
                  <View style={styles.summaryIconWrap}>
                    <Ionicons name="cash-outline" size={18} color={colors.textSecondary} />
                  </View>
                  <Text style={styles.summaryLabel}>Distributions</Text>
                  <Text style={styles.summaryValue}>{formatGbp(doc.summary.totalDistributionsGbpMinor)}</Text>
                </View>
              </View>
            </Reanimated.View>

            {/* Purchases breakdown */}
            {doc.purchases.length > 0 && (
              <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(300).delay(160)}>
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>Purchases by asset</Text>
                </View>
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
              </Reanimated.View>
            )}

            {/* Sales breakdown */}
            {doc.sales.length > 0 && (
              <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(300).delay(240)}>
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>Sales by asset</Text>
                </View>
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
              </Reanimated.View>
            )}

            {/* Distributions breakdown */}
            {doc.distributions.length > 0 && (
              <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(300).delay(320)}>
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>Distributions by asset</Text>
                </View>
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
              </Reanimated.View>
            )}

            {/* Disclaimer */}
            <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(300).delay(400)}>
              <View style={styles.disclaimerCard}>
                <View style={styles.disclaimerIconWrap}>
                  <Ionicons name="information-circle" size={18} color={colors.textMuted} />
                </View>
                <View style={styles.disclaimerTextWrap}>
                  <Text style={styles.disclaimerTitle}>For information only</Text>
                  <Text style={styles.disclaimerText}>
                    This statement does not constitute tax advice. Please consult a qualified tax professional for guidance on your specific circumstances.
                  </Text>
                </View>
              </View>
            </Reanimated.View>

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

            <View style={{ height: Space.xxl }} />
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    loadingBody: { flex: 1 },
    scrollContent: { paddingHorizontal: Space.md, paddingBottom: Space.xl },

    // Hero card — P&L dominant
    heroCard: {
      borderRadius: Radius.xl,
      backgroundColor: colors.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      padding: Space.lg,
      marginTop: Space.sm,
    },
    heroTop: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.md,
    },
    heroIconWrap: {
      width: 44,
      height: 44,
      borderRadius: Radius.full,
      backgroundColor: colors.brand,
      justifyContent: 'center',
      alignItems: 'center',
    },
    heroYearWrap: { flex: 1 },
    heroYear: {
      fontSize: Type.subtitle.size,
      fontFamily: Typography.family.semibold,
      color: colors.textPrimary,
      letterSpacing: Type.subtitle.letterSpacing,
    },
    heroPeriod: {
      fontSize: Type.caption.size,
      fontFamily: Typography.family.regular,
      color: colors.textSecondary,
      marginTop: 2,
    },
    heroPnlWrap: {
      marginTop: Space.lg,
      alignItems: 'center',
      gap: Space.xs,
    },
    heroPnlLabel: {
      fontSize: Type.meta.size,
      fontFamily: Typography.family.medium,
      color: colors.textMuted,
      textTransform: 'uppercase',
      letterSpacing: 0.8,
    },
    heroPnlValue: {
      fontSize: Type.priceLarge.size,
      fontFamily: Typography.family.bold,
      fontVariant: ['tabular-nums'],
      letterSpacing: Type.priceLarge.letterSpacing,
    },
    heroPnlBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      borderRadius: Radius.full,
      paddingHorizontal: Space.sm + 2,
      paddingVertical: 3,
    },
    heroPnlBadgeText: {
      fontSize: Type.meta.size,
      fontFamily: Typography.family.semibold,
    },

    // Section headers
    sectionHeader: {
      marginTop: Space.lg,
      marginBottom: Space.sm,
      paddingHorizontal: Space.xs,
    },
    sectionTitle: {
      fontSize: Type.meta.size,
      fontFamily: Typography.family.semibold,
      color: colors.textPrimary,
      textTransform: 'uppercase',
      letterSpacing: 0.8,
      opacity: 0.7,
    },

    // Summary card
    summaryCard: {
      backgroundColor: colors.surface,
      borderRadius: Radius.lg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      padding: Space.md,
    },
    summaryRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: Space.sm + 2,
      gap: Space.sm,
    },
    summaryRowBorder: {
      borderBottomWidth: StyleSheet.hairlineWidth,
    },
    summaryIconWrap: {
      width: 32,
      height: 32,
      borderRadius: Radius.md,
      backgroundColor: colors.surfaceAlt,
      justifyContent: 'center',
      alignItems: 'center',
    },
    summaryLabel: {
      fontSize: Type.body.size,
      fontFamily: Typography.family.regular,
      color: colors.textSecondary,
      flex: 1,
    },
    summaryValue: {
      fontSize: Type.bodyEmphasis.size,
      fontFamily: Typography.family.semibold,
      color: colors.textPrimary,
      fontVariant: ['tabular-nums'],
    },

    // Breakdown cards
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
      paddingVertical: Space.sm + 2,
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
      fontVariant: ['tabular-nums'],
    },

    // Disclaimer — elevated card
    disclaimerCard: {
      flexDirection: 'row',
      gap: Space.md,
      marginTop: Space.lg,
      backgroundColor: colors.surface,
      borderRadius: Radius.lg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      padding: Space.md,
    },
    disclaimerIconWrap: {
      width: 32,
      height: 32,
      borderRadius: Radius.full,
      backgroundColor: colors.surfaceAlt,
      justifyContent: 'center',
      alignItems: 'center',
    },
    disclaimerTextWrap: { flex: 1 },
    disclaimerTitle: {
      fontSize: Type.caption.size,
      fontFamily: Typography.family.semibold,
      color: colors.textPrimary,
      marginBottom: 2,
    },
    disclaimerText: {
      fontSize: Type.meta.size,
      fontFamily: Typography.family.regular,
      color: colors.textMuted,
      lineHeight: 16,
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
