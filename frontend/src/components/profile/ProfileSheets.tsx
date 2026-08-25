import React, { useState, useEffect, useRef, useMemo } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AnimatedPressable } from '../AnimatedPressable';
import { NativeSheet } from '../../platform/native';
import { Space, Typography, Type, Radius } from '../../theme/designTokens';
import { useAppTheme } from '../../theme/ThemeContext';
import { KeyboardAwareScrollView, KeyboardStickyView, type KeyboardAwareScrollViewRef } from '../../platform/keyboard/KeyboardProvider';
import type { ReportReason } from '../../services/profileApi';

// ── Sheet item ────────────────────────────────────────────────────────────
function SheetItem({
  icon,
  label,
  onPress,
  destructive = false,
  colors,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  destructive?: boolean;
  colors: any;
}) {
  return (
    <Pressable
      style={({ pressed }) => [styles.sheetItem, pressed && { opacity: 0.6 }]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
    >
      <Ionicons name={icon} size={20} color={destructive ? colors.danger : colors.textPrimary} />
      <Text style={[
        styles.sheetItemText,
        { color: colors.textPrimary },
        destructive && { color: colors.danger },
      ]}>
        {label}
      </Text>
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
  const { colors } = useAppTheme();
  return (
    <NativeSheet visible={visible} onDismiss={onDismiss} snapPoints={[{ fraction: 0.38 }]}>
      <View style={styles.sheetContainer}>
        <Text style={[styles.sheetTitle, { color: colors.textPrimary }]}>
          More options
        </Text>
        <SheetItem icon="share-outline" label="Share" onPress={() => { onDismiss(); onShare(); }} colors={colors} />
        <SheetItem icon="link-outline" label="Copy link" onPress={onCopyLink} colors={colors} />
        {!isSelfProfile ? (
          <>
            <SheetItem icon="flag-outline" label="Report" onPress={onReport} colors={colors} />
            {isBlocked ? (
              <SheetItem icon="hand-right-outline" label="Unblock" onPress={onUnblock} colors={colors} />
            ) : (
              <SheetItem icon="hand-right-outline" label="Block" onPress={onBlock} destructive colors={colors} />
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
  const { colors } = useAppTheme();
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
          <Text style={[styles.sheetTitle, { color: colors.textPrimary }]}>
            Report
          </Text>
          <Text style={[styles.sheetDescription, { color: colors.textSecondary }]}>
            Tell us what's wrong. Our team reviews all reports.
          </Text>
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
                style={({ pressed }) => [
                  styles.reportReason,
                  { borderBottomColor: colors.borderSubtle },
                  pressed && { opacity: 0.6 },
                ]}
                onPress={() => setSelected(reason.key)}
                accessibilityRole="radio"
                accessibilityState={{ selected: isActive }}
                accessibilityLabel={reason.label}
              >
                <View style={[
                  styles.radioOuter,
                  { borderColor: isActive ? colors.brand : colors.border },
                ]}>
                  {isActive ? <View style={[styles.radioInner, { backgroundColor: colors.brand }]} /> : null}
                </View>
                <Text style={[
                  styles.reportReasonLabel,
                  { color: colors.textPrimary },
                  isActive && { fontFamily: Typography.family.semibold },
                ]}>
                  {reason.label}
                </Text>
              </Pressable>
            );
          })}
          {/* Details field — above keyboard, scrollable into view */}
          {selected ? (
            <View style={styles.detailsWrap}>
              <Text style={[styles.detailsLabel, { color: colors.textSecondary }]}>
                {requiresDetails ? 'Details' : 'Add details (optional)'}
              </Text>
              <TextInput
                style={[
                  styles.detailsInput,
                  {
                    borderColor: requiresDetails && details.trim().length === 0 ? colors.danger : colors.border,
                    color: colors.textPrimary,
                  },
                ]}
                value={details}
                onChangeText={setDetails}
                placeholder={requiresDetails ? 'What\'s the issue?' : 'Add more context'}
                placeholderTextColor={colors.textMuted}
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
          style={[styles.submitBtn, { backgroundColor: colors.brand }, !canSubmit && { opacity: 0.5 }]}
          onPress={handleSubmit}
          activeOpacity={0.85}
          disabled={!canSubmit || isPending}
          accessibilityRole="button"
          accessibilityLabel="Submit report"
        >
          {isPending ? <ActivityIndicator size="small" color={colors.textInverse} /> : (
            <Text style={[styles.submitBtnText, { color: colors.textInverse }]}>
              Submit report
            </Text>
          )}
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
  const { colors } = useAppTheme();
  return (
    <NativeSheet visible={visible} onDismiss={onDismiss} snapPoints={[{ fraction: 0.4 }]}>
      <View style={styles.sheetContainer}>
        <Text style={[styles.sheetTitle, { color: colors.textPrimary }]}>
          Block {displayHandle}?
        </Text>
        <Text style={[styles.sheetDescription, { color: colors.textSecondary }]}>
          They can't follow, message, or view your profile. Unblock anytime.
        </Text>
        <View style={styles.confirmRow}>
          <AnimatedPressable
            style={[styles.cancelBtn, { borderColor: colors.border, backgroundColor: colors.background }]}
            onPress={onDismiss}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Cancel block"
          >
            <Text style={[styles.cancelBtnText, { color: colors.textPrimary }]}>
              Cancel
            </Text>
          </AnimatedPressable>
          <AnimatedPressable
            style={[styles.confirmBlockBtn, { backgroundColor: colors.danger }]}
            onPress={onConfirm}
            activeOpacity={0.85}
            disabled={isPending}
            accessibilityRole="button"
            accessibilityLabel="Confirm block"
          >
            {isPending ? <ActivityIndicator size="small" color={colors.textInverse} /> : (
              <Text style={[styles.confirmBlockBtnText, { color: colors.textInverse }]}>
                Block
              </Text>
            )}
          </AnimatedPressable>
        </View>
      </View>
    </NativeSheet>
  );
}

// ── Styles ──────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  sheetContainer: {
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
  },
  sheetTitle: {
    fontSize: Type.subtitle.size,
    lineHeight: Type.subtitle.lineHeight,
    fontFamily: Typography.family.semibold,
    letterSpacing: Type.subtitle.letterSpacing,
    marginBottom: Space.sm,
  },
  sheetDescription: {
    fontSize: Type.body.size,
    lineHeight: Type.body.lineHeight,
    fontFamily: Typography.family.regular,
    marginBottom: Space.md,
  },
  // ── Sheet items — flat rows with hairline separators ──
  sheetItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
    paddingVertical: Space.md + 2,
    borderBottomWidth: StyleSheet.hairlineWidth,
    minHeight: 52,
  },
  sheetItemText: {
    fontSize: Type.bodyStrong.size,
    lineHeight: Type.bodyStrong.lineHeight,
    fontFamily: Typography.family.regular,
    flex: 1,
  },
  // ── Report sheet ──
  reportSheetRoot: { flex: 1 },
  reportSheetHeader: {
    paddingHorizontal: Space.md,
    paddingTop: Space.sm,
  },
  reportScroll: { flex: 1 },
  reportScrollContent: {
    paddingHorizontal: Space.md,
    paddingBottom: Space.sm,
  },
  reportReason: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
    paddingVertical: Space.md + 2,
    borderBottomWidth: StyleSheet.hairlineWidth,
    minHeight: 52,
  },
  radioOuter: {
    width: 22,
    height: 22,
    borderRadius: Radius.full,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: Radius.full,
  },
  reportReasonLabel: {
    flex: 1,
    fontSize: Type.bodyStrong.size,
    lineHeight: Type.bodyStrong.lineHeight,
    fontFamily: Typography.family.regular,
  },
  // ── Details field ──
  detailsWrap: { marginTop: Space.md },
  detailsLabel: {
    fontSize: Type.caption.size,
    lineHeight: Type.caption.lineHeight,
    fontFamily: Typography.family.medium,
    marginBottom: Space.xs,
  },
  detailsInput: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radius.md,
    paddingHorizontal: Space.md,
    paddingVertical: Space.md,
    fontSize: Type.body.size,
    lineHeight: Type.body.lineHeight,
    fontFamily: Typography.family.regular,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  // ── Submit button ──
  submitBtn: {
    height: 52,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: Space.md,
    marginTop: Space.sm,
    marginBottom: Space.sm,
  },
  submitBtnText: {
    fontSize: Type.bodyStrong.size,
    lineHeight: Type.bodyStrong.lineHeight,
    fontFamily: Typography.family.semibold,
  },
  // ── Block confirmation ──
  confirmRow: {
    flexDirection: 'row',
    gap: Space.md,
    marginTop: Space.md,
  },
  cancelBtn: {
    flex: 1,
    height: 48,
    borderRadius: Radius.full,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelBtnText: {
    fontSize: Type.bodyStrong.size,
    lineHeight: Type.bodyStrong.lineHeight,
    fontFamily: Typography.family.semibold,
  },
  confirmBlockBtn: {
    flex: 1,
    height: 48,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmBlockBtnText: {
    fontSize: Type.bodyStrong.size,
    lineHeight: Type.bodyStrong.lineHeight,
    fontFamily: Typography.family.semibold,
  },
});
