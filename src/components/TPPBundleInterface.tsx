import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  ScrollView,
  ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../constants/colors';

interface BundleItem {
  id: string;
  name: string;
  image: string;
  price: number;
  originalPrice?: number;
  size?: string;
  condition?: string;
}

interface BundleDiscount {
  enabled: boolean;
  type: 'percentage' | 'fixed_amount';
  value: number;
  minimumItems: number;
  message: string;
}

interface TPPBundleInterfaceProps {
  sellerName: string;
  items: BundleItem[];
  discount: BundleDiscount;
  currency: string;
  onItemPress?: (item: BundleItem) => void;
  onCreateBundle?: (selectedItems: BundleItem[]) => void;
  style?: ViewStyle;
}

export function TPPBundleInterface({
  sellerName,
  items,
  discount,
  currency,
  onItemPress,
  onCreateBundle,
  style,
}: TPPBundleInterfaceProps) {
  const [selectedItems, setSelectedItems] = useState<string[]>([]);

  const toggleItem = (itemId: string) => {
    setSelectedItems((prev) =>
      prev.includes(itemId)
        ? prev.filter((id) => id !== itemId)
        : [...prev, itemId]
    );
  };

  const selectedItemsData = useMemo(
    () => items.filter((item) => selectedItems.includes(item.id)),
    [items, selectedItems]
  );

  const subtotal = useMemo(
    () => selectedItemsData.reduce((sum, item) => sum + item.price, 0),
    [selectedItemsData]
  );

  const qualifiesForDiscount =
    discount.enabled && selectedItems.length >= discount.minimumItems;

  const discountAmount = useMemo(() => {
    if (!qualifiesForDiscount) return 0;
    if (discount.type === 'percentage') {
      return subtotal * (discount.value / 100);
    }
    return Math.min(discount.value, subtotal);
  }, [subtotal, discount, qualifiesForDiscount]);

  const total = subtotal - discountAmount;

  const savingsPercentage = useMemo(() => {
    if (subtotal === 0) return 0;
    return Math.round((discountAmount / subtotal) * 100);
  }, [discountAmount, subtotal]);

  return (
    <View style={[styles.container, style]}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.bundleIcon}>
          <Ionicons name="gift-outline" size={24} color={Colors.brand} />
        </View>
        <View style={styles.headerText}>
          <Text style={styles.headerTitle}>Bundle & Save</Text>
          <Text style={styles.headerSubtitle}>
            {discount.message}
          </Text>
        </View>
      </View>

      {/* Discount Progress */}
      {discount.enabled && (
        <View style={styles.progressContainer}>
          <View style={styles.progressHeader}>
            <Text style={styles.progressText}>
              {selectedItems.length >= discount.minimumItems
                ? `🎉 Discount applied! You're saving ${currency} ${discountAmount.toFixed(2)}`
                : `Add ${discount.minimumItems - selectedItems.length} more item${
                    discount.minimumItems - selectedItems.length > 1 ? 's' : ''
                  } to get ${discount.value}${discount.type === 'percentage' ? '%' : currency} off`}
            </Text>
          </View>
          <View style={styles.progressBarContainer}>
            <View
              style={[
                styles.progressBar,
                {
                  width: `${Math.min(
                    (selectedItems.length / discount.minimumItems) * 100,
                    100
                  )}%`,
                  backgroundColor: qualifiesForDiscount
                    ? Colors.success
                    : Colors.brand,
                },
              ]}
            />
          </View>
          <Text style={styles.progressSubtext}>
            {selectedItems.length} of {discount.minimumItems} items selected
          </Text>
        </View>
      )}

      {/* Item Selection Grid */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.itemsContainer}
        contentContainerStyle={styles.itemsContent}
      >
        {items.map((item) => {
          const isSelected = selectedItems.includes(item.id);
          return (
            <TouchableOpacity
              key={item.id}
              style={[styles.itemCard, isSelected && styles.itemCardSelected]}
              onPress={() => {
                toggleItem(item.id);
                onItemPress?.(item);
              }}
              activeOpacity={0.9}
            >
              <Image source={{ uri: item.image }} style={styles.itemImage} />
              
              {/* Selection Indicator */}
              <View
                style={[
                  styles.selectionIndicator,
                  isSelected && styles.selectionIndicatorSelected,
                ]}
              >
                <Ionicons
                  name={isSelected ? 'checkmark-circle' : 'ellipse-outline'}
                  size={24}
                  color={isSelected ? Colors.success : Colors.textMuted}
                />
              </View>

              {/* Item Info */}
              <View style={styles.itemInfo}>
                <Text style={styles.itemName} numberOfLines={1}>
                  {item.name}
                </Text>
                {item.size && (
                  <Text style={styles.itemMeta}>Size {item.size}</Text>
                )}
                <View style={styles.priceRow}>
                  <Text style={styles.itemPrice}>
                    {currency} {item.price.toFixed(2)}
                  </Text>
                  {item.originalPrice && (
                    <Text style={styles.originalPrice}>
                      {currency} {item.originalPrice.toFixed(2)}
                    </Text>
                  )}
                </View>
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Bundle Summary */}
      {selectedItems.length > 0 && (
        <View style={styles.summaryContainer}>
          <Text style={styles.summaryTitle}>Bundle Summary</Text>
          
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>
              Subtotal ({selectedItems.length} items)
            </Text>
            <Text style={styles.summaryValue}>
              {currency} {subtotal.toFixed(2)}
            </Text>
          </View>

          {qualifiesForDiscount && (
            <>
              <View style={styles.summaryRow}>
                <View style={styles.discountLabelContainer}>
                  <Ionicons
                    name="pricetag"
                    size={14}
                    color={Colors.success}
                    style={{ marginRight: 4 }}
                  />
                  <Text style={styles.discountLabel}>
                    Bundle Discount ({savingsPercentage}% off)
                  </Text>
                </View>
                <Text style={styles.discountValue}>
                  -{currency} {discountAmount.toFixed(2)}
                </Text>
              </View>
              <View style={styles.savingsBadge}>
                <Text style={styles.savingsText}>
                  You save {currency} {discountAmount.toFixed(2)}!
                </Text>
              </View>
            </>
          )}

          <View style={[styles.summaryRow, styles.totalRow]}>
            <Text style={styles.totalLabel}>Total</Text>
            <Text style={styles.totalValue}>
              {currency} {total.toFixed(2)}
            </Text>
          </View>

          <TouchableOpacity
            style={[
              styles.createBundleButton,
              !qualifiesForDiscount && styles.createBundleButtonDisabled,
            ]}
            onPress={() => onCreateBundle?.(selectedItemsData)}
            disabled={!qualifiesForDiscount}
          >
            <Ionicons name="cart-outline" size={20} color="#FFFFFF" />
            <Text style={styles.createBundleButtonText}>
              {qualifiesForDiscount
                ? `Create Bundle & Save ${savingsPercentage}%`
                : `Add ${discount.minimumItems - selectedItems.length} more to save`}
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.surface,
    padding: 16,
    borderRadius: 16,
    marginHorizontal: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  bundleIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: `${Colors.brand}15`,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  headerText: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  headerSubtitle: {
    fontSize: 14,
    color: Colors.textMuted,
    marginTop: 2,
  },
  progressContainer: {
    backgroundColor: Colors.background,
    padding: 12,
    borderRadius: 12,
    marginBottom: 16,
  },
  progressHeader: {
    marginBottom: 8,
  },
  progressText: {
    fontSize: 14,
    color: Colors.textPrimary,
    fontWeight: '500',
  },
  progressBarContainer: {
    height: 8,
    backgroundColor: Colors.border,
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    borderRadius: 4,
  },
  progressSubtext: {
    fontSize: 12,
    color: Colors.textMuted,
    marginTop: 6,
  },
  itemsContainer: {
    marginBottom: 16,
  },
  itemsContent: {
    gap: 12,
    paddingRight: 16,
  },
  itemCard: {
    width: 140,
    backgroundColor: Colors.background,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  itemCardSelected: {
    borderColor: Colors.success,
  },
  itemImage: {
    width: '100%',
    height: 140,
  },
  selectionIndicator: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
  },
  selectionIndicatorSelected: {
    backgroundColor: 'transparent',
  },
  itemInfo: {
    padding: 10,
  },
  itemName: {
    fontSize: 13,
    color: Colors.textPrimary,
    marginBottom: 2,
  },
  itemMeta: {
    fontSize: 12,
    color: Colors.textMuted,
    marginBottom: 4,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  itemPrice: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  originalPrice: {
    fontSize: 12,
    color: Colors.textMuted,
    textDecorationLine: 'line-through',
  },
  summaryContainer: {
    backgroundColor: Colors.background,
    padding: 16,
    borderRadius: 12,
  },
  summaryTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: 12,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  summaryLabel: {
    fontSize: 14,
    color: Colors.textMuted,
  },
  summaryValue: {
    fontSize: 14,
    color: Colors.textPrimary,
  },
  discountLabelContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  discountLabel: {
    fontSize: 14,
    color: Colors.success,
  },
  discountValue: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.success,
  },
  savingsBadge: {
    backgroundColor: `${Colors.success}15`,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    alignSelf: 'flex-start',
    marginBottom: 12,
  },
  savingsText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.success,
  },
  totalRow: {
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingTop: 12,
    marginTop: 4,
    marginBottom: 16,
  },
  totalLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  totalValue: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  createBundleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Colors.brand,
    paddingVertical: 14,
    borderRadius: 12,
  },
  createBundleButtonDisabled: {
    backgroundColor: Colors.textMuted,
    opacity: 0.5,
  },
  createBundleButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});
