import React, { useMemo } from 'react';
import { View, Text, StyleSheet, Pressable, Modal } from 'react-native';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { Space, Radius } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { AppIcon } from '../common/AppIcon';
import { IconSize } from '../../theme/iconTokens';

export interface PosterOptionsMenuProps {
  visible: boolean;
  isOwner: boolean;
  /** Whether the active frame has a published mediaUrl that can be saved. */
  canSaveMedia: boolean;
  onClose: () => void;
  onCopyLink: () => void;
  onSaveToCameraRoll: () => void;
  onArchive: () => void;
  onDelete: () => void;
}

/**
 * Poster viewer overflow menu — context-aware bottom sheet.
 * Everyone sees: Copy link, Save to camera roll (when the frame has a
 * published artifact). Owner additionally sees: Archive, Delete
 * (destructive, red, separated by a hairline).
 *
 * Anatomy mirrors LookOverflowMenu: drag handle, icon+label rows, 48pt
 * targets, hairline dividers between groups, destructive actions last.
 */
function PosterOptionsMenuImpl({
  visible,
  isOwner,
  canSaveMedia,
  onClose,
  onCopyLink,
  onSaveToCameraRoll,
  onArchive,
  onDelete,
}: PosterOptionsMenuProps) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close menu">
        <Pressable
          style={styles.sheet}
          onPress={(e) => e.stopPropagation()}
          accessibilityRole="menu"
          accessibilityLabel="Story options menu"
        >
          <View style={styles.handle} />

          <Pressable
            style={styles.item}
            onPress={onCopyLink}
            accessibilityRole="menuitem"
            accessibilityLabel="Copy link"
          >
            <AppIcon name="link" size={IconSize.md} color="textPrimary" opticalCenter accessible={false} />
            <Text style={styles.itemText}>Copy link</Text>
          </Pressable>

          {canSaveMedia && (
            <Pressable
              style={styles.item}
              onPress={onSaveToCameraRoll}
              accessibilityRole="menuitem"
              accessibilityLabel="Save to camera roll"
              accessibilityHint="Downloads the published media to your device"
            >
              <AppIcon name="download-outline" size={IconSize.md} color="textPrimary" opticalCenter accessible={false} />
              <Text style={styles.itemText}>Save to camera roll</Text>
            </Pressable>
          )}

          {isOwner && (
            <>
              <View style={styles.divider} />
              <Pressable
                style={styles.item}
                onPress={onArchive}
                accessibilityRole="menuitem"
                accessibilityLabel="Archive story"
              >
                <AppIcon name="archive-outline" size={IconSize.md} color="textPrimary" opticalCenter accessible={false} />
                <Text style={styles.itemText}>Archive story</Text>
              </Pressable>
              <Pressable
                style={styles.item}
                onPress={onDelete}
                accessibilityRole="menuitem"
                accessibilityLabel="Delete story"
              >
                <AppIcon name="trash" size={IconSize.md} color="dangerText" opticalCenter accessible={false} />
                <Text style={[styles.itemText, { color: colors.dangerText }]}>Delete story</Text>
              </Pressable>
            </>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export const PosterOptionsMenu = React.memo(PosterOptionsMenuImpl);

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: colors.overlay,
      justifyContent: 'flex-end' },
    sheet: {
      backgroundColor: colors.surface,
      borderTopLeftRadius: Radius.sheet,
      borderTopRightRadius: Radius.sheet,
      paddingBottom: Space.lg,
      paddingTop: Space.sm },
    handle: {
      width: Space.xl + Space.sm,
      height: Space.xxs,
      borderRadius: Space.xxs,
      backgroundColor: colors.border,
      alignSelf: 'center',
      marginBottom: Space.md },
    item: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.md,
      minHeight: 48,
      paddingVertical: Space.smMd,
      paddingHorizontal: Space.lg },
    itemText: {
      flex: 1,
      fontSize: TypographyV2.bodyStrong.size,
      fontFamily: TypographyV2.bodyStrong.fontFamily,
      color: colors.textPrimary },
    divider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: colors.border,
      marginVertical: Space.xs } });
}
