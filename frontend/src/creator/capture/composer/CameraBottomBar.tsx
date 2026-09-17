import React from 'react';
import type { RefObject } from 'react';
import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { SharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppTheme } from '../../../theme/ThemeContext';
import { GalleryCarousel, type GalleryItem } from '../../camera/GalleryCarousel';
import { ShutterButton } from '../../camera/ShutterButton';
import { styles } from '../CreatorCameraStyles';
import { CameraFlipButton } from './CameraFlipButton';

// ── CameraBottomBar ──────────────────────────────────────────────────
// Bottom controls — gallery (left), shutter (center), flip (right).
// The shutter is the hero control with the recording ring; while a hold
// recording is live, the slide-to-lock pill (Snap grammar) appears
// up-left of it. Dragging the held finger onto the pill latches
// recording so releasing the shutter keeps capturing. Extracted from
// CreatorCamera — markup is verbatim.

export interface CameraBottomBarProps {
  insets: ReturnType<typeof useSafeAreaInsets>;
  lastItem: GalleryItem | null;
  recentItems: GalleryItem[];
  showRecentCarousel: boolean;
  onGallery: () => void;
  onGalleryLongPress: () => void;
  isRecording: boolean;
  recordLocked: boolean;
  handsFreeMode: boolean;
  lockZoneRef: RefObject<View | null>;
  lockHot: boolean;
  onShutterPress: () => void;
  onShutterLongPress?: () => void;
  onShutterPressOut?: () => void;
  onHoldTouchStart: (pageX: number, pageY: number) => void;
  onHoldTouchMove: (pageX: number, pageY: number) => void;
  cameraReady: boolean;
  recordingProgress: SharedValue<number>;
  recordingRingScale: SharedValue<number>;
  speedMode: string;
  videoCaptureEnabled: boolean;
  onFlip: () => void;
}

export function CameraBottomBar({
  insets,
  lastItem,
  recentItems,
  showRecentCarousel,
  onGallery,
  onGalleryLongPress,
  isRecording,
  recordLocked,
  handsFreeMode,
  lockZoneRef,
  lockHot,
  onShutterPress,
  onShutterLongPress,
  onShutterPressOut,
  onHoldTouchStart,
  onHoldTouchMove,
  cameraReady,
  recordingProgress,
  recordingRingScale,
  speedMode,
  videoCaptureEnabled,
  onFlip,
}: CameraBottomBarProps) {
  const { colors } = useAppTheme();
  return (
    <View style={[styles.bottomBar, { paddingBottom: Math.max(insets.bottom, 16) + 16 }]} pointerEvents="box-none">
      {/* Gallery thumbnail + recent photos carousel */}
      <GalleryCarousel
        lastItem={lastItem}
        recentItems={recentItems}
        showRecentCarousel={showRecentCarousel}
        carouselBottom={Math.max(insets.bottom, 16) + 112}
        onGallery={onGallery}
        onLongPress={onGalleryLongPress}
      />

      {/* Shutter — the hero control with recording ring */}
      {/* Slide-to-lock pill (Snap grammar): appears while a hold
          recording is live. Dragging the held finger up-left onto it
          latches recording so releasing the shutter keeps capturing.
          pointerEvents none — the touch responder must stay on the
          shutter so move events keep arriving. */}
      {isRecording && !recordLocked && !handsFreeMode && (
        <View
          ref={lockZoneRef}
          pointerEvents="none"
          style={[
            styles.recordLockPill,
            { backgroundColor: lockHot ? colors.brand : colors.mediaOverlayScrim },
          ]}
          accessibilityElementsHidden={true}
          importantForAccessibility="no"
        >
          <Ionicons
            name={lockHot ? 'lock-closed' : 'lock-open-outline'}
            size={18}
            color={colors.scrimTextPrimary}
          />
        </View>
      )}

      <ShutterButton
        onPress={onShutterPress}
        onLongPress={videoCaptureEnabled ? onShutterLongPress : undefined}
        onPressOut={videoCaptureEnabled ? onShutterPressOut : undefined}
        onHoldTouchStart={onHoldTouchStart}
        onHoldTouchMove={onHoldTouchMove}
        isRecording={isRecording}
        // Stays enabled during countdowns so a tap can abort (handled in
        // handleShutterPress); holds are ignored via handleShutterLongPress.
        disabled={!cameraReady}
        recordingProgress={recordingProgress}
        recordingRingScale={recordingRingScale}
        handsFreeMode={handsFreeMode}
        speedMode={speedMode}
        videoCaptureEnabled={videoCaptureEnabled}
      />

      {/* Flip camera — transparent 44pt target. The bottom scrim provides
          legibility; no persistent dark plate. */}
      <CameraFlipButton onPress={onFlip} />
    </View>
  );
}
