import React from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BottomSheet } from '../BottomSheet';
import { Colors } from '../../constants/colors';
import { Space, Typography } from '../../theme/designTokens';
import { CommercePaymentMethod } from '../../services/commerceApi';

interface Props {
  visible: boolean;
  onDismiss: () => void;
  methods: CommercePaymentMethod[];
  selectedId?: number;
  onSelect: (method: CommercePaymentMethod) => void | Promise<void>;
  isSelecting?: boolean;
}

export function CheckoutPaymentSelector({
  visible,
  onDismiss,
  methods,
  selectedId,
  onSelect,
  isSelecting,
}: Props) {
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
              style={[styles.row, isSelected && styles.rowSelected]}
              accessibilityRole="radio"
              accessibilityState={{ selected: isSelected }}
              accessibilityLabel={`${method.label}${method.details ? `, ${method.details}` : ''}${
                isSelected ? ', selected' : ''
              }`}
            >
              <View style={styles.rowLeft}>
                <Ionicons
                  name={method.type === 'card' ? 'card-outline' : 'business-outline'}
                  size={22}
                  color={Colors.textPrimary}
                />
                <View style={styles.rowInfo}>
                  <Text style={styles.methodLabel}>{method.label}</Text>
                  {method.details ? (
                    <Text style={styles.methodDetails}>{method.details}</Text>
                  ) : null}
                  {method.isDefault ? (
                    <Text style={styles.defaultTag}>Default</Text>
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
      </ScrollView>
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
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Space.md,
    paddingHorizontal: Space.md,
    borderRadius: 10,
    marginBottom: Space.sm,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  rowSelected: {
    borderColor: Colors.brand,
    backgroundColor: Colors.surfaceAlt,
  },
  rowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
    flex: 1,
  },
  rowInfo: {
    flex: 1,
    gap: 2,
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
  defaultTag: {
    fontSize: 11,
    fontFamily: Typography.family.semibold,
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginTop: 2,
  },
});
