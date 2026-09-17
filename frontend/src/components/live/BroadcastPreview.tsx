/**
 * BroadcastPreview — the seller's camera stage.
 *
 * Two honest modes:
 *  - `liveTrack` set → renders the actual published LiveKit camera track via
 *    VideoView, i.e. the real broadcast feed viewers receive. This also
 *    unmounts the VisionCamera session so the two capturers never fight
 *    over the camera device.
 *  - `liveTrack` null → local framing preview via react-native-vision-camera
 *    (already a dependency, used by VisualSearchCamera / CreatorCamera).
 *
 * Also exports `LiveKitVideoSurface`, the shared renderer for any LiveKit
 * video track (used by the viewer screen for the host's remote track).
 * VideoView is resolved lazily: the package's module init registers a
 * native view, so a missing native module (Expo Go) must fail soft rather
 * than crash module evaluation — and a track can only exist when the room
 * connected, which already requires the native module.
 *
 * States (AGENTS §14):
 *  - permission not yet granted → quiet panel with an "Allow camera" action
 *  - permission denied / no device / web → quiet panel, stream setup still
 *    works (lots, chat, bids do not depend on the camera)
 *  - granted + device → real camera feed
 */

import React from 'react';
import { Platform, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import {
  Camera,
  useCameraDevice,
  useCameraPermission,
  usePhotoOutput,
} from 'react-native-vision-camera';
import { useAppTheme } from '../../theme/ThemeContext';
import { Radius, Space, Control } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { AnimatedPressable } from '../AnimatedPressable';
import { AppIcon } from '../common/AppIcon';
import { IconSize } from '../../theme/iconTokens';
import type { LiveKitVideoTrack } from '../../platform/streaming/useLiveKitRoom';

type VideoViewComponent = React.ComponentType<{
  videoTrack?: LiveKitVideoTrack;
  style?: StyleProp<ViewStyle>;
  objectFit?: 'cover' | 'contain';
  mirror?: boolean;
  zOrder?: number;
}>;

let cachedVideoView: VideoViewComponent | null | undefined;

/** Lazy resolve — see file header. Returns null when the native view cannot
 *  be registered (Expo Go / web), never throws. */
function getLiveKitVideoView(): VideoViewComponent | null {
  if (cachedVideoView === undefined) {
    try {
      const mod = require('@livekit/react-native') as {
        VideoView?: VideoViewComponent;
      };
      cachedVideoView = mod.VideoView ?? null;
    } catch {
      cachedVideoView = null;
    }
  }
  return cachedVideoView;
}

interface LiveKitVideoSurfaceProps {
  /** The LiveKit video track to render — local published or remote
   *  subscribed. Renders nothing when absent. */
  track: LiveKitVideoTrack | null | undefined;
  style?: StyleProp<ViewStyle>;
  objectFit?: 'cover' | 'contain';
  /** Mirror horizontally — front-facing local cameras only. */
  mirror?: boolean;
  accessibilityLabel: string;
}

/** Shared LiveKit video renderer — wraps the SDK's VideoView (which handles
 *  adaptiveStream element observation and mediaStream extraction). */
export function LiveKitVideoSurface({
  track,
  style,
  objectFit = 'cover',
  mirror = false,
  accessibilityLabel,
}: LiveKitVideoSurfaceProps) {
  const VideoView = getLiveKitVideoView();
  if (!track || !VideoView) return null;
  return (
    <View style={style} accessibilityRole="image" accessibilityLabel={accessibilityLabel}>
      <VideoView
        videoTrack={track}
        style={StyleSheet.absoluteFill}
        objectFit={objectFit}
        mirror={mirror}
      />
    </View>
  );
}

interface BroadcastPreviewProps {
  /** Whether the camera session should be active (mount/unmount screens). */
  active: boolean;
  /** Camera direction — 'back' shows the items being sold. */
  facing?: 'front' | 'back';
  /** Fixed height; defaults to a 4:3 stage. */
  height?: number;
  /** Accessibility label for the preview surface. */
  accessibilityLabel?: string;
  /** When set, render the published LiveKit camera track — the real
   *  broadcast feed — instead of the local VisionCamera preview. */
  liveTrack?: LiveKitVideoTrack | null;
}

export function BroadcastPreview({
  active,
  facing = 'back',
  height,
  accessibilityLabel = 'Camera preview',
  liveTrack,
}: BroadcastPreviewProps) {
  const { colors } = useAppTheme();
  const device = useCameraDevice(facing);
  const photoOutput = usePhotoOutput({ qualityPrioritization: 'speed' });
  const { hasPermission, requestPermission } = useCameraPermission();
  const [requesting, setRequesting] = React.useState(false);

  const handleRequest = React.useCallback(() => {
    setRequesting(true);
    requestPermission()
      .catch(() => {})
      .finally(() => setRequesting(false));
  }, [requestPermission]);

  const stageStyle = [
    styles.stage,
    { backgroundColor: colors.surfaceAlt },
    height != null && { height },
  ];

  // Published feed — the real broadcast plane.
  if (liveTrack) {
    return (
      <LiveKitVideoSurface
        track={liveTrack}
        style={stageStyle}
        objectFit="cover"
        mirror={facing === 'front'}
        accessibilityLabel={accessibilityLabel}
      />
    );
  }

  const stage = (
    <View
      style={stageStyle}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="image"
    >
      <AppIcon name="videocam" size={IconSize.xl} color="textMuted" accessible={false} />
      {hasPermission === false ? (
        <>
          <Text style={[styles.hint, { color: colors.textMuted }]}>
            Camera access needed for preview
          </Text>
          <AnimatedPressable
            onPress={handleRequest}
            disabled={requesting}
            hapticFeedback="light"
            scaleValue={0.97}
            style={styles.allowBtn}
            accessibilityRole="button"
            accessibilityLabel="Allow camera access"
            accessibilityState={{ busy: requesting }}
          >
            <Text style={[styles.allowText, { color: colors.textPrimary }]}>Allow camera</Text>
          </AnimatedPressable>
        </>
      ) : (
        <Text style={[styles.hint, { color: colors.textMuted }]}>No camera on this device</Text>
      )}
    </View>
  );

  if (Platform.OS === 'web' || !device || hasPermission !== true) {
    return stage;
  }

  return (
    <View
      style={stageStyle}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="image"
    >
      <Camera
        style={StyleSheet.absoluteFill}
        device={device}
        isActive={active}
        outputs={[photoOutput]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  stage: {
    width: '100%',
    aspectRatio: 3 / 4,
    maxHeight: 320,
    borderRadius: Radius.lg,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space.xs,
  },
  hint: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    letterSpacing: TypographyV2.meta.letterSpacing,
  },
  allowBtn: {
    marginTop: Space.xs,
    minHeight: Control.hit,
    justifyContent: 'center',
    paddingHorizontal: Space.lg,
    paddingVertical: Space.sm,
    borderRadius: Radius.lg,
  },
  allowText: {
    fontSize: TypographyV2.bodyStrong.size,
    fontFamily: TypographyV2.bodyStrong.fontFamily,
  },
});
