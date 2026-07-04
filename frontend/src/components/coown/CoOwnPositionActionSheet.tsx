import React from 'react';
import { View, Text, StyleSheet, Modal, Pressable, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppTheme } from '../../theme/ThemeContext';
import { Space, Radius, Type, Typography } from '../../theme/designTokens';
import { CachedImage } from '../CachedImage';
import { AnimatedPressable } from '../AnimatedPressable';

export interface CoOwnPositionAction {
  label: string;
  onPress: () => void;
  icon?: React.ComponentProps<typeof Ionicons>['name'];
  variant?: 'primary' | 'secondary' | 'danger';
  disabled?: boolean;
}

export interface CoOwnPositionActionSheetProps {
  visible: boolean;
  onClose: () => void;
  imageUri?: string | null;
  title: string;
  unitsOwned: number;
  ownershipPct: number;
  currentValueLabel: string;
  statusLabel: string;
  actions: CoOwnPositionAction[];
}

export function CoOwnPositionActionSheet({
  visible,
  onClose,
  imageUri,
  title,
  unitsOwned,
  ownershipPct,
  currentValueLabel,
  statusLabel,
  actions,
}: CoOwnPositionActionSheetProps) {
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={[styles.sheet, { backgroundColor: colors.background, paddingBottom: insets.bottom + Space.md }]}>
        <View style={[styles.handle, { backgroundColor: colors.border }]} />

        <View style={styles.header}>
          <View style={styles.identityRow}>
            <View style={[styles.imageWrap, { backgroundColor: colors.surfaceAlt }]}>
              {imageUri ? (
                <CachedImage uri={imageUri} style={styles.image} contentFit="cover" transition={200} />
              ) : (
                <View style={styles.imageFallback}>
                  <Ionicons name="cube-outline" size={22} color={colors.textMuted} />
                </View>
              )}
            </View>
            <View style={styles.identity}>
              <Text style={[styles.title, { color: colors.textPrimary }]} numberOfLines={2}>{title}</Text>
              <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
                {unitsOwned} units · {ownershipPct}% ownership · {statusLabel}
              </Text>
              <Text style={[styles.value, { color: colors.textPrimary }]}>{currentValueLabel}</Text>
            </View>
          </View>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} style={styles.actionsScroll}>
          <View style={styles.actionsWrap}>
            {actions.map((action, i) => {
              const isPrimary = action.variant === 'primary';
              const isDanger = action.variant === 'danger';
              const bgColor = isPrimary ? colors.brand : isDanger ? colors.danger : colors.surfaceAlt;
              const textColor = isPrimary || isDanger ? colors.background : colors.textPrimary;
              const borderColor = isPrimary || isDanger ? bgColor : colors.border;

              return (
                <AnimatedPressable
                  key={`${action.label}-${i}`}
                  onPress={() => { action.onPress(); onClose(); }}
                  disabled={action.disabled}
                  scaleValue={0.98}
                  hapticFeedback="light"
                  style={[
                    styles.actionBtn,
                    { backgroundColor: bgColor, borderColor, opacity: action.disabled ? 0.4 : 1 },
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={action.label}
                >
                  {action.icon ? (
                    <Ionicons name={action.icon} size={18} color={textColor} />
                  ) : null}
                  <Text style={[styles.actionText, { color: textColor }]}>{action.label}</Text>
                </AnimatedPressable>
              );
            })}
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  sheet: {
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    paddingHorizontal: Space.md,
    paddingTop: Space.sm,
    maxHeight: '70%',
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: Space.md,
  },
  header: {
    marginBottom: Space.md,
  },
  identityRow: {
    flexDirection: 'row',
    gap: Space.md,
  },
  imageWrap: {
    width: 64,
    height: 64,
    borderRadius: Radius.md,
    overflow: 'hidden',
  },
  image: {
    width: 64,
    height: 64,
  },
  imageFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  identity: {
    flex: 1,
    gap: 3,
  },
  title: {
    fontSize: Type.bodyEmphasis.size,
    fontFamily: Typography.family.semibold,
    lineHeight: 20,
    letterSpacing: -0.2,
  },
  subtitle: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.regular,
  },
  value: {
    fontSize: Type.priceList.size,
    fontFamily: Typography.family.bold,
    letterSpacing: -0.3,
    marginTop: 2,
  },
  actionsScroll: {
    maxHeight: 300,
  },
  actionsWrap: {
    gap: Space.sm,
    paddingBottom: Space.sm,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    paddingVertical: Space.sm + 2,
    paddingHorizontal: Space.md,
    borderRadius: Radius.lg,
    borderWidth: 1,
  },
  actionText: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.semibold,
  },
});
