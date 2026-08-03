import React from 'react';
import { View, Text, StyleSheet, Modal, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppTheme } from '../../theme/ThemeContext';
import { Space, Radius, Type, Typography } from '../../theme/designTokens';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { useHaptic } from '../../hooks/useHaptic';

/**
 * Overflow bottom sheet — lower-frequency hero actions that don't fit
 * the max-3-visible-controls rule on the media rail.
 *
 * Per spec 02 §A: "overflow sheet contains lower-frequency actions."
 * Per spec 03 §9: "Move Report an issue to: overflow; rights sheet
 * footer; or a quiet support row near the end."
 *
 * Actions: Favourite/Watch toggle, Report an issue.
 */
export interface CoOwnOverflowSheetProps {
  visible: boolean;
  onClose: () => void;
  onShare?: () => void;
  onToggleFav: () => void;
  isFav: boolean;
  onWatch: () => void;
  isWatched: boolean;
  onReport: () => void;
  onPriceAlert?: () => void;
  onOrderHistory?: () => void;
}

export function CoOwnOverflowSheet({
  visible,
  onClose,
  onShare,
  onToggleFav,
  isFav,
  onWatch,
  isWatched,
  onReport,
  onPriceAlert,
  onOrderHistory,
}: CoOwnOverflowSheetProps) {
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const reducedMotion = useReducedMotion();
  const haptic = useHaptic();

  const handleAction = (cb: () => void) => {
    if (!reducedMotion) haptic.light();
    cb();
  };

  const actions = [
    ...(onShare ? [{
      icon: 'share-outline' as keyof typeof Ionicons.glyphMap,
      label: 'Share asset',
      onPress: () => handleAction(() => {
        onClose();
        onShare();
      }),
    }] : []),
    ...(onOrderHistory ? [{
      icon: 'time-outline' as keyof typeof Ionicons.glyphMap,
      label: 'View order history',
      onPress: () => handleAction(() => {
        onClose();
        onOrderHistory();
      }),
    }] : []),
    {
      icon: (isFav ? 'heart' : 'heart-outline') as keyof typeof Ionicons.glyphMap,
      label: isFav ? 'Favourited' : 'Favourite',
      onPress: () => handleAction(() => {
        onToggleFav();
        onClose();
      }),
    },
    {
      icon: (isWatched ? 'eye' : 'eye-outline') as keyof typeof Ionicons.glyphMap,
      label: isWatched ? 'Watching' : 'Watch',
      onPress: () => handleAction(() => {
        onWatch();
      }),
    },
    ...(onPriceAlert ? [{
      icon: 'notifications-outline' as keyof typeof Ionicons.glyphMap,
      label: 'Create price alert',
      onPress: () => handleAction(() => {
        onClose();
        onPriceAlert();
      }),
    }] : []),
    {
      icon: 'flag-outline' as keyof typeof Ionicons.glyphMap,
      label: 'Report an issue',
      onPress: () => handleAction(() => {
        onReport();
      }),
    },
  ];

  return (
    <Modal
      visible={visible}
      transparent
      animationType={reducedMotion ? 'none' : 'slide'}
      onRequestClose={onClose}
      accessibilityViewIsModal
    >
      <View style={styles.backdrop}>
        <Pressable style={styles.backdropPress} onPress={onClose} accessibilityLabel="Close more actions" />
        <View
          style={[
            styles.sheet,
            {
              backgroundColor: colors.background,
              paddingBottom: Math.max(insets.bottom, Space.md),
            },
          ]}
        >
          <View style={[styles.handle, { backgroundColor: colors.border }]} />
          <View style={styles.header}>
            <Text style={[styles.title, { color: colors.textPrimary }]}>
              More actions
            </Text>
            <Pressable
              onPress={onClose}
              hitSlop={12}
              accessibilityLabel="Close"
              accessibilityRole="button"
              style={styles.closeBtn}
            >
              <Ionicons name="close" size={22} color={colors.textSecondary} />
            </Pressable>
          </View>
          <View style={styles.actionList}>
            {actions.map((action) => (
              <Pressable
                key={action.label}
                onPress={action.onPress}
                style={({ pressed }) => [styles.row, pressed && styles.pressed]}
                accessibilityLabel={action.label}
                accessibilityRole="button"
              >
                <Ionicons name={action.icon} size={20} color={colors.textPrimary} />
                <Text style={[styles.rowLabel, { color: colors.textPrimary }]}>
                  {action.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  backdropPress: {
    flex: 1,
  },
  sheet: {
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    maxHeight: '60%',
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: Space.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
  },
  title: {
    fontSize: Type.subtitle.size,
    fontFamily: Typography.family.semibold,
    letterSpacing: -0.3,
  },
  closeBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionList: {
    paddingHorizontal: Space.md,
    paddingBottom: Space.lg,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
    paddingVertical: Space.md,
    minHeight: 48,
  },
  pressed: {
    opacity: 0.6,
  },
  rowLabel: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.regular,
    lineHeight: Type.body.lineHeight,
  },
});
