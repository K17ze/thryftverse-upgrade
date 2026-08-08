import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Reanimated, { FadeInDown } from 'react-native-reanimated';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAppTheme, type ThemeColors } from '../theme/ThemeContext';
import { Space, Radius, Type, Typography } from '../theme/designTokens';
import { RootStackParamList } from '../navigation/types';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { AppButton } from '../components/ui/AppButton';
import { FlagshipScreen, FlagshipHeader, FlagshipState } from '../components/flagship';
import { SellerStandardsBadges } from '../components/profile/SellerStandardsBadges';
import { useStore } from '../store/useStore';
import { useSellerTrust } from '../platform/product';
import { fetchUserListingsFromApi, ListingApiItem } from '../services/listingsApi';

type NavT = NativeStackNavigationProp<RootStackParamList>;

interface HubStat {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  value: string;
  tone: 'default' | 'success' | 'brand';
}

interface HubAction {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  subtitle: string;
  onPress: () => void;
  accessibilityLabel: string;
}

import { useReducedMotion } from '../hooks/useReducedMotion';
export default function SellerHubScreen() {
  const { colors } = useAppTheme();
  const reducedMotionEnabled = useReducedMotion();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const navigation = useNavigation<NavT>();
  const currentUser = useStore((s) => s.currentUser);
  const { data: sellerTrust } = useSellerTrust(currentUser?.id);

  const [listings, setListings] = useState<ListingApiItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!currentUser?.id) return;
    try {
      const res = await fetchUserListingsFromApi(currentUser.id, { limit: 100 });
      setListings(res.items);
    } catch {
      // silent — empty state will show
    }
  }, [currentUser?.id]);

  useEffect(() => {
    let mounted = true;
    setIsLoading(true);
    load().finally(() => { if (mounted) setIsLoading(false); });
    return () => { mounted = false; };
  }, [load]);

  const onRefresh = async () => {
    setIsRefreshing(true);
    await load();
    setIsRefreshing(false);
  };

  const stats = useMemo<HubStat[]>(() => {
    const active = listings.filter((l) => l.status === 'active');
    const sold = listings.filter((l) => l.status === 'sold');
    const totalActiveValue = active.reduce((sum, l) => sum + l.priceGbp, 0);
    const totalSoldValue = sold.reduce((sum, l) => sum + l.priceGbp, 0);
    const totalViews = listings.reduce((sum, l) => sum + (l.engagement?.views ?? 0), 0);
    const totalLikes = listings.reduce((sum, l) => sum + (l.engagement?.likes ?? 0), 0);
    const conversionRate = totalViews > 0 ? (sold.length / totalViews) * 100 : 0;

    return [
      { icon: 'pricetag-outline', label: 'Active listings', value: String(active.length), tone: 'success' },
      { icon: 'checkmark-done', label: 'Sold', value: String(sold.length), tone: 'brand' },
      { icon: 'cash-outline', label: 'Active value', value: `£${totalActiveValue.toFixed(0)}`, tone: 'default' },
      { icon: 'trending-up-outline', label: 'Revenue', value: `£${totalSoldValue.toFixed(0)}`, tone: 'default' },
      { icon: 'eye-outline', label: 'Total views', value: String(totalViews), tone: 'default' },
      { icon: 'heart-outline', label: 'Total likes', value: String(totalLikes), tone: 'default' },
      { icon: 'stats-chart-outline', label: 'Conversion', value: `${conversionRate.toFixed(1)}%`, tone: 'default' },
      { icon: 'pause-outline', label: 'Paused', value: String(listings.filter((l) => l.status === 'paused').length), tone: 'default' },
    ];
  }, [listings]);

  const actions = useMemo<HubAction[]>(() => [
    {
      icon: 'add-circle-outline',
      label: 'Create listing',
      subtitle: 'List a new item for sale',
      onPress: () => navigation.navigate('Sell'),
      accessibilityLabel: 'Create a new listing',
    },
    {
      icon: 'list-outline',
      label: 'My listings',
      subtitle: 'Manage active and sold listings',
      onPress: () => navigation.navigate('MyListings'),
      accessibilityLabel: 'View all your listings',
    },
    {
      icon: 'grid-outline',
      label: 'Inventory',
      subtitle: 'Full inventory dashboard with filters and bulk actions',
      onPress: () => navigation.navigate('InventoryManagement'),
      accessibilityLabel: 'Open full inventory management',
    },
    {
      icon: 'bar-chart-outline',
      label: 'Analytics',
      subtitle: 'Views, likes, conversion and revenue',
      onPress: () => navigation.navigate('SellerAnalytics'),
      accessibilityLabel: 'View seller analytics dashboard',
    },
    {
      icon: 'pulse-outline',
      label: 'Creator Analytics',
      subtitle: 'Content views, engagement and insights',
      onPress: () => navigation.navigate('CreatorAnalyticsDashboard'),
      accessibilityLabel: 'View creator analytics dashboard',
    },
    {
      icon: 'trophy-outline',
      label: 'Auctions',
      subtitle: 'Auction listings',
      onPress: () => navigation.navigate('SellerAuctionCentre'),
      accessibilityLabel: 'Auctions',
    },
    {
      icon: 'receipt-outline',
      label: 'Orders',
      subtitle: 'View and fulfil orders',
      onPress: () => navigation.navigate('MyOrders'),
      accessibilityLabel: 'Orders',
    },
    {
      icon: 'wallet-outline',
      label: 'Payouts',
      subtitle: 'Withdraw your earnings',
      onPress: () => navigation.navigate('Wallet'),
      accessibilityLabel: 'Wallet and payouts',
    },
    {
      icon: 'shield-checkmark-outline',
      label: 'Verification',
      subtitle: 'ID, phone and seller standards',
      onPress: () => navigation.navigate('Verification'),
      accessibilityLabel: 'Verification status',
    },
  ], [navigation]);

  if (isLoading) {
    return (
      <FlagshipScreen
        header={<FlagshipHeader title="Seller Hub" onBack={() => navigation.goBack()} />}
      >
        <FlagshipState variant="loading" />
      </FlagshipScreen>
    );
  }

  const activeCount = listings.filter((l) => l.status === 'active').length;
  const soldCount = listings.filter((l) => l.status === 'sold').length;

  return (
    <FlagshipScreen
      header={<FlagshipHeader title="Seller Hub" onBack={() => navigation.goBack()} />}
      scrollEnabled={false}
      contentStyle={{ paddingHorizontal: 0, paddingTop: 0 }}
    >
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor={colors.brand} />}
      >
        {/* Hero summary — seller overview */}
        <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(300)}>
          <View style={[styles.heroCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.heroRow}>
              <View style={[styles.heroIcon, { backgroundColor: colors.brand }]}>
                <Ionicons name="storefront" size={18} color={colors.textInverse} />
              </View>
              <View style={styles.heroText}>
                <Text style={[styles.heroTitle, { color: colors.textPrimary }]}>
                  {activeCount} active, {soldCount} sold
                </Text>
                <Text style={[styles.heroSubtitle, { color: colors.textSecondary }]}>
                  {listings.length} total listing{listings.length === 1 ? '' : 's'}
                </Text>
              </View>
            </View>
          </View>
        </Reanimated.View>

        {/* Seller standards badges */}
        {sellerTrust ? (
          <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(300).delay(60)} style={styles.badgeSection}>
            <SellerStandardsBadges sellerTrust={sellerTrust} align="left" />
          </Reanimated.View>
        ) : null}

        {/* Get Verified CTA — shown when seller is not yet verified */}
        {sellerTrust && !sellerTrust.verified ? (
          <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(300).delay(90)}>
            <View style={[styles.verifyCta, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={styles.verifyCtaInfo}>
                <Ionicons name="shield-checkmark-outline" size={20} color={colors.brand} />
                <View style={styles.verifyCtaText}>
                  <Text style={[styles.verifyCtaTitle, { color: colors.textPrimary }]}>Get verified</Text>
                  <Text style={[styles.verifyCtaSubtitle, { color: colors.textMuted }]}>
                    Build buyer trust with a verified badge
                  </Text>
                </View>
              </View>
              <AnimatedPressable
                style={[styles.verifyCtaBtn, { backgroundColor: colors.brand }]}
                onPress={() => navigation.navigate('KYCVerification')}
                hapticFeedback="medium"
                accessibilityRole="button"
                accessibilityLabel="Start identity verification"
              >
                <Text style={[styles.verifyCtaBtnText, { color: colors.textInverse }]}>Start</Text>
              </AnimatedPressable>
            </View>
          </Reanimated.View>
        ) : null}

        {/* Analytics dashboard */}
        <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(300).delay(120)}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Performance overview</Text>
          </View>
          <View style={styles.statsGrid}>
            {stats.map((stat) => {
              const color = stat.tone === 'success' ? colors.success : stat.tone === 'brand' ? colors.brand : colors.textPrimary;
              return (
                <View key={stat.label} style={[styles.statCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <Ionicons name={stat.icon} size={16} color={color} />
                  <Text style={[styles.statValue, { color }]}>{stat.value}</Text>
                  <Text style={[styles.statLabel, { color: colors.textMuted }]}>{stat.label}</Text>
                </View>
              );
            })}
          </View>
        </Reanimated.View>

        {/* Quick actions */}
        <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(300).delay(180)}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Seller tools</Text>
          </View>
          <View style={styles.actionsList}>
            {actions.map((action) => (
              <AnimatedPressable
                key={action.label}
                style={[styles.actionRow, { backgroundColor: colors.surface, borderColor: colors.border }]}
                onPress={action.onPress}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel={action.accessibilityLabel}
              >
                <View style={styles.actionIconWrap}>
                  <Ionicons name={action.icon} size={20} color={colors.brand} />
                </View>
                <View style={styles.actionInfo}>
                  <Text style={[styles.actionLabel, { color: colors.textPrimary }]}>{action.label}</Text>
                  <Text style={[styles.actionSubtitle, { color: colors.textMuted }]}>{action.subtitle}</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
              </AnimatedPressable>
            ))}
          </View>
        </Reanimated.View>

        {/* Primary CTA */}
        <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(300).delay(240)}>
          <AppButton
            title="Create new listing"
            icon={<Ionicons name="add-circle-outline" size={18} color={colors.background} />}
            variant="primary"
            size="lg"
            style={styles.ctaBtn}
            onPress={() => navigation.navigate('Sell')}
            accessibilityLabel="Create a new listing"
            hapticFeedback="light"
          />
        </Reanimated.View>
      </ScrollView>
    </FlagshipScreen>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
  heroCard: {
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Space.md,
    marginBottom: Space.md,
  },
  heroRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
  },
  heroIcon: {
    width: Space.xl + Space.xs + 4,
    height: Space.xl + Space.xs + 4,
    borderRadius: Radius.full,
    justifyContent: 'center',
    alignItems: 'center',
  },
  heroText: { flex: 1 },
  heroTitle: {
    fontSize: Type.bodyEmphasis.size,
    fontFamily: Typography.family.semibold,
    letterSpacing: Type.body.letterSpacing,
  },
  heroSubtitle: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.regular,
    marginTop: Space.xs - 2,
  },
  scrollContent: {
    paddingHorizontal: Space.md,
    paddingBottom: Space.xl,
  },
  badgeSection: {
    marginBottom: Space.md,
  },
  sectionHeader: {
    marginTop: Space.md,
    marginBottom: Space.sm,
  },
  sectionTitle: {
    fontSize: Type.subtitle.size,
    fontFamily: Typography.family.semibold,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Space.xs,
  },
  statCard: {
    flex: 1,
    minWidth: '47%',
    paddingHorizontal: Space.sm,
    paddingVertical: Space.sm + 2,
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    gap: Space.xs / 2,
  },
  statValue: {
    fontSize: Type.subtitle.size,
    fontFamily: Typography.family.bold,
  },
  statLabel: {
    fontSize: Type.meta.size,
    fontFamily: Typography.family.regular,
  },
  actionsList: {
    gap: Space.xs,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm + 2,
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  actionIconWrap: {
    width: Space.xl + Space.xs + 4,
    height: Space.xl + Space.xs + 4,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionInfo: {
    flex: 1,
    gap: Space.xs / 2,
  },
  actionLabel: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.semibold,
    color: colors.textPrimary,
  },
  actionSubtitle: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.regular,
    color: colors.textMuted,
  },
  ctaBtn: {
    marginTop: Space.lg,
  },
  verifyCta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Space.sm,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm + 2,
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: Space.md,
  },
  verifyCtaInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    flex: 1,
  },
  verifyCtaText: {
    flex: 1,
    gap: Space.xs / 2,
  },
  verifyCtaTitle: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.semibold,
  },
  verifyCtaSubtitle: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.regular,
  },
  verifyCtaBtn: {
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
    borderRadius: Radius.md,
  },
  verifyCtaBtnText: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.bold,
  },
  });
}
