import React, { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AnimatedPressable } from '../components/AnimatedPressable';
import { AppIcon } from '../components/common/AppIcon';
import { AppIconButton } from '../components/common/AppIconButton';
import type { CreatorInitialMedia } from '../navigation/types';
import { Control, EditorCanvas, Radius, Space } from '../theme/designTokens';
import { IconSize } from '../theme/iconTokens';
import { TypographyV2 } from '../theme/typography.v2';
import { useAppTheme } from '../theme/ThemeContext';
import type { CaptureViewport } from './capture/CaptureViewport';

export interface CreatorCameraProps {
  mode: 'poster' | 'look' | 'visual-search';
  onCapture: (uri: string) => void;
  onCaptureBatch?: (captures: CreatorInitialMedia[]) => void;
  onGallery: () => void;
  onGalleryLongPress?: () => void;
  onClose: () => void;
  renderBottomOverlay?: () => React.ReactNode;
  renderTopRightAccessory?: () => React.ReactNode;
  onViewportChange?: (viewport: CaptureViewport | null) => void;
}

/**
 * Browser acquisition surface.
 *
 * Vision Camera is a native module and must never be imported into the web
 * bundle. Web creation starts from the system file picker instead, while the
 * native implementation keeps the full camera, effects and multi-capture UI.
 */
export default function CreatorCameraWeb({
  mode,
  onGallery,
  onGalleryLongPress,
  onClose,
  renderBottomOverlay,
  renderTopRightAccessory,
  onViewportChange,
}: CreatorCameraProps) {
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();

  useEffect(() => {
    onViewportChange?.(null);
    return () => onViewportChange?.(null);
  }, [onViewportChange]);

  const noun = mode === 'look' ? 'look' : mode === 'poster' ? 'poster' : 'search';

  return (
    <View style={[styles.root, { backgroundColor: EditorCanvas }]}>
      <View style={[styles.topBar, { paddingTop: Math.max(insets.top, Space.sm) }]}>
        <AppIconButton
          name="close"
          size={IconSize.lg}
          color="textInverse"
          containerVariant="blur"
          onPress={onClose}
          accessibilityLabel="Close creator"
        />
        {renderTopRightAccessory ? renderTopRightAccessory() : <View style={styles.balance} />}
      </View>

      <View style={styles.content}>
        <AppIcon name="images" size={IconSize.display} color="textInverse" opticalCenter accessible={false} />
        <Text style={[styles.title, { color: colors.textInverse }]}>Start with your media</Text>
        <Text style={[styles.body, { color: colors.scrimTextSecondary }]}>Choose photos or videos from this device to create your {noun}. Camera capture is available in the mobile app.</Text>
        <AnimatedPressable
          style={[styles.primaryAction, { backgroundColor: colors.textInverse }]}
          onPress={onGallery}
          onLongPress={onGalleryLongPress}
          hapticFeedback="light"
          accessibilityRole="button"
          accessibilityLabel="Choose photos or videos"
          accessibilityHint={`Opens the system picker for your ${noun}`}
        >
          <Text style={[styles.primaryActionLabel, { color: colors.textPrimary }]}>Choose media</Text>
        </AnimatedPressable>
      </View>

      {renderBottomOverlay ? renderBottomOverlay() : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    minHeight: 520,
  },
  topBar: {
    position: 'absolute',
    top: 0,
    left: Space.sm,
    right: Space.sm,
    zIndex: 4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  balance: {
    width: Control.hit,
    height: Control.hit,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Space.xl,
    paddingBottom: 128,
  },
  title: {
    marginTop: Space.lg,
    fontSize: TypographyV2.screenTitle.size,
    lineHeight: TypographyV2.screenTitle.lineHeight,
    fontFamily: TypographyV2.screenTitle.fontFamily,
    textAlign: 'center',
  },
  body: {
    marginTop: Space.sm,
    maxWidth: 320,
    fontSize: TypographyV2.body.size,
    lineHeight: TypographyV2.body.lineHeight,
    fontFamily: TypographyV2.body.fontFamily,
    textAlign: 'center',
  },
  primaryAction: {
    minWidth: 184,
    minHeight: Control.hit + 12,
    marginTop: Space.xl,
    paddingHorizontal: Space.lg,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryActionLabel: {
    fontSize: TypographyV2.bodyStrong.size,
    lineHeight: TypographyV2.bodyStrong.lineHeight,
    fontFamily: TypographyV2.bodyStrong.fontFamily,
  },
});
