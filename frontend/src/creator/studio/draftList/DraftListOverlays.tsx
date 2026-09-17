/**
 * DraftListOverlays — the overlay surfaces for CreatorDraftListScreen:
 * UndoToast (undo-delete snackbar) and DeleteConfirmSheet (delete
 * confirmation action sheet). Extracted verbatim from
 * CreatorDraftListScreen.tsx.
 */
import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  type SharedValue } from 'react-native-reanimated';
import { Space, Radius, Typography, IconGrammar } from '../../../theme/designTokens';
import { TypographyV2 } from '../../../theme/typography.v2';
import type { ThemeColors } from '../../../theme/ThemeContext';
import { Motion } from '../../../theme/motionTokens';
import type { DraftMeta } from '../../core/projectStore/drafts';

interface UndoToastProps {
  visible: boolean;
  title: string;
  colors: ThemeColors;
  toastTranslateY: SharedValue<number>;
  toastOpacity: SharedValue<number>;
  onUndo: () => void;
  onDismiss: () => void;
}

export function UndoToast({
  visible,
  title,
  colors,
  toastTranslateY,
  toastOpacity,
  onUndo,
  onDismiss }: UndoToastProps) {
  const toastStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: toastTranslateY.value }],
    opacity: toastOpacity.value }));

  if (!visible) return null;

  return (
    <Reanimated.View
      style={[
        {
          position: 'absolute',
          bottom: Space.lg,
          left: Space.md,
          right: Space.md,
          backgroundColor: colors.surfaceElevated,
          borderRadius: Radius.lg,
          paddingHorizontal: Space.md,
          paddingVertical: Space.md,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: Space.sm,
          shadowColor: colors.shadow,
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.12,
          shadowRadius: 8,
          elevation: 4 },
        toastStyle,
      ]}
    >
      <View style={{ flex: 1, gap: 2 }}>
        <Text
          style={{
            fontFamily: Typography.family.medium,
            fontSize: TypographyV2.body.size,
            color: colors.textPrimary }}
          numberOfLines={1}
        >
          Draft deleted
        </Text>
        <Text
          style={{
            fontFamily: TypographyV2.body.fontFamily,
            fontSize: TypographyV2.meta.size,
            color: colors.textSecondary }}
          numberOfLines={1}
        >
          {title}
        </Text>
      </View>
      <Pressable
        onPress={onUndo}
        style={({ pressed }) => [
          {
            paddingHorizontal: Space.md,
            paddingVertical: Space.sm,
            minHeight: 50,
            justifyContent: 'center',
            borderRadius: Radius.lg,
            backgroundColor: pressed ? colors.brandPressed : colors.brand },
        ]}
        accessibilityLabel="Undo delete"
        accessibilityHint="Restores the deleted draft"
        accessibilityRole="button"
      >
        <Text
          style={{
            fontFamily: Typography.family.semibold,
            fontSize: TypographyV2.bodyStrong.size,
            color: colors.textInverse }}
        >
          Undo
        </Text>
      </Pressable>
      <Pressable
        onPress={onDismiss}
        style={{ width: 32, height: 32, justifyContent: 'center', alignItems: 'center' }}
        accessibilityLabel="Dismiss"
        accessibilityHint="Hides this message"
        accessibilityRole="button"
        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
      >
        <Ionicons name="close" size={IconGrammar.metadata} color={colors.textSecondary} />
      </Pressable>
    </Reanimated.View>
  );
}

// ── Delete confirmation ActionSheet ────────────────────────────────
interface DeleteConfirmSheetProps {
  draft: DraftMeta | null;
  colors: ThemeColors;
  reduceMotion: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export function DeleteConfirmSheet({ draft, colors, reduceMotion, onCancel, onConfirm }: DeleteConfirmSheetProps) {
  const translateY = useSharedValue(400);
  const backdropOpacity = useSharedValue(0);
  const mounted = useRef(false);

  useEffect(() => {
    if (draft) {
      mounted.current = true;
      if (reduceMotion) {
        translateY.value = 0;
        backdropOpacity.value = 1;
      } else {
        translateY.value = withSpring(0, Motion.spring.entrance);
        backdropOpacity.value = withTiming(1, { duration: Motion.duration.normal, easing: Motion.easing.entrance });
      }
    } else if (mounted.current) {
      if (reduceMotion) {
        translateY.value = 400;
        backdropOpacity.value = 0;
      } else {
        translateY.value = withTiming(400, { duration: Motion.duration.normal, easing: Motion.easing.exit });
        backdropOpacity.value = withTiming(0, { duration: Motion.duration.normal });
      }
    }
  }, [draft, reduceMotion, translateY, backdropOpacity]);

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }] }));

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: backdropOpacity.value }));

  if (!draft && !mounted.current) return null;

  return (
    <View style={[StyleSheet.absoluteFill, { zIndex: 500 }]} pointerEvents={draft ? 'auto' : 'none'}>
      <Reanimated.View style={[StyleSheet.absoluteFill, backdropStyle, { backgroundColor: colors.overlay }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onCancel} accessibilityLabel="Cancel delete" accessibilityHint="Dismisses the delete confirmation" accessibilityRole="button" />
      </Reanimated.View>
      <Reanimated.View
        style={[
          {
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            backgroundColor: colors.surface,
            borderTopLeftRadius: Radius.xl,
            borderTopRightRadius: Radius.xl,
            paddingTop: Space.xs,
            paddingBottom: Space.lg,
            paddingHorizontal: Space.md },
          sheetStyle,
        ]}
      >
        <View style={{ alignItems: 'center', paddingVertical: Space.xs }}>
          <View style={{ width: 32, height: 4, borderRadius: Radius.sm, backgroundColor: colors.borderSubtle }} />
        </View>
        <Text style={{ fontFamily: TypographyV2.sectionTitle.fontFamily, fontSize: TypographyV2.sectionTitle.size, color: colors.textPrimary, marginTop: Space.sm, textAlign: 'center' }}>
          Delete draft?
        </Text>
        <Text style={{ fontFamily: TypographyV2.body.fontFamily, fontSize: TypographyV2.body.size, color: colors.textSecondary, textAlign: 'center', marginTop: Space.xs, marginBottom: Space.md }}>
          This can&rsquo;t be undone.
        </Text>
        <Pressable
          onPress={onConfirm}
          style={({ pressed }) => ({
            backgroundColor: pressed ? colors.danger : colors.danger,
            opacity: pressed ? 0.85 : 1,
            paddingVertical: Space.md,
            minHeight: 50,
            justifyContent: 'center',
            borderRadius: Radius.lg,
            alignItems: 'center',
            marginBottom: Space.sm })}
          accessibilityLabel="Confirm delete"
          accessibilityHint="Permanently deletes the draft"
          accessibilityRole="button"
        >
          <Text style={{ fontFamily: TypographyV2.bodyStrong.fontFamily, fontSize: TypographyV2.bodyStrong.size, color: colors.textInverse }}>
            Delete
          </Text>
        </Pressable>
        <Pressable
          onPress={onCancel}
          style={({ pressed }) => ({
            backgroundColor: pressed ? colors.surfaceAlt : 'transparent',
            paddingVertical: Space.md,
            minHeight: 50,
            justifyContent: 'center',
            borderRadius: Radius.lg,
            alignItems: 'center' })}
          accessibilityLabel="Cancel"
          accessibilityHint="Dismisses without deleting"
          accessibilityRole="button"
        >
          <Text style={{ fontFamily: TypographyV2.body.fontFamily, fontSize: TypographyV2.body.size, color: colors.textSecondary }}>
            Cancel
          </Text>
        </Pressable>
      </Reanimated.View>
    </View>
  );
}
