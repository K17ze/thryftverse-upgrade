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
import { Space, Typography, Type, Radius } from '../../theme/designTokens';
import { useAppTheme } from '../../theme/ThemeContext';
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
  const { colors } = useAppTheme();
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
        <Pressable
          style={[styles.sheet, { backgroundColor: colors.background }]}
          onPress={(e) => e.stopPropagation()}
        >
          <View style={[styles.handle, { backgroundColor: colors.border }]} />

          <View style={styles.header}>
            <Text style={[styles.title, { color: colors.textPrimary }]}>
              Order options
            </Text>
            <Pressable
              onPress={onClose}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="Close actions sheet"
            >
              <Ionicons name="close" size={22} color={colors.textPrimary} />
            </Pressable>
          </View>

          {hasAction && (
            <View style={styles.actionBanner}>
              <Ionicons name="alert-circle-outline" size={16} color={colors.brand} />
              <Text style={[styles.actionBannerText, { color: colors.brand }]}>
                This order needs your attention
              </Text>
            </View>
          )}

          <ScrollView showsVerticalScrollIndicator={false}>
            {actions.map((action) => {
              const color =
                action.variant === 'destructive'
                  ? colors.danger
                  : action.variant === 'primary'
                    ? colors.brand
                    : colors.textPrimary;
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
                  <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
                </Pressable>
              );
            })}
          </ScrollView>

          <View style={[styles.orderIdRow, { borderTopColor: colors.borderSubtle }]}>
            <Text style={[styles.orderIdLabel, { color: colors.textMuted }]}>
              Order number
            </Text>
            <Text style={[styles.orderIdValue, { color: colors.textSecondary }]}>
              {orderId.slice(0, 12).toUpperCase()}
            </Text>
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
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    paddingHorizontal: Space.md,
    paddingBottom: Space.xl,
    maxHeight: '70%',
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: Radius.full,
    alignSelf: 'center',
    marginTop: Space.sm,
    marginBottom: Space.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Space.sm,
    minHeight: 44,
  },
  title: {
    fontSize: Type.subtitle.size,
    lineHeight: Type.subtitle.lineHeight,
    fontFamily: Typography.family.semibold,
    letterSpacing: Type.subtitle.letterSpacing,
  },
  actionBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs + 2,
    paddingVertical: Space.xs,
    marginBottom: Space.xs,
  },
  actionBannerText: {
    fontSize: Type.caption.size,
    lineHeight: Type.caption.lineHeight,
    fontFamily: Typography.family.medium,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
    paddingVertical: Space.md,
    minHeight: 44,
  },
  actionText: {
    flex: 1,
    fontSize: Type.bodyStrong.size,
    lineHeight: Type.bodyStrong.lineHeight,
    fontFamily: Typography.family.regular,
  },
  orderIdRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: Space.md,
    marginTop: Space.xs,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  orderIdLabel: {
    fontSize: Type.caption.size,
    lineHeight: Type.caption.lineHeight,
    fontFamily: Typography.family.regular,
  },
  orderIdValue: {
    fontSize: Type.caption.size,
    lineHeight: Type.caption.lineHeight,
    fontFamily: Typography.family.semibold,
    fontVariant: ['tabular-nums'],
  },
});
