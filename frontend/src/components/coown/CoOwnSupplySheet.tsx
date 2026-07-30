import React from 'react';
import { View, Text, StyleSheet, Modal, Pressable, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppTheme } from '../../theme/ThemeContext';
import { Space, Radius, Type, Typography } from '../../theme/designTokens';
import { CoOwnOwnershipPanel } from './CoOwnOwnershipPanel';
import type { CoOwnSettlementMode, CoOwnSupplyBuckets } from './CoOwnOwnershipPanel';

/**
 * Supply structure bottom sheet — the full authorised/issued/float/
 * locked/treasury ledger.
 *
 * Per spec 03 §5: "Move authorised/issued/public float/sponsor locked/
 * treasury into: View supply structure; bottom sheet or disclosure
 * section. Do not keep the full five-row accounting ledger expanded
 * by default."
 *
 * The default Availability section on the page shows units available +
 * allocated bar + holder count. This sheet shows the full ledger on
 * demand.
 */
export interface CoOwnSupplySheetProps {
  visible: boolean;
  onClose: () => void;
  unitPriceLabel: string;
  totalUnits: number;
  availableUnits: number;
  allocatedPct: number;
  viewerUnits: number | null;
  viewerPct: number | null;
  settlementMode: CoOwnSettlementMode;
  feePct: number;
  holderCount: number;
  status: 'open' | 'closed' | 'paused';
  supply?: CoOwnSupplyBuckets;
  rightsVersion?: string;
}

export function CoOwnSupplySheet({
  visible,
  onClose,
  ...panelProps
}: CoOwnSupplySheetProps) {
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      accessibilityViewIsModal
    >
      <View style={styles.backdrop}>
        <Pressable style={styles.backdropPress} onPress={onClose} accessibilityLabel="Close supply structure" />
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
              Supply structure
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
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            <CoOwnOwnershipPanel {...panelProps} />
            <Text style={[styles.note, { color: colors.textMuted }]}>
              Sponsor locked is not exposed by the backend. Missing and zero are different.
            </Text>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdropPress: {
    flex: 1,
  },
  sheet: {
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    maxHeight: '85%',
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
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: Space.md,
    paddingBottom: Space.lg,
  },
  note: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.regular,
    lineHeight: Type.caption.lineHeight,
    marginTop: Space.md,
    fontStyle: 'italic',
  },
});
