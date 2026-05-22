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
import { Colors } from '../constants/colors';
import { Space, Radius } from '../theme/designTokens';
import { Typography } from '../constants/typography';
import { BottomSheet } from './BottomSheet';
import { AnimatedPressable } from './AnimatedPressable';
import { useToast } from '../context/ToastContext';
import { useHaptic } from '../hooks/useHaptic';
import { GlassCard } from './ui/GlassSurface';

interface ShareOption {
  id: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  action: () => void;
  tint?: string;
}

interface ShareSheetProps {
  visible: boolean;
  onDismiss: () => void;
  url: string;
  title?: string;
  /** Optional image URI to include in share */
  imageUri?: string;
}

export function ShareSheet({ visible, onDismiss, url, title = 'Check this out', imageUri }: ShareSheetProps) {
  const { show } = useToast();
  const haptic = useHaptic();

  const handleCopyLink = React.useCallback(async () => {
    haptic.medium();
    await Clipboard.setStringAsync(url);
    show('Link copied to clipboard', 'success');
    onDismiss();
  }, [url, show, haptic, onDismiss]);

  const handleNativeShare = React.useCallback(async () => {
    haptic.medium();
    try {
      await Share.share({
        url: Platform.OS === 'ios' ? url : undefined,
        message: Platform.OS === 'android' ? `${title}\n${url}` : title,
      }, {
        dialogTitle: title,
      });
    } catch {
      // User cancelled share
    }
    onDismiss();
  }, [url, title, haptic, onDismiss]);

  const options: ShareOption[] = React.useMemo(() => [
    {
      id: 'copy',
      label: 'Copy Link',
      icon: 'link-outline',
      action: handleCopyLink,
    },
    {
      id: 'share',
      label: 'Share via...',
      icon: 'share-outline',
      action: handleNativeShare,
    },
    {
      id: 'messages',
      label: 'Messages',
      icon: 'chatbubble-outline',
      action: () => {
        haptic.light();
        show('Opening Messages...', 'info');
        onDismiss();
      },
    },
    {
      id: 'instagram',
      label: 'Instagram',
      icon: 'logo-instagram',
      action: () => {
        haptic.light();
        show('Instagram share coming soon', 'info');
        onDismiss();
      },
    },
  ], [handleCopyLink, handleNativeShare, haptic, show, onDismiss]);

  return (
    <BottomSheet visible={visible} onDismiss={onDismiss} snapPoint={0.45} blurIntensity={30}>
      <View style={styles.container}>
        <Text style={styles.sheetTitle}>Share</Text>

        {/* Preview card */}
        {imageUri && (
          <GlassCard intensity={20} style={styles.previewCard}>
            <View style={styles.previewRow}>
              <View style={styles.previewIconWrap}>
                <Ionicons name="image-outline" size={24} color={Colors.textPrimary} />
              </View>
              <View style={styles.previewTextCol}>
                <Text style={styles.previewTitle} numberOfLines={1}>{title}</Text>
                <Text style={styles.previewUrl} numberOfLines={1}>{url}</Text>
              </View>
            </View>
          </GlassCard>
        )}

        {/* Share options grid */}
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
                <Ionicons name={option.icon} size={24} color={Colors.textPrimary} />
              </View>
              <Text style={styles.optionLabel}>{option.label}</Text>
            </AnimatedPressable>
          ))}
        </View>

        {/* Cancel */}
        <AnimatedPressable
          style={styles.cancelBtn}
          onPress={onDismiss}
          activeOpacity={0.85}
          hapticFeedback="light"
        >
          <Text style={styles.cancelText}>Cancel</Text>
        </AnimatedPressable>
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingTop: Space.sm,
    paddingHorizontal: Space.md,
    gap: Space.md,
  },
  sheetTitle: {
    fontSize: 17,
    fontFamily: Typography.family.semibold,
    color: Colors.textPrimary,
    textAlign: 'center',
    marginBottom: Space.xs,
  },
  previewCard: {
    padding: Space.md,
  },
  previewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm + 4,
  },
  previewIconWrap: {
    width: 40,
    height: 40,
    borderRadius: Radius.md,
    backgroundColor: Colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewTextCol: {
    flex: 1,
    gap: 2,
  },
  previewTitle: {
    fontSize: 15,
    fontFamily: Typography.family.semibold,
    color: Colors.textPrimary,
  },
  previewUrl: {
    fontSize: 13,
    fontFamily: Typography.family.regular,
    color: Colors.textMuted,
  },
  optionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Space.sm + 4,
    justifyContent: 'center',
    paddingVertical: Space.sm,
  },
  optionBtn: {
    alignItems: 'center',
    gap: Space.xs + 2,
    width: 72,
  },
  optionIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: Colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  optionLabel: {
    fontSize: 12,
    fontFamily: Typography.family.medium,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  cancelBtn: {
    marginTop: Space.sm,
    paddingVertical: Space.sm + 4,
    borderRadius: Radius.lg,
    backgroundColor: Colors.surfaceAlt,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  cancelText: {
    fontSize: 16,
    fontFamily: Typography.family.semibold,
    color: Colors.textPrimary,
  },
});
