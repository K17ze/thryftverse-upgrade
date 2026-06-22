import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Modal,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/colors';
import { Space, Typography } from '../../theme/designTokens';
import {
  normaliseOrderStatus,
  needsAction,
  type OrderRole,
} from './orderCapabilities';

export interface OrderActionItem {
  key: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  variant?: 'default' | 'primary' | 'destructive';
}

interface OrderActionsSheetProps {
  visible: boolean;
  orderStatus: string;
  role: OrderRole;
  orderId: string;
  listingAvailable: boolean;
  actions: OrderActionItem[];
  onClose: () => void;
}

export function OrderActionsSheet({
  visible,
  orderStatus,
  role,
  orderId,
  listingAvailable,
  actions,
  onClose,
}: OrderActionsSheetProps) {
  const statusLabel = normaliseOrderStatus(orderStatus);
  const hasAction = needsAction(orderStatus, role);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.handle} />

          <View style={styles.header}>
            <Text style={styles.title}>Order options</Text>
            <Pressable
              onPress={onClose}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              accessibilityRole="button"
              accessibilityLabel="Close actions sheet"
            >
              <Ionicons name="close" size={22} color={Colors.textPrimary} />
            </Pressable>
          </View>

          {hasAction && (
            <View style={styles.actionBanner}>
              <Ionicons name="alert-circle-outline" size={16} color={Colors.brand} />
              <Text style={styles.actionBannerText}>
                {role === 'buyer' ? 'This order needs your attention' : 'This order needs your attention'}
              </Text>
            </View>
          )}

          <ScrollView showsVerticalScrollIndicator={false}>
            {actions.map((action) => {
              const color =
                action.variant === 'destructive'
                  ? Colors.danger
                  : action.variant === 'primary'
                    ? Colors.brand
                    : Colors.textPrimary;
              return (
                <Pressable
                  key={action.key}
                  style={styles.actionRow}
                  onPress={() => {
                    action.onPress();
                    onClose();
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={action.label}
                >
                  <Ionicons name={action.icon} size={20} color={color} />
                  <Text style={[styles.actionText, { color }]}>{action.label}</Text>
                  <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
                </Pressable>
              );
            })}
          </ScrollView>

          <View style={styles.orderIdRow}>
            <Text style={styles.orderIdLabel}>Order number</Text>
            <Text style={styles.orderIdValue}>{orderId.slice(0, 12).toUpperCase()}</Text>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: Colors.background,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingHorizontal: Space.md,
    paddingBottom: Space.xl,
    maxHeight: '70%',
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.borderLight,
    alignSelf: 'center',
    marginTop: Space.sm,
    marginBottom: Space.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Space.sm,
  },
  title: {
    fontSize: 17,
    fontFamily: Typography.family.semibold,
    color: Colors.textPrimary,
  },
  actionBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: Space.xs,
    marginBottom: Space.xs,
  },
  actionBannerText: {
    fontSize: 13,
    fontFamily: Typography.family.medium,
    color: Colors.brand,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    paddingVertical: 14,
    minHeight: 44,
  },
  actionText: {
    flex: 1,
    fontSize: 15,
    fontFamily: Typography.family.regular,
  },
  orderIdRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: Space.md,
    marginTop: Space.xs,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
  },
  orderIdLabel: {
    fontSize: 13,
    fontFamily: Typography.family.regular,
    color: Colors.textMuted,
  },
  orderIdValue: {
    fontSize: 13,
    fontFamily: Typography.family.semibold,
    color: Colors.textSecondary,
  },
});
