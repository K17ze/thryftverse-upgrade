/**
 * PageMenu — page options sheet (duration + duplicate + reorder + delete).
 *
 * Extracted from CreatorStudioShell.tsx as part of the component split.
 * Replaces the old Alert.alert-based page menu with a proper designed
 * sheet: segmented duration control, duplicate, move left/right, delete.
 *
 * @module PageMenu
 */

import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Space, Radius, Type, Typography } from '../../theme/designTokens';
import { useAppTheme } from '../../theme/ThemeContext';
import { useHaptic } from '../../hooks/useHaptic';
import { PressScale, SheetContainer } from '../CreatorAnimations';

// ── Props ──────────────────────────────────────────────────────────
export interface PageMenuProps {
  pageIndex: number;
  pageCount: number;
  currentDuration: number;
  onClose: () => void;
  onSetDuration: (ms: number) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onMoveLeft: () => void;
  onMoveRight: () => void;
}

// ── Duration presets ───────────────────────────────────────────────
const DURATIONS = [
  { label: '3s', ms: 3000 },
  { label: '5s', ms: 5000 },
  { label: '7s', ms: 7000 },
  { label: '10s', ms: 10000 },
  { label: '15s', ms: 15000 },
];

// ── Component ──────────────────────────────────────────────────────
export function PageMenu({
  pageIndex,
  pageCount,
  currentDuration,
  onClose,
  onSetDuration,
  onDuplicate,
  onDelete,
  onMoveLeft,
  onMoveRight,
}: PageMenuProps) {
  const { colors } = useAppTheme();
  const haptic = useHaptic();
  const canMoveLeft = pageIndex > 0;
  const canMoveRight = pageIndex < pageCount - 1;
  const canDelete = pageCount > 1;

  return (
    <SheetContainer visible={true} onClose={onClose} maxHeight={0.6}>
      <View style={styles.pageSheetHeader}>
        <Text style={[styles.pageSheetTitle, { color: colors.textPrimary }]}>Page {pageIndex + 1}</Text>
        <PressScale onPress={onClose} style={styles.closeBtn} accessibilityLabel="Close page options">
          <Ionicons name="close" size={22} color={colors.textSecondary} />
        </PressScale>
      </View>
      <View style={styles.pageSheetBody}>
        {/* Duration — segmented control */}
        <Text style={[styles.pageSheetLabel, { color: colors.textSecondary }]}>Duration</Text>
        <View style={styles.pageSheetDurationRow}>
          {DURATIONS.map((d) => {
            const isActive = currentDuration === d.ms;
            return (
              <Pressable
                key={d.ms}
                onPress={() => { haptic.selection(); onSetDuration(d.ms); }}
                style={({ pressed }) => [styles.pageSheetDurationBtn, { backgroundColor: colors.surfaceAlt }, isActive && { backgroundColor: colors.brand }, pressed && { opacity: 0.7 }]}
                hitSlop={4}
                accessibilityLabel={`Set duration to ${d.label}`}
                accessibilityRole="button"
                accessibilityState={{ selected: isActive }}
              >
                <Text style={[styles.pageSheetDurationText, { color: colors.textPrimary }, isActive && { color: colors.textInverse }]}>
                  {d.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* Reorder */}
        <Text style={[styles.pageSheetLabel, { color: colors.textSecondary, marginTop: Space.md }]}>Order</Text>
        <View style={styles.pageSheetActions}>
          <Pressable
            onPress={() => { if (canMoveLeft) { haptic.selection(); onMoveLeft(); } }}
            disabled={!canMoveLeft}
            style={({ pressed }) => [styles.pageSheetActionBtn, { backgroundColor: colors.surfaceAlt }, !canMoveLeft && { opacity: 0.35 }, pressed && canMoveLeft && { opacity: 0.6 }]}
            hitSlop={8}
            accessibilityLabel="Move page left"
            accessibilityRole="button"
            accessibilityState={{ disabled: !canMoveLeft }}
          >
            <Ionicons name="arrow-back" size={20} color={colors.textPrimary} />
            <Text style={[styles.pageSheetActionLabel, { color: colors.textPrimary }]}>Move Left</Text>
          </Pressable>
          <Pressable
            onPress={() => { if (canMoveRight) { haptic.selection(); onMoveRight(); } }}
            disabled={!canMoveRight}
            style={({ pressed }) => [styles.pageSheetActionBtn, { backgroundColor: colors.surfaceAlt }, !canMoveRight && { opacity: 0.35 }, pressed && canMoveRight && { opacity: 0.6 }]}
            hitSlop={8}
            accessibilityLabel="Move page right"
            accessibilityRole="button"
            accessibilityState={{ disabled: !canMoveRight }}
          >
            <Ionicons name="arrow-forward" size={20} color={colors.textPrimary} />
            <Text style={[styles.pageSheetActionLabel, { color: colors.textPrimary }]}>Move Right</Text>
          </Pressable>
        </View>

        {/* Duplicate + Delete */}
        <View style={styles.pageSheetActions}>
          <Pressable
            onPress={() => { haptic.medium(); onDuplicate(); }}
            style={({ pressed }) => [styles.pageSheetActionBtn, { backgroundColor: colors.surfaceAlt }, pressed && { opacity: 0.6 }]}
            hitSlop={8}
            accessibilityLabel="Duplicate page"
            accessibilityRole="button"
          >
            <Ionicons name="copy-outline" size={20} color={colors.textPrimary} />
            <Text style={[styles.pageSheetActionLabel, { color: colors.textPrimary }]}>Duplicate</Text>
          </Pressable>
          <Pressable
            onPress={() => { if (canDelete) { haptic.medium(); onDelete(); } }}
            disabled={!canDelete}
            style={({ pressed }) => [styles.pageSheetActionBtn, { backgroundColor: colors.surfaceAlt }, !canDelete && { opacity: 0.35 }, pressed && canDelete && { opacity: 0.6 }]}
            hitSlop={8}
            accessibilityLabel="Delete page"
            accessibilityRole="button"
            accessibilityState={{ disabled: !canDelete }}
          >
            <Ionicons name="trash-outline" size={20} color={canDelete ? colors.danger : colors.textMuted} />
            <Text style={[styles.pageSheetActionLabel, { color: canDelete ? colors.danger : colors.textMuted }]}>Delete</Text>
          </Pressable>
        </View>
      </View>
    </SheetContainer>
  );
}

export default PageMenu;

// ── Styles ─────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  pageSheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
  },
  pageSheetTitle: {
    fontFamily: Typography.family.semibold,
    fontSize: Type.subtitle.size,
  },
  closeBtn: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: Radius.sm,
  },
  pageSheetBody: {
    paddingHorizontal: Space.md,
    paddingBottom: Space.xl,
    gap: Space.xs,
  },
  pageSheetLabel: {
    fontFamily: Typography.family.semibold,
    fontSize: Type.caption.size,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  pageSheetDurationRow: {
    flexDirection: 'row',
    gap: Space.xs,
    marginTop: Space.xs,
  },
  pageSheetDurationBtn: {
    flex: 1,
    paddingVertical: Space.smMd,
    borderRadius: Radius.md,
    alignItems: 'center',
  },
  pageSheetDurationText: {
    fontFamily: Typography.family.semibold,
    fontSize: Type.body.size,
  },
  pageSheetActions: {
    flexDirection: 'row',
    gap: Space.sm,
    marginTop: Space.xs,
  },
  pageSheetActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space.sm,
    paddingVertical: Space.md,
    borderRadius: Radius.md,
  },
  pageSheetActionLabel: {
    fontFamily: Typography.family.medium,
    fontSize: Type.body.size,
  },
});
