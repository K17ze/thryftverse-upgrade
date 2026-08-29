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
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useAppTheme, type ThemeColors } from '../theme/ThemeContext';
import { Space, Radius } from '../theme/designTokens';
import { TypographyV2 } from '../theme/typography.v2';
import { useHaptic } from '../hooks/useHaptic';
import { useToast } from '../context/ToastContext';
import { FlagshipScreen, FlagshipHeader } from '../components/flagship';
import { CoOwnActivitySkeleton } from '../components/coown/CoOwnSkeletons';
import { AppButton } from '../components/ui/AppButton';
import { EmptyState } from '../components/EmptyState';
import { SettingsSection } from '../components/settings/SettingsSection';
import { SettingsRow } from '../components/settings/SettingsRow';
import { fetchCoOwnTaxDocument, type CoOwnTaxDocument } from '../services/marketApi';
import { RootStackParamList } from '../navigation/types';
import { useFormattedPrice } from '../hooks/useFormattedPrice';

type Props = NativeStackScreenProps<RootStackParamList, 'CoOwnTaxDocuments'>;

function formatGbp(minor: number, currencySymbol: string): string {
  const sign = minor < 0 ? '-' : '';
  return `${sign}${currencySymbol}${Math.abs(minor / 100).toFixed(2)}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function CoOwnTaxDocumentsScreen({ navigation }: Props) {
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const haptic = useHaptic();
  const { show } = useToast();
  const { currencySymbol } = useFormattedPrice();

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
    const summary = `ThryftVerse Tax Statement ${doc.taxYear}\n\nPurchases: ${formatGbp(doc.summary.totalPurchasesGbpMinor, currencySymbol)}\nSales: ${formatGbp(doc.summary.totalSalesGbpMinor, currencySymbol)}\nDistributions: ${formatGbp(doc.summary.totalDistributionsGbpMinor, currencySymbol)}\nRealized P&L: ${formatGbp(doc.summary.realizedPnlGbpMinor, currencySymbol)}\n\nGenerated: ${formatDate(doc.generatedAt)}`;
    try {
      await Share.share({ message: summary, title: `ThryftVerse Tax Statement ${doc.taxYear}` });
    } catch {
      // User cancelled — silent
    }
  };

  if (isLoading) {
    return (
      <FlagshipScreen
        header={
          <FlagshipHeader
            title="Tax Documents"
            onBack={() => navigation.goBack()}
          />
        }
        scrollEnabled={false}
      >
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <CoOwnActivitySkeleton />
        </ScrollView>
      </FlagshipScreen>
    );
  }

  const pnlPositive = (doc?.summary.realizedPnlGbpMinor ?? 0) >= 0;

  return (
    <FlagshipScreen
      header={
        <FlagshipHeader
          title="Tax Documents"
          onBack={() => navigation.goBack()}
        />
      }
      scrollEnabled={false}
    >
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
            {/* Hero — tax year with P&L as dominant number (flat, no card) */}
            <View style={styles.heroWrap}>
              <Text style={styles.heroYear}>Tax Year {doc.taxYear}</Text>
              <Text style={styles.heroPeriod}>
                {formatDate(doc.startDate)} – {formatDate(doc.endDate)}
              </Text>
              {/* P&L as the dominant number */}
              <View style={styles.heroPnlWrap}>
                <Text style={styles.heroPnlLabel}>Realized P&L</Text>
                <Text style={[styles.heroPnlValue, { color: pnlPositive ? colors.success : colors.danger }]}>
                  {formatGbp(doc.summary.realizedPnlGbpMinor, currencySymbol)}
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

            {/* Summary breakdown */}
            <SettingsSection title="Summary">
              <SettingsRow title="Total purchases" icon="add-circle-outline" isFirst>
                <Text style={[styles.financialValue, { color: colors.textPrimary }]}>
                  {formatGbp(doc.summary.totalPurchasesGbpMinor, currencySymbol)}
                </Text>
              </SettingsRow>
              <SettingsRow title="Total sales" icon="remove-circle-outline">
                <Text style={[styles.financialValue, { color: colors.textPrimary }]}>
                  {formatGbp(doc.summary.totalSalesGbpMinor, currencySymbol)}
                </Text>
              </SettingsRow>
              <SettingsRow title="Distributions" icon="cash-outline" isLast>
                <Text style={[styles.financialValue, { color: colors.textPrimary }]}>
                  {formatGbp(doc.summary.totalDistributionsGbpMinor, currencySymbol)}
                </Text>
              </SettingsRow>
            </SettingsSection>

            {/* Purchases breakdown */}
            {doc.purchases.length > 0 && (
              <SettingsSection title="Purchases by asset">
                {doc.purchases.map((p, i) => (
                  <SettingsRow
                    key={p.assetId}
                    title={p.assetId.slice(0, 16) + '…'}
                    subtitle={`${p.units} units · ${p.executionCount} trades`}
                    isFirst={i === 0}
                    isLast={i === doc.purchases.length - 1}
                  >
                    <Text style={[styles.financialValue, { color: colors.textPrimary }]}>
                      {formatGbp(p.totalGbpMinor, currencySymbol)}
                    </Text>
                  </SettingsRow>
                ))}
              </SettingsSection>
            )}

            {/* Sales breakdown */}
            {doc.sales.length > 0 && (
              <SettingsSection title="Sales by asset">
                {doc.sales.map((s, i) => (
                  <SettingsRow
                    key={s.assetId}
                    title={s.assetId.slice(0, 16) + '…'}
                    subtitle={`${s.units} units · ${s.executionCount} trades`}
                    isFirst={i === 0}
                    isLast={i === doc.sales.length - 1}
                  >
                    <Text style={[styles.financialValue, { color: colors.textPrimary }]}>
                      {formatGbp(s.totalGbpMinor, currencySymbol)}
                    </Text>
                  </SettingsRow>
                ))}
              </SettingsSection>
            )}

            {/* Distributions breakdown */}
            {doc.distributions.length > 0 && (
              <SettingsSection title="Distributions by asset">
                {doc.distributions.map((d, i) => (
                  <SettingsRow
                    key={d.assetId}
                    title={d.assetId.slice(0, 16) + '…'}
                    subtitle={`${d.count} payments`}
                    isFirst={i === 0}
                    isLast={i === doc.distributions.length - 1}
                  >
                    <Text style={[styles.financialValue, { color: colors.textPrimary }]}>
                      {formatGbp(d.totalGbpMinor, currencySymbol)}
                    </Text>
                  </SettingsRow>
                ))}
              </SettingsSection>
            )}

            {/* Disclaimer — flat, no card */}
            <View style={styles.disclaimerWrap}>
              <Text style={styles.disclaimerTitle}>For information only</Text>
              <Text style={styles.disclaimerText}>
                This statement does not constitute tax advice. Consult a qualified tax professional for guidance on your specific circumstances.
              </Text>
            </View>

            <Text style={styles.generatedAt}>Generated {formatDate(doc.generatedAt)}</Text>

            {/* Share */}
            <AppButton
              title="Share summary"
              onPress={handleShare}
              variant="secondary"
              size="md"
              hapticFeedback="light"
              icon={<Ionicons name="share-outline" size={18} color={colors.textPrimary} />}
              style={{ marginTop: Space.md }}
            />

            <View style={{ height: Space.xxl }} />
          </>
        )}
      </ScrollView>
    </FlagshipScreen>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    loadingBody: { flex: 1 },
    scrollContent: { paddingHorizontal: Space.md, paddingBottom: Space.xl },

    // Hero — flat, no card. P&L dominant number.
    heroWrap: {
      marginTop: Space.sm,
      paddingHorizontal: Space.xs,
    },
    heroYear: {
      fontSize: TypographyV2.sectionTitle.size,
      fontFamily: TypographyV2.sectionTitle.fontFamily,
      color: colors.textPrimary,
      letterSpacing: TypographyV2.sectionTitle.letterSpacing,
    },
    heroPeriod: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      color: colors.textSecondary,
      letterSpacing: TypographyV2.meta.letterSpacing,
      lineHeight: TypographyV2.meta.lineHeight,
      marginTop: Space.xs / 2,
    },
    heroPnlWrap: {
      marginTop: Space.lg,
      alignItems: 'center',
      gap: Space.xs,
    },
    heroPnlLabel: {
      fontSize: TypographyV2.label.size,
      fontFamily: TypographyV2.label.fontFamily,
      color: colors.textMuted,
      textTransform: 'uppercase',
      letterSpacing: TypographyV2.label.letterSpacing,
    },
    heroPnlValue: {
      fontSize: TypographyV2.priceHero.size,
      fontFamily: TypographyV2.priceHero.fontFamily,
      fontVariant: ['tabular-nums'],
      letterSpacing: TypographyV2.priceHero.letterSpacing,
      lineHeight: TypographyV2.priceHero.lineHeight,
    },
    heroPnlBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs,
      borderRadius: Radius.full,
      paddingHorizontal: Space.sm + 2,
      paddingVertical: Space.xs - 1,
    },
    heroPnlBadgeText: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      letterSpacing: TypographyV2.meta.letterSpacing,
    },

    // Disclaimer — flat, no card
    disclaimerWrap: {
      marginTop: Space.lg,
      paddingHorizontal: Space.xs,
    },
    disclaimerTitle: {
      fontSize: TypographyV2.bodyStrong.size,
      fontFamily: TypographyV2.bodyStrong.fontFamily,
      color: colors.textPrimary,
      letterSpacing: TypographyV2.bodyStrong.letterSpacing,
      lineHeight: TypographyV2.bodyStrong.lineHeight,
      marginBottom: Space.xs / 2,
    },
    disclaimerText: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      color: colors.textMuted,
      letterSpacing: TypographyV2.meta.letterSpacing,
      lineHeight: TypographyV2.meta.lineHeight,
    },
    generatedAt: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      color: colors.textMuted,
      letterSpacing: TypographyV2.meta.letterSpacing,
      lineHeight: TypographyV2.meta.lineHeight,
      textAlign: 'center',
      marginTop: Space.md,
    },
    financialValue: {
      fontSize: TypographyV2.bodyStrong.size,
      fontFamily: TypographyV2.bodyStrong.fontFamily,
      fontVariant: ['tabular-nums'],
    },
  });
}
