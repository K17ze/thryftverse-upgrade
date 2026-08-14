import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAppTheme, type ThemeColors } from '../theme/ThemeContext';
import { Space, FontFamily, Numeric, Control } from '../theme/designTokens';
import { TypographyV2 } from '../theme/typography.v2';
import { RadiusRoleValue } from '../theme/surfaceRadiusRules';
import { RootStackParamList } from '../navigation/types';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { AppButton } from '../components/ui/AppButton';
import { CachedImage } from '../components/CachedImage';
import { FlagshipScreen, FlagshipHeader, FlagshipState } from '../components/flagship';
import { SellerStandardsBadges } from '../components/profile/SellerStandardsBadges';
import { useStore } from '../store/useStore';
import { useSellerTrust } from '../platform/product';
import { fetchUserListingsFromApi, ListingApiItem } from '../services/listingsApi';

type NavT = NativeStackNavigationProp<RootStackParamList>;

interface HubAction {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  subtitle: string;
  onPress: () => void;
  accessibilityLabel: string;
}

interface ToolGroup {
  eyebrow: string;
  actions: HubAction[];
}

interface AttentionItem {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  count: number;
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
      // (AGENTS.md Â§11: truthful UI; Â§14: complete state coverage).
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

  // Needs-attention items -- computed from real listing + trust data
  const attentionItems = useMemo<AttentionItem[]>(() => {
    const items: AttentionItem[] = [];
    const drafts = listings.filter((l) => l.status === 'draft');
    if (drafts.length > 0) {
      items.push({
        icon: 'document-text-outline',
        label: 'Drafts to publish',
        count: drafts.length,
        onPress: () => navigation.navigate('MyListings'),
        accessibilityLabel: `${drafts.length} draft listings to publish`,
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
        label: 'Listings missing details',
        count: missingDetails.length,
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
        label: 'Unanswered buyer questions',
        count: unanswered.length,
        onPress: () => navigation.navigate('MyListings'),
        accessibilityLabel: `${unanswered.length} listings with unanswered buyer questions`,
      });
    }
    const paused = listings.filter((l) => l.status === 'paused');
    if (paused.length > 0) {
      items.push({
        icon: 'pause-outline',
        label: 'Paused listings',
        count: paused.length,
        onPress: () => navigation.navigate('MyListings'),
        accessibilityLabel: `${paused.length} paused listings`,
      });
    }
    if (sellerTrust && !sellerTrust.verified) {
      items.push({
        icon: 'shield-checkmark-outline',
        label: 'Pending verification',
        count: 1,
        onPress: () => navigation.navigate('KYCVerification'),
        accessibilityLabel: 'Complete identity verification',
      });
    }
    return items;
  }, [listings, sellerTrust, navigation]);

  const metrics = useMemo(() => {
    const active = listings.filter((l) => l.status === 'active');
    const sold = listings.filter((l) => l.status === 'sold');
    const paused = listings.filter((l) => l.status === 'paused');
    const totalActiveValue = active.reduce((sum, l) => sum + l.priceGbp, 0);
    const totalSoldValue = sold.reduce((sum, l) => sum + l.priceGbp, 0);
    const totalViews = listings.reduce((sum, l) => sum + (l.engagement?.views ?? 0), 0);
    const totalLikes = listings.reduce((sum, l) => sum + (l.engagement?.likes ?? 0), 0);
    const conversionRate = totalViews > 0 ? (sold.length / totalViews) * 100 : 0;
    return {
      activeCount: active.length,
      soldCount: sold.length,
      pausedCount: paused.length,
      total: listings.length,
      totalActiveValue,
      totalSoldValue,
      totalViews,
      totalLikes,
      conversionRate,
    };
  }, [listings]);

  const hasListings = metrics.total > 0;
  const hasAttention = attentionItems.length > 0;
  const sellerName = currentUser?.displayName || currentUser?.username || 'Seller';
  const sellerHandle = currentUser?.handle
    ? `@${currentUser.handle}`
    : currentUser?.username
      ? `@${currentUser.username}`
      : null;
  const avatarUri = currentUser?.avatar ?? null;
  const isVerified = sellerTrust?.verified === true;

  const toolGroups = useMemo<ToolGroup[]>(() => [
    {
      eyebrow: 'Manage',
      actions: [
        {
          icon: 'list-outline',
          label: 'My listings',
          subtitle: 'Active and sold listings',
          onPress: () => navigation.navigate('MyListings'),
          accessibilityLabel: 'View all your listings',
        },
        {
          icon: 'grid-outline',
          label: 'Inventory',
          subtitle: 'Filters and bulk actions',
          onPress: () => navigation.navigate('InventoryManagement'),
          accessibilityLabel: 'Open full inventory management',
        },
        {
          icon: 'receipt-outline',
          label: 'Orders',
          subtitle: 'View and fulfil orders',
          onPress: () => navigation.navigate('MyOrders'),
          accessibilityLabel: 'Orders',
        },
        {
          icon: 'trophy-outline',
          label: 'Auctions',
          subtitle: 'Auction listings',
          onPress: () => navigation.navigate('SellerAuctionCentre'),
          accessibilityLabel: 'Auctions',
        },
      ],
    },
    {
      eyebrow: 'Insights',
      actions: [
        {
          icon: 'bar-chart-outline',
          label: 'Analytics',
          subtitle: 'Views, conversion and revenue',
          onPress: () => navigation.navigate('SellerAnalytics'),
          accessibilityLabel: 'View seller analytics dashboard',
        },
        {
          icon: 'pulse-outline',
          label: 'Creator Analytics',
          subtitle: 'Content engagement and insights',
          onPress: () => navigation.navigate('CreatorAnalyticsDashboard'),
          accessibilityLabel: 'View creator analytics dashboard',
        },
      ],
    },
    {
      eyebrow: 'Account',
      actions: [
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
      ],
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

  const renderToolRow = (action: HubAction) => (
    <AnimatedPressable
      key={action.label}
      style={styles.toolRow}
      onPress={action.onPress}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel={action.accessibilityLabel}
    >
      <Ionicons name={action.icon} size={20} color={colors.textPrimary} />
      <View style={styles.toolInfo}>
        <Text style={[styles.toolLabel, { color: colors.textPrimary }]} numberOfLines={1}>
          {action.label}
        </Text>
        <Text style={[styles.toolSubtitle, { color: colors.textMuted }]} numberOfLines={1}>
          {action.subtitle}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
    </AnimatedPressable>
  );

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
        {/* Hero -- seller overview (one dominant panel) */}
        <View>
          <View style={[styles.hero, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.heroIdentity}>
              <View style={[styles.heroAvatar, { borderColor: colors.border }]}>
                {avatarUri ? (
                  <CachedImage
                    uri={avatarUri}
                    style={styles.heroAvatarImg}
                    contentFit="cover"
                    transition={300}
                  />
                ) : (
                  <Ionicons name="person" size={20} color={colors.textMuted} />
                )}
              </View>
              <View style={styles.heroIdentityText}>
                <View style={styles.heroNameRow}>
                  <Text style={[styles.heroName, { color: colors.textPrimary }]} numberOfLines={1}>
                    {sellerName}
                  </Text>
                  {isVerified ? (
                    <Ionicons name="checkmark-circle" size={15} color={colors.brand} />
                  ) : null}
                </View>
                {sellerHandle ? (
                  <Text style={[styles.heroHandle, { color: colors.textSecondary }]} numberOfLines={1}>
                    {sellerHandle}
                  </Text>
                ) : null}
              </View>
            </View>

            {sellerTrust ? (
              <View style={styles.heroBadges}>
                <SellerStandardsBadges sellerTrust={sellerTrust} align="left" size="sm" />
              </View>
            ) : null}

            {hasListings ? (
              <View style={[styles.heroFigures, { borderColor: colors.borderSubtle }]}>
                <View style={styles.heroFigure}>
                  <Text
                    style={[styles.heroFigureValue, { color: colors.textPrimary }]}
                    accessibilityLabel={`Revenue ${metrics.totalSoldValue.toFixed(0)} pounds`}
                  >
                    {metrics.totalSoldValue > 0 ? `\u00A3${metrics.totalSoldValue.toFixed(0)}` : '--'}
                  </Text>
                  <Text style={[styles.heroFigureLabel, { color: colors.textMuted }]}>
                    Revenue
                  </Text>
                </View>
                <View style={[styles.heroFigureDivider, { backgroundColor: colors.borderSubtle }]} />
                <View style={styles.heroFigure}>
                  <Text
                    style={[styles.heroFigureValue, { color: colors.textPrimary }]}
                    accessibilityLabel={`${metrics.activeCount} active listings`}
                  >
                    {metrics.activeCount}
                  </Text>
                  <Text style={[styles.heroFigureLabel, { color: colors.textMuted }]}>
                    Active
                  </Text>
                </View>
              </View>
            ) : null}

            <Text style={[styles.heroMeta, { color: colors.textSecondary }]}>
              {hasListings
                ? `${metrics.soldCount} sold \u00B7 \u00A3${metrics.totalActiveValue.toFixed(0)} live value \u00B7 ${metrics.total} total${metrics.pausedCount > 0 ? ` \u00B7 ${metrics.pausedCount} paused` : ''}`
                : 'No listings yet \u2014 your shop is ready for its first item.'}
            </Text>
          </View>
        </View>

        {/* Needs attention -- task-first panel (only when actionable items exist) */}
        {hasAttention ? (
          <View>
            <View style={styles.eyebrowRow}>
              <Text style={[styles.eyebrow, { color: colors.warning }]}>Needs attention</Text>
              <Text style={[styles.eyebrowCount, { color: colors.textMuted }]}>
                {attentionItems.length} item{attentionItems.length === 1 ? '' : 's'}
              </Text>
            </View>
            <View style={[styles.attentionPanel, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              {attentionItems.map((item, idx) => (
                <AnimatedPressable
                  key={item.label}
                  style={[
                    styles.attentionRow,
                    idx < attentionItems.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.borderSubtle },
                  ]}
                  onPress={item.onPress}
                  activeOpacity={0.85}
                  accessibilityRole="button"
                  accessibilityLabel={item.accessibilityLabel}
                >
                  <Ionicons name={item.icon} size={18} color={colors.warning} />
                  <Text style={[styles.attentionLabel, { color: colors.textPrimary }]}>{item.label}</Text>
                  <View style={[styles.attentionBadge, { backgroundColor: colors.warning }]}>
                    <Text style={[styles.attentionBadgeText, { color: colors.background }]}>{item.count}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
                </AnimatedPressable>
              ))}
            </View>
          </View>
        ) : null}

        {/* Get Verified CTA -- shown when seller is not yet verified */}
        {sellerTrust && !sellerTrust.verified ? (
          <View>
            <View style={[styles.verifyCta, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={styles.verifyCtaInfo}>
                <Ionicons name="shield-checkmark-outline" size={20} color={colors.brand} />
                <View style={styles.verifyCtaText}>
                  <Text style={[styles.verifyCtaTitle, { color: colors.textPrimary }]}>Get verified</Text>
                  <Text style={[styles.verifyCtaSubtitle, { color: colors.textMuted }]}>
                    Verified sellers earn buyer trust and sell faster
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
          </View>
        ) : null}

        {/* Performance overview (flat hairline grid) or onboarding empty */}
        {hasListings ? (
          <View>
            <Text style={[styles.eyebrow, { color: colors.textMuted }]}>Performance</Text>
            <View style={[styles.metricGrid, { borderColor: colors.borderSubtle }]}>
              <View style={styles.metricCell}>
                <Text style={[styles.metricValue, { color: colors.textPrimary }]}>
                  {`\u00A3${metrics.totalActiveValue.toFixed(0)}`}
                </Text>
                <Text style={[styles.metricLabel, { color: colors.textMuted }]}>Live value</Text>
              </View>
              <View style={[styles.metricCell, styles.metricCellMid, { borderLeftColor: colors.borderSubtle }]}>
                <Text style={[styles.metricValue, { color: colors.textPrimary }]}>
                  {metrics.totalViews.toLocaleString()}
                </Text>
                <Text style={[styles.metricLabel, { color: colors.textMuted }]}>Views</Text>
              </View>
              <View style={[styles.metricCell, styles.metricCellBottom, { borderTopColor: colors.borderSubtle }]}>
                <Text style={[styles.metricValue, { color: colors.textPrimary }]}>
                  {`${metrics.conversionRate.toFixed(1)}%`}
                </Text>
                <Text style={[styles.metricLabel, { color: colors.textMuted }]}>Conversion</Text>
              </View>
              <View style={[styles.metricCell, styles.metricCellMid, styles.metricCellBottom, { borderLeftColor: colors.borderSubtle, borderTopColor: colors.borderSubtle }]}>
                <Text style={[styles.metricValue, { color: colors.textPrimary }]}>
                  {metrics.totalLikes.toLocaleString()}
                </Text>
                <Text style={[styles.metricLabel, { color: colors.textMuted }]}>Likes</Text>
              </View>
            </View>
          </View>
        ) : (
          <View>
            <View style={[styles.emptyPanel, { borderColor: colors.borderSubtle }]}>
              <Ionicons name="cube-outline" size={26} color={colors.textMuted} />
              <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>
                Start your shop
              </Text>
              <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
                List your first item to unlock sales, insights and seller tools.
              </Text>
            </View>
          </View>
        )}

        {/* Seller tools */}
        <View>
          {/* Primary action -- full-width, prominent */}
          <AppButton
            title="Create new listing"
            icon={<Ionicons name="add-circle-outline" size={18} color={colors.background} />}
            variant="primary"
            size="lg"
            style={styles.createBtn}
            onPress={() => navigation.navigate('Sell')}
            accessibilityLabel="Create a new listing"
            hapticFeedback="light"
          />

          {toolGroups.map((group) => (
            <View key={group.eyebrow} style={styles.toolGroup}>
              <Text style={[styles.eyebrow, { color: colors.textMuted }]}>
                {group.eyebrow}
              </Text>
              <View style={[styles.toolGroupContainer, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                {group.actions.map((action, index) => (
                  <React.Fragment key={action.label}>
                    {renderToolRow(action)}
                    {index < group.actions.length - 1 ? (
                      <View style={[styles.toolRowSeparator, { backgroundColor: colors.borderSubtle }]} />
                    ) : null}
                  </React.Fragment>
                ))}
              </View>
            </View>
          ))}
        </View>
      </ScrollView>
    </FlagshipScreen>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    scrollContent: {
      paddingHorizontal: Space.md,
      paddingBottom: Space.xxl,
      paddingTop: Space.md,
    },

    /* Eyebrow / section labels */
    eyebrowRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: Space.sm,
    },
    eyebrow: {
      fontSize: TypographyV2.label.size,
      fontFamily: FontFamily.semibold,
      letterSpacing: TypographyV2.label.letterSpacing,
      textTransform: 'uppercase',
      marginBottom: Space.sm,
    },
    eyebrowCount: {
      fontSize: TypographyV2.body.size,
      fontFamily: FontFamily.regular,
      marginBottom: Space.sm,
    },

    /* Hero -- one dominant panel */
    hero: {
      borderRadius: RadiusRoleValue.sheetDialog,
      borderWidth: StyleSheet.hairlineWidth,
      padding: Space.md,
      marginBottom: Space.md,
    },
    heroIdentity: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.sm + 2,
    },
    heroAvatar: {
      width: 40,
      height: 40,
      borderRadius: RadiusRoleValue.pillAvatar,
      borderWidth: StyleSheet.hairlineWidth,
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
    },
    heroAvatarImg: {
      width: '100%',
      height: '100%',
    },
    heroIdentityText: {
      flex: 1,
      gap: 1,
    },
      heroNameRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs,
    },
    heroName: {
      fontSize: TypographyV2.sectionTitle.size,
      fontFamily: FontFamily.semibold,
      letterSpacing: TypographyV2.sectionTitle.letterSpacing,
      lineHeight: TypographyV2.sectionTitle.lineHeight,
    },
    heroHandle: {
      fontSize: TypographyV2.body.size,
      fontFamily: FontFamily.regular,
      letterSpacing: TypographyV2.body.letterSpacing,
      lineHeight: TypographyV2.body.lineHeight,
    },
    heroBadges: {
      marginTop: Space.sm,
    },
    heroFigures: {
      flexDirection: 'row',
      alignItems: 'stretch',
      marginTop: Space.md,
      paddingTop: Space.md,
      borderTopWidth: StyleSheet.hairlineWidth,
    },
    heroFigure: {
      flex: 1,
      gap: 2,
    },
    heroFigureDivider: {
      width: StyleSheet.hairlineWidth,
      marginHorizontal: Space.sm,
    },
    heroFigureValue: {
      fontSize: Numeric.priceLarge.size,
      lineHeight: Numeric.priceLarge.lineHeight,
      fontFamily: FontFamily.bold,
      letterSpacing: Numeric.priceLarge.letterSpacing,
      fontVariant: ['tabular-nums'],
    },
    heroFigureLabel: {
      fontSize: TypographyV2.meta.size,
      fontFamily: FontFamily.medium,
      letterSpacing: TypographyV2.meta.letterSpacing,
    },
    heroMeta: {
      fontSize: TypographyV2.body.size,
      fontFamily: FontFamily.regular,
      letterSpacing: TypographyV2.body.letterSpacing,
      lineHeight: TypographyV2.body.lineHeight + 2,
      marginTop: Space.sm + 2,
    },

    /* Needs attention panel */
    attentionPanel: {
      borderRadius: RadiusRoleValue.sheetDialog,
      borderWidth: StyleSheet.hairlineWidth,
      overflow: 'hidden',
      marginBottom: Space.md,
    },
    attentionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.sm,
      paddingHorizontal: Space.md,
      paddingVertical: Space.sm + 2,
      minHeight: 48,
    },
    attentionLabel: {
      flex: 1,
      fontSize: TypographyV2.body.size,
      fontFamily: FontFamily.medium,
      letterSpacing: TypographyV2.body.letterSpacing,
    },
    attentionBadge: {
      minWidth: 22,
      height: 22,
      borderRadius: RadiusRoleValue.pillAvatar,
      paddingHorizontal: Space.xs + 2,
      alignItems: 'center',
      justifyContent: 'center',
    },
    attentionBadgeText: {
      fontSize: TypographyV2.meta.size,
      fontFamily: FontFamily.bold,
      letterSpacing: TypographyV2.meta.letterSpacing,
    },

    /* Verify CTA */
    verifyCta: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: Space.sm,
      paddingHorizontal: Space.md,
      paddingVertical: Space.sm + 2,
      borderRadius: RadiusRoleValue.sheetDialog,
      borderWidth: StyleSheet.hairlineWidth,
      marginBottom: Space.lg,
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
      fontSize: TypographyV2.body.size,
      fontFamily: FontFamily.semibold,
      letterSpacing: TypographyV2.body.letterSpacing,
    },
    verifyCtaSubtitle: {
      fontSize: TypographyV2.body.size,
      fontFamily: FontFamily.regular,
      letterSpacing: TypographyV2.body.letterSpacing,
    },
    verifyCtaBtn: {
      paddingHorizontal: Space.md,
      paddingVertical: Space.sm,
      borderRadius: RadiusRoleValue.mediaThumbnail,
      minHeight: 44,
      alignItems: 'center',
      justifyContent: 'center',
    },
    verifyCtaBtnText: {
      fontSize: TypographyV2.body.size,
      fontFamily: FontFamily.bold,
    },

    /* Performance grid -- flat hairline grid on canvas */
    metricGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      borderWidth: StyleSheet.hairlineWidth,
      borderRadius: RadiusRoleValue.sheetDialog,
      overflow: 'hidden',
      marginBottom: Space.lg,
    },
    metricCell: {
      width: '50%',
      paddingHorizontal: Space.md,
      paddingVertical: Space.md,
      gap: 2,
    },
    metricCellMid: {
      borderLeftWidth: StyleSheet.hairlineWidth,
    },
    metricCellBottom: {
      borderTopWidth: StyleSheet.hairlineWidth,
    },
    metricValue: {
      fontSize: TypographyV2.priceList.size,
      lineHeight: TypographyV2.priceList.lineHeight,
      fontFamily: FontFamily.bold,
      letterSpacing: TypographyV2.priceList.letterSpacing,
      fontVariant: ['tabular-nums'],
    },
    metricLabel: {
      fontSize: TypographyV2.meta.size,
      fontFamily: FontFamily.medium,
      letterSpacing: TypographyV2.meta.letterSpacing,
    },

    /* Empty onboarding panel */
    emptyPanel: {
      alignItems: 'center',
      gap: Space.xs,
      paddingVertical: Space.xl,
      paddingHorizontal: Space.md,
      borderWidth: StyleSheet.hairlineWidth,
      borderRadius: RadiusRoleValue.sheetDialog,
      borderStyle: 'dashed',
      marginBottom: Space.lg,
    },
    emptyTitle: {
      fontSize: TypographyV2.sectionTitle.size,
      fontFamily: FontFamily.semibold,
      letterSpacing: TypographyV2.sectionTitle.letterSpacing,
      lineHeight: TypographyV2.sectionTitle.lineHeight,
      marginTop: Space.xs,
    },
    emptySubtitle: {
      fontSize: TypographyV2.body.size,
      fontFamily: FontFamily.regular,
      letterSpacing: TypographyV2.body.letterSpacing,
      lineHeight: TypographyV2.body.lineHeight,
      textAlign: 'center',
    },

    /* Seller tools */
    createBtn: {
      marginBottom: Space.lg,
    },
    toolGroup: {
      marginBottom: Space.md,
    },
    toolGroupContainer: {
      borderRadius: RadiusRoleValue.sheetDialog,
      borderWidth: StyleSheet.hairlineWidth,
      overflow: 'hidden',
    },
    toolRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.sm + 2,
      paddingHorizontal: Space.md,
      minHeight: Control.hit + 4,
      paddingVertical: Space.sm,
    },
    toolInfo: {
      flex: 1,
      gap: 1,
    },
    toolLabel: {
      fontSize: TypographyV2.body.size,
      fontFamily: FontFamily.semibold,
      letterSpacing: TypographyV2.body.letterSpacing,
    },
    toolSubtitle: {
      fontSize: TypographyV2.body.size,
      fontFamily: FontFamily.regular,
      letterSpacing: TypographyV2.body.letterSpacing,
    },
    toolRowSeparator: {
      height: StyleSheet.hairlineWidth,
      marginLeft: Space.md + 20 + Space.sm + 2,
    },
  });
}
