import React from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BottomSheet } from '../BottomSheet';
import { Space, Typography, Radius, Type } from '../../theme/designTokens';
import { useAppTheme } from '../../theme/ThemeContext';
import { CommercePaymentMethod } from '../../services/commerceApi';

interface Props {
  visible: boolean;
  onDismiss: () => void;
  methods: CommercePaymentMethod[];
  selectedId?: number;
  onSelect: (method: CommercePaymentMethod) => void | Promise<void>;
  isSelecting?: boolean;
  onAddCard?: () => void;
}

export function CheckoutPaymentSelector({
  visible,
  onDismiss,
  methods,
  selectedId,
  onSelect,
  isSelecting,
  onAddCard,
}: Props) {
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  return (
    <BottomSheet visible={visible} onDismiss={onDismiss} snapPoint={0.55}>
      <Text style={styles.title}>Select payment method</Text>
      <ScrollView
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
      >
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
              hitSlop={{ top: 4, bottom: 4, left: 8, right: 8 }}
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
                  {method.type === 'apple_pay' ? (
                    <Text style={styles.walletIconText}>Pay</Text>
                  ) : method.type === 'google_pay' ? (
                    <Text style={styles.walletIconText}>G</Text>
                  ) : method.type === 'bank_account' ? (
                    <Ionicons
                      name="business"
                      size={18}
                      color={isSelected ? colors.brand : colors.textSecondary}
                    />
                  ) : (
                    <Ionicons
                      name="card"
                      size={18}
                      color={isSelected ? colors.brand : colors.textSecondary}
                    />
                  )}
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
                <ActivityIndicator size="small" color={colors.brand} />
              ) : isSelected ? (
                <Ionicons name="checkmark-circle" size={22} color={colors.brand} />
              ) : (
                <Ionicons name="radio-button-off" size={22} color={colors.textMuted} />
              )}
            </Pressable>
          );
        })}

        {/* Add new card action */}
        {onAddCard && (
          <Pressable
            onPress={onAddCard}
            disabled={isSelecting}
            hitSlop={{ top: 4, bottom: 4, left: 8, right: 8 }}
            style={({ pressed }) => [styles.addCardRow, pressed && styles.addCardRowPressed]}
            accessibilityRole="button"
            accessibilityLabel="Add a new card"
          >
            <View style={styles.addCardIconWrap}>
              <Ionicons name="add-circle-outline" size={18} color={colors.brand} />
            </View>
            <Text style={styles.addCardText}>Add new card</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
          </Pressable>
        )}
      </ScrollView>

      {/* Secure payment trust indicator */}
      <View style={styles.trustFooter}>
        <Ionicons name="shield-checkmark-outline" size={12} color={colors.textMuted} />
        <Text style={styles.trustText}>Card details are collected securely</Text>
      </View>
    </BottomSheet>
  );
}

const createStyles = (colors: any) => StyleSheet.create({
  title: {
    fontSize: 18,
    fontFamily: Typography.family.semibold,
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: Space.md,
  },
  listContent: {
    paddingHorizontal: Space.md,
    paddingBottom: Space.xl,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 44,
    paddingVertical: Space.md,
    paddingHorizontal: Space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  rowSelected: {
    backgroundColor: `${colors.brand}06`,
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
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardIconWrapSelected: {
    backgroundColor: `${colors.brand}15`,
  },
  walletIconText: {
    fontSize: Type.captionElevated.size,
    fontWeight: '700',
    color: colors.textPrimary,
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
    fontSize: Type.bodyLarge.size,
    fontFamily: Typography.family.semibold,
    color: colors.textPrimary,
  },
  methodDetails: {
    fontSize: Type.captionElevated.size,
    fontFamily: Typography.family.regular,
    color: colors.textSecondary,
  },
  defaultBadge: {
    backgroundColor: `${colors.brand}12`,
    borderRadius: Radius.md,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  defaultBadgeText: {
    fontSize: 10,
    fontFamily: Typography.family.semibold,
    color: colors.brand,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  addCardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 44,
    gap: Space.sm + 2,
    paddingVertical: Space.md,
    paddingHorizontal: Space.md,
    marginTop: Space.xs,
  },
  addCardRowPressed: {
    opacity: 0.7,
  },
  addCardIconWrap: {
    width: 36,
    height: 36,
    borderRadius: Radius.md,
    backgroundColor: `${colors.brand}12`,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addCardText: {
    flex: 1,
    fontSize: Type.bodyEmphasis.size,
    fontFamily: Typography.family.semibold,
    color: colors.brand,
  },
  trustFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: Space.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  trustText: {
    fontSize: Type.meta.size,
    fontFamily: Typography.family.medium,
    color: colors.textMuted,
    letterSpacing: 0.2,
  },
});
