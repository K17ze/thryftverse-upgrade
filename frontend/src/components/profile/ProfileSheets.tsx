import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AnimatedPressable } from '../AnimatedPressable';
import { NativeSheet } from '../../platform/native';
import { Colors } from '../../constants/colors';
import { Space, Typography } from '../../theme/designTokens';
import type { ReportReason } from '../../services/profileApi';

const BG = Colors.background;
const BORDER = Colors.border;
const TEXT = Colors.textPrimary;
const SECONDARY = Colors.textSecondary;
const MUTED = Colors.textMuted;
const BRAND = Colors.brand;
const DANGER = Colors.danger;
const TEXT_INVERSE = Colors.textInverse;

// ── Sheet item ────────────────────────────────────────────────────────────
function SheetItem({
  icon,
  label,
  onPress,
  destructive = false,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  destructive?: boolean;
}) {
  return (
    <Pressable
      style={styles.sheetItem}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Ionicons name={icon} size={20} color={destructive ? DANGER : TEXT} />
      <Text style={[styles.sheetItemText, destructive && styles.sheetItemTextDestructive]}>{label}</Text>
    </Pressable>
  );
}

// ── More actions sheet ────────────────────────────────────────────────────
interface MoreSheetProps {
  visible: boolean;
  onDismiss: () => void;
  isSelfProfile: boolean;
  isBlocked: boolean;
  onShare: () => void;
  onCopyLink: () => void;
  onReport: () => void;
  onBlock: () => void;
  onUnblock: () => void;
}

export function ProfileMoreSheet({
  visible, onDismiss, isSelfProfile, isBlocked,
  onShare, onCopyLink, onReport, onBlock, onUnblock,
}: MoreSheetProps) {
  return (
    <NativeSheet visible={visible} onDismiss={onDismiss} snapPoints={['half']}>
      <View style={styles.sheetContainer}>
        <Text style={styles.sheetTitle}>Profile options</Text>
        <SheetItem icon="share-outline" label="Share profile" onPress={() => { onDismiss(); onShare(); }} />
        <SheetItem icon="link-outline" label="Copy profile link" onPress={onCopyLink} />
        {!isSelfProfile ? (
          <>
            <SheetItem icon="flag-outline" label="Report profile" onPress={onReport} />
            {isBlocked ? (
              <SheetItem icon="hand-right-outline" label="Unblock user" onPress={onUnblock} />
            ) : (
              <SheetItem icon="hand-right-outline" label="Block user" onPress={onBlock} destructive />
            )}
          </>
        ) : null}
      </View>
    </NativeSheet>
  );
}

// ── Report sheet ──────────────────────────────────────────────────────────
const REPORT_REASONS: { key: ReportReason; label: string }[] = [
  { key: 'spam', label: 'Spam or misleading' },
  { key: 'inappropriate', label: 'Inappropriate content' },
  { key: 'counterfeit', label: 'Counterfeit item' },
  { key: 'unresponsive', label: 'Seller unresponsive' },
  { key: 'harassment', label: 'Harassment' },
  { key: 'other', label: 'Other' },
];

interface ReportSheetProps {
  visible: boolean;
  onDismiss: () => void;
  isPending: boolean;
  onSubmit: (reason: ReportReason, details?: string) => void;
}

export function ProfileReportSheet({ visible, onDismiss, isPending, onSubmit }: ReportSheetProps) {
  const [selected, setSelected] = useState<ReportReason | null>(null);
  return (
    <NativeSheet visible={visible} onDismiss={onDismiss} snapPoints={[{ fraction: 0.7 }]}>
      <View style={styles.sheetContainer}>
        <Text style={styles.sheetTitle}>Report profile</Text>
        <Text style={styles.sheetDescription}>Help us understand the issue. Reports are reviewed by our team.</Text>
        {REPORT_REASONS.map((reason) => {
          const isActive = selected === reason.key;
          return (
            <Pressable
              key={reason.key}
              style={[styles.reportReason, isActive && styles.reportReasonActive]}
              onPress={() => setSelected(reason.key)}
              accessibilityRole="radio"
              accessibilityState={{ selected: isActive }}
              accessibilityLabel={reason.label}
            >
              <View style={[styles.radioOuter, isActive && styles.radioOuterActive]}>
                {isActive ? <View style={styles.radioInner} /> : null}
              </View>
              <Text style={styles.reportReasonLabel}>{reason.label}</Text>
            </Pressable>
          );
        })}
        <AnimatedPressable
          style={[styles.submitBtn, !selected && styles.btnDisabled]}
          onPress={() => selected && onSubmit(selected)}
          activeOpacity={0.85}
          disabled={!selected || isPending}
          accessibilityRole="button"
          accessibilityLabel="Submit report"
        >
          {isPending ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.submitBtnText}>Submit report</Text>}
        </AnimatedPressable>
      </View>
    </NativeSheet>
  );
}

// ── Block confirmation sheet ──────────────────────────────────────────────
interface BlockConfirmSheetProps {
  visible: boolean;
  onDismiss: () => void;
  displayHandle: string;
  isPending: boolean;
  onConfirm: () => void;
}

export function ProfileBlockConfirmSheet({
  visible, onDismiss, displayHandle, isPending, onConfirm,
}: BlockConfirmSheetProps) {
  return (
    <NativeSheet visible={visible} onDismiss={onDismiss} snapPoints={[{ fraction: 0.4 }]}>
      <View style={styles.sheetContainer}>
        <Text style={styles.sheetTitle}>Block {displayHandle}?</Text>
        <Text style={styles.sheetDescription}>
          They won't be able to follow you, message you, or view your profile. You can unblock them anytime.
        </Text>
        <View style={styles.confirmRow}>
          <AnimatedPressable
            style={styles.cancelBtn}
            onPress={onDismiss}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Cancel block"
          >
            <Text style={styles.cancelBtnText}>Cancel</Text>
          </AnimatedPressable>
          <AnimatedPressable
            style={styles.confirmBlockBtn}
            onPress={onConfirm}
            activeOpacity={0.85}
            disabled={isPending}
            accessibilityRole="button"
            accessibilityLabel="Confirm block"
          >
            {isPending ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.confirmBlockBtnText}>Block</Text>}
          </AnimatedPressable>
        </View>
      </View>
    </NativeSheet>
  );
}

const styles = StyleSheet.create({
  sheetContainer: { paddingHorizontal: Space.md, paddingVertical: Space.sm },
  sheetTitle: { fontSize: 18, fontFamily: Typography.family.bold, color: TEXT, marginBottom: Space.sm },
  sheetDescription: { fontSize: 14, fontFamily: Typography.family.regular, color: SECONDARY, lineHeight: 20, marginBottom: Space.md },
  sheetItem: {
    flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: BORDER, minHeight: 52,
  },
  sheetItemText: { fontSize: 16, fontFamily: Typography.family.regular, color: TEXT, flex: 1 },
  sheetItemTextDestructive: { color: DANGER },
  reportReason: {
    flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: BORDER, minHeight: 52,
  },
  reportReasonActive: {},
  radioOuter: {
    width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: BORDER,
    alignItems: 'center', justifyContent: 'center',
  },
  radioOuterActive: { borderColor: BRAND },
  radioInner: { width: 10, height: 10, borderRadius: 5, backgroundColor: BRAND },
  reportReasonLabel: { flex: 1, fontSize: 15, fontFamily: Typography.family.regular, color: TEXT },
  submitBtn: {
    height: 48, borderRadius: 24, backgroundColor: BRAND,
    alignItems: 'center', justifyContent: 'center', marginTop: Space.md,
  },
  submitBtnText: { fontSize: 16, fontFamily: Typography.family.semibold, color: TEXT_INVERSE },
  btnDisabled: { opacity: 0.5 },
  confirmRow: { flexDirection: 'row', gap: 12, marginTop: Space.md },
  cancelBtn: {
    flex: 1, height: 48, borderRadius: 24, borderWidth: StyleSheet.hairlineWidth,
    borderColor: BORDER, backgroundColor: BG, alignItems: 'center', justifyContent: 'center',
  },
  cancelBtnText: { fontSize: 16, fontFamily: Typography.family.semibold, color: TEXT },
  confirmBlockBtn: {
    flex: 1, height: 48, borderRadius: 24, backgroundColor: DANGER,
    alignItems: 'center', justifyContent: 'center',
  },
  confirmBlockBtnText: { fontSize: 16, fontFamily: Typography.family.semibold, color: '#fff' },
});
