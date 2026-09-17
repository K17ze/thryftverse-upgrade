/**
 * Chrome elements for the MediaBrowser sheet: the sheet header (title +
 * close), the limited-access banner, and the bottom confirm bar.
 *
 * Extracted from MediaBrowserSheet — pure extraction, no behavior change.
 */
import React from 'react';
import { View, Text, Pressable } from 'react-native';
import type { ThemeColors } from '../../../theme/ThemeContext';
import { PressScale } from '../../shared/CreatorAnimations';
import { AppIcon } from '../../../components/common/AppIcon';
import { IconSize } from '../../../theme/iconTokens';
import type { MediaBrowserStyles } from './mediaBrowserStyles';

// ── SheetHeader — title + close button ──────────────────────────────

interface SheetHeaderProps {
  title: string;
  onClose: () => void;
  colors: ThemeColors;
  styles: MediaBrowserStyles;
}

export function SheetHeader({ title, onClose, colors, styles }: SheetHeaderProps) {
  return (
    <View style={styles.header}>
      <Text style={[styles.title, { color: colors.textPrimary }]}>{title}</Text>
      <PressScale
        onPress={onClose}
        style={styles.closeBtn}
        accessibilityLabel="Close"
        accessibilityHint="Closes the media browser"
        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
      >
        <AppIcon name="close" size={IconSize.lg} color="textSecondary" opticalCenter={true} accessible={false} />
      </PressScale>
    </View>
  );
}

// ── LimitedAccessBanner — iOS 14+ / Android 14+ selected-photos ─────

interface LimitedAccessBannerProps {
  onPress: () => void;
  colors: ThemeColors;
  styles: MediaBrowserStyles;
}

export function LimitedAccessBanner({ onPress, colors, styles }: LimitedAccessBannerProps) {
  return (
    <Pressable
      style={[styles.limitedBanner, { backgroundColor: colors.surfaceAlt }]}
      onPress={onPress}
      accessibilityLabel="Limited photo access — tap to select more photos"
      accessibilityHint="Opens the photo-access picker"
      accessibilityRole="button"
    >
      <AppIcon name="images-outline" size={IconSize.sm} color="textSecondary" opticalCenter={true} accessible={false} />
      <Text style={[styles.limitedBannerText, { color: colors.textSecondary }]}>
        Limited access — tap to manage
      </Text>
      <AppIcon name="forward" size={IconSize.xs} color="textMuted" opticalCenter={true} accessible={false} />
    </Pressable>
  );
}

// ── ConfirmBottomBar — "Next (N)" full-width confirm button ─────────

interface ConfirmBottomBarProps {
  selectedCount: number;
  onConfirm: () => void;
  colors: ThemeColors;
  styles: MediaBrowserStyles;
}

export function ConfirmBottomBar({
  selectedCount,
  onConfirm,
  colors,
  styles }: ConfirmBottomBarProps) {
  return (
    <View style={[styles.bottomBar, { borderTopColor: colors.border }]}>
      <PressScale
        onPress={onConfirm}
        disabled={selectedCount === 0}
        style={[
          styles.confirmBtn,
          {
            backgroundColor: selectedCount > 0 ? colors.brand : colors.surfaceAlt },
        ]}
        accessibilityLabel={
          selectedCount > 0
            ? `Next, ${selectedCount} selected`
            : 'Next button — select items first'
        }
        accessibilityHint="Proceeds with the selected items"
        accessibilityRole="button"
        accessibilityState={{ disabled: selectedCount === 0 }}
      >
        <Text
          style={[
            styles.confirmBtnText,
            {
              color: selectedCount > 0 ? colors.textInverse : colors.textMuted },
          ]}
        >
          {selectedCount > 0 ? `Next (${selectedCount})` : 'Next'}
        </Text>
        <AppIcon
          name="forward"
          size={IconSize.sm}
          color={selectedCount > 0 ? 'textInverse' : 'textMuted'}
          opticalCenter={true}
          accessible={false}
        />
      </PressScale>
    </View>
  );
}
