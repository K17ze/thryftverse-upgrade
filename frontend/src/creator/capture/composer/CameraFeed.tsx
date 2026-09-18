import React from 'react';
import type { RefObject } from 'react';
import {
  View,
  StyleSheet,
  Pressable,
  GestureResponderEvent,
  type StyleProp,
  type ViewStyle } from 'react-native';
import {
  Camera,
  type CameraRef,
  useCameraDevice,
  usePhotoOutput,
  useVideoOutput } from 'react-native-vision-camera';
import { SkiaCamera, type SkiaCameraRef } from 'react-native-vision-camera-skia';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Reanimated, { type AnimatedStyle } from 'react-native-reanimated';
import type { CameraEffectId } from '../../camera/CameraEffectBar';
import type { SkiaOnFrameCallback } from '../../camera/useCameraEffectProcessor';
import { CameraInitOverlay } from './CameraInitOverlay';

// ── CameraFeed ───────────────────────────────────────────────────────
// The live viewfinder surface: double-tap-to-flip gesture wrapping the
// tap-to-focus pressable, the flip opacity fade, the Camera/SkiaCamera
// swap for real-time effects, and the init overlay while the session
// starts. Extracted from CreatorCamera — markup is verbatim.

export interface CameraFeedProps {
  doubleTapGesture: ReturnType<typeof Gesture.Tap>;
  onTapFocus: (evt: GestureResponderEvent) => void;
  cameraFlipVeilStyle: StyleProp<AnimatedStyle<ViewStyle>>;
  cameraEffect: CameraEffectId;
  cameraRef: RefObject<CameraRef | SkiaCameraRef | null>;
  device: NonNullable<ReturnType<typeof useCameraDevice>>;
  cameraActive: boolean;
  photoOutput: ReturnType<typeof usePhotoOutput>;
  videoOutput: ReturnType<typeof useVideoOutput>;
  flash: 'off' | 'on' | 'auto';
  effectiveZoom: number;
  effectFrameProcessor: SkiaOnFrameCallback;
  cameraReady: boolean;
  showInitLabel: boolean;
  spinnerStyle: StyleProp<AnimatedStyle<ViewStyle>>;
  onCameraStarted: () => void;
  onCameraError: () => void;
}

export function CameraFeed({
  doubleTapGesture,
  onTapFocus,
  cameraFlipVeilStyle,
  cameraEffect,
  cameraRef,
  device,
  cameraActive,
  photoOutput,
  videoOutput,
  flash,
  effectiveZoom,
  effectFrameProcessor,
  cameraReady,
  showInitLabel,
  spinnerStyle,
  onCameraStarted,
  onCameraError,
}: CameraFeedProps) {
  return (
    <GestureDetector gesture={doubleTapGesture}>
      <View style={StyleSheet.absoluteFill}>
        {/* Full-screen camera feed with tap-to-focus visual indicator + 3D flip rotation */}
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onTapFocus}
          accessibilityRole="button"
          accessibilityLabel="Camera viewfinder"
          accessibilityHint="Tap to focus at that point"
        >
          {/* Camera sits in a plain View — never animate a SurfaceView's
              ancestor (opacity/transform forces a composition-mode switch
              that destroys the preview surface mid-session). The flip
              fade is a black veil sibling instead. */}
          <View style={StyleSheet.absoluteFill}>
            {cameraEffect !== 'none' ? (
              <SkiaCamera
                ref={cameraRef as React.RefObject<SkiaCameraRef>}
                style={StyleSheet.absoluteFill}
                device={device}
                isActive={cameraActive}
                outputs={[photoOutput, videoOutput]}
                torchMode={flash === 'on' ? 'on' : 'off'}
                zoom={effectiveZoom}
                orientationSource="interface"
                onFrame={effectFrameProcessor}
                onStarted={onCameraStarted}
                onError={onCameraError}
              />
            ) : (
              <Camera
                ref={cameraRef as React.RefObject<CameraRef>}
                style={StyleSheet.absoluteFill}
                device={device}
                isActive={cameraActive}
                outputs={[photoOutput, videoOutput]}
                torchMode={flash === 'on' ? 'on' : 'off'}
                zoom={effectiveZoom}
                orientationSource="interface"
                onStarted={onCameraStarted}
                onError={onCameraError}
              />
            )}
            {/* Camera initialization loading overlay — shown between
                permission granted and cameraReady=true. A subtle
                spinner on the dark preview communicates "starting"
                instead of a black screen with no feedback. */}
            {!cameraReady && (
              <CameraInitOverlay showInitLabel={showInitLabel} spinnerStyle={spinnerStyle} />
            )}
          </View>
          {/* Camera flip fade — black veil above the viewfinder, animated
              opacity (1 - flipOpacity). Lives outside the camera's View so
              the SurfaceView's composition mode never changes. */}
          <Reanimated.View
            pointerEvents="none"
            style={[StyleSheet.absoluteFill, { backgroundColor: 'black' }, cameraFlipVeilStyle]}
          />
        </Pressable>
      </View>
    </GestureDetector>
  );
}
