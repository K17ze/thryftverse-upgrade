/**
 * ShareSheet — Social platform picker bottom sheet
 *
 * Shows icons for Instagram Story, TikTok, WhatsApp, Telegram, and More
 * (system sheet). Each option calls the corresponding SocialShare function.
 *
 * Uses the existing BottomSheet engine (react-native-reanimated spring
 * entrance, pan-to-dismiss, semantic material variants). Theme-aware via
 * useAppTheme — dark mode parity is automatic.
 *
 * Design: follows the existing ShareSheet pattern in src/components/ but
 * targets specific social platforms instead of generic copy/share actions.
 * The icon grid uses transparent containment (per AGENTS.md surface budget)
 * with one icon family (Ionicons) at a stable optical size band.
 */

import React, { useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Space, Radius, Type, FontFamily } from '../../theme/designTokens';
import { useAppTheme } from '../../theme/ThemeContext';
import { BottomSheet } from '../../components/BottomSheet';
import { AnimatedPressable } from '../../components/AnimatedPressable';
import { CachedImage } from '../../components/CachedImage';
import { useToast } from '../../context/ToastContext';
import { useHaptic } from '../../hooks/useHaptic';
import {
  shareToInstagramStory,
  shareToTikTok,
  shareToWhatsApp,
  shareToTelegram,
  shareToSystemSheet,
} from './SocialShare';
import type { ShareSheetProps, SocialShareTarget } from './types';

// ============================================================================
// SHARE OPTION MODEL
// ============================================================================

interface ShareOption {
  id: SocialShareTarget;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  /** Brand-tinted icon color override — null uses default textPrimary. */
  iconColor?: string | null;
}

const SHARE_OPTIONS: readonly ShareOption[] = [
  {
    id: 'instagram-story',
    label: 'Story',
    icon: 'logo-instagram',
  },
  {
    id: 'tiktok',
    label: 'TikTok',
    icon: 'logo-tiktok',
  },
  {
    id: 'whatsapp',
    label: 'WhatsApp',
    icon: 'logo-whatsapp',
  },
  {
    id: 'telegram',
    label: 'Telegram',
    icon: 'paper-plane-outline',
  },
  {
    id: 'system',
    label: 'More',
    icon: 'share-outline',
  },
] as const;

// ============================================================================
// COMPONENT
// ============================================================================

/**
 * ShareSheet — renders a bottom sheet with social platform targets.
 *
 * The sheet composes platform-specific payloads from `shareParams.listing`
 * and dispatches to the corresponding SocialShare function. If a
 * `composedImageUri` is provided (from `useShareListing.prepareListingImage`),
 * it is used as the Instagram Story background; otherwise the raw listing
 * image is used.
 */
export function ShareSheet({ visible, onClose, shareParams }: ShareSheetProps) {
  const { colors } = useAppTheme();
  const { show } = useToast();
  const haptic = useHaptic();

  // ── Dispatch ──────────────────────────────────────────────────────────
  const handleShare = useCallback(
    async (target: SocialShareTarget) => {
      if (!shareParams) return;
      const { listing, composedImageUri, stickerImageUri } = shareParams;

      haptic.medium();

      try {
        switch (target) {
          case 'instagram-story':
            await shareToInstagramStory({
              backgroundImageUri: composedImageUri ?? listing.imageUri,
              stickerImageUri,
              attributionLink: listing.deepLink,
            });
            break;

          case 'tiktok':
            await shareToTikTok({
              imageUri: composedImageUri ?? listing.imageUri,
              caption: `"${listing.title}" — \u00A3${listing.priceGbp.toFixed(2)} on Thryftverse`,
            });
            break;

          case 'whatsapp':
            await shareToWhatsApp({
              message: `Check out "${listing.title}" — \u00A3${listing.priceGbp.toFixed(2)} on Thryftverse\n${listing.deepLink}`,
              imageUri: listing.imageUri,
            });
            break;

          case 'telegram':
            await shareToTelegram({
              message: `Check out "${listing.title}" — \u00A3${listing.priceGbp.toFixed(2)} on Thryftverse\n${listing.deepLink}`,
              imageUri: listing.imageUri,
            });
            break;

          case 'system':
            await shareToSystemSheet({
              message: `Check out "${listing.title}" — \u00A3${listing.priceGbp.toFixed(2)} on Thryftverse\n${listing.deepLink}`,
              imageUri: listing.imageUri,
              url: listing.deepLink,
            });
            break;
        }
      } catch {
        // All SocialShare functions handle errors internally, but guard
        // against any unexpected rejections so the sheet never crashes.
        show('Could not share right now', 'error');
      }

      onClose();
    },
    [shareParams, haptic, show, onClose],
  );

  // ── Preview data ──────────────────────────────────────────────────────
  const previewTitle = shareParams?.listing.title ?? '';
  const previewSubtitle = shareParams
    ? `\u00A3${shareParams.listing.priceGbp.toFixed(2)}`
    : '';
  const previewImage = shareParams?.listing.imageUri;

  // ── Options ───────────────────────────────────────────────────────────
  const options = useMemo(() => SHARE_OPTIONS, []);

  if (!visible || !shareParams) return null;

  return (
    <BottomSheet visible={visible} onDismiss={onClose} snapPoint={0.42} variant="system">
      <View style={styles.container}>
        <Text style={[styles.sheetTitle, { color: colors.textPrimary }]}>
          Share to
        </Text>

        {/* Preview — flat, no card border. Per AGENTS.md surface budget. */}
        <View style={styles.previewRow}>
          <View style={[styles.previewImageWrap, { backgroundColor: colors.surfaceAlt }]}>
            {previewImage ? (
              <CachedImage uri={previewImage} style={styles.previewImage} contentFit="cover" />
            ) : (
              <View style={styles.previewIconFallback}>
                <Ionicons name="image-outline" size={24} color={colors.textMuted} />
              </View>
            )}
          </View>
          <View style={styles.previewTextCol}>
            <Text
              style={[styles.previewTitle, { color: colors.textPrimary }]}
              numberOfLines={1}
            >
              {previewTitle}
            </Text>
            {previewSubtitle ? (
              <Text
                style={[styles.previewSubtitle, { color: colors.textSecondary }]}
                numberOfLines={1}
              >
                {previewSubtitle}
              </Text>
            ) : null}
          </View>
        </View>

        {/* Platform targets — icon grid with transparent containment.
            Per Design.md: default icon containment is transparent. */}
        <View style={styles.optionsGrid}>
          {options.map((option) => (
            <AnimatedPressable
              key={option.id}
              style={styles.optionBtn}
              onPress={() => handleShare(option.id)}
              activeOpacity={0.85}
              hapticFeedback="light"
              accessibilityLabel={`Share to ${option.label}`}
              accessibilityRole="button"
            >
              <View style={[styles.optionIconWrap, { backgroundColor: colors.surfaceAlt }]}>
                <Ionicons
                  name={option.icon}
                  size={24}
                  color={option.iconColor ?? colors.textPrimary}
                />
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
          onPress={onClose}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Cancel"
        >
          <Text style={[styles.cancelText, { color: colors.textSecondary }]}>
            Cancel
          </Text>
        </Pressable>
      </View>
    </BottomSheet>
  );
}

// ============================================================================
// STYLES
// ============================================================================

const styles = StyleSheet.create({
  container: {
    paddingTop: Space.sm,
    paddingHorizontal: Space.md,
    gap: Space.md,
  },
  sheetTitle: {
    fontSize: Type.subtitle.size,
    lineHeight: Type.subtitle.lineHeight,
    fontFamily: FontFamily.semibold,
    letterSpacing: Type.subtitle.letterSpacing,
    textAlign: 'center',
    marginBottom: Space.xs,
  },
  // ── Preview — flat, no card ──
  previewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
    paddingVertical: Space.sm,
  },
  previewImageWrap: {
    width: 48,
    height: 48,
    borderRadius: Radius.md,
    overflow: 'hidden',
  },
  previewImage: {
    width: '100%',
    height: '100%',
  },
  previewIconFallback: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewTextCol: {
    flex: 1,
    gap: 2,
  },
  previewTitle: {
    fontSize: Type.bodyStrong.size,
    lineHeight: Type.bodyStrong.lineHeight,
    fontFamily: FontFamily.semibold,
  },
  previewSubtitle: {
    fontSize: Type.caption.size,
    lineHeight: Type.caption.lineHeight,
    fontFamily: FontFamily.regular,
  },
  // ── Platform options grid ──
  optionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Space.md,
    justifyContent: 'center',
    paddingVertical: Space.sm,
  },
  optionBtn: {
    alignItems: 'center',
    gap: Space.xs + 2,
    width: 68,
  },
  optionIconWrap: {
    width: 56,
    height: 56,
    borderRadius: Radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionLabel: {
    fontSize: Type.caption.size,
    lineHeight: Type.caption.lineHeight,
    fontFamily: FontFamily.medium,
    textAlign: 'center',
  },
  // ── Cancel — quiet text action ──
  cancelBtn: {
    marginTop: Space.xs,
    paddingVertical: Space.md,
    alignItems: 'center',
    minHeight: 44,
    justifyContent: 'center',
  },
  cancelText: {
    fontSize: Type.bodyStrong.size,
    lineHeight: Type.bodyStrong.lineHeight,
    fontFamily: FontFamily.semibold,
  },
});
