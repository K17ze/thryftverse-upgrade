import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme/ThemeContext';
import { Space, FontFamily } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { RadiusRoleValue } from '../../theme/surfaceRadiusRules';
import { AnimatedPressable } from '../AnimatedPressable';
import { ConfirmationSheet } from '../ConfirmationSheet';
import { ActionSheet } from '../sheets';
import type { InboxConfirmSheetState, InboxActionSheetState } from '../../hooks/inbox';

export interface InboxSheetsProps {
  confirmSheet: InboxConfirmSheetState;
  onDismissConfirmSheet: () => void;
  actionSheet: InboxActionSheetState;
  onDismissActionSheet: () => void;
  onMuteConversation: (conversationId: string) => void;
  onPinConversation: (conversationId: string) => void;
  onDeleteConversation: (conversationId: string) => void;
}

export function InboxSheets({
  confirmSheet,
  onDismissConfirmSheet,
  actionSheet,
  onDismissActionSheet,
  onMuteConversation,
  onPinConversation,
  onDeleteConversation,
}: InboxSheetsProps) {
  const { colors } = useAppTheme();
  return (
    <>
      <ConfirmationSheet
        visible={confirmSheet.visible}
        onDismiss={onDismissConfirmSheet}
        title={confirmSheet.title}
        message={confirmSheet.message}
        confirmLabel={confirmSheet.confirmLabel ?? 'Confirm'}
        variant={confirmSheet.variant ?? 'default'}
        onConfirm={confirmSheet.onConfirm}
      />
      <ActionSheet
        visible={actionSheet.visible}
        onDismiss={onDismissActionSheet}
        snapPoint={0.36}
      >
        <View style={styles.actionSheetBody}>
          <Text style={[styles.actionSheetTitle, { color: colors.textPrimary }]}>
            Conversation
          </Text>
          <View style={[styles.actionSheetList, { borderColor: colors.border }]}>
            <AnimatedPressable
              style={styles.actionSheetRow}
              onPress={() => {
                const id = actionSheet.conversationId;
                onDismissActionSheet();
                onMuteConversation(id);
              }}
              activeOpacity={0.7}
              scaleValue={0.98}
              hapticFeedback="light"
              accessibilityRole="button"
              accessibilityLabel={actionSheet.isMuted ? 'Unmute conversation' : 'Mute conversation'}
            >
              <Ionicons
                name={actionSheet.isMuted ? 'notifications-outline' : 'notifications-off-outline'}
                size={22}
                color={colors.brand}
              />
              <Text style={[styles.actionSheetRowLabel, { color: colors.textPrimary }]}>
                {actionSheet.isMuted ? 'Unmute' : 'Mute'}
              </Text>
            </AnimatedPressable>
            <View style={[styles.actionSheetDivider, { backgroundColor: colors.border }]} />
            <AnimatedPressable
              style={styles.actionSheetRow}
              onPress={() => {
                const id = actionSheet.conversationId;
                onDismissActionSheet();
                onPinConversation(id);
              }}
              activeOpacity={0.7}
              scaleValue={0.98}
              hapticFeedback="light"
              accessibilityRole="button"
              accessibilityLabel={actionSheet.isPinned ? 'Unpin conversation' : 'Pin conversation'}
            >
              <Ionicons
                name={actionSheet.isPinned ? 'pin-outline' : 'pin'}
                size={22}
                color={colors.brand}
              />
              <Text style={[styles.actionSheetRowLabel, { color: colors.textPrimary }]}>
                {actionSheet.isPinned ? 'Unpin' : 'Pin'}
              </Text>
            </AnimatedPressable>
            <View style={[styles.actionSheetDivider, { backgroundColor: colors.border }]} />
            <AnimatedPressable
              style={styles.actionSheetRow}
              onPress={() => {
                const id = actionSheet.conversationId;
                onDismissActionSheet();
                onDeleteConversation(id);
              }}
              activeOpacity={0.7}
              scaleValue={0.98}
              hapticFeedback="medium"
              accessibilityRole="button"
              accessibilityLabel="Delete conversation"
            >
              <Ionicons name="trash-outline" size={22} color={colors.danger} />
              <Text style={[styles.actionSheetRowLabel, { color: colors.danger }]}>
                Delete
              </Text>
            </AnimatedPressable>
          </View>
          <AnimatedPressable
            style={[styles.actionSheetCancelBtn, { borderColor: colors.border }]}
            onPress={onDismissActionSheet}
            activeOpacity={0.7}
            scaleValue={0.98}
            hapticFeedback="light"
            accessibilityRole="button"
            accessibilityLabel="Cancel"
          >
            <Text style={[styles.actionSheetCancelText, { color: colors.textPrimary }]}>
              Cancel
            </Text>
          </AnimatedPressable>
        </View>
      </ActionSheet>
    </>
  );
}

const styles = StyleSheet.create({
  actionSheetBody: {
    gap: Space.md,
    paddingBottom: Space.lg,
  },
  actionSheetTitle: {
    fontSize: TypographyV2.body.size,
    fontFamily: FontFamily.semibold,
    letterSpacing: TypographyV2.body.letterSpacing,
  },
  actionSheetList: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: RadiusRoleValue.compactControl,
    overflow: 'hidden',
  },
  actionSheetDivider: {
    height: StyleSheet.hairlineWidth,
  },
  actionSheetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.smMd,
    paddingVertical: Space.sm + 4,
    paddingHorizontal: Space.md,
    minHeight: 44,
  },
  actionSheetRowLabel: {
    fontSize: TypographyV2.body.size,
    fontFamily: FontFamily.semibold,
  },
  actionSheetCancelBtn: {
    borderRadius: RadiusRoleValue.compactControl,
    paddingVertical: Space.md,
    alignItems: 'center',
    marginTop: Space.sm,
    borderWidth: StyleSheet.hairlineWidth,
    minHeight: 44,
    justifyContent: 'center',
  },
  actionSheetCancelText: {
    fontSize: TypographyV2.body.size,
    fontFamily: FontFamily.semibold,
  },
});
