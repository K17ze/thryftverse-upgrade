import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/colors';
import { Space, Typography } from '../../theme/designTokens';
import { haptics } from '../../utils/haptics';

interface ListingPreviewFooterProps {
  origin?: 'sell' | 'edit';
  onBack: () => void;
  bottomInset: number;
}

export function ListingPreviewFooter({
  origin,
  onBack,
  bottomInset,
}: ListingPreviewFooterProps) {
  const secondaryLabel = origin === 'sell'
    ? 'Return to publish'
    : origin === 'edit'
    ? 'Return to save'
    : null;

  return (
    <View style={[styles.container, { paddingBottom: Math.max(bottomInset, 12) }]}>
      <Pressable
        style={styles.secondaryBtn}
        onPress={() => { haptics.press(); onBack(); }}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        accessibilityRole="button"
        accessibilityLabel="Back to edit"
      >
        <Ionicons name="chevron-back" size={18} color={Colors.textPrimary} />
        <Text style={styles.secondaryText}>Back to edit</Text>
      </Pressable>

      {secondaryLabel && (
        <Pressable
          style={styles.primaryBtn}
          onPress={() => { haptics.press(); onBack(); }}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityRole="button"
          accessibilityLabel={secondaryLabel}
        >
          <Text style={styles.primaryText}>{secondaryLabel}</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    paddingHorizontal: Space.md,
    paddingTop: Space.md,
    backgroundColor: Colors.background,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
  },
  secondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    minHeight: 48,
  },
  secondaryText: {
    fontSize: 14,
    fontFamily: Typography.family.semibold,
    color: Colors.textPrimary,
  },
  primaryBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: Colors.brand,
    minHeight: 48,
  },
  primaryText: {
    fontSize: 15,
    fontFamily: Typography.family.bold,
    color: Colors.textInverse,
  },
});
