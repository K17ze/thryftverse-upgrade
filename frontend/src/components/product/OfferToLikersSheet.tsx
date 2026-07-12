import React, { useState, useMemo, useCallback } from 'react';
import { View, Text, StyleSheet, Modal, Pressable, ScrollView, TextInput, Switch } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/colors';
import { Typography, Space, Radius } from '../../theme/designTokens';
import { AnimatedPressable } from '../AnimatedPressable';
import { CachedImage } from '../CachedImage';
import { AppButton } from '../ui/AppButton';
import { useFormattedPrice } from '../../hooks/useFormattedPrice';
import { useCurrencyContext } from '../../context/CurrencyContext';
import { CURRENCIES } from '../../constants/currencies';
import { convertGbpToDisplayAmount, sanitizeDecimalInput } from '../../utils/currencyAuthoringFlows';
import { haptics } from '../../utils/haptics';

// ── Types ────────────────────────────────────────────────────────────────────

export interface OfferToLikersSheetProps {
  visible: boolean;
  listing: {
    id: string;
    title: string;
    price: number;
    image?: string;
    likes: number;
  } | null;
  onClose: () => void;
  onSend: (params: {
    listingId: string;
    discountPercent: number;
    offerPrice: number;
    includeFreeShipping: boolean;
    expiryHours: number;
    likerCount: number;
  }) => void;
}

const DISCOUNT_PRESETS = [10, 15, 20, 25];
const EXPIRY_OPTIONS = [24, 48, 72];

// ── Component ────────────────────────────────────────────────────────────────

export function OfferToLikersSheet({
  visible,
  listing,
  onClose,
  onSend,
}: OfferToLikersSheetProps) {
  const { formatFromFiat } = useFormattedPrice();
  const { currencyCode, goldRates } = useCurrencyContext();
  const currencySymbol = CURRENCIES[currencyCode].symbol;

  const [selectedDiscount, setSelectedDiscount] = useState(15);
  const [customPrice, setCustomPrice] = useState('');
  const [useCustomPrice, setUseCustomPrice] = useState(false);
  const [includeFreeShipping, setIncludeFreeShipping] = useState(false);
  const [expiryHours, setExpiryHours] = useState(48);

  // Reset state when sheet opens for a new listing
  React.useEffect(() => {
    if (visible && listing) {
      setSelectedDiscount(15);
      setCustomPrice('');
      setUseCustomPrice(false);
      setIncludeFreeShipping(false);
      setExpiryHours(48);
    }
  }, [visible, listing?.id]);

  const askingPrice = listing?.price ?? 0;

  const computedOfferPrice = useMemo(() => {
    if (useCustomPrice) {
      return parseFloat(customPrice) || 0;
    }
    return askingPrice * (1 - selectedDiscount / 100);
  }, [useCustomPrice, customPrice, askingPrice, selectedDiscount]);

  const formattedOfferPrice = formatFromFiat(computedOfferPrice, 'GBP');
  const formattedAskingPrice = formatFromFiat(askingPrice, 'GBP');
  const savingsAmount = askingPrice - computedOfferPrice;
  const formattedSavings = formatFromFiat(savingsAmount, 'GBP');

  const likerCount = listing?.likes ?? 0;

  const handleDiscountSelect = useCallback((pct: number) => {
    setSelectedDiscount(pct);
    setUseCustomPrice(false);
    haptics.tap();
  }, []);

  const handleCustomPriceFocus = useCallback(() => {
    setUseCustomPrice(true);
    // Pre-fill with the current discount-based price
    const displayAmount = convertGbpToDisplayAmount(
      askingPrice * (1 - selectedDiscount / 100),
      currencyCode,
      goldRates,
    );
    setCustomPrice((Number.isFinite(displayAmount) ? displayAmount : askingPrice).toFixed(2));
  }, [askingPrice, selectedDiscount, currencyCode, goldRates]);

  const handleCustomPriceChange = useCallback((value: string) => {
    setCustomPrice(sanitizeDecimalInput(value));
  }, []);

  const handleSend = useCallback(() => {
    if (!listing || computedOfferPrice <= 0) return;
    haptics.press();
    const discountPercent = useCustomPrice
      ? Math.round(((askingPrice - computedOfferPrice) / askingPrice) * 100)
      : selectedDiscount;
    onSend({
      listingId: listing.id,
      discountPercent,
      offerPrice: computedOfferPrice,
      includeFreeShipping,
      expiryHours,
      likerCount,
    });
  }, [listing, computedOfferPrice, useCustomPrice, askingPrice, selectedDiscount, includeFreeShipping, expiryHours, likerCount, onSend]);

  if (!listing) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.handle} />

          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <View style={styles.headerIconWrap}>
                <Ionicons name="heart-outline" size={18} color={Colors.brand} />
              </View>
              <View>
                <Text style={styles.title}>Offer to likers</Text>
                <Text style={styles.subtitle}>
                  Send a private discount to {likerCount} {likerCount === 1 ? 'person' : 'people'} who liked this item
                </Text>
              </View>
            </View>
            <Pressable
              onPress={onClose}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="Close offer to likers"
            >
              <Text style={styles.closeText}>Done</Text>
            </Pressable>
          </View>

          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {/* Item preview */}
            <View style={styles.itemRow}>
              {listing.image ? (
                <CachedImage uri={listing.image} style={styles.itemImage} contentFit="cover" />
              ) : (
                <View style={styles.itemImageFallback}>
                  <Ionicons name="shirt-outline" size={20} color={Colors.textMuted} />
                </View>
              )}
              <View style={styles.itemInfo}>
                <Text style={styles.itemTitle} numberOfLines={2}>{listing.title}</Text>
                <Text style={styles.itemPrice}>Listed at {formattedAskingPrice}</Text>
              </View>
            </View>

            {/* Discount presets */}
            <Text style={styles.sectionLabel}>Discount</Text>
            <View style={styles.discountRow}>
              {DISCOUNT_PRESETS.map((pct) => {
                const isActive = !useCustomPrice && selectedDiscount === pct;
                const discountedGbp = askingPrice * (1 - pct / 100);
                const displayAmount = convertGbpToDisplayAmount(discountedGbp, currencyCode, goldRates);
                const label = Number.isFinite(displayAmount)
                  ? `${pct}% off · ${currencySymbol}${displayAmount.toFixed(0)}`
                  : `${pct}% off`;
                return (
                  <AnimatedPressable
                    key={pct}
                    style={[styles.discountChip, isActive && styles.discountChipActive]}
                    onPress={() => handleDiscountSelect(pct)}
                    activeOpacity={0.8}
                    scaleValue={0.97}
                    accessibilityRole="button"
                    accessibilityLabel={`${pct} percent discount, ${label}`}
                    accessibilityState={{ selected: isActive }}
                  >
                    <Text style={[styles.discountChipText, isActive && styles.discountChipTextActive]}>
                      {label}
                    </Text>
                  </AnimatedPressable>
                );
              })}
            </View>

            {/* Custom price input */}
            <Pressable
              style={styles.customPriceToggle}
              onPress={handleCustomPriceFocus}
              accessibilityRole="button"
              accessibilityLabel="Set custom offer price"
            >
              <View style={styles.customPriceToggleLeft}>
                <Ionicons name="create-outline" size={16} color={Colors.textSecondary} />
                <Text style={styles.customPriceToggleLabel}>Custom price</Text>
              </View>
              {useCustomPrice && (
                <View style={styles.customPriceInputRow}>
                  <Text style={styles.currencySymbol}>{currencySymbol}</Text>
                  <TextInput
                    style={styles.customPriceInput}
                    value={customPrice}
                    onChangeText={handleCustomPriceChange}
                    keyboardType="decimal-pad"
                    selectionColor={Colors.brand}
                    placeholderTextColor={Colors.textMuted}
                    placeholder="0.00"
                    accessibilityLabel="Custom offer price"
                  />
                </View>
              )}
            </Pressable>

            {/* Free shipping toggle */}
            <View style={styles.toggleRow}>
              <View style={styles.toggleLeft}>
                <View style={[styles.toggleIconWrap, { backgroundColor: includeFreeShipping ? `${Colors.success}15` : Colors.surfaceAlt }]}>
                  <Ionicons
                    name="cube-outline"
                    size={16}
                    color={includeFreeShipping ? Colors.success : Colors.textMuted}
                  />
                </View>
                <View>
                  <Text style={styles.toggleTitle}>Include free shipping</Text>
                  <Text style={styles.toggleSub}>Sellers cover shipping to increase acceptance</Text>
                </View>
              </View>
              <Switch
                value={includeFreeShipping}
                onValueChange={(v) => { setIncludeFreeShipping(v); haptics.tap(); }}
                accessibilityRole="switch"
                accessibilityLabel="Include free shipping in offer"
                accessibilityState={{ checked: includeFreeShipping }}
              />
            </View>

            {/* Expiry selector */}
            <Text style={styles.sectionLabel}>Offer valid for</Text>
            <View style={styles.expiryRow}>
              {EXPIRY_OPTIONS.map((hours) => (
                <AnimatedPressable
                  key={hours}
                  style={[styles.expiryChip, expiryHours === hours && styles.expiryChipActive]}
                  onPress={() => { setExpiryHours(hours); haptics.tap(); }}
                  activeOpacity={0.8}
                  scaleValue={0.97}
                  accessibilityRole="button"
                  accessibilityLabel={`Offer valid for ${hours} hours`}
                  accessibilityState={{ selected: expiryHours === hours }}
                >
                  <Text style={[styles.expiryChipText, expiryHours === hours && styles.expiryChipTextActive]}>
                    {hours}h
                  </Text>
                </AnimatedPressable>
              ))}
            </View>
            <Text style={styles.expiryHint}>
              Likers have {expiryHours} hours to accept. After that, the offer expires automatically.
            </Text>

            {/* Summary */}
            <View style={styles.summaryCard}>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Offer price</Text>
                <Text style={styles.summaryValue}>{formattedOfferPrice}</Text>
              </View>
              <View style={[styles.summaryRow, styles.summaryRowDivider]}>
                <Text style={styles.summaryLabel}>Buyer saves</Text>
                <Text style={[styles.summaryValue, { color: Colors.success }]}>{formattedSavings}</Text>
              </View>
              {includeFreeShipping && (
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Shipping</Text>
                  <Text style={[styles.summaryValue, { color: Colors.success }]}>Free</Text>
                </View>
              )}
            </View>

            {/* Info note */}
            <View style={styles.infoNote}>
              <Ionicons name="lock-closed-outline" size={13} color={Colors.textMuted} />
              <Text style={styles.infoNoteText}>
                Each liker receives a private offer. Only one offer per listing at a time.
              </Text>
            </View>
          </ScrollView>

          {/* Footer CTA */}
          <View style={styles.footer}>
            <AppButton
              style={styles.sendBtn}
              title={`Send to ${likerCount} ${likerCount === 1 ? 'liker' : 'likers'}`}
              subtitle={formattedOfferPrice}
              icon={<Ionicons name="paper-plane-outline" size={16} color={Colors.textInverse} />}
              variant="primary"
              size="lg"
              onPress={handleSend}
              disabled={computedOfferPrice <= 0 || likerCount === 0}
              accessibilityLabel={`Send offer of ${formattedOfferPrice} to ${likerCount} likers`}
            />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  sheet: {
    backgroundColor: Colors.background,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    paddingBottom: Space.xl,
    maxHeight: '85%',
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.border,
    alignSelf: 'center',
    marginTop: Space.sm,
    marginBottom: Space.xs,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: Space.md,
    paddingBottom: Space.sm,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Space.sm,
    flex: 1,
    paddingRight: Space.sm,
  },
  headerIconWrap: {
    width: 32,
    height: 32,
    borderRadius: Radius.full,
    backgroundColor: `${Colors.brand}15`,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  title: {
    fontSize: 17,
    fontFamily: Typography.family.bold,
    color: Colors.textPrimary,
    marginBottom: 2,
  },
  subtitle: {
    fontSize: 13,
    fontFamily: Typography.family.regular,
    color: Colors.textSecondary,
    lineHeight: 17,
  },
  closeText: {
    fontSize: 15,
    fontFamily: Typography.family.semibold,
    color: Colors.brand,
    marginTop: 4,
  },
  scroll: {
    paddingHorizontal: Space.md,
  },
  scrollContent: {
    paddingBottom: Space.lg,
  },

  // Item preview
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm + 2,
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: Space.md,
    marginBottom: Space.lg,
  },
  itemImage: {
    width: 56,
    height: 56,
    borderRadius: Radius.md,
  },
  itemImageFallback: {
    width: 56,
    height: 56,
    borderRadius: Radius.md,
    backgroundColor: Colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemInfo: {
    flex: 1,
  },
  itemTitle: {
    fontSize: 15,
    fontFamily: Typography.family.semibold,
    color: Colors.textPrimary,
    marginBottom: 4,
    lineHeight: 19,
  },
  itemPrice: {
    fontSize: 13,
    fontFamily: Typography.family.regular,
    color: Colors.textMuted,
  },

  // Section labels
  sectionLabel: {
    fontSize: 13,
    fontFamily: Typography.family.semibold,
    color: Colors.textSecondary,
    letterSpacing: 0.2,
    marginBottom: Space.sm,
  },

  // Discount chips
  discountRow: {
    flexDirection: 'row',
    gap: Space.xs,
    marginBottom: Space.md,
  },
  discountChip: {
    flex: 1,
    paddingVertical: Space.sm + 2,
    borderRadius: Radius.md,
    backgroundColor: Colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
    alignItems: 'center',
    minHeight: 48,
    justifyContent: 'center',
  },
  discountChipActive: {
    backgroundColor: `${Colors.brand}12`,
    borderColor: Colors.brand,
    borderWidth: 1.5,
  },
  discountChipText: {
    fontSize: 12,
    fontFamily: Typography.family.semibold,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  discountChipTextActive: {
    color: Colors.brand,
  },

  // Custom price
  customPriceToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm + 2,
    minHeight: 48,
    marginBottom: Space.md,
  },
  customPriceToggleLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
  },
  customPriceToggleLabel: {
    fontSize: 14,
    fontFamily: Typography.family.medium,
    color: Colors.textPrimary,
  },
  customPriceInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  currencySymbol: {
    fontSize: 16,
    fontFamily: Typography.family.bold,
    color: Colors.brand,
  },
  customPriceInput: {
    fontSize: 16,
    fontFamily: Typography.family.bold,
    color: Colors.textPrimary,
    minWidth: 60,
    paddingVertical: 0,
  },

  // Toggle row
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm + 2,
    minHeight: 56,
    marginBottom: Space.lg,
  },
  toggleLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    flex: 1,
    paddingRight: Space.sm,
  },
  toggleIconWrap: {
    width: 32,
    height: 32,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toggleTitle: {
    fontSize: 14,
    fontFamily: Typography.family.semibold,
    color: Colors.textPrimary,
    marginBottom: 2,
  },
  toggleSub: {
    fontSize: 12,
    fontFamily: Typography.family.regular,
    color: Colors.textMuted,
    lineHeight: 15,
  },

  // Expiry
  expiryRow: {
    flexDirection: 'row',
    gap: Space.xs,
    marginBottom: Space.xs,
  },
  expiryChip: {
    flex: 1,
    paddingVertical: Space.sm + 2,
    borderRadius: Radius.md,
    backgroundColor: Colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
    alignItems: 'center',
    minHeight: 48,
    justifyContent: 'center',
  },
  expiryChipActive: {
    backgroundColor: `${Colors.brand}12`,
    borderColor: Colors.brand,
    borderWidth: 1.5,
  },
  expiryChipText: {
    fontSize: 14,
    fontFamily: Typography.family.semibold,
    color: Colors.textSecondary,
  },
  expiryChipTextActive: {
    color: Colors.brand,
  },
  expiryHint: {
    fontSize: 12,
    fontFamily: Typography.family.regular,
    color: Colors.textMuted,
    marginTop: Space.xs,
    lineHeight: 16,
    marginBottom: Space.lg,
  },

  // Summary
  summaryCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: Space.md,
    marginBottom: Space.md,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  summaryRowDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
    marginTop: 2,
    paddingTop: 10,
  },
  summaryLabel: {
    fontSize: 14,
    fontFamily: Typography.family.medium,
    color: Colors.textSecondary,
  },
  summaryValue: {
    fontSize: 16,
    fontFamily: Typography.family.bold,
    color: Colors.textPrimary,
  },

  // Info note
  infoNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    paddingHorizontal: Space.xs,
  },
  infoNoteText: {
    flex: 1,
    fontSize: 12,
    fontFamily: Typography.family.regular,
    color: Colors.textMuted,
    lineHeight: 16,
  },

  // Footer
  footer: {
    paddingHorizontal: Space.md,
    paddingTop: Space.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
  },
  sendBtn: {
    width: '100%',
  },
});
