import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  Share,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { Space, Radius, Stroke, AvatarSize, Control } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { CachedImage } from '../CachedImage';
import { AnimatedPressable } from '../AnimatedPressable';
import { useHaptic } from '../../hooks/useHaptic';

interface SharePassportModalProps {
  visible: boolean;
  onClose: () => void;
  username: string;
  displayName: string;
  avatarUri?: string | null;
  ratingAverage?: number | null;
  completedSales?: number;
  verificationTier?: string | null;
  memberSince?: string;
  bio?: string | null;
}

export function SharePassportModal({
  visible,
  onClose,
  username,
  displayName,
  avatarUri,
  ratingAverage,
  completedSales = 0,
  verificationTier,
  bio,
}: SharePassportModalProps) {
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const { width: SCREEN_WIDTH } = useWindowDimensions();
  const haptic = useHaptic();
  const [copied, setCopied] = useState(false);

  const profileUrl = `https://thryftverse.com/@${username}`;

  const handleCopyLink = useCallback(async () => {
    haptic.light();
    await Clipboard.setStringAsync(profileUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [profileUrl, haptic]);

  const handleShareSystem = useCallback(async () => {
    haptic.light();
    try {
      await Share.share({
        title: `${displayName} (@${username}) on ThryftVerse`,
        message: `Check out my profile on ThryftVerse: ${profileUrl}`,
        url: profileUrl,
      });
    } catch {
      // User cancelled
    }
  }, [displayName, username, profileUrl, haptic]);

  if (!visible) return null;

  const hasRating = ratingAverage != null && ratingAverage > 0;
  const hasSales = completedSales > 0;
  const hasTrustData = hasRating || hasSales;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close share modal" />

        <View style={[styles.sheetContent, { width: Math.min(SCREEN_WIDTH - 32, 380) }]}>
          {/* Header */}
          <View style={styles.modalHeader}>
            <Text style={styles.modalHeaderTitle}>Share profile</Text>
            <Pressable
              style={styles.closeBtn}
              onPress={onClose}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Close"
            >
              <Ionicons name="close" size={20} color={colors.textSecondary} />
            </Pressable>
          </View>

          {/* Identity */}
          <View style={styles.identityRow}>
            {avatarUri ? (
              <CachedImage uri={avatarUri} style={styles.avatar} contentFit="cover" />
            ) : (
              <View style={[styles.avatar, styles.avatarMonogram]}>
                <Text style={styles.avatarMonogramText}>
                  {(displayName || username || '?').charAt(0).toUpperCase()}
                </Text>
              </View>
            )}
            <View style={styles.identityText}>
              <View style={styles.nameRow}>
                <Text style={styles.displayName} numberOfLines={1}>
                  {displayName || username}
                </Text>
                {verificationTier ? (
                  <Ionicons name="checkmark-circle" size={16} color={colors.brand} />
                ) : null}
              </View>
              <Text style={styles.username} numberOfLines={1}>
                @{username}
              </Text>
              {hasTrustData ? (
                <View style={styles.trustRow}>
                  {hasRating ? (
                    <Text style={styles.trustItem}>
                      {ratingAverage!.toFixed(1)} ★
                    </Text>
                  ) : null}
                  {hasRating && hasSales ? <Text style={styles.trustDivider}>·</Text> : null}
                  {hasSales ? (
                    <Text style={styles.trustItem}>
                      {completedSales} sold
                    </Text>
                  ) : null}
                </View>
              ) : null}
            </View>
          </View>

          {bio ? (
            <Text style={styles.bio} numberOfLines={2}>
              {bio}
            </Text>
          ) : null}

          {/* Profile URL */}
          <View style={styles.urlContainer}>
            <Text style={styles.urlText} numberOfLines={1}>
              {profileUrl}
            </Text>
          </View>

          {/* Actions */}
          <View style={styles.actionsRow}>
            <AnimatedPressable
              style={[styles.actionBtn, styles.actionBtnSecondary, copied && styles.actionBtnSuccess]}
              onPress={handleCopyLink}
              scaleValue={0.97}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel={copied ? 'Profile link copied' : 'Copy profile link'}
            >
              <Ionicons
                name={copied ? 'checkmark-circle' : 'copy-outline'}
                size={16}
                color={copied ? colors.success : colors.textPrimary}
              />
              <Text style={[styles.actionBtnSecondaryText, copied && { color: colors.success }]}>
                {copied ? 'Copied' : 'Copy link'}
              </Text>
            </AnimatedPressable>

            <AnimatedPressable
              style={[styles.actionBtn, styles.actionBtnPrimary]}
              onPress={handleShareSystem}
              scaleValue={0.97}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel="Share profile via device"
            >
              <Ionicons name="share-outline" size={16} color={colors.textInverse} />
              <Text style={styles.actionBtnPrimaryText}>Share</Text>
            </AnimatedPressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: colors.overlay,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: Space.md,
    },
    sheetContent: {
      backgroundColor: colors.surface,
      borderRadius: Radius.xxl,
      borderWidth: Stroke.standard,
      borderColor: colors.border,
      padding: Space.lg,
      shadowColor: colors.overlay,
      shadowOffset: { width: 0, height: 16 },
      shadowOpacity: 0.35,
      shadowRadius: 28,
      elevation: 20,
    },
    modalHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: Space.lg,
    },
    modalHeaderTitle: {
      fontSize: TypographyV2.itemTitle.size,
      fontFamily: TypographyV2.itemTitle.fontFamily,
      color: colors.textPrimary,
    },
    closeBtn: {
      width: Space.xl,
      height: Space.xl,
      borderRadius: Radius.xl,
      backgroundColor: colors.surfaceAlt,
      justifyContent: 'center',
      alignItems: 'center',
    },
    identityRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.md,
      marginBottom: Space.md,
    },
    avatar: {
      width: AvatarSize.lg,
      height: AvatarSize.lg,
      borderRadius: AvatarSize.lg / 2,
      borderWidth: Stroke.hairline,
      borderColor: colors.borderSubtle,
    },
    avatarMonogram: {
      backgroundColor: colors.surfaceAlt,
      alignItems: 'center',
      justifyContent: 'center',
    },
    avatarMonogramText: {
      fontSize: TypographyV2.screenTitle.size,
      fontFamily: TypographyV2.screenTitle.fontFamily,
      color: colors.textPrimary,
    },
    identityText: {
      flex: 1,
    },
    nameRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs,
      marginBottom: 2,
    },
    displayName: {
      fontSize: TypographyV2.itemTitle.size,
      fontFamily: TypographyV2.itemTitle.fontFamily,
      color: colors.textPrimary,
      flexShrink: 1,
    },
    username: {
      fontSize: TypographyV2.body.size,
      fontFamily: TypographyV2.body.fontFamily,
      color: colors.textSecondary,
      marginBottom: Space.xs,
    },
    trustRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs,
    },
    trustItem: {
      fontSize: TypographyV2.captionElevated.size,
      fontFamily: TypographyV2.captionElevated.fontFamily,
      color: colors.textSecondary,
    },
    trustDivider: {
      fontSize: TypographyV2.captionElevated.size,
      color: colors.textMuted,
    },
    bio: {
      fontSize: TypographyV2.body.size,
      fontFamily: TypographyV2.body.fontFamily,
      color: colors.textSecondary,
      lineHeight: TypographyV2.body.lineHeight,
      marginBottom: Space.md,
    },
    urlContainer: {
      backgroundColor: colors.surfaceAlt,
      borderRadius: Radius.lg,
      paddingVertical: Space.sm,
      paddingHorizontal: Space.md,
      marginBottom: Space.lg,
    },
    urlText: {
      fontSize: TypographyV2.captionElevated.size,
      fontFamily: TypographyV2.captionElevated.fontFamily,
      color: colors.textSecondary,
    },
    actionsRow: {
      flexDirection: 'row',
      gap: Space.sm,
    },
    actionBtn: {
      flex: 1,
      minHeight: Control.hit,
      borderRadius: Radius.lg,
      flexDirection: 'row',
      justifyContent: 'center',
      alignItems: 'center',
      gap: Space.xs,
    },
    actionBtnSecondary: {
      backgroundColor: colors.surfaceAlt,
      borderWidth: Stroke.standard,
      borderColor: colors.border,
    },
    actionBtnSuccess: {
      borderColor: colors.success,
      backgroundColor: colors.surfaceAlt,
    },
    actionBtnSecondaryText: {
      fontSize: TypographyV2.bodyStrong.size,
      fontFamily: TypographyV2.bodyStrong.fontFamily,
      color: colors.textPrimary,
    },
    actionBtnPrimary: {
      backgroundColor: colors.brand,
    },
    actionBtnPrimaryText: {
      fontSize: TypographyV2.bodyStrong.size,
      fontFamily: TypographyV2.bodyStrong.fontFamily,
      color: colors.textInverse,
    },
  });
}
