import React, { useState, useMemo, useCallback } from 'react';
import { View, Text, StyleSheet, Modal, Pressable, ScrollView, TextInput, Switch } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Typography, Space, Radius, Type } from '../../theme/designTokens';
import { useAppTheme } from '../../theme/ThemeContext';
import { AnimatedPressable } from '../AnimatedPressable';
import { CachedImage } from '../CachedImage';
import { AppButton } from '../ui/AppButton';
import { useFormattedPrice } from '../../hooks/useFormattedPrice';
import { useCurrencyContext } from '../../context/CurrencyContext';
import { CURRENCIES, DEFAULT_CURRENCY_CODE } from '../../constants/currencies';
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
  const { colors } = useAppTheme();
  const themed = {
    textPrimary: colors.textPrimary,
    textSecondary: colors.textSecondary,
    textMuted: colors.textMuted,
    brand: colors.brand,
    border: colors.border,
    borderSubtle: colors.borderSubtle,
    surface: colors.surface,
    surfaceAlt: colors.surfaceAlt,
    surfaceElevated: colors.surfaceElevated,
    danger: colors.danger,
    success: colors.success,
    warning: colors.warning,
    background: colors.background,
    textInverse: colors.textInverse,
    overlay: colors.overlay,
  };
  const styles = React.useMemo(() => createStyles(themed), [themed]);
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

  const formattedOfferPrice = formatFromFiat(computedOfferPrice, DEFAULT_CURRENCY_CODE);
  const formattedAskingPrice = formatFromFiat(askingPrice, DEFAULT_CURRENCY_CODE);
  const savingsAmount = askingPrice - computedOfferPrice;
  const formattedSavings = formatFromFiat(savingsAmount, DEFAULT_CURRENCY_CODE);

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
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.handle} />

          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <View style={styles.headerIconWrap}>
                <Ionicons name="heart-outline" size={18} color={themed.brand} />
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
                  <Ionicons name="shirt-outline" size={20} color={themed.textMuted} />
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
                <Ionicons name="create-outline" size={16} color={themed.textSecondary} />
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
                    selectionColor={themed.brand}
                    placeholderTextColor={themed.textMuted}
                    placeholder="0.00"
                    accessibilityLabel="Custom offer price"
                  />
                </View>
              )}
            </Pressable>

            {/* Free shipping toggle */}
            <View style={styles.toggleRow}>
              <View style={styles.toggleLeft}>
                <View style={[styles.toggleIconWrap, { backgroundColor: includeFreeShipping ? `${themed.success}15` : themed.surfaceAlt }]}>
                  <Ionicons
                    name="cube-outline"
                    size={16}
                    color={includeFreeShipping ? themed.success : themed.textMuted}
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
                <Text style={[styles.summaryValue, { color: themed.success }]}>{formattedSavings}</Text>
              </View>
              {includeFreeShipping && (
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Shipping</Text>
                  <Text style={[styles.summaryValue, { color: themed.success }]}>Free</Text>
                </View>
              )}
            </View>

            {/* Info note */}
            <View style={styles.infoNote}>
              <Ionicons name="lock-closed-outline" size={13} color={themed.textMuted} />
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
              icon={<Ionicons name="paper-plane-outline" size={16} color={themed.textInverse} />}
              variant="primary"
              size="lg"
              onPress={handleSend}
              disabled={computedOfferPrice <= 0 || likerCount === 0}
              accessibilityLabel={`Send offer of ${formattedOfferPrice} to ${likerCount} likers`}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────

const createStyles = (themed: {
  textPrimary: string; textSecondary: string; textMuted: string;
  brand: string; border: string; borderSubtle: string;
  surface: string; surfaceAlt: string; surfaceElevated: string;
  danger: string; success: string; warning: string;
  background: string; textInverse: string; overlay: string;
}) => StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: themed.overlay,
  },
  sheet: {
    backgroundColor: themed.background,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    paddingBottom: Space.xl,
    maxHeight: '85%',
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: Radius.sm,
    backgroundColor: themed.border,
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
    backgroundColor: `${themed.brand}15`,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  title: {
    fontSize: Type.subtitle.size,
    fontFamily: Typography.family.bold,
    color: themed.textPrimary,
    marginBottom: 2,
  },
  subtitle: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.regular,
    color: themed.textSecondary,
    lineHeight: 17,
  },
  closeText: {
    fontSize: Type.bodyStrong.size,
    fontFamily: Typography.family.semibold,
    color: themed.brand,
    marginTop: Space.xs,
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
    backgroundColor: themed.surface,
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
    backgroundColor: themed.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemInfo: {
    flex: 1,
  },
  itemTitle: {
    fontSize: Type.bodyStrong.size,
    fontFamily: Typography.family.semibold,
    color: themed.textPrimary,
    marginBottom: Space.xs,
    lineHeight: 19,
  },
  itemPrice: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.regular,
    color: themed.textMuted,
  },

  // Section labels
  sectionLabel: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.semibold,
    color: themed.textSecondary,
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
    backgroundColor: themed.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: themed.border,
    alignItems: 'center',
    minHeight: 48,
    justifyContent: 'center',
  },
  discountChipActive: {
    backgroundColor: `${themed.brand}12`,
    borderColor: themed.brand,
    borderWidth: 1.5,
  },
  discountChipText: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.semibold,
    color: themed.textSecondary,
    textAlign: 'center',
  },
  discountChipTextActive: {
    color: themed.brand,
  },

  // Custom price
  customPriceToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: themed.surface,
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
    fontSize: Type.body.size,
    fontFamily: Typography.family.medium,
    color: themed.textPrimary,
  },
  customPriceInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
  },
  currencySymbol: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.bold,
    color: themed.brand,
  },
  customPriceInput: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.bold,
    color: themed.textPrimary,
    minWidth: 60,
    paddingVertical: 0,
  },

  // Toggle row
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: themed.surface,
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
    fontSize: Type.body.size,
    fontFamily: Typography.family.semibold,
    color: themed.textPrimary,
    marginBottom: 2,
  },
  toggleSub: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.regular,
    color: themed.textMuted,
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
    backgroundColor: themed.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: themed.border,
    alignItems: 'center',
    minHeight: 48,
    justifyContent: 'center',
  },
  expiryChipActive: {
    backgroundColor: `${themed.brand}12`,
    borderColor: themed.brand,
    borderWidth: 1.5,
  },
  expiryChipText: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.semibold,
    color: themed.textSecondary,
  },
  expiryChipTextActive: {
    color: themed.brand,
  },
  expiryHint: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.regular,
    color: themed.textMuted,
    marginTop: Space.xs,
    lineHeight: 16,
    marginBottom: Space.lg,
  },

  // Summary
  summaryCard: {
    backgroundColor: themed.surface,
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
    borderTopColor: themed.border,
    marginTop: 2,
    paddingTop: 10,
  },
  summaryLabel: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.medium,
    color: themed.textSecondary,
  },
  summaryValue: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.bold,
    color: themed.textPrimary,
  },

  // Info note
  infoNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Space.xs + 2,
    paddingHorizontal: Space.xs,
  },
  infoNoteText: {
    flex: 1,
    fontSize: Type.caption.size,
    fontFamily: Typography.family.regular,
    color: themed.textMuted,
    lineHeight: 16,
  },

  // Footer
  footer: {
    paddingHorizontal: Space.md,
    paddingTop: Space.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: themed.border,
  },
  sendBtn: {
    width: '100%',
  },
});
