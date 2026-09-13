import React, { useMemo } from 'react';
import { View, Text, StyleSheet, Pressable, Modal, ActivityIndicator } from 'react-native';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { Space, Radius } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { AppIcon } from '../common/AppIcon';
import { IconSize } from '../../theme/iconTokens';

export interface LookOverflowMenuProps {
  visible: boolean;
  isOwner: boolean;
  repostBusy: boolean;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onRecreate: () => void;
  onRepost: () => void;
  onReport: () => void;
}

/**
 * Overflow Menu — context-aware bottom sheet shown to ALL users.
 * Owner sees: Edit → Delete (destructive, red, separated).
 * Non-owner sees: Recreate → Repost → Report (destructive, red, separated).
 * Anatomy: drag handle, icon+label rows, 48pt targets, hairline dividers
 * between groups, destructive actions last in red. Matches the
 * Instagram/Pinterest/TikTok bottom-sheet overflow pattern.
 */
function LookOverflowMenuImpl({
  visible,
  isOwner,
  repostBusy,
  onClose,
  onEdit,
  onDelete,
  onRecreate,
  onRepost,
  onReport,
}: LookOverflowMenuProps) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable style={styles.overflowBackdrop} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close menu">
        <Pressable
          style={styles.overflowSheet}
          onPress={(e) => e.stopPropagation()}
          accessibilityRole="menu"
          accessibilityLabel="Look options menu"
        >
          <View style={styles.overflowHandle} />

          {isOwner ? (
            <>
              {/* ── Owner: management actions ── */}
              <Pressable
                style={styles.overflowItem}
                onPress={onEdit}
                accessibilityRole="menuitem"
                accessibilityLabel="Edit look"
              >
                <AppIcon name="edit" size={IconSize.md} color="textPrimary" opticalCenter accessible={false} />
                <Text style={styles.overflowItemText}>Edit look</Text>
              </Pressable>
              <View style={styles.overflowDivider} />
              {/* ── Destructive ── */}
              <Pressable
                style={styles.overflowItem}
                onPress={onDelete}
                accessibilityRole="menuitem"
                accessibilityLabel="Delete look"
              >
                <AppIcon name="trash" size={IconSize.md} color="danger" opticalCenter accessible={false} />
                <Text style={[styles.overflowItemText, { color: colors.danger }]}>Delete look</Text>
              </Pressable>
            </>
          ) : (
            <>
              {/* ── Non-owner: creative + distributive actions ── */}
              <Pressable
                style={styles.overflowItem}
                onPress={onRecreate}
                accessibilityRole="menuitem"
                accessibilityLabel="Recreate this look"
                accessibilityHint="Open the creator studio seeded from this look to build your own version"
              >
                <AppIcon name="bulb-outline" size={IconSize.md} color="textPrimary" opticalCenter accessible={false} />
                <Text style={styles.overflowItemText}>Recreate this look</Text>
              </Pressable>
              <Pressable
                style={styles.overflowItem}
                onPress={onRepost}
                accessibilityRole="menuitem"
                accessibilityLabel="Repost this look"
                accessibilityHint="Re-publishes this look to your profile with attribution to the original creator"
                disabled={repostBusy}
              >
                {repostBusy ? (
                  <ActivityIndicator size="small" color={colors.textPrimary} />
                ) : (
                  <AppIcon name="repeat" size={IconSize.md} color="textPrimary" opticalCenter accessible={false} />
                )}
                <Text style={[styles.overflowItemText, repostBusy && { color: colors.textMuted }]}>
                  {repostBusy ? 'Reposting…' : 'Repost'}
                </Text>
              </Pressable>
              <View style={styles.overflowDivider} />
              {/* ── Destructive ── */}
              <Pressable
                style={styles.overflowItem}
                onPress={onReport}
                accessibilityRole="menuitem"
                accessibilityLabel="Report this look"
                accessibilityHint="Reports the creator of this look"
              >
                <AppIcon name="warning" size={IconSize.md} color="danger" opticalCenter accessible={false} />
                <Text style={[styles.overflowItemText, { color: colors.danger }]}>Report</Text>
              </Pressable>
            </>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export const LookOverflowMenu = React.memo(LookOverflowMenuImpl);

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    // ── Overflow menu — flagship bottom sheet anatomy ──
    // Drag handle, icon+label rows, 48pt targets, hairline dividers,
    // destructive actions in red. Slide-up animation, tap-outside dismiss.
    overflowBackdrop: {
      flex: 1,
      backgroundColor: colors.overlay,
      justifyContent: 'flex-end' },
    overflowSheet: {
      backgroundColor: colors.surface,
      borderTopLeftRadius: Radius.sheet,
      borderTopRightRadius: Radius.sheet,
      paddingBottom: Space.lg,
      paddingTop: Space.sm },
    overflowHandle: {
      width: Space.xl + Space.sm,
      height: Space.xxs,
      borderRadius: Space.xxs,
      backgroundColor: colors.border,
      alignSelf: 'center',
      marginBottom: Space.md },
    overflowItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.md,
      minHeight: 48,
      paddingVertical: Space.smMd,
      paddingHorizontal: Space.lg },
    overflowItemText: {
      flex: 1,
      fontSize: TypographyV2.bodyStrong.size,
      fontFamily: TypographyV2.bodyStrong.fontFamily,
      color: colors.textPrimary },
    overflowDivider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: colors.border,
      marginVertical: Space.xs } });
}
