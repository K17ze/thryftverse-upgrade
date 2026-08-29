import React, { useState, useMemo, useCallback } from 'react';
import { View, Text, StyleSheet, RefreshControl } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAppTheme, type ThemeColors } from '../theme/ThemeContext';
import { Space, Radius, Stroke } from '../theme/designTokens';
import { TypographyV2 } from '../theme/typography.v2';
import { RootStackParamList } from '../navigation/types';
import { FlagshipScreen, FlagshipHeader, FlagshipState } from '../components/flagship';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { AppButton } from '../components/ui/AppButton';
import { CachedImage } from '../components/CachedImage';
import { EmptyState } from '../components/EmptyState';
import { useBackendData } from '../context/BackendDataContext';
import { useFormattedPrice } from '../hooks/useFormattedPrice';
import { useHaptic } from '../hooks/useHaptic';
import { useToast } from '../context/ToastContext';

type NavT = NativeStackNavigationProp<RootStackParamList>;
type RouteT = RouteProp<RootStackParamList, 'BundleBag'>;

export default function BundleBagScreen() {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const navigation = useNavigation<NavT>();
  const route = useRoute<RouteT>();
  const { sellerId, sellerName } = route.params ?? { sellerId: '', sellerName: '' };
  const { listings, isSyncing, refreshListings } = useBackendData();
  const { currencyCode, formatFromFiat } = useFormattedPrice();
  const haptic = useHaptic();
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

  // Shipping is not available from the backend for bundle orders — do not
  // fabricate a number. Show "Calculated at checkout" in the summary instead.
  // Bundle discounts are not supported by the backend — do not fabricate tiers.
  const total = subtotal;

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
      show('Select at least 2 items to create a bundle.', 'info');
      return;
    }
    // Bundle checkout (multi-item) is not supported by the backend. Be honest
    // with the user instead of silently checking out only the first item.
    show('Checkout each item individually. Starting with the first selected item.', 'info');
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
          <Text style={styles.itemPrice}>{formatFromFiat(item.price, currencyCode, { displayMode: 'fiat' })}</Text>
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
          {/* Hero summary — flat, no card */}
          <View style={styles.heroWrap}>
            <View style={styles.heroRow}>
              <View style={styles.heroText}>
                <Text style={[styles.heroTitle, { color: colors.textPrimary }]}>
                  {selectedItems.length} selected
                </Text>
                <Text style={[styles.heroSubtitle, { color: colors.textSecondary }]}>
                  {sellerListings.length} items from {sellerName ?? 'this seller'}
                </Text>
              </View>
            </View>
          </View>

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
                <Text style={styles.summaryValue}>{formatFromFiat(subtotal, currencyCode, { displayMode: 'fiat' })}</Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Shipping</Text>
                <Text style={styles.summaryValue}>Calculated at checkout</Text>
              </View>
              <View style={[styles.summaryRow, styles.totalRow]}>
                <Text style={styles.totalLabel}>Total</Text>
                <Text style={styles.totalValue}>{formatFromFiat(total, currencyCode, { displayMode: 'fiat' })}</Text>
              </View>
              <AppButton
                title={selectedItems.length < 2 ? 'Select 2+ items' : `Checkout · ${formatFromFiat(total, currencyCode, { displayMode: 'fiat' })}`}
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
  heroWrap: {
    paddingHorizontal: Space.md,
    paddingTop: Space.sm,
    paddingBottom: Space.sm },
  heroRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md },
  heroText: { flex: 1 },
  heroTitle: {
    fontSize: TypographyV2.bodyStrong.size,
    fontFamily: TypographyV2.bodyStrong.fontFamily,
    letterSpacing: TypographyV2.body.letterSpacing },
  heroSubtitle: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    marginTop: Space.xs / 2 },
  loadingBody: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center' },
  body: {
    flex: 1 },
  list: {
    paddingHorizontal: Space.md,
    paddingTop: Space.sm,
    gap: Space.sm,
    paddingBottom: 300 },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm + 2,
    borderRadius: Radius.md,
    backgroundColor: colors.surface,
    borderWidth: Stroke.standard,
    borderColor: colors.border },
  itemRowSelected: {
    borderColor: colors.brand,
    backgroundColor: colors.brandSubtle },
  checkbox: {
    width: Space.lg,
    height: Space.lg,
    borderRadius: Radius.lg,
    borderWidth: Stroke.emphasis,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center' },
  checkboxChecked: {
    backgroundColor: colors.brand,
    borderColor: colors.brand },
  itemImage: {
    width: Space.xxl + Space.sm,
    height: Space.xxl + Space.sm,
    borderRadius: Radius.md,
    backgroundColor: colors.surfaceAlt },
  itemImagePlaceholder: {
    alignItems: 'center',
    justifyContent: 'center' },
  itemInfo: {
    flex: 1,
    gap: Space.xs / 2 },
  itemTitle: {
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily,
    color: colors.textPrimary },
  itemPrice: {
    fontSize: TypographyV2.sectionTitle.size,
    fontFamily: TypographyV2.sectionTitle.fontFamily,
    color: colors.textPrimary },
  itemMeta: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    color: colors.textMuted },
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
    gap: Space.xs },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Space.xs / 2 },
  summaryLabel: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    color: colors.textSecondary },
  summaryValue: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    color: colors.textPrimary },
  totalRow: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    marginTop: Space.xs,
    paddingTop: Space.sm },
  totalLabel: {
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily,
    color: colors.textPrimary },
  totalValue: {
    fontSize: TypographyV2.sectionTitle.size,
    fontFamily: TypographyV2.sectionTitle.fontFamily,
    color: colors.textPrimary },
  checkoutBtn: {
    marginTop: Space.sm,
    width: '100%' } });
}