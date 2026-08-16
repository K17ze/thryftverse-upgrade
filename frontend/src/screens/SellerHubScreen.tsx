import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAppTheme, type ThemeColors } from '../theme/ThemeContext';
import { Space, FontFamily } from '../theme/designTokens';
import { TypographyV2 } from '../theme/typography.v2';
import { RootStackParamList } from '../navigation/types';

import { AppButton } from '../components/ui/AppButton';
import {
  FlagshipScreen,
  FlagshipHeader,
  FlagshipState,
  FlagshipFormSection,
  FlagshipNavigationRow,
  FlagshipMetricLine,
} from '../components/flagship';
import { useStore } from '../store/useStore';
import { useSellerTrust } from '../platform/product';
import { fetchUserListingsFromApi, ListingApiItem } from '../services/listingsApi';

type NavT = NativeStackNavigationProp<RootStackParamList>;

// Task / attention item -- derived only from real listing + trust data.
// No fabricated order/offer/payout counts. Each item maps to a real screen.
interface TaskItem {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  title: string;
  subtitle: string;
  onPress: () => void;
  accessibilityLabel: string;
}

export default function SellerHubScreen() {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const navigation = useNavigation<NavT>();
  const currentUser = useStore((s) => s.currentUser);
  const { data: sellerTrust } = useSellerTrust(currentUser?.id);

  const [listings, setListings] = useState<ListingApiItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [loadError, setLoadError] = useState(false);

  const load = useCallback(async () => {
    if (!currentUser?.id) return;
    try {
      const res = await fetchUserListingsFromApi(currentUser.id, { limit: 100 });
      setListings(res.items);
      setLoadError(false);
    } catch {
      // Show a truthful error state rather than masking as empty
      // (AGENTS.md S11: truthful UI; S14: complete state coverage).
      setLoadError(true);
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

  // Honest inventory metrics -- computed from real listing data.
  // "Listed value" is the sum of active listing asking prices, NOT revenue.
  // There is no backend payout/balance aggregate, so we do not show one.
  // "Conversion" (sold/views) was removed: not a real backend conversion rate.
  const metrics = useMemo(() => {
    const active = listings.filter((l) => l.status === 'active');
    const sold = listings.filter((l) => l.status === 'sold');
    const paused = listings.filter((l) => l.status === 'paused');
    const drafts = listings.filter((l) => l.status === 'draft');
    const totalActiveValue = active.reduce((sum, l) => sum + l.priceGbp, 0);
    return {
      activeCount: active.length,
      soldCount: sold.length,
      pausedCount: paused.length,
      draftCount: drafts.length,
      total: listings.length,
      totalActiveValue,
    };
  }, [listings]);

  // "Needs you" tasks -- only items derivable from real listing + trust data.
  // Per audit 10: "seller home surfaces what needs attention." We do not
  // fabricate ship/offer tasks because no order/offer data source exists here.
  const tasks = useMemo<TaskItem[]>(() => {
    const items: TaskItem[] = [];

    if (metrics.draftCount > 0) {
      items.push({
        icon: 'document-text-outline',
        title: `Complete ${metrics.draftCount} draft listing${metrics.draftCount === 1 ? '' : 's'}`,
        subtitle: 'Finish and publish to make them live',
        onPress: () => navigation.navigate('InventoryManagement'),
        accessibilityLabel: `${metrics.draftCount} draft listings to complete`,
      });
    }

    const missingDetails = listings.filter(
      (l) =>
        l.status === 'active' &&
        (!l.brand || !l.size || !l.condition || !l.category || l.images.length === 0),
    );
    if (missingDetails.length > 0) {
      items.push({
        icon: 'create-outline',
        title: `${missingDetails.length} listing${missingDetails.length === 1 ? '' : 's'} missing details`,
        subtitle: 'Add brand, size, condition or photos',
        onPress: () => navigation.navigate('InventoryManagement'),
        accessibilityLabel: `${missingDetails.length} listings missing details`,
      });
    }

    const unanswered = listings.filter(
      (l) => l.engagement && l.engagement.questionCount > l.engagement.answeredQuestionCount,
    );
    if (unanswered.length > 0) {
      items.push({
        icon: 'chatbubble-ellipses-outline',
        title: `${unanswered.length} listing${unanswered.length === 1 ? '' : 's'} with buyer questions`,
        subtitle: 'Reply to keep buyers engaged',
        onPress: () => navigation.navigate('Inbox'),
        accessibilityLabel: `${unanswered.length} listings with unanswered buyer questions`,
      });
    }

    if (metrics.pausedCount > 0) {
      items.push({
        icon: 'pause-outline',
        title: `Review ${metrics.pausedCount} paused listing${metrics.pausedCount === 1 ? '' : 's'}`,
        subtitle: 'Resume or relist when ready',
        onPress: () => navigation.navigate('MyListings'),
        accessibilityLabel: `${metrics.pausedCount} paused listings to review`,
      });
    }

    if (sellerTrust && !sellerTrust.verified) {
      items.push({
        icon: 'shield-checkmark-outline',
        title: 'Get verified to sell',
        subtitle: 'Build buyer trust with a verified badge',
        onPress: () => navigation.navigate('KYCVerification'),
        accessibilityLabel: 'Complete identity verification',
      });
    }

    return items;
  }, [listings, metrics, sellerTrust, navigation]);

  const isVerified = sellerTrust?.verified === true;
  const hasListings = metrics.total > 0;

  if (isLoading) {
    return (
      <FlagshipScreen
        header={<FlagshipHeader title="Seller Hub" onBack={() => navigation.goBack()} />}
      >
        <FlagshipState variant="loading" />
      </FlagshipScreen>
    );
  }

  if (loadError) {
    return (
      <FlagshipScreen
        header={<FlagshipHeader title="Seller Hub" onBack={() => navigation.goBack()} />}
      >
        <FlagshipState
          variant="error"
          title="Couldn't load your shop"
          subtitle="Check your connection and try again."
          actionLabel="Retry"
          onAction={() => {
            setLoadError(false);
            setIsLoading(true);
            load().finally(() => setIsLoading(false));
          }}
        />
      </FlagshipScreen>
    );
  }

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
        {/* Listed value -- honest money summary, no fabricated payout.
            Sum of active listing asking prices, labelled "Listed value"
            (NOT "Revenue"). No backend payout/balance aggregate exists. */}
        <FlagshipMetricLine
          label="Listed value"
          value={`£${metrics.totalActiveValue.toFixed(2)}`}
          subLabel={
            hasListings
              ? `${metrics.activeCount} active listing${metrics.activeCount === 1 ? '' : 's'}`
              : 'No active listings yet'
          }
          emphasis
        />

        {/* Needs you -- task-first, only real derivable tasks */}
        <FlagshipFormSection variant="flat" title="Needs you">
          {tasks.length > 0 ? (
            tasks.map((task) => (
              <FlagshipNavigationRow
                key={task.title}
                title={task.title}
                subtitle={task.subtitle}
                icon={task.icon}
                onPress={task.onPress}
                accessibilityLabel={task.accessibilityLabel}
              />
            ))
          ) : (
            <View style={styles.allCaughtUp}>
              <Text style={[styles.allCaughtUpText, { color: colors.textMuted }]} maxFontSizeMultiplier={1.3}>
                You're all caught up
              </Text>
            </View>
          )}
        </FlagshipFormSection>

        {/* Create listing -- primary action, not a card */}
        <View style={styles.ctaWrap}>
          <AppButton
            title="Create listing"
            icon={<Ionicons name="add-circle-outline" size={18} color={colors.background} />}
            variant="primary"
            size="lg"
            onPress={() => navigation.navigate('Sell')}
            accessibilityLabel="Create a new listing"
            hapticFeedback="light"
          />
        </View>

        {/* Inventory -- flat metric lines + manage row */}
        <FlagshipFormSection variant="flat" title="Inventory">
          <FlagshipMetricLine label="Active" value={String(metrics.activeCount)} />
          <FlagshipMetricLine label="Draft" value={String(metrics.draftCount)} separated />
          <FlagshipMetricLine label="Sold" value={String(metrics.soldCount)} separated />
          <FlagshipMetricLine label="Paused" value={String(metrics.pausedCount)} separated />
          <FlagshipNavigationRow
            title="Manage listings"
            subtitle="Active, draft, sold and paused"
            icon="list-outline"
            onPress={() => navigation.navigate('MyListings')}
            accessibilityLabel="Manage all your listings"
            accessibilityHint="Opens your listings"
          />
          <FlagshipNavigationRow
            title="Inventory dashboard"
            subtitle="Filters and bulk actions"
            icon="grid-outline"
            onPress={() => navigation.navigate('InventoryManagement')}
            accessibilityLabel="Open inventory management dashboard"
            accessibilityHint="Opens the inventory management screen"
          />
        </FlagshipFormSection>

        {/* Store -- only real destinations.
            Storefront / Shipping policies omitted: no real screens exist. */}
        <FlagshipFormSection variant="flat" title="Store">
          <FlagshipNavigationRow
            title="Orders"
            subtitle="View and fulfil orders"
            icon="receipt-outline"
            onPress={() => navigation.navigate('MyOrders')}
            accessibilityLabel="Orders"
            accessibilityHint="Opens your orders"
          />
          <FlagshipNavigationRow
            title="Analytics"
            subtitle="Views, sales and engagement"
            icon="bar-chart-outline"
            onPress={() => navigation.navigate('SellerAnalytics')}
            accessibilityLabel="View seller analytics"
            accessibilityHint="Opens the seller analytics dashboard"
          />
          <FlagshipNavigationRow
            title="Auctions"
            subtitle="Auction listings"
            icon="trophy-outline"
            onPress={() => navigation.navigate('SellerAuctionCentre')}
            accessibilityLabel="Auctions"
            accessibilityHint="Opens the seller auction centre"
          />
        </FlagshipFormSection>

        {/* Account -- payouts + verification */}
        <FlagshipFormSection variant="flat" title="Account">
          <FlagshipNavigationRow
            title="Payouts"
            subtitle="Wallet and earnings"
            icon="wallet-outline"
            onPress={() => navigation.navigate('Wallet')}
            accessibilityLabel="Payouts and wallet"
            accessibilityHint="Opens your wallet"
          />
          <FlagshipNavigationRow
            title="Verification"
            subtitle={isVerified ? 'Verified' : 'ID and seller standards'}
            icon="shield-checkmark-outline"
            iconColor={isVerified ? colors.success : undefined}
            onPress={() => navigation.navigate('Verification')}
            accessibilityLabel="Verification status"
            accessibilityHint="Opens verification settings"
          />
        </FlagshipFormSection>
      </ScrollView>
    </FlagshipScreen>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    scrollContent: {
      paddingHorizontal: 0,
      paddingTop: Space.sm,
      paddingBottom: Space.xxl,
    },

    /* "All caught up" muted line -- replaces the needs-attention list
       when no real tasks are derivable from listing data. */
    allCaughtUp: {
      paddingVertical: Space.sm,
      paddingHorizontal: Space.md,
    },
    allCaughtUpText: {
      fontSize: TypographyV2.body.size,
      fontFamily: FontFamily.regular,
      letterSpacing: TypographyV2.body.letterSpacing,
      lineHeight: TypographyV2.body.lineHeight,
    },

    /* Create listing CTA -- primary button, wrapped for horizontal inset
       because the flat primitives own their own padding. */
    ctaWrap: {
      paddingHorizontal: Space.md,
      paddingVertical: Space.lg,
    },
  });
}