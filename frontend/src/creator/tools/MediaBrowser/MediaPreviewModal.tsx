/**
 * LargePreviewModal — full-screen media preview on long-press.
 *
 * Extracted from MediaBrowserSheet — pure extraction, no behavior change.
 */
import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Modal } from 'react-native';
import { Image } from 'expo-image';
import { Space, Radius } from '../../../theme/designTokens';
import { TypographyV2 } from '../../../theme/typography.v2';
import type { ThemeColors } from '../../../theme/ThemeContext';
import { AppIcon } from '../../../components/common/AppIcon';
import { IconSize } from '../../../theme/iconTokens';
import { formatDuration, type MediaAsset } from './mediaBrowserTypes';

interface LargePreviewModalProps {
  asset: MediaAsset | null;
  onClose: () => void;
  colors: ThemeColors;
}

export function LargePreviewModal({ asset, onClose, colors }: LargePreviewModalProps) {
  if (!asset) return null;
  return (
    <Modal visible={!!asset} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={[previewStyles.backdrop, { backgroundColor: colors.mediaOverlayScrim }]} onPress={onClose} accessibilityRole="image">
        <View style={previewStyles.content}>
          <Image
            source={{ uri: asset.uri }}
            style={previewStyles.image}
            contentFit="contain"
            transition={150}
          />
          {asset.mediaType === 'video' && asset.durationMs != null && (
            <View style={[previewStyles.durationBadge, { backgroundColor: colors.mediaOverlayScrim }]}>
              <AppIcon name="play" size={IconSize.xs} color="textInverse" opticalCenter={true} accessible={false} />
              <Text style={[previewStyles.durationText, { color: colors.scrimTextPrimary }]}>
                {formatDuration(asset.durationMs)}
              </Text>
            </View>
          )}
        </View>
        <Pressable style={[previewStyles.closeBtn, { backgroundColor: colors.scrimTextTertiary }]} onPress={onClose} hitSlop={12} accessibilityLabel="Close preview" accessibilityHint="Returns to the media grid" accessibilityRole="button">
          <AppIcon name="close" size={IconSize.hero} color="textInverse" opticalCenter={true} accessible={false} />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const previewStyles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center' },
  content: {
    width: '100%',
    height: '80%' },
  image: {
    width: '100%',
    height: '100%' },
  durationBadge: {
    position: 'absolute',
    bottom: Space.md,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
    paddingHorizontal: Space.sm,
    paddingVertical: Space.xs,
    borderRadius: Radius.full },
  durationText: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily },
  closeBtn: {
    position: 'absolute',
    top: 50,
    right: Space.md,
    width: 44,
    height: 44,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center' } });
