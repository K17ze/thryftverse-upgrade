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
  ScrollView,
} from 'react-native';
import { CameraView, useCameraPermissions, CameraType } from 'expo-camera';
import * as MediaLibrary from 'expo-media-library/legacy';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Typography } from '../theme/designTokens';
import { useToast } from '../context/ToastContext';
import { useHaptic } from '../hooks/useHaptic';
import { useReducedMotion } from '../hooks/useReducedMotion';

// ── CreatorCamera — Flagship 2026 Elevation ────────────────────────
// Snapchat 2026 / TikTok / BeReal-grade camera component with:
//   - tap-to-focus with animated reticle
//   - corner brackets (mode-specific aspect ratio guide, refined 2pt)
//   - center crosshair
//   - large shutter button with press animation
//   - vertical controls rail: flip, flash, zoom, timer, grid (TikTok pattern)
//   - gallery thumbnail (64x64, recent photos carousel)
//   - quick-review overlay (post-capture preview with retake/edit/save)
//   - grid overlay (rule-of-thirds toggle)
//   - self-timer with countdown overlay
//   - refined gradient overlays (0.25 top, 0.35 bottom)
//   - proper permission states with art-directed empty states
//
// This is a dedicated component — not inline in a screen.
// The entry screen renders <CreatorCamera /> and receives captures.

const SHUTTER_SIZE = 80;
const SHUTTER_INNER = 64;
const CORNER_SIZE = 40;
const CORNER_STROKE = 2;
const GALLERY_THUMB_SIZE = 64;
const CONTROL_RAIL_ICON = 22;
const ZOOM_LEVELS = [0.5, 1, 2];
const TIMER_OPTIONS = [0, 3, 10] as const;

type FlashMode = 'off' | 'on' | 'auto';
type ZoomLevel = 0 | 1 | 2;
type TimerOption = 0 | 3 | 10;

export interface CreatorCameraProps {
  /** Camera mode — determines framing guide + labels */
  mode: 'poster' | 'look' | 'visual-search';
  /** Called when the user captures a photo and confirms it via quick-review */
  onCapture: (uri: string) => void;
  /** Called when the user taps the gallery thumbnail */
  onGallery: () => void;
  /** Called when the user taps close */
  onClose: () => void;
  /** Optional render prop for the bottom overlay (e.g. mode switcher) */
  renderBottomOverlay?: () => React.ReactNode;
  /** Optional control rendered beside the canonical flash control. */
  renderTopRightAccessory?: () => React.ReactNode;
}

export default function CreatorCamera({
  mode,
  onCapture,
  onGallery,
  onClose,
  renderBottomOverlay,
  renderTopRightAccessory,
}: CreatorCameraProps) {
  const { show } = useToast();
  const haptic = useHaptic();
  const reducedMotion = useReducedMotion();
  const insets = useSafeAreaInsets();
  const cameraRef = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [facing, setFacing] = useState<CameraType>('back');
  const [flash, setFlash] = useState<FlashMode>('off');
  const [zoomIndex, setZoomIndex] = useState<ZoomLevel>(1);
  const [timerOption, setTimerOption] = useState<TimerOption>(0);
  const [showGrid, setShowGrid] = useState(false);
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const [focusPoint, setFocusPoint] = useState<{ x: number; y: number } | null>(null);
  const focusAnim = useRef(new Animated.Value(0)).current;
  const [lastImageUri, setLastImageUri] = useState<string | null>(null);
  const [recentImages, setRecentImages] = useState<string[]>([]);
  const [showRecentCarousel, setShowRecentCarousel] = useState(false);
  const [capturedUri, setCapturedUri] = useState<string | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);
  const reviewOpacity = useRef(new Animated.Value(0)).current;
  const countdownAnim = useRef(new Animated.Value(0)).current;

  const isPoster = mode === 'poster';
  const isVisualSearch = mode === 'visual-search';
  const modeLabel = isVisualSearch ? 'Search' : isPoster ? 'Story' : 'Collage';
  const zoom = ZOOM_LEVELS[zoomIndex];

  // ── Permission ──
  useEffect(() => {
    if (!permission?.granted && permission?.canAskAgain) {
      requestPermission().catch(() => {
        show('Camera permission is required', 'error');
      });
    }
  }, [permission, requestPermission, show]);

  // ── Load recent gallery photos for thumbnail + carousel ──
  useEffect(() => {
    let cancelled = false;
    async function loadRecent() {
      try {
        const mediaPermission = await MediaLibrary.requestPermissionsAsync(false);
        if (!mediaPermission.granted || cancelled) return;
        const page = await MediaLibrary.getAssetsAsync({
          mediaType: ['photo', 'video'],
          sortBy: [['creationTime', false]],
          first: 10,
        });
        if (!cancelled && page.assets.length > 0) {
          const uris = page.assets.map((a) => a.uri).filter(Boolean);
          setRecentImages(uris);
          setLastImageUri(uris[0]);
        }
      } catch {
        // The thumbnail is optional; camera capture remains usable if the
        // platform library is unavailable or its permission changes.
      }
    }
    void loadRecent();
    return () => { cancelled = true; };
  }, []);

  // ── Camera controls ──
  const cycleFlash = useCallback(() => {
    haptic.selection();
    setFlash((p) => p === 'off' ? 'on' : p === 'on' ? 'auto' : 'off');
  }, [haptic]);

  const toggleFacing = useCallback(() => {
    haptic.light();
    setFacing((p) => (p === 'back' ? 'front' : 'back'));
  }, [haptic]);

  const cycleZoom = useCallback(() => {
    haptic.selection();
    setZoomIndex((p) => ((p + 1) % 3) as ZoomLevel);
  }, [haptic]);

  const cycleTimer = useCallback(() => {
    haptic.selection();
    setTimerOption((p) => {
      const idx = TIMER_OPTIONS.indexOf(p);
      return TIMER_OPTIONS[(idx + 1) % TIMER_OPTIONS.length] as TimerOption;
    });
  }, [haptic]);

  const toggleGrid = useCallback(() => {
    haptic.selection();
    setShowGrid((p) => !p);
  }, [haptic]);

  // ── Capture with optional timer ──
  const takePhoto = useCallback(async () => {
    if (!cameraRef.current || countdown !== null) return;

    if (timerOption > 0) {
      haptic.light();
      setCountdown(timerOption);
      for (let i = timerOption; i > 0; i--) {
        setCountdown(i);
        if (!reducedMotion) {
          countdownAnim.setValue(0);
          Animated.timing(countdownAnim, {
            toValue: 1,
            duration: 800,
            useNativeDriver: true,
          }).start();
        }
        await new Promise((r) => setTimeout(r, 1000));
      }
      setCountdown(null);
    }

    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.92,
        skipProcessing: false,
      });
      if (photo?.uri) {
        haptic.medium();
        setCapturedUri(photo.uri);
      }
    } catch {
      show('Failed to capture photo', 'error');
    }
  }, [cameraRef, countdown, haptic, reducedMotion, show, timerOption, countdownAnim]);

  const handleShutterPress = useCallback(() => {
    Animated.sequence([
      Animated.timing(scaleAnim, { toValue: 0.85, duration: 80, useNativeDriver: true }),
      Animated.timing(scaleAnim, { toValue: 1, duration: 120, useNativeDriver: true }),
    ]).start();
    takePhoto();
  }, [scaleAnim, takePhoto]);

  // ── Quick-review flow ──
  useEffect(() => {
    if (capturedUri) {
      if (reducedMotion) {
        reviewOpacity.setValue(1);
      } else {
        reviewOpacity.setValue(0);
        Animated.timing(reviewOpacity, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }).start();
      }
    }
  }, [capturedUri, reducedMotion, reviewOpacity]);

  const handleRetake = useCallback(() => {
    haptic.selection();
    if (!reducedMotion) {
      Animated.timing(reviewOpacity, {
        toValue: 0,
        duration: 160,
        useNativeDriver: true,
      }).start(() => setCapturedUri(null));
    } else {
      setCapturedUri(null);
    }
  }, [haptic, reducedMotion, reviewOpacity]);

  const handleConfirmCapture = useCallback(() => {
    if (!capturedUri) return;
    haptic.light();
    onCapture(capturedUri);
  }, [capturedUri, haptic, onCapture]);

  const handleSaveToGallery = useCallback(async () => {
    if (!capturedUri) return;
    try {
      await MediaLibrary.saveToLibraryAsync(capturedUri);
      haptic.light();
      show('Saved to gallery', 'success');
    } catch {
      show('Failed to save to gallery', 'error');
    }
  }, [capturedUri, haptic, show]);

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

  const handleGalleryLongPress = useCallback(() => {
    if (recentImages.length > 1) {
      haptic.selection();
      setShowRecentCarousel((p) => !p);
    }
  }, [haptic, recentImages.length]);

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
          <View style={styles.permissionIconWrap}>
            <Ionicons name="camera-outline" size={48} color="#fff" />
          </View>
          <Text style={styles.permissionTitle}>Camera access needed</Text>
          <Text style={styles.permissionText}>
            Enable camera permission in Settings to capture {isPoster ? 'your story' : 'your look'}.
          </Text>
          <Pressable
            style={({ pressed }) => [styles.permissionBtn, pressed && styles.btnPressed]}
            onPress={handleOpenSettings}
          >
            <Text style={styles.permissionBtnText}>Open Settings</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.galleryFallbackBtn, pressed && styles.btnPressed]}
            onPress={onGallery}
          >
            <Ionicons name="images-outline" size={20} color="rgba(255,255,255,0.7)" />
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
          <View style={styles.permissionIconWrap}>
            <Ionicons name="camera-outline" size={48} color="#fff" />
          </View>
          <Text style={styles.permissionTitle}>Access your camera</Text>
          <Text style={styles.permissionText}>
            Capture photos and videos directly for your {isPoster ? 'story' : 'look'}.
          </Text>
          <Pressable
            style={({ pressed }) => [styles.permissionBtn, pressed && styles.btnPressed]}
            onPress={() => requestPermission()}
          >
            <Text style={styles.permissionBtnText}>Allow camera</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.galleryFallbackBtn, pressed && styles.btnPressed]}
            onPress={onGallery}
          >
            <Ionicons name="images-outline" size={20} color="rgba(255,255,255,0.7)" />
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
          zoom={zoom}
        />
      </Pressable>

      {/* Refined gradient overlays — 0.25 top, 0.35 bottom (less heavy, more premium) */}
      <LinearGradient
        colors={['rgba(0,0,0,0.25)', 'rgba(0,0,0,0)']}
        style={styles.topGradient}
        pointerEvents="none"
      />
      <LinearGradient
        colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.35)']}
        style={styles.bottomGradient}
        pointerEvents="none"
      />

      {/* Grid overlay (rule-of-thirds) */}
      {showGrid && (
        <View style={styles.gridOverlay} pointerEvents="none">
          <View style={styles.gridLineV1} />
          <View style={styles.gridLineV2} />
          <View style={styles.gridLineH1} />
          <View style={styles.gridLineH2} />
        </View>
      )}

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

      {/* Countdown overlay */}
      {countdown !== null && (
        <View style={styles.countdownOverlay} pointerEvents="none">
          <Animated.Text
            style={[
              styles.countdownText,
              {
                opacity: countdownAnim.interpolate({
                  inputRange: [0, 0.5, 1],
                  outputRange: [1, 1, 0],
                }),
                transform: [
                  {
                    scale: countdownAnim.interpolate({
                      inputRange: [0, 0.5, 1],
                      outputRange: [1, 1.3, 1.6],
                    }),
                  },
                ],
              },
            ]}
          >
            {countdown}
          </Animated.Text>
        </View>
      )}

      {/* Corner brackets — refined 2pt stroke */}
      <View style={styles.bracketTL} />
      <View style={styles.bracketTR} />
      <View style={[styles.bracketBL, renderBottomOverlay && styles.bracketBottomWithDeck]} />
      <View style={[styles.bracketBR, renderBottomOverlay && styles.bracketBottomWithDeck]} />

      {/* Center crosshair */}
      <View style={styles.crosshair} pointerEvents="none">
        <View style={styles.crosshairH} />
        <View style={styles.crosshairV} />
      </View>

      {/* Top controls — close (left), accessories + flash (right) */}
      <View style={[styles.topBar, { paddingTop: Math.max(insets.top, 16) + 8 }]} pointerEvents="box-none">
        <Pressable
          style={({ pressed }) => [styles.topIconBtn, pressed && styles.btnPressed]}
          onPress={onClose}
          hitSlop={12}
          accessibilityLabel="Close camera"
          accessibilityRole="button"
        >
          <Ionicons name="close" size={26} color="#fff" />
        </Pressable>

        <View style={styles.topRightControls}>
          {renderTopRightAccessory?.()}
          <Pressable
            style={({ pressed }) => [styles.topIconBtn, pressed && styles.btnPressed]}
            onPress={cycleFlash}
            hitSlop={12}
            accessibilityLabel={`Flash ${flash}`}
            accessibilityRole="button"
          >
            <Ionicons
              name={flash === 'off' ? 'flash-off' : flash === 'auto' ? 'flash-outline' : 'flash'}
              size={22}
              color={flash === 'off' ? '#fff' : '#FFD60A'}
            />
          </Pressable>
        </View>
      </View>

      {/* Vertical controls rail — right side (TikTok pattern) */}
      <View
        style={[styles.controlsRail, { top: Math.max(insets.top, 16) + 60 }]}
        pointerEvents="box-none"
      >
        {/* Flip */}
        <Pressable
          style={({ pressed }) => [styles.railBtn, pressed && styles.btnPressed]}
          onPress={toggleFacing}
          hitSlop={8}
          accessibilityLabel="Flip camera"
          accessibilityRole="button"
        >
          <Ionicons name="camera-reverse-outline" size={CONTROL_RAIL_ICON} color="#fff" />
          <Text style={styles.railLabel}>Flip</Text>
        </Pressable>

        {/* Zoom */}
        <Pressable
          style={({ pressed }) => [styles.railBtn, pressed && styles.btnPressed]}
          onPress={cycleZoom}
          hitSlop={8}
          accessibilityLabel={`Zoom ${zoom}x`}
          accessibilityRole="button"
        >
          <Text style={styles.zoomLabel}>{zoom === 0.5 ? '½' : zoom}×</Text>
          <Text style={styles.railLabel}>Zoom</Text>
        </Pressable>

        {/* Timer */}
        <Pressable
          style={({ pressed }) => [styles.railBtn, pressed && styles.btnPressed]}
          onPress={cycleTimer}
          hitSlop={8}
          accessibilityLabel={timerOption === 0 ? 'Timer off' : `Timer ${timerOption} seconds`}
          accessibilityRole="button"
        >
          <Ionicons
            name={timerOption === 0 ? 'timer-outline' : 'timer'}
            size={CONTROL_RAIL_ICON}
            color={timerOption > 0 ? '#FFD60A' : '#fff'}
          />
          <Text style={styles.railLabel}>{timerOption === 0 ? 'Timer' : `${timerOption}s`}</Text>
        </Pressable>

        {/* Grid */}
        <Pressable
          style={({ pressed }) => [styles.railBtn, pressed && styles.btnPressed]}
          onPress={toggleGrid}
          hitSlop={8}
          accessibilityLabel={showGrid ? 'Grid on' : 'Grid off'}
          accessibilityRole="button"
        >
          <Ionicons
            name="grid-outline"
            size={CONTROL_RAIL_ICON}
            color={showGrid ? '#FFD60A' : '#fff'}
          />
          <Text style={styles.railLabel}>Grid</Text>
        </Pressable>
      </View>

      {/* Recent photos carousel (long-press gallery) */}
      {showRecentCarousel && recentImages.length > 1 && (
        <View style={[styles.recentCarousel, { bottom: Math.max(insets.bottom, 16) + 140 }]} pointerEvents="box-none">
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.recentCarouselContent}
          >
            {recentImages.map((uri, i) => (
              <Pressable
                key={`${uri}-${i}`}
                style={({ pressed }) => [styles.recentThumbWrap, pressed && styles.btnPressed]}
                onPress={() => {
                  setShowRecentCarousel(false);
                  onGallery();
                }}
              >
                <Image source={{ uri }} style={styles.recentThumb} />
              </Pressable>
            ))}
          </ScrollView>
        </View>
      )}

      {/* Bottom controls — gallery, shutter, flip */}
      <View style={[styles.bottomBar, { paddingBottom: Math.max(insets.bottom, 16) + 16 }]} pointerEvents="box-none">
        {/* Gallery thumbnail — 64x64 with long-press for recent carousel */}
        <Pressable
          style={styles.galleryBtn}
          onPress={onGallery}
          onLongPress={handleGalleryLongPress}
          hitSlop={16}
          accessibilityLabel="Choose photos from gallery"
          accessibilityRole="button"
        >
          {lastImageUri ? (
            <Image source={{ uri: lastImageUri }} style={styles.galleryThumb} />
          ) : (
            <View style={styles.galleryThumbPlaceholder}>
              <Ionicons name="images-outline" size={24} color="rgba(255,255,255,0.6)" />
            </View>
          )}
          <Text style={styles.bottomLabel}>Gallery</Text>
        </Pressable>

        {/* Shutter */}
        <Pressable
          onPress={handleShutterPress}
          hitSlop={24}
          accessibilityLabel="Take photo"
          accessibilityRole="button"
          disabled={countdown !== null}
        >
          <Animated.View style={[styles.shutterOuter, { transform: [{ scale: scaleAnim }] }]}>
            <View style={styles.shutterInner} />
          </Animated.View>
        </Pressable>

        {/* Flip (also in rail, but kept here for thumb reach) */}
        <Pressable
          style={styles.facingBtn}
          onPress={toggleFacing}
          hitSlop={16}
          accessibilityLabel="Switch camera"
          accessibilityRole="button"
        >
          <Ionicons name="camera-reverse-outline" size={24} color="#fff" />
          <Text style={styles.bottomLabel}>Flip</Text>
        </Pressable>
      </View>

      {/* Mode indicator (only when no bottom overlay) */}
      {!renderBottomOverlay && (
        <View style={styles.modePill} pointerEvents="none">
          <Text style={styles.modeText}>{modeLabel}</Text>
        </View>
      )}

      {/* Optional bottom overlay (e.g. mode switcher) */}
      {renderBottomOverlay?.()}

      {/* ── Quick-review overlay ── */}
      {capturedUri && (
        <Animated.View
          style={[
            styles.reviewOverlay,
            { opacity: reviewOpacity },
          ]}
        >
          <Image source={{ uri: capturedUri }} style={styles.reviewImage} />

          {/* Review actions */}
          <View style={[styles.reviewActions, { paddingBottom: Math.max(insets.bottom, 16) + 24 }]}>
            {/* Retake */}
            <Pressable
              style={({ pressed }) => [styles.reviewBtn, pressed && styles.btnPressed]}
              onPress={handleRetake}
              accessibilityLabel="Retake photo"
              accessibilityRole="button"
            >
              <Ionicons name="refresh-outline" size={26} color="#fff" />
              <Text style={styles.reviewBtnLabel}>Retake</Text>
            </Pressable>

            {/* Use — primary action */}
            <Pressable
              style={({ pressed }) => [styles.reviewPrimaryBtn, pressed && styles.btnPressed]}
              onPress={handleConfirmCapture}
              accessibilityLabel={isVisualSearch ? 'Search with this photo' : 'Edit in studio'}
              accessibilityRole="button"
            >
              <Ionicons name="arrow-forward" size={28} color="#000" />
              <Text style={styles.reviewPrimaryLabel}>
                {isVisualSearch ? 'Search' : 'Edit'}
              </Text>
            </Pressable>

            {/* Save to gallery */}
            <Pressable
              style={({ pressed }) => [styles.reviewBtn, pressed && styles.btnPressed]}
              onPress={handleSaveToGallery}
              accessibilityLabel="Save to gallery"
              accessibilityRole="button"
            >
              <Ionicons name="download-outline" size={26} color="#fff" />
              <Text style={styles.reviewBtnLabel}>Save</Text>
            </Pressable>
          </View>
        </Animated.View>
      )}
    </View>
  );
}

// ── Styles — Flagship 2026 ────────────────────────────────────────

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
  permissionIconWrap: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  permissionTitle: {
    fontFamily: Typography.family.semibold,
    fontSize: 18,
    color: '#fff',
    marginTop: 4,
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
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 28,
    backgroundColor: '#fff',
  },
  permissionBtnText: {
    fontFamily: Typography.family.semibold,
    fontSize: 15,
    color: '#000',
  },
  galleryFallbackBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 12,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  galleryFallbackText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 14,
    fontFamily: Typography.family.medium,
  },
  btnPressed: {
    opacity: 0.7,
    transform: [{ scale: 0.97 }],
  },
  // Gradient overlays
  topGradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 140,
  },
  bottomGradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 200,
  },
  // Grid overlay (rule-of-thirds)
  gridOverlay: {
    ...StyleSheet.absoluteFill,
  },
  gridLineV1: {
    position: 'absolute',
    left: '33.33%',
    top: 0,
    bottom: 0,
    width: 1,
    backgroundColor: 'rgba(255,255,255,0.3)',
  },
  gridLineV2: {
    position: 'absolute',
    left: '66.66%',
    top: 0,
    bottom: 0,
    width: 1,
    backgroundColor: 'rgba(255,255,255,0.3)',
  },
  gridLineH1: {
    position: 'absolute',
    top: '33.33%',
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.3)',
  },
  gridLineH2: {
    position: 'absolute',
    top: '66.66%',
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.3)',
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
  // Countdown overlay
  countdownOverlay: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countdownText: {
    fontFamily: Typography.family.bold,
    fontSize: 96,
    color: '#fff',
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
  },
  // Corner brackets — refined 2pt stroke
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
  bracketBottomWithDeck: {
    bottom: '35%',
  },
  // Crosshair
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
    backgroundColor: 'rgba(255,255,255,0.5)',
  },
  crosshairV: {
    position: 'absolute',
    width: 2,
    height: 24,
    backgroundColor: 'rgba(255,255,255,0.5)',
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
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Vertical controls rail (TikTok pattern)
  controlsRail: {
    position: 'absolute',
    right: 12,
    gap: 4,
    alignItems: 'center',
  },
  railBtn: {
    width: 48,
    height: 56,
    borderRadius: 24,
    backgroundColor: 'rgba(0,0,0,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  railLabel: {
    fontFamily: Typography.family.medium,
    fontSize: 10,
    color: 'rgba(255,255,255,0.85)',
  },
  zoomLabel: {
    fontFamily: Typography.family.bold,
    fontSize: 14,
    color: '#fff',
  },
  // Recent photos carousel
  recentCarousel: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  recentCarouselContent: {
    paddingHorizontal: 16,
    gap: 8,
  },
  recentThumbWrap: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  recentThumb: {
    width: 56,
    height: 56,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  // Mode pill
  modePill: {
    position: 'absolute',
    bottom: 120,
    alignSelf: 'center',
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  modeText: {
    fontFamily: Typography.family.medium,
    fontSize: 13,
    color: '#fff',
  },
  // Bottom bar
  bottomBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingHorizontal: 24,
    paddingTop: 10,
    minHeight: 120,
  },
  galleryBtn: {
    alignItems: 'center',
    gap: 6,
    width: 72,
    minHeight: 72,
    justifyContent: 'center',
  },
  galleryThumb: {
    width: GALLERY_THUMB_SIZE,
    height: GALLERY_THUMB_SIZE,
    borderRadius: GALLERY_THUMB_SIZE / 2,
    borderWidth: 2.5,
    borderColor: '#fff',
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  galleryThumbPlaceholder: {
    width: GALLERY_THUMB_SIZE,
    height: GALLERY_THUMB_SIZE,
    borderRadius: GALLERY_THUMB_SIZE / 2,
    borderWidth: 2.5,
    borderColor: 'rgba(255,255,255,0.3)',
    backgroundColor: 'rgba(0,0,0,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  facingBtn: {
    alignItems: 'center',
    gap: 6,
    width: 72,
    minHeight: 64,
    justifyContent: 'center',
  },
  bottomLabel: {
    fontFamily: Typography.family.medium,
    fontSize: 11,
    color: 'rgba(255,255,255,0.85)',
  },
  // Shutter
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
  // Quick-review overlay
  reviewOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: '#000',
    zIndex: 100,
  },
  reviewImage: {
    ...StyleSheet.absoluteFill,
    resizeMode: 'contain',
  },
  reviewActions: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingHorizontal: 32,
    paddingTop: 16,
  },
  reviewBtn: {
    alignItems: 'center',
    gap: 6,
  },
  reviewBtnLabel: {
    fontFamily: Typography.family.medium,
    fontSize: 12,
    color: 'rgba(255,255,255,0.85)',
  },
  reviewPrimaryBtn: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  reviewPrimaryLabel: {
    fontFamily: Typography.family.bold,
    fontSize: 12,
    color: '#000',
  },
});
