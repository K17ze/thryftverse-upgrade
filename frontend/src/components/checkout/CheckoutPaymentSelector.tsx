import React from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BottomSheet } from '../BottomSheet';
import { Colors } from '../../constants/colors';
import { Space, Typography, Radius } from '../../theme/designTokens';
import { CommercePaymentMethod } from '../../services/commerceApi';

interface Props {
  visible: boolean;
  onDismiss: () => void;
  methods: CommercePaymentMethod[];
  selectedId?: number;
  onSelect: (method: CommercePaymentMethod) => void | Promise<void>;
  isSelecting?: boolean;
  onAddCard?: () => void;
  onExpressPay?: (type: 'apple_pay' | 'google_pay') => void;
}

export function CheckoutPaymentSelector({
  visible,
  onDismiss,
  methods,
  selectedId,
  onSelect,
  isSelecting,
  onAddCard,
  onExpressPay,
}: Props) {
  return (
    <BottomSheet visible={visible} onDismiss={onDismiss} snapPoint={0.55}>
      <Text style={styles.title}>Select payment method</Text>
      <ScrollView
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Express wallet payment options */}
        {onExpressPay && (
          <View style={styles.expressRow}>
            <Pressable
              onPress={() => onExpressPay('apple_pay')}
              disabled={isSelecting}
              style={({ pressed }) => [styles.expressBtn, styles.applePayBtn, pressed && styles.rowPressed]}
              accessibilityRole="button"
              accessibilityLabel="Pay with Apple Pay"
            >
              <Ionicons name="logo-apple" size={18} color={Colors.textPrimary} />
              <Text style={styles.expressBtnText}>Apple Pay</Text>
            </Pressable>
            <Pressable
              onPress={() => onExpressPay('google_pay')}
              disabled={isSelecting}
              style={({ pressed }) => [styles.expressBtn, styles.googlePayBtn, pressed && styles.rowPressed]}
              accessibilityRole="button"
              accessibilityLabel="Pay with Google Pay"
            >
              <Ionicons name="logo-google" size={16} color={Colors.textPrimary} />
              <Text style={styles.expressBtnText}>Google Pay</Text>
            </Pressable>
          </View>
        )}

        {methods.map((method) => {
          const isSelected = method.id === selectedId;
          return (
            <Pressable
              key={method.id}
              onPress={() => {
                if (isSelecting) return;
                onSelect(method);
              }}
              disabled={isSelecting}
              style={({ pressed }) => [
                styles.row,
                isSelected && styles.rowSelected,
                pressed && styles.rowPressed,
              ]}
              accessibilityRole="radio"
              accessibilityState={{ selected: isSelected }}
              accessibilityLabel={`${method.label}${method.details ? `, ${method.details}` : ''}${
                isSelected ? ', selected' : ''
              }`}
            >
              <View style={styles.rowLeft}>
                <View style={[styles.cardIconWrap, isSelected && styles.cardIconWrapSelected]}>
                  <Ionicons
                    name={method.type === 'card' ? 'card' : method.type === 'apple_pay' ? 'logo-apple' : method.type === 'google_pay' ? 'logo-google' : 'business'}
                    size={18}
                    color={isSelected ? Colors.brand : Colors.textSecondary}
                  />
                </View>
                <View style={styles.rowInfo}>
                  <View style={styles.methodLabelRow}>
                    <Text style={styles.methodLabel}>{method.label}</Text>
                    {method.isDefault && (
                      <View style={styles.defaultBadge}>
                        <Text style={styles.defaultBadgeText}>Default</Text>
                      </View>
                    )}
                  </View>
                  {method.details ? (
                    <Text style={styles.methodDetails}>{method.details}</Text>
                  ) : null}
                </View>
              </View>
              {isSelecting && isSelected ? (
                <ActivityIndicator size="small" color={Colors.brand} />
              ) : isSelected ? (
                <Ionicons name="checkmark-circle" size={22} color={Colors.brand} />
              ) : (
                <Ionicons name="radio-button-off" size={22} color={Colors.textMuted} />
              )}
            </Pressable>
          );
        })}

        {/* Add new card action */}
        {onAddCard && (
          <Pressable
            onPress={onAddCard}
            disabled={isSelecting}
            style={({ pressed }) => [styles.addCardRow, pressed && styles.addCardRowPressed]}
            accessibilityRole="button"
            accessibilityLabel="Add a new card"
          >
            <View style={styles.addCardIconWrap}>
              <Ionicons name="add-circle-outline" size={18} color={Colors.brand} />
            </View>
            <Text style={styles.addCardText}>Add new card</Text>
            <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
          </Pressable>
        )}
      </ScrollView>

      {/* Secure payment trust indicator */}
      <View style={styles.trustFooter}>
        <Ionicons name="lock-closed" size={11} color={Colors.textMuted} />
        <Text style={styles.trustText}>Payments are encrypted & secured</Text>
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: 18,
    fontFamily: Typography.family.semibold,
    color: Colors.textPrimary,
    textAlign: 'center',
    marginBottom: Space.md,
  },
  listContent: {
    paddingHorizontal: Space.md,
    paddingBottom: Space.xl,
  },
  expressRow: {
    flexDirection: 'row',
    gap: Space.sm,
    marginBottom: Space.md,
  },
  expressBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: Space.sm + 2,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  applePayBtn: {
    backgroundColor: '#00000008',
  },
  googlePayBtn: {
    backgroundColor: '#4285F408',
  },
  expressBtnText: {
    fontSize: 14,
    fontFamily: Typography.family.semibold,
    color: Colors.textPrimary,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Space.md,
    paddingHorizontal: Space.md,
    borderRadius: Radius.md,
    marginBottom: Space.sm,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  rowSelected: {
    borderColor: Colors.brand,
    backgroundColor: `${Colors.brand}08`,
  },
  rowPressed: {
    opacity: 0.7,
  },
  rowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm + 2,
    flex: 1,
  },
  cardIconWrap: {
    width: 36,
    height: 36,
    borderRadius: Radius.md,
    backgroundColor: Colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardIconWrapSelected: {
    backgroundColor: `${Colors.brand}15`,
  },
  rowInfo: {
    flex: 1,
    gap: 2,
  },
  methodLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  methodLabel: {
    fontSize: 16,
    fontFamily: Typography.family.semibold,
    color: Colors.textPrimary,
  },
  methodDetails: {
    fontSize: 13,
    fontFamily: Typography.family.regular,
    color: Colors.textSecondary,
  },
  defaultBadge: {
    backgroundColor: `${Colors.brand}12`,
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  defaultBadgeText: {
    fontSize: 10,
    fontFamily: Typography.family.semibold,
    color: Colors.brand,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  addCardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm + 2,
    paddingVertical: Space.md,
    paddingHorizontal: Space.md,
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
    borderStyle: 'dashed',
    marginTop: Space.xs,
  },
  addCardRowPressed: {
    opacity: 0.7,
  },
  addCardIconWrap: {
    width: 36,
    height: 36,
    borderRadius: Radius.md,
    backgroundColor: `${Colors.brand}12`,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addCardText: {
    flex: 1,
    fontSize: 15,
    fontFamily: Typography.family.semibold,
    color: Colors.brand,
  },
  trustFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: Space.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
  },
  trustText: {
    fontSize: 11,
    fontFamily: Typography.family.medium,
    color: Colors.textMuted,
    letterSpacing: 0.2,
  },
});
