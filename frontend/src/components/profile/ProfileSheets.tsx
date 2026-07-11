import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AnimatedPressable } from '../AnimatedPressable';
import { NativeSheet } from '../../platform/native';
import { Colors } from '../../constants/colors';
import { Space, Typography } from '../../theme/designTokens';
import { KeyboardAwareScrollView, KeyboardStickyView, type KeyboardAwareScrollViewRef } from '../../platform/keyboard/KeyboardProvider';
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
    <NativeSheet visible={visible} onDismiss={onDismiss} snapPoints={[{ fraction: 0.38 }]}>
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
  const [details, setDetails] = useState('');
  const scrollRef = useRef<KeyboardAwareScrollViewRef>(null);
  const requiresDetails = selected === 'other';
  const canSubmit = selected !== null && (!requiresDetails || details.trim().length > 0);

  // Reset reason and details whenever the sheet closes or opens fresh
  useEffect(() => {
    if (!visible) {
      setSelected(null);
      setDetails('');
    }
  }, [visible]);

  const handleSubmit = () => {
    if (canSubmit && selected) {
      onSubmit(selected, details.trim() || undefined);
      // Reset after successful submission — parent closes the sheet
      setSelected(null);
      setDetails('');
    }
  };

  return (
    <NativeSheet visible={visible} onDismiss={onDismiss} snapPoints={[{ fraction: 0.7 }]}>
      <View style={styles.reportSheetRoot}>
        {/* Title stays visible — not scrolled */}
        <View style={styles.reportSheetHeader}>
          <Text style={styles.sheetTitle}>Report profile</Text>
          <Text style={styles.sheetDescription}>Help us understand the issue. Reports are reviewed by our team.</Text>
        </View>

        {/* Scrollable reason list — usable on short phones */}
        <KeyboardAwareScrollView
          ref={scrollRef}
          style={styles.reportScroll}
          contentContainerStyle={styles.reportScrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          {REPORT_REASONS.map((reason) => {
            const isActive = selected === reason.key;
            return (
              <Pressable
                key={reason.key}
                style={({ pressed }) => [styles.reportReason, isActive && styles.reportReasonActive, pressed && styles.reportReasonPressed]}
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
          {/* Details field — above keyboard, scrollable into view */}
          {selected ? (
            <View style={styles.detailsWrap}>
              <Text style={styles.detailsLabel}>
                {requiresDetails ? 'Details (required)' : 'Additional details (optional)'}
              </Text>
              <TextInput
                style={[styles.detailsInput, requiresDetails && details.trim().length === 0 && styles.detailsInputRequired]}
                value={details}
                onChangeText={setDetails}
                placeholder={requiresDetails ? 'Please describe the issue' : 'Add more context'}
                placeholderTextColor={MUTED}
                multiline
                maxLength={500}
                accessibilityLabel="Report details"
                accessibilityHint={requiresDetails ? 'Required when Other is selected' : 'Optional additional context'}
                onFocus={() => {
                  // Scroll details into view when keyboard appears
                  setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 200);
                }}
              />
            </View>
          ) : null}
        </KeyboardAwareScrollView>

        {/* Submit stays reachable — pinned below scroll */}
        <KeyboardStickyView>
        <AnimatedPressable
          style={[styles.submitBtn, !canSubmit && styles.btnDisabled]}
          onPress={handleSubmit}
          activeOpacity={0.85}
          disabled={!canSubmit || isPending}
          accessibilityRole="button"
          accessibilityLabel="Submit report"
        >
          {isPending ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.submitBtnText}>Submit report</Text>}
        </AnimatedPressable>
        </KeyboardStickyView>
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
  // Report sheet — keyboard-aware, scrollable
  reportSheetRoot: { flex: 1 },
  reportSheetHeader: { paddingHorizontal: Space.md, paddingTop: Space.sm },
  reportScroll: { flex: 1 },
  reportScrollContent: { paddingHorizontal: Space.md, paddingBottom: Space.sm },
  reportReason: {
    flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: BORDER, minHeight: 52,
  },
  reportReasonActive: {},
  reportReasonPressed: { opacity: 0.6 },
  radioOuter: {
    width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: BORDER,
    alignItems: 'center', justifyContent: 'center',
  },
  radioOuterActive: { borderColor: BRAND },
  radioInner: { width: 10, height: 10, borderRadius: 5, backgroundColor: BRAND },
  reportReasonLabel: { flex: 1, fontSize: 15, fontFamily: Typography.family.regular, color: TEXT },
  // Details field
  detailsWrap: { marginTop: Space.md },
  detailsLabel: { fontSize: 13, fontFamily: Typography.family.medium, color: SECONDARY, marginBottom: Space.xs },
  detailsInput: {
    borderWidth: StyleSheet.hairlineWidth, borderColor: BORDER, borderRadius: 8,
    paddingHorizontal: Space.sm, paddingVertical: Space.sm, fontSize: 14,
    fontFamily: Typography.family.regular, color: TEXT, minHeight: 80, textAlignVertical: 'top',
  },
  detailsInputRequired: { borderColor: DANGER },
  submitBtn: {
    height: 48, borderRadius: 11, backgroundColor: BRAND,
    alignItems: 'center', justifyContent: 'center', marginHorizontal: Space.md, marginTop: Space.sm, marginBottom: Space.sm,
  },
  submitBtnText: { fontSize: 16, fontFamily: Typography.family.semibold, color: TEXT_INVERSE },
  btnDisabled: { opacity: 0.5 },
  confirmRow: { flexDirection: 'row', gap: 12, marginTop: Space.md },
  cancelBtn: {
    flex: 1, height: 48, borderRadius: 11, borderWidth: StyleSheet.hairlineWidth,
    borderColor: BORDER, backgroundColor: BG, alignItems: 'center', justifyContent: 'center',
  },
  cancelBtnText: { fontSize: 16, fontFamily: Typography.family.semibold, color: TEXT },
  confirmBlockBtn: {
    flex: 1, height: 48, borderRadius: 11, backgroundColor: DANGER,
    alignItems: 'center', justifyContent: 'center',
  },
  confirmBlockBtnText: { fontSize: 16, fontFamily: Typography.family.semibold, color: '#fff' },
});
