import React from 'react';
import { View, Text, StyleSheet, Modal, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAppTheme } from '../../theme/ThemeContext';
import { Space, Radius, FontFamily, Control, Stroke } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { haptics } from '../../utils/haptics';

export interface ShippingPickerSheetProps {
  visible: boolean;
  onClose: () => void;
  shippingMethod: 'standard' | 'express' | null;
  shippingPayer: 'buyer' | 'seller' | null;
  onSetShippingMethod: (method: 'standard' | 'express') => void;
  onSetShippingPayer: (payer: 'buyer' | 'seller') => void;
}

/**
 * Bottom sheet modal for selecting shipping method and who pays.
 * Slides up from the bottom with a backdrop dismiss. Uses radio-style
 * selection rows for each option.
 */
function ShippingPickerSheet({
  visible,
  onClose,
  shippingMethod,
  shippingPayer,
  onSetShippingMethod,
  onSetShippingPayer }: ShippingPickerSheetProps) {
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <Pressable style={[styles.shippingSheetBackdrop, { backgroundColor: colors.overlay }]} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close shipping options">
        <Pressable
          style={[styles.shippingSheet, { backgroundColor: colors.background, paddingBottom: insets.bottom + Space.md }]}
          onPress={(e) => { e.stopPropagation(); }}
          accessibilityRole="button"
        >
          {/* Header */}
          <View style={styles.shippingSheetHeader}>
            <View style={[styles.shippingSheetHandle, { backgroundColor: colors.border }]} />
            <View style={styles.shippingSheetTitleRow}>
              <Text style={[styles.shippingSheetTitle, { color: colors.textPrimary }]}>Delivery</Text>
              <Pressable
                hitSlop={Control.hit}
                onPress={() => { onClose(); haptics.tap(); }}
                accessibilityRole="button"
                accessibilityLabel="Close delivery options"
              >
                <Ionicons name="close" size={22} color={colors.textMuted} aria-hidden={true} />
              </Pressable>
            </View>
          </View>

          {/* Shipping method section */}
          <Text style={[styles.shippingSheetSectionLabel, { color: colors.textMuted }]}>Shipping method</Text>
          {(['standard', 'express'] as const).map((m) => {
            const active = shippingMethod === m;
            return (
              <Pressable
                key={m}
                style={({ pressed }) => [styles.shippingSheetRow, { borderBottomColor: colors.border }, pressed && { opacity: 0.6 }]}
                onPress={() => { onSetShippingMethod(m); haptics.selection(); }}
                accessibilityRole="button"
                accessibilityLabel={`Set shipping method to ${m}`}
                accessibilityState={{ selected: active }}
              >
                <Ionicons name={m === 'standard' ? 'cube-outline' : 'flash-outline'} size={22} color={colors.textPrimary} style={{ marginRight: Space.md }} aria-hidden={true} />
                <Text style={[styles.shippingSheetRowLabel, { color: colors.textPrimary }]}>
                  {m === 'standard' ? 'Standard' : 'Express'}
                </Text>
                <View style={[styles.shippingSheetRadioOuter, { borderColor: active ? colors.brand : colors.border }]}>
                  {active && <View style={[styles.shippingSheetRadioInner, { backgroundColor: colors.brand }]} />}
                </View>
              </Pressable>
            );
          })}

          {/* Who pays section */}
          <Text style={[styles.shippingSheetSectionLabel, { color: colors.textMuted, marginTop: Space.lg }]}>Who pays</Text>
          {(['buyer', 'seller'] as const).map((p) => {
            const active = shippingPayer === p;
            return (
              <Pressable
                key={p}
                style={({ pressed }) => [styles.shippingSheetRow, { borderBottomColor: colors.border }, pressed && { opacity: 0.6 }]}
                onPress={() => { onSetShippingPayer(p); haptics.selection(); }}
                accessibilityRole="button"
                accessibilityLabel={`Set shipping payer to ${p}`}
                accessibilityState={{ selected: active }}
              >
                <Ionicons name={p === 'buyer' ? 'person-outline' : 'storefront-outline'} size={22} color={colors.textPrimary} style={{ marginRight: Space.md }} aria-hidden={true} />
                <Text style={[styles.shippingSheetRowLabel, { color: colors.textPrimary }]}>
                  {p === 'buyer' ? 'Buyer pays' : 'I pay (free)'}
                </Text>
                <View style={[styles.shippingSheetRadioOuter, { borderColor: active ? colors.brand : colors.border }]}>
                  {active && <View style={[styles.shippingSheetRadioInner, { backgroundColor: colors.brand }]} />}
                </View>
              </Pressable>
            );
          })}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export default ShippingPickerSheet;

const styles = StyleSheet.create({
  shippingSheetBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'transparent' },
  shippingSheet: {
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    paddingTop: Space.xs,
    paddingHorizontal: Space.md },
  shippingSheetHeader: {
    alignItems: 'center',
    paddingBottom: Space.sm },
  shippingSheetHandle: {
    width: 36,
    height: 4,
    borderRadius: Radius.full,
    backgroundColor: '#00000033',
    marginBottom: Space.sm },
  shippingSheetTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%' },
  shippingSheetTitle: {
    fontSize: TypographyV2.bodyStrong.size,
    fontFamily: FontFamily.semibold,
    lineHeight: TypographyV2.bodyStrong.lineHeight },
  shippingSheetSectionLabel: {
    fontSize: TypographyV2.meta.size,
    fontFamily: FontFamily.medium,
    lineHeight: TypographyV2.meta.lineHeight,
    letterSpacing: TypographyV2.meta.letterSpacing,
    textTransform: 'uppercase',
    marginBottom: Space.xs },
  shippingSheetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Space.sm + Space.xs,
    minHeight: Control.hit,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#00000000' },
  shippingSheetRowLabel: {
    flex: 1,
    fontSize: TypographyV2.bodyStrong.size,
    fontFamily: FontFamily.regular,
    lineHeight: TypographyV2.bodyStrong.lineHeight },
  shippingSheetRadioOuter: {
    width: 20,
    height: 20,
    borderRadius: Radius.full,
    borderWidth: 2,
    borderColor: '#00000033',
    alignItems: 'center',
    justifyContent: 'center' },
  shippingSheetRadioInner: {
    width: 10,
    height: 10,
    borderRadius: Radius.full } });
