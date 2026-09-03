/**
 * ShareSheet — Native-feeling share bottom sheet with blur backdrop
 * Inspired by iOS share sheet design language
 *
 * Usage:
 *   <ShareSheet
 *     visible={shareVisible}
 *     onDismiss={() => setShareVisible(false)}
 *     url="https://thryftverse.com/item/123"
 *     title="Check out this listing"
 *   />
 */

import React from 'react';
import { View, Text, StyleSheet, Share, Pressable, Platform } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Ionicons } from '@expo/vector-icons';
import { Space, Radius } from '../theme/designTokens';
import { TypographyV2 } from '../theme/typography.v2';
import { useAppTheme } from '../theme/ThemeContext';
import { BottomSheet } from './BottomSheet';
import { AnimatedPressable } from './AnimatedPressable';
import { CachedImage } from './CachedImage';
import { useToast } from '../context/ToastContext';
import { useHaptic } from '../hooks/useHaptic';
import { track } from '../analytics';

interface ShareOption {
  id: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  action: () => void;
}

interface ShareSheetProps {
  visible: boolean;
  onDismiss: () => void;
  url: string;
  title?: string;
  imageUri?: string;
  subtitle?: string;
  contentType?: string;
  contentId?: string;
}

export function ShareSheet({ visible, onDismiss, url, title = 'Check this out', imageUri, subtitle, contentType = 'generic', contentId }: ShareSheetProps) {
  const { colors } = useAppTheme();
  const { show } = useToast();
  const haptic = useHaptic();

  const handleCopyLink = React.useCallback(async () => {
    haptic.medium();
    await Clipboard.setStringAsync(url);
    track('share_completed', { platform: 'copy_link', content_type: contentType, outcome: 'success' });
    if (contentId && contentType === 'listing') {
      track('item_shared', { listing_id: contentId, platform: 'copy_link' });
    }
    show('Link copied to clipboard', 'success');
    onDismiss();
  }, [url, show, haptic, onDismiss, contentType, contentId]);

  const handleNativeShare = React.useCallback(async () => {
    haptic.medium();
    track('share_initiated', { platform: 'system', content_type: contentType });
    try {
      await Share.share({
        url: Platform.OS === 'ios' ? url : undefined,
        message: Platform.OS === 'android' ? `${title}\n${url}` : title }, {
        dialogTitle: title });
      track('share_completed', { platform: 'system', content_type: contentType, outcome: 'success' });
      if (contentId && contentType === 'listing') {
        track('item_shared', { listing_id: contentId, platform: 'system' });
      }
    } catch {
      track('share_completed', { platform: 'system', content_type: contentType, outcome: 'cancelled' });
    }
    onDismiss();
  }, [url, title, haptic, onDismiss, contentType, contentId]);

  const options: ShareOption[] = React.useMemo(() => [
    {
      id: 'copy',
      label: 'Copy Link',
      icon: 'link-outline',
      action: handleCopyLink },
    {
      id: 'share',
      label: 'Share via...',
      icon: 'share-social-outline',
      action: handleNativeShare },
    {
      id: 'remind',
      label: 'Set reminder',
      icon: 'alarm-outline',
      action: () => {
        haptic.light();
        show('Reminder set for this item', 'success');
        onDismiss();
      } },
  ], [handleCopyLink, handleNativeShare, haptic, show, onDismiss]);

  return (
    <BottomSheet visible={visible} onDismiss={onDismiss} snapPoint={0.45} blurIntensity={30}>
      <View style={styles.container}>
        <Text style={[styles.sheetTitle, { color: colors.textPrimary }]}>Share</Text>

        {/* Preview — flat, no card border. Per AGENTS.md surface budget. */}
        <View style={styles.previewRow}>
          <View style={[styles.previewImageWrap, { backgroundColor: colors.surfaceAlt }]}>
            {imageUri ? (
              <CachedImage uri={imageUri} style={styles.previewImage} contentFit="cover" />
            ) : (
              <View style={styles.previewIconFallback}>
                <Ionicons name="image-outline" size={24} color={colors.textMuted} />
              </View>
            )}
          </View>
          <View style={styles.previewTextCol}>
            <Text style={[styles.previewTitle, { color: colors.textPrimary }]} numberOfLines={1}>{title}</Text>
            {subtitle ? (
              <Text style={[styles.previewSubtitle, { color: colors.textSecondary }]} numberOfLines={1}>{subtitle}</Text>
            ) : null}
            <Text style={[styles.previewUrl, { color: colors.textMuted }]} numberOfLines={1}>{url}</Text>
          </View>
        </View>

        {/* Share options — icon targets with transparent background.
            Per Design.md: default icon containment is transparent. */}
        <View style={styles.optionsGrid}>
          {options.map((option) => (
            <AnimatedPressable
              key={option.id}
              style={styles.optionBtn}
              onPress={option.action}
              activeOpacity={0.85}
              hapticFeedback="light"
              accessibilityLabel={option.label}
              accessibilityRole="button"
            >
              <View style={styles.optionIconWrap}>
                <Ionicons name={option.icon} size={24} color={colors.textPrimary} />
              </View>
              <Text style={[styles.optionLabel, { color: colors.textSecondary }]}>
                {option.label}
              </Text>
            </AnimatedPressable>
          ))}
        </View>

        {/* Cancel — quiet text action, not a bordered button */}
        <Pressable
          style={styles.cancelBtn}
          onPress={onDismiss}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Cancel"
        >
          <Text style={[styles.cancelText, { color: colors.textSecondary }]}>Cancel</Text>
        </Pressable>
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingTop: Space.sm,
    paddingHorizontal: Space.md,
    gap: Space.md },
  sheetTitle: {
    fontSize: TypographyV2.sectionTitle.size,
    lineHeight: TypographyV2.sectionTitle.lineHeight,
    fontFamily: TypographyV2.sectionTitle.fontFamily,
    letterSpacing: TypographyV2.sectionTitle.letterSpacing,
    textAlign: 'center',
    marginBottom: Space.xs },
  // ── Preview — flat, no card ──
  previewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
    paddingVertical: Space.sm },
  previewImageWrap: {
    width: 48,
    height: 48,
    borderRadius: Radius.md,
    overflow: 'hidden' },
  previewImage: {
    width: '100%',
    height: '100%' },
  previewIconFallback: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center' },
  previewTextCol: {
    flex: 1,
    gap: 2 },
  previewTitle: {
    fontSize: TypographyV2.bodyStrong.size,
    lineHeight: TypographyV2.bodyStrong.lineHeight,
    fontFamily: TypographyV2.bodyStrong.fontFamily },
  previewSubtitle: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: TypographyV2.meta.fontFamily },
  previewUrl: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: TypographyV2.meta.fontFamily },
  // ── Share options grid ──
  optionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Space.md,
    justifyContent: 'center',
    paddingVertical: Space.sm },
  optionBtn: {
    alignItems: 'center',
    gap: Space.xs + 2,
    width: 72 },
  optionIconWrap: {
    width: 56,
    height: 56,
    borderRadius: Radius.lg,
    alignItems: 'center',
    justifyContent: 'center' },
  optionLabel: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: TypographyV2.meta.fontFamily,
    textAlign: 'center' },
  // ── Cancel — quiet text action ──
  cancelBtn: {
    marginTop: Space.xs,
    paddingVertical: Space.md,
    alignItems: 'center',
    minHeight: 44,
    justifyContent: 'center' },
  cancelText: {
    fontSize: TypographyV2.bodyStrong.size,
    lineHeight: TypographyV2.bodyStrong.lineHeight,
    fontFamily: TypographyV2.bodyStrong.fontFamily } });
