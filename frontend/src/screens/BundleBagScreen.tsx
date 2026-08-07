import React, { useState, useMemo, useCallback } from 'react';
import { View, Text, StyleSheet, RefreshControl } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Ionicons } from '@expo/vector-icons';
import Reanimated, { FadeInDown } from 'react-native-reanimated';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAppTheme, type ThemeColors } from '../theme/ThemeContext';
import { Space, Radius, Type, Typography, Stroke } from '../theme/designTokens';
import { RootStackParamList } from '../navigation/types';
import { FlagshipScreen, FlagshipHeader, FlagshipState } from '../components/flagship';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { AppButton } from '../components/ui/AppButton';
import { CachedImage } from '../components/CachedImage';
import { EmptyState } from '../components/EmptyState';
import { useBackendData } from '../context/BackendDataContext';
import { useFormattedPrice } from '../hooks/useFormattedPrice';
import { useHaptic } from '../hooks/useHaptic';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { useToast } from '../context/ToastContext';

type NavT = NativeStackNavigationProp<RootStackParamList>;
type RouteT = RouteProp<RootStackParamList, 'BundleBag'>;

interface BundleTier {
  itemCount: number;
  discountPercent: number;
  label: string;
}

const BUNDLE_TIERS: BundleTier[] = [
  { itemCount: 2, discountPercent: 10, label: '2 items: 10% off' },
  { itemCount: 3, discountPercent: 15, label: '3 items: 15% off' },
  { itemCount: 5, discountPercent: 20, label: '5+ items: 20% off' },
];

function getBundleDiscount(selectedCount: number): number {
  if (selectedCount >= 5) return 20;
  if (selectedCount >= 3) return 15;
  if (selectedCount >= 2) return 10;
  return 0;
}

export default function BundleBagScreen() {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const navigation = useNavigation<NavT>();
  const route = useRoute<RouteT>();
  const { sellerId, sellerName } = route.params ?? { sellerId: '', sellerName: '' };
  const { listings, isSyncing, refreshListings } = useBackendData();
  const { formatFromFiat } = useFormattedPrice();
  const haptic = useHaptic();
  const reducedMotionEnabled = useReducedMotion();
  const { show } = useToast();

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [refreshing, setRefreshing] = useState(false);

  const sellerListings = useMemo(() => {
    return listings.filter((l) => l.sellerId === sellerId && !l.isSold);
  }, [listings, sellerId]);

  const selectedItems = useMemo(() => {
    return sellerListings.filter((l) => selectedIds.has(l.id));
  }, [sellerListings, selectedIds]);

  const subtotal = useMemo(() => {
    return selectedItems.reduce((sum, l) => sum + l.price, 0);
  }, [selectedItems]);

  const discountPercent = getBundleDiscount(selectedItems.length);
  const discountAmount = (subtotal * discountPercent) / 100;
  const combinedShipping = selectedItems.length > 0 ? 3.99 : 0;
  const total = subtotal - discountAmount + combinedShipping;

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refreshListings();
    setRefreshing(false);
  }, [refreshListings]);

  const toggleSelect = useCallback((id: string) => {
    haptic.selection();
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, [haptic]);

  const handleCheckout = () => {
    if (selectedItems.length < 2) {
      show('Select at least 2 items to get bundle savings.', 'info');
      return;
    }
    show(`Bundle checkout for ${selectedItems.length} items — £${total.toFixed(2)} total. Proceeding to checkout.`, 'success');
    // Navigate to the first item's checkout — in production this would be a multi-item checkout
    navigation.navigate('Checkout', { itemId: selectedItems[0].id });
  };

  const renderItem = ({ item }: { item: typeof sellerListings[0] }) => {
    const isSelected = selectedIds.has(item.id);
    return (
      <AnimatedPressable
        style={[styles.itemRow, isSelected && styles.itemRowSelected]}
        onPress={() => toggleSelect(item.id)}
        activeOpacity={0.85}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: isSelected }}
        accessibilityLabel={`${isSelected ? 'Deselect' : 'Select'} ${item.title}`}
      >
        <View style={[styles.checkbox, isSelected && styles.checkboxChecked]}>
          {isSelected && <Ionicons name="checkmark" size={16} color={colors.background} />}
        </View>
        {item.images?.[0] ? (
          <CachedImage uri={item.images[0]} style={styles.itemImage} contentFit="cover" />
        ) : (
          <View style={[styles.itemImage, styles.itemImagePlaceholder]}>
            <Ionicons name="shirt-outline" size={20} color={colors.textMuted} />
          </View>
        )}
        <View style={styles.itemInfo}>
          <Text style={styles.itemTitle} numberOfLines={2}>{item.title}</Text>
          <Text style={styles.itemPrice}>{formatFromFiat(item.price, 'GBP', { displayMode: 'fiat' })}</Text>
          {item.size && <Text style={styles.itemMeta}>Size: {item.size}</Text>}
        </View>
      </AnimatedPressable>
    );
  };

  if (isSyncing && sellerListings.length === 0) {
    return (
      <FlagshipScreen header={<FlagshipHeader title="Bundle Bag" onBack={() => navigation.goBack()} />}>
        <FlagshipState variant="loading" />
      </FlagshipScreen>
    );
  }

  return (
    <FlagshipScreen
      header={<FlagshipHeader title="Bundle Bag" onBack={() => navigation.goBack()} />}
      scrollEnabled={false}
      contentStyle={{ paddingHorizontal: 0, paddingTop: 0 }}
    >
      {sellerListings.length === 0 ? (
        <View style={styles.loadingBody}>
          <EmptyState
            icon="bag-outline"
            title="No items available"
            subtitle="This seller has no active listings to bundle."
            ctaLabel="Browse"
            onCtaPress={() => navigation.navigate('MainTabs', { screen: 'Explore' })}
          />
        </View>
      ) : (
        <View style={styles.body}>
          {/* Hero summary — bundle status */}
          <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(300)}>
            <View style={[styles.heroCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={styles.heroRow}>
                <View style={[styles.heroIcon, { backgroundColor: colors.brand }]}>
                  <Ionicons name="storefront" size={18} color={colors.textInverse} />
                </View>
                <View style={styles.heroText}>
                  <Text style={[styles.heroTitle, { color: colors.textPrimary }]}>
                    {selectedItems.length} selected
                  </Text>
                  <Text style={[styles.heroSubtitle, { color: colors.textSecondary }]}>
                    {sellerListings.length} items from {sellerName ?? 'this seller'}
                  </Text>
                </View>
                {discountPercent > 0 && (
                  <View style={[styles.heroBadge, { backgroundColor: colors.brand + '18' }]}>
                    <Text style={[styles.heroBadgeText, { color: colors.brand }]}>{discountPercent}% off</Text>
                  </View>
                )}
              </View>
            </View>
          </Reanimated.View>

          {/* Bundle tier hints */}
          <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(300).delay(60)}>
          <View style={styles.tiersRow}>
            {BUNDLE_TIERS.map((tier) => {
              const achieved = selectedItems.length >= tier.itemCount;
              return (
                <View
                  key={tier.itemCount}
                  style={[styles.tierChip, achieved && styles.tierChipActive]}
                >
                  <Ionicons
                    name={achieved ? 'checkmark-circle' : 'ellipse-outline'}
                    size={12}
                    color={achieved ? colors.brand : colors.textMuted}
                  />
                  <Text style={[styles.tierChipText, achieved && styles.tierChipTextActive]}>
                    {tier.label}
                  </Text>
                </View>
              );
            })}
          </View>
          </Reanimated.View>

          <FlashList
            data={sellerListings}
            keyExtractor={(item) => item.id}
            renderItem={renderItem}
            contentContainerStyle={styles.list}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
            // Performance: bundle bags can list many seller items; FlashList
            // v2 handles recycling automatically.
          />

          {/* Sticky checkout footer */}
          {selectedItems.length > 0 && (
            <View style={styles.footer}>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Subtotal ({selectedItems.length} items)</Text>
                <Text style={styles.summaryValue}>{formatFromFiat(subtotal, 'GBP', { displayMode: 'fiat' })}</Text>
              </View>
              {discountAmount > 0 && (
                <View style={styles.summaryRow}>
                  <Text style={[styles.summaryLabel, { color: colors.brand }]}>Bundle discount ({discountPercent}%)</Text>
                  <Text style={[styles.summaryValue, { color: colors.brand }]}>-{formatFromFiat(discountAmount, 'GBP', { displayMode: 'fiat' })}</Text>
                </View>
              )}
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Combined shipping</Text>
                <Text style={styles.summaryValue}>{formatFromFiat(combinedShipping, 'GBP', { displayMode: 'fiat' })}</Text>
              </View>
              <View style={[styles.summaryRow, styles.totalRow]}>
                <Text style={styles.totalLabel}>Total</Text>
                <Text style={styles.totalValue}>{formatFromFiat(total, 'GBP', { displayMode: 'fiat' })}</Text>
              </View>
              <AppButton
                title={selectedItems.length < 2 ? 'Select 2+ for bundle savings' : `Checkout bundle · ${formatFromFiat(total, 'GBP', { displayMode: 'fiat' })}`}
                variant="primary"
                size="lg"
                style={styles.checkoutBtn}
                onPress={handleCheckout}
                disabled={selectedItems.length < 2}
                accessibilityLabel="Checkout bundle"
                hapticFeedback="light"
              />
            </View>
          )}
        </View>
      )}
    </FlagshipScreen>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
  heroCard: {
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Space.md,
    marginHorizontal: Space.md,
    marginTop: Space.sm,
    marginBottom: Space.sm,
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
    marginTop: Space.xs / 2,
  },
  heroBadge: {
    paddingHorizontal: Space.sm,
    paddingVertical: Space.xs,
    borderRadius: Radius.full,
  },
  heroBadgeText: {
    fontSize: Type.meta.size,
    fontFamily: Typography.family.bold,
  },
  loadingBody: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  body: {
    flex: 1,
  },
  tiersRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Space.xs,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
  },
  tierChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
    paddingHorizontal: Space.sm + 2,
    paddingVertical: Space.xs + 1,
    borderRadius: Radius.xl,
    borderWidth: Stroke.standard,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  tierChipActive: {
    borderColor: colors.brand,
    backgroundColor: `${colors.brand}10`,
  },
  tierChipText: {
    fontSize: Type.meta.size,
    fontFamily: Typography.family.medium,
    color: colors.textMuted,
  },
  tierChipTextActive: {
    color: colors.brand,
    fontFamily: Typography.family.semibold,
  },
  list: {
    paddingHorizontal: Space.md,
    paddingTop: Space.sm,
    gap: Space.sm,
    paddingBottom: 300,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm + 2,
    borderRadius: Radius.md,
    backgroundColor: colors.surface,
    borderWidth: Stroke.standard,
    borderColor: colors.border,
  },
  itemRowSelected: {
    borderColor: colors.brand,
    backgroundColor: `${colors.brand}08`,
  },
  checkbox: {
    width: Space.lg,
    height: Space.lg,
    borderRadius: Radius.lg,
    borderWidth: Stroke.emphasis,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: {
    backgroundColor: colors.brand,
    borderColor: colors.brand,
  },
  itemImage: {
    width: Space.xxl + Space.sm,
    height: Space.xxl + Space.sm,
    borderRadius: Radius.md,
    backgroundColor: colors.surfaceAlt,
  },
  itemImagePlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemInfo: {
    flex: 1,
    gap: Space.xs / 2,
  },
  itemTitle: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.semibold,
    color: colors.textPrimary,
  },
  itemPrice: {
    fontSize: Type.subtitle.size,
    fontFamily: Typography.family.bold,
    color: colors.textPrimary,
  },
  itemMeta: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.regular,
    color: colors.textMuted,
  },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.surface,
    borderTopWidth: Stroke.standard,
    borderTopColor: colors.border,
    paddingHorizontal: Space.md,
    paddingVertical: Space.md,
    gap: Space.xs,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Space.xs / 2,
  },
  summaryLabel: {
    fontSize: Type.captionElevated.size,
    fontFamily: Typography.family.regular,
    color: colors.textSecondary,
  },
  summaryValue: {
    fontSize: Type.captionElevated.size,
    fontFamily: Typography.family.semibold,
    color: colors.textPrimary,
  },
  totalRow: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    marginTop: Space.xs,
    paddingTop: Space.sm,
  },
  totalLabel: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.bold,
    color: colors.textPrimary,
  },
  totalValue: {
    fontSize: Type.subtitle.size,
    fontFamily: Typography.family.bold,
    color: colors.textPrimary,
  },
  checkoutBtn: {
    marginTop: Space.sm,
    width: '100%',
  },
  });
}