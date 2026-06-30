import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  Pressable,
  Dimensions,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Space, Radius, Type, Typography } from '../../theme/designTokens';
import { Colors } from '../../constants/colors';
import { Video, ResizeMode } from '../compat/Video';
import { PosterStickerLayer } from './PosterStickerLayer';
import type { ComposerFrame } from './PosterFrameStrip';
import type { PosterSticker as ApiPosterSticker } from '../../services/postersApi';

const { width: SCREEN_W } = Dimensions.get('window');
const DEFAULT_CANVAS_W = Math.min(SCREEN_W - 40, 360);
const DEFAULT_CANVAS_H = DEFAULT_CANVAS_W * (16 / 9);

export type CanvasMode = 'edit' | 'preview';

export interface PosterFrameCanvasProps {
  frame: ComposerFrame;
  mode: CanvasMode;
  width?: number;
  height?: number;
  selectedStickerId?: string | null;
  onStickerPress?: (stickerId: string) => void;
  onStickerPositionChange?: (stickerId: string, x: number, y: number) => void;
  onCanvasPress?: () => void;
}

export function PosterFrameCanvas({
  frame,
  mode,
  width = DEFAULT_CANVAS_W,
  height = DEFAULT_CANVAS_H,
  selectedStickerId,
  onStickerPress,
  onStickerPositionChange,
  onCanvasPress,
}: PosterFrameCanvasProps) {
  const isTextFrame = frame.mediaType === 'text' && !frame.mediaUri;
  const isVideo = frame.mediaType === 'video' && !!frame.mediaUri;
  const isImage = frame.mediaType === 'image' && !!frame.mediaUri;

  const [videoError, setVideoError] = useState(false);
  const [videoReady, setVideoReady] = useState(false);
  const [videoPlaying, setVideoPlaying] = useState(false);

  // Reset video state when frame or media changes
  useEffect(() => {
    setVideoError(false);
    setVideoReady(false);
    setVideoPlaying(false);
  }, [frame.id, frame.mediaUri]);

  const handleVideoLoad = useCallback(() => {
    setVideoReady(true);
    setVideoError(false);
  }, []);

  const handleVideoError = useCallback(() => {
    setVideoError(true);
    setVideoReady(false);
  }, []);

  const toggleVideoPlay = useCallback(() => {
    setVideoPlaying((prev) => !prev);
  }, []);

  const apiStickers = frame.stickers as unknown as ApiPosterSticker[];

  const handleStickerPress = useCallback(
    (sticker: ApiPosterSticker) => {
      if (mode === 'edit') {
        onStickerPress?.(sticker.id);
      }
    },
    [mode, onStickerPress]
  );

  const handleStickerPositionChange = useCallback(
    (id: string, x: number, y: number) => {
      if (mode === 'edit') {
        onStickerPositionChange?.(id, x, y);
      }
    },
    [mode, onStickerPositionChange]
  );

  const handleCanvasPress = useCallback(() => {
    if (mode === 'edit') {
      onCanvasPress?.();
    }
  }, [mode, onCanvasPress]);

  return (
    <GestureHandlerRootView
      style={[
        styles.canvas,
        {
          width,
          height,
          backgroundColor: frame.backgroundColor ?? (isTextFrame ? '#1a1a1a' : Colors.surfaceAlt),
        },
      ]}
    >
      {isImage && (
        <Image source={{ uri: frame.mediaUri! }} style={StyleSheet.absoluteFill} resizeMode="cover" />
      )}

      {isVideo && !videoError && (
        <>
          {frame.thumbnailUri && (
            <Image source={{ uri: frame.thumbnailUri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
          )}
          <Video
            key={`${frame.id}-${frame.mediaUri}`}
            source={{ uri: frame.mediaUri! }}
            style={StyleSheet.absoluteFill}
            resizeMode={ResizeMode.COVER}
            shouldPlay={videoPlaying}
            isMuted
            isLooping
            onLoad={handleVideoLoad}
            onError={handleVideoError}
          />
          <View style={styles.videoBadge} pointerEvents="none">
            <Ionicons name="videocam" size={12} color="#fff" />
            <Text style={styles.videoBadgeText}>Video</Text>
          </View>
          {videoReady && (
            <Pressable
              onPress={toggleVideoPlay}
              style={styles.videoPlayBtn}
              accessibilityLabel={videoPlaying ? 'Pause video' : 'Play video'}
              accessibilityRole="button"
            >
              <Ionicons name={videoPlaying ? 'pause' : 'play'} size={24} color="#fff" />
            </Pressable>
          )}
          {!videoReady && (
            <View style={styles.videoLoading} pointerEvents="none">
              <ActivityIndicator size="small" color="#fff" />
            </View>
          )}
        </>
      )}

      {isVideo && videoError && (
        <View style={styles.videoErrorState}>
          <Ionicons name="warning-outline" size={28} color={Colors.textMuted} />
          <Text style={styles.videoErrorText}>Video unavailable</Text>
        </View>
      )}

      {isTextFrame && (
        <View style={styles.textFrameContent}>
          <Text
            style={[
              styles.textFrameText,
              { color: frame.backgroundColor === '#ffffff' ? '#000' : '#fff' },
            ]}
          >
            {frame.caption || (mode === 'edit' ? 'Type your text...' : '')}
          </Text>
        </View>
      )}

      {/* Background press layer for deselection — above media, below stickers */}
      {mode === 'edit' && (
        <Pressable
          style={styles.backgroundPressLayer}
          onPress={handleCanvasPress}
        />
      )}

      <PosterStickerLayer
        stickers={apiStickers}
        onStickerPress={handleStickerPress}
        onStickerPositionChange={handleStickerPositionChange}
        editable={mode === 'edit'}
        selectedStickerId={selectedStickerId}
        containerWidth={width}
        containerHeight={height}
      />
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  canvas: {
    borderRadius: Radius.lg,
    overflow: 'hidden',
    backgroundColor: Colors.surfaceAlt,
  },
  textFrameContent: {
    ...StyleSheet.absoluteFill,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Space.md,
  },
  textFrameText: {
    fontFamily: Typography.family.semibold,
    fontSize: Type.title.size,
    textAlign: 'center',
  },
  videoBadge: {
    position: 'absolute',
    top: Space.xs,
    left: Space.xs,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: Radius.sm,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  videoBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontFamily: Typography.family.semibold,
  },
  videoPlayBtn: {
    position: 'absolute',
    bottom: Space.sm,
    right: Space.sm,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  videoLoading: {
    ...StyleSheet.absoluteFill,
    justifyContent: 'center',
    alignItems: 'center',
  },
  videoErrorState: {
    ...StyleSheet.absoluteFill,
    justifyContent: 'center',
    alignItems: 'center',
    gap: Space.xs,
    backgroundColor: Colors.surfaceAlt,
  },
  videoErrorText: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.medium,
    color: Colors.textMuted,
  },
  backgroundPressLayer: {
    ...StyleSheet.absoluteFill,
    zIndex: 1,
  },
});
