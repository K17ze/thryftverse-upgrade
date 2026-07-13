import React, { useState, useMemo, useCallback } from 'react';
import { View, Text, StyleSheet, StatusBar, FlatList, ActivityIndicator, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { ActiveTheme, Colors } from '../constants/colors';
import { Space, Radius, Type, Typography } from '../theme/designTokens';
import { RootStackParamList } from '../navigation/types';
import { ScreenHeader } from '../components/ui/ScreenHeader';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { AppButton } from '../components/ui/AppButton';
import { CachedImage } from '../components/CachedImage';
import { EmptyState } from '../components/EmptyState';
import { useBackendData } from '../context/BackendDataContext';
import { useFormattedPrice } from '../hooks/useFormattedPrice';
import { useToast } from '../context/ToastContext';

type NavT = StackNavigationProp<RootStackParamList>;
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
  const navigation = useNavigation<NavT>();
  const route = useRoute<RouteT>();
  const { sellerId, sellerName } = route.params ?? { sellerId: '', sellerName: '' };
  const { listings, isSyncing, refreshListings } = useBackendData();
  const { formatFromFiat } = useFormattedPrice();
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
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

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
          {isSelected && <Ionicons name="checkmark" size={16} color={Colors.background} />}
        </View>
        {item.images?.[0] ? (
          <CachedImage uri={item.images[0]} style={styles.itemImage} contentFit="cover" />
        ) : (
          <View style={[styles.itemImage, styles.itemImagePlaceholder]}>
            <Ionicons name="shirt-outline" size={20} color={Colors.textMuted} />
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
      <SafeAreaView style={styles.container} edges={['top']}>
        <StatusBar barStyle={ActiveTheme === 'light' ? 'dark-content' : 'light-content'} />
        <ScreenHeader title="Bundle Bag" onBack={() => navigation.goBack()} />
        <View style={styles.loadingBody}>
          <ActivityIndicator size="large" color={Colors.brand} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar barStyle={ActiveTheme === 'light' ? 'dark-content' : 'light-content'} />
      <ScreenHeader title="Bundle Bag" onBack={() => navigation.goBack()} />

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
          {/* Seller info */}
          <View style={styles.sellerBanner}>
            <Ionicons name="storefront-outline" size={20} color={Colors.brand} />
            <Text style={styles.sellerText}>
              {sellerListings.length} items from {sellerName ?? 'this seller'}
            </Text>
          </View>

          {/* Bundle tier hints */}
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
                    color={achieved ? Colors.brand : Colors.textMuted}
                  />
                  <Text style={[styles.tierChipText, achieved && styles.tierChipTextActive]}>
                    {tier.label}
                  </Text>
                </View>
              );
            })}
          </View>

          <FlatList
            data={sellerListings}
            keyExtractor={(item) => item.id}
            renderItem={renderItem}
            contentContainerStyle={styles.list}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
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
                  <Text style={[styles.summaryLabel, { color: Colors.brand }]}>Bundle discount ({discountPercent}%)</Text>
                  <Text style={[styles.summaryValue, { color: Colors.brand }]}>-{formatFromFiat(discountAmount, 'GBP', { displayMode: 'fiat' })}</Text>
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  loadingBody: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  body: {
    flex: 1,
  },
  sellerBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
    backgroundColor: Colors.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  sellerText: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.semibold,
    color: Colors.textPrimary,
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
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  tierChipActive: {
    borderColor: Colors.brand,
    backgroundColor: `${Colors.brand}10`,
  },
  tierChipText: {
    fontSize: 11,
    fontFamily: Typography.family.medium,
    color: Colors.textMuted,
  },
  tierChipTextActive: {
    color: Colors.brand,
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
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  itemRowSelected: {
    borderColor: Colors.brand,
    backgroundColor: `${Colors.brand}08`,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: {
    backgroundColor: Colors.brand,
    borderColor: Colors.brand,
  },
  itemImage: {
    width: 56,
    height: 56,
    borderRadius: Radius.md,
    backgroundColor: Colors.surfaceAlt,
  },
  itemImagePlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemInfo: {
    flex: 1,
    gap: 2,
  },
  itemTitle: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.semibold,
    color: Colors.textPrimary,
  },
  itemPrice: {
    fontSize: Type.subtitle.size,
    fontFamily: Typography.family.bold,
    color: Colors.textPrimary,
  },
  itemMeta: {
    fontSize: 12,
    fontFamily: Typography.family.regular,
    color: Colors.textMuted,
  },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: Colors.surface,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingHorizontal: Space.md,
    paddingVertical: Space.md,
    gap: 4,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 2,
  },
  summaryLabel: {
    fontSize: 13,
    fontFamily: Typography.family.regular,
    color: Colors.textSecondary,
  },
  summaryValue: {
    fontSize: 13,
    fontFamily: Typography.family.semibold,
    color: Colors.textPrimary,
  },
  totalRow: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
    marginTop: 4,
    paddingTop: 8,
  },
  totalLabel: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.bold,
    color: Colors.textPrimary,
  },
  totalValue: {
    fontSize: Type.subtitle.size,
    fontFamily: Typography.family.bold,
    color: Colors.textPrimary,
  },
  checkoutBtn: {
    marginTop: Space.sm,
    width: '100%',
  },
});
