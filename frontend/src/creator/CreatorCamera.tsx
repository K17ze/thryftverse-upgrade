import React, { useRef, useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Image,
  ActivityIndicator,
  Animated,
  GestureResponderEvent,
  Linking,
} from 'react-native';
import { CameraView, useCameraPermissions, CameraType } from 'expo-camera';
import * as MediaLibrary from 'expo-media-library';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Typography } from '../theme/designTokens';
import { useToast } from '../context/ToastContext';

// ── CreatorCamera ──────────────────────────────────────────────────
// Purpose-built camera component for the creator, modeled on
// VisualSearchCamera. Full-screen live viewfinder with:
//   - tap-to-focus with animated reticle
//   - corner brackets (mode-specific aspect ratio guide)
//   - center crosshair
//   - large shutter button with press animation
//   - flash toggle, flip camera
//   - gallery thumbnail (most recent photo)
//   - mode pill (Story / Collage)
//   - capture hint text
//   - proper permission states
//
// This is a dedicated component — not inline in a screen.
// The entry screen renders <CreatorCamera /> and receives captures.

const SHUTTER_SIZE = 80;
const SHUTTER_INNER = 64;
const CORNER_SIZE = 40;
const CORNER_STROKE = 3;

export interface CreatorCameraProps {
  /** Creator mode — determines framing guide + labels */
  mode: 'poster' | 'look';
  /** Called when the user captures a photo */
  onCapture: (uri: string) => void;
  /** Called when the user taps the gallery thumbnail */
  onGallery: () => void;
  /** Called when the user taps close */
  onClose: () => void;
}

export default function CreatorCamera({
  mode,
  onCapture,
  onGallery,
  onClose,
}: CreatorCameraProps) {
  const { show } = useToast();
  const insets = useSafeAreaInsets();
  const cameraRef = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [facing, setFacing] = useState<CameraType>('back');
  const [flash, setFlash] = useState<'off' | 'on'>('off');
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const [focusPoint, setFocusPoint] = useState<{ x: number; y: number } | null>(null);
  const focusAnim = useRef(new Animated.Value(0)).current;
  const [lastImageUri, setLastImageUri] = useState<string | null>(null);

  const isPoster = mode === 'poster';

  // ── Permission ──
  useEffect(() => {
    if (!permission?.granted && permission?.canAskAgain) {
      requestPermission().catch(() => {
        show('Camera permission is required', 'error');
      });
    }
  }, [permission, requestPermission, show]);

  // ── Load most recent gallery photo for the thumbnail ──
  useEffect(() => {
    let cancelled = false;
    async function loadRecent() {
      const mediaPermission = await MediaLibrary.requestPermissionsAsync(false);
      if (!mediaPermission.granted || cancelled) return;
      const page = await MediaLibrary.getAssetsAsync({
        mediaType: ['photo', 'video'],
        sortBy: [['creationTime', false]],
        first: 1,
      });
      if (!cancelled && page.assets[0]?.uri) {
        setLastImageUri(page.assets[0].uri);
      }
    }
    void loadRecent();
    return () => { cancelled = true; };
  }, []);

  const toggleFlash = useCallback(() => setFlash((p) => (p === 'off' ? 'on' : 'off')), []);
  const toggleFacing = useCallback(() => setFacing((p) => (p === 'back' ? 'front' : 'back')), []);

  const takePhoto = useCallback(async () => {
    if (!cameraRef.current) return;
    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.92,
        skipProcessing: false,
      });
      if (photo?.uri) {
        onCapture(photo.uri);
      }
    } catch {
      show('Failed to capture photo', 'error');
    }
  }, [onCapture, show]);

  const handleShutterPress = useCallback(() => {
    Animated.sequence([
      Animated.timing(scaleAnim, { toValue: 0.85, duration: 80, useNativeDriver: true }),
      Animated.timing(scaleAnim, { toValue: 1, duration: 120, useNativeDriver: true }),
    ]).start();
    takePhoto();
  }, [scaleAnim, takePhoto]);

  const handleTapFocus = useCallback((evt: GestureResponderEvent) => {
    const { locationX, locationY } = evt.nativeEvent;
    setFocusPoint({ x: locationX, y: locationY });
    focusAnim.setValue(0);
    Animated.sequence([
      Animated.timing(focusAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
      Animated.timing(focusAnim, { toValue: 0, duration: 200, useNativeDriver: true, delay: 400 }),
    ]).start(() => setFocusPoint(null));
  }, [focusAnim]);

  const handleOpenSettings = useCallback(() => Linking.openSettings(), []);

  // ── Permission: loading ──
  if (!permission) {
    return (
      <View style={styles.permissionOverlay}>
        <ActivityIndicator size="large" color="#fff" />
      </View>
    );
  }

  // ── Permission: permanently denied ──
  if (!permission.granted && !permission.canAskAgain) {
    return (
      <View style={styles.permissionOverlay}>
        <View style={styles.permissionContent}>
          <Ionicons name="camera-outline" size={48} color="#fff" />
          <Text style={styles.permissionTitle}>Camera access needed</Text>
          <Text style={styles.permissionText}>
            Enable camera permission in Settings to capture {isPoster ? 'your story' : 'your collage'}.
          </Text>
          <Pressable style={styles.permissionBtn} onPress={handleOpenSettings}>
            <Text style={styles.permissionBtnText}>Open Settings</Text>
          </Pressable>
          <Pressable style={styles.galleryFallbackBtn} onPress={onGallery}>
            <Ionicons name="images-outline" size={20} color="rgba(255,255,255,0.6)" />
            <Text style={styles.galleryFallbackText}>Use gallery instead</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  // ── Permission: undetermined — ask ──
  if (!permission.granted) {
    return (
      <View style={styles.permissionOverlay}>
        <View style={styles.permissionContent}>
          <Ionicons name="camera-outline" size={48} color="#fff" />
          <Text style={styles.permissionTitle}>Access your camera</Text>
          <Text style={styles.permissionText}>
            Capture photos and videos directly for your {isPoster ? 'story' : 'collage'}.
          </Text>
          <Pressable style={styles.permissionBtn} onPress={() => requestPermission()}>
            <Text style={styles.permissionBtnText}>Allow camera</Text>
          </Pressable>
          <Pressable style={styles.galleryFallbackBtn} onPress={onGallery}>
            <Ionicons name="images-outline" size={20} color="rgba(255,255,255,0.6)" />
            <Text style={styles.galleryFallbackText}>Use gallery instead</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  // ── Camera viewfinder ──
  return (
    <View style={StyleSheet.absoluteFill}>
      {/* Full-screen camera feed with tap-to-focus */}
      <Pressable style={StyleSheet.absoluteFill} onPress={handleTapFocus}>
        <CameraView
          ref={cameraRef}
          style={StyleSheet.absoluteFill}
          facing={facing}
          flash={flash}
          mode="picture"
          enableTorch={flash === 'on'}
        />
      </Pressable>

      {/* Focus reticle */}
      {focusPoint && (
        <Animated.View
          style={[
            styles.focusReticle,
            {
              left: focusPoint.x - 30,
              top: focusPoint.y - 30,
              opacity: focusAnim,
              transform: [
                { scale: focusAnim.interpolate({ inputRange: [0, 1], outputRange: [1.4, 1] }) },
              ],
            },
          ]}
        />
      )}

      {/* Corner brackets — framing guide (same as VisualSearchCamera) */}
      <View style={styles.bracketTL} />
      <View style={styles.bracketTR} />
      <View style={styles.bracketBL} />
      <View style={styles.bracketBR} />

      {/* Center crosshair (same as VisualSearchCamera) */}
      <View style={styles.crosshair} pointerEvents="none">
        <View style={styles.crosshairH} />
        <View style={styles.crosshairV} />
      </View>

      {/* Top controls */}
      <View style={[styles.topBar, { paddingTop: Math.max(insets.top, 16) + 8 }]} pointerEvents="box-none">
        <Pressable style={styles.topIconBtn} onPress={onClose} hitSlop={12} accessibilityLabel="Close">
          <Ionicons name="close" size={26} color="#fff" />
        </Pressable>

        {/* Mode pill — Story / Collage */}
        <View style={styles.modePill}>
          <Text style={styles.modeText}>{isPoster ? 'Story' : 'Collage'}</Text>
        </View>

        <View style={styles.topRightControls}>
          <Pressable
            style={styles.topIconBtn}
            onPress={toggleFlash}
            hitSlop={12}
            accessibilityLabel={flash === 'on' ? 'Flash on' : 'Flash off'}
          >
            <Ionicons name={flash === 'on' ? 'flash' : 'flash-off'} size={24} color="#fff" />
          </Pressable>
        </View>
      </View>

      {/* Capture hint */}
      <View style={styles.captureHint} pointerEvents="none">
        <Text style={styles.captureHintText}>
          {isPoster ? 'Tap to capture your story' : 'Tap to capture for your collage'}
        </Text>
      </View>

      {/* Bottom controls — gallery, shutter, flip (same layout as VisualSearchCamera) */}
      <View style={[styles.bottomBar, { paddingBottom: Math.max(insets.bottom, 16) + 16 }]} pointerEvents="box-none">
        {/* Gallery thumbnail */}
        <Pressable
          style={styles.galleryBtn}
          onPress={onGallery}
          hitSlop={16}
          accessibilityLabel="Choose photos from gallery"
        >
          {lastImageUri ? (
            <Image source={{ uri: lastImageUri }} style={styles.galleryThumb} />
          ) : (
            <View style={styles.galleryThumbPlaceholder}>
              <Ionicons name="images-outline" size={24} color="#fff" />
            </View>
          )}
          <Text style={styles.bottomLabel}>Gallery</Text>
        </Pressable>

        {/* Shutter button */}
        <Pressable onPress={handleShutterPress} hitSlop={24} accessibilityLabel="Take photo">
          <Animated.View style={[styles.shutterOuter, { transform: [{ scale: scaleAnim }] }]}>
            <View style={styles.shutterInner} />
          </Animated.View>
        </Pressable>

        {/* Flip camera */}
        <Pressable
          style={styles.facingBtn}
          onPress={toggleFacing}
          hitSlop={16}
          accessibilityLabel="Switch camera"
        >
          <Ionicons name="camera-reverse-outline" size={24} color="#fff" />
          <Text style={styles.bottomLabel}>Flip</Text>
        </Pressable>
      </View>
    </View>
  );
}

// ── Styles — mirrors VisualSearchCamera exactly ────────────────────

const styles = StyleSheet.create({
  // Permission states
  permissionOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  permissionContent: {
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 40,
  },
  permissionTitle: {
    fontFamily: Typography.family.semibold,
    fontSize: 18,
    color: '#fff',
    marginTop: 8,
  },
  permissionText: {
    fontFamily: Typography.family.regular,
    fontSize: 14,
    color: 'rgba(255,255,255,0.7)',
    textAlign: 'center',
    lineHeight: 20,
  },
  permissionBtn: {
    marginTop: 16,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 24,
    backgroundColor: '#fff',
  },
  permissionBtnText: {
    fontFamily: Typography.family.semibold,
    fontSize: 14,
    color: '#000',
  },
  galleryFallbackBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  galleryFallbackText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 14,
  },
  // Focus reticle
  focusReticle: {
    position: 'absolute',
    width: 60,
    height: 60,
    borderWidth: 2,
    borderColor: '#fff',
    borderRadius: 4,
    pointerEvents: 'none',
  },
  // Corner brackets — same positions as VisualSearchCamera
  bracketTL: {
    position: 'absolute',
    top: '18%',
    left: '12%',
    width: CORNER_SIZE,
    height: CORNER_SIZE,
    borderTopWidth: CORNER_STROKE,
    borderLeftWidth: CORNER_STROKE,
    borderColor: 'rgba(255,255,255,0.85)',
    borderTopLeftRadius: 12,
  },
  bracketTR: {
    position: 'absolute',
    top: '18%',
    right: '12%',
    width: CORNER_SIZE,
    height: CORNER_SIZE,
    borderTopWidth: CORNER_STROKE,
    borderRightWidth: CORNER_STROKE,
    borderColor: 'rgba(255,255,255,0.85)',
    borderTopRightRadius: 12,
  },
  bracketBL: {
    position: 'absolute',
    bottom: '28%',
    left: '12%',
    width: CORNER_SIZE,
    height: CORNER_SIZE,
    borderBottomWidth: CORNER_STROKE,
    borderLeftWidth: CORNER_STROKE,
    borderColor: 'rgba(255,255,255,0.85)',
    borderBottomLeftRadius: 12,
  },
  bracketBR: {
    position: 'absolute',
    bottom: '28%',
    right: '12%',
    width: CORNER_SIZE,
    height: CORNER_SIZE,
    borderBottomWidth: CORNER_STROKE,
    borderRightWidth: CORNER_STROKE,
    borderColor: 'rgba(255,255,255,0.85)',
    borderBottomRightRadius: 12,
  },
  // Crosshair — same as VisualSearchCamera
  crosshair: {
    position: 'absolute',
    left: '50%',
    top: '40%',
    width: 24,
    height: 24,
    marginLeft: -12,
    marginTop: -12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  crosshairH: {
    position: 'absolute',
    width: 24,
    height: 2,
    backgroundColor: 'rgba(255,255,255,0.6)',
  },
  crosshairV: {
    position: 'absolute',
    width: 2,
    height: 24,
    backgroundColor: 'rgba(255,255,255,0.6)',
  },
  // Top bar
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingBottom: 8,
  },
  topRightControls: {
    flexDirection: 'row',
    gap: 8,
  },
  topIconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Mode pill
  modePill: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  modeText: {
    fontFamily: Typography.family.medium,
    fontSize: 13,
    color: '#fff',
  },
  // Capture hint
  captureHint: {
    position: 'absolute',
    bottom: 130,
    alignSelf: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  captureHintText: {
    fontSize: 13,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.85)',
  },
  // Bottom bar — same layout as VisualSearchCamera
  bottomBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingHorizontal: 24,
    paddingTop: 16,
  },
  galleryBtn: {
    alignItems: 'center',
    gap: 6,
    width: 64,
  },
  galleryThumb: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
    borderColor: '#fff',
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  galleryThumbPlaceholder: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  facingBtn: {
    alignItems: 'center',
    gap: 6,
    width: 64,
  },
  bottomLabel: {
    fontFamily: Typography.family.medium,
    fontSize: 11,
    color: 'rgba(255,255,255,0.85)',
  },
  // Shutter — same dimensions as VisualSearchCamera
  shutterOuter: {
    width: SHUTTER_SIZE,
    height: SHUTTER_SIZE,
    borderRadius: SHUTTER_SIZE / 2,
    borderWidth: 5,
    borderColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  shutterInner: {
    width: SHUTTER_INNER,
    height: SHUTTER_INNER,
    borderRadius: SHUTTER_INNER / 2,
    backgroundColor: '#fff',
  },
});
