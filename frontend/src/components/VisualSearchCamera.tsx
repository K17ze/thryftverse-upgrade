import React from 'react';
import {
  View,
  StyleSheet,
  Pressable,
  Animated,
  Text,
  Image,
  ActivityIndicator,
  GestureResponderEvent } from 'react-native';
import { Camera, type CameraRef, useCameraDevice, useCameraPermission, usePhotoOutput } from 'react-native-vision-camera';
import * as MediaLibrary from 'expo-media-library/legacy';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppTheme, type ThemeColors } from '../theme/ThemeContext';
import { Typography, Radius, Space, Stroke} from '../theme/designTokens';
import { TypographyV2 } from '../theme/typography.v2';
import { useToast } from '../context/ToastContext';
import { useHaptic } from '../hooks/useHaptic';
import { Motion } from '../theme/motionTokens';
import { Linking } from 'react-native';

const SHUTTER_SIZE = 80;
const SHUTTER_INNER = 64;

interface VisualSearchCameraProps {
  onPhotoCapture: (uri: string) => void;
  onGallery: () => void;
  onClose: () => void;
  onSavedSearches?: () => void;
}

export default function VisualSearchCamera({
  onPhotoCapture,
  onGallery,
  onClose,
  onSavedSearches }: VisualSearchCameraProps) {
  const { show } = useToast();
  const insets = useSafeAreaInsets();
  const { colors } = useAppTheme();
  const haptic = useHaptic();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const [facing, setFacing] = React.useState<'back' | 'front'>('back');
  const device = useCameraDevice(facing);
  const cameraRef = React.useRef<CameraRef>(null);
  const photoOutput = usePhotoOutput({ qualityPrioritization: 'balanced' });
  const { hasPermission, requestPermission } = useCameraPermission();
  const [flash, setFlash] = React.useState<'off' | 'on'>('off');
  const [isCapturing, setIsCapturing] = React.useState(false);
  const [permissionStatus, setPermissionStatus] = React.useState<'loading' | 'denied' | 'granted'>('loading');
  const scaleAnim = React.useRef(new Animated.Value(1)).current;
  const [focusPoint, setFocusPoint] = React.useState<{ x: number; y: number } | null>(null);
  const focusAnim = React.useRef(new Animated.Value(0)).current;
  const [lastImageUri, setLastImageUri] = React.useState<string | null>(null);
  // Deactivate the camera on unmount to release the native CameraSession
  // promptly. Without this, the native session can linger until GC, causing
  // "A resource failed to call release" warnings and blocking other camera
  // consumers (e.g. CreatorCamera) from acquiring the device.
  const [cameraActive, setCameraActive] = React.useState(true);
  React.useEffect(() => {
    return () => setCameraActive(false);
  }, []);

  React.useEffect(() => {
    if (hasPermission) {
      setPermissionStatus('granted');
      return;
    }
    let cancelled = false;
    requestPermission()
      .then(() => {
        if (!cancelled) setPermissionStatus('granted');
      })
      .catch(() => {
        if (!cancelled) {
          setPermissionStatus('denied');
          show('Camera permission is required for visual search', 'error');
        }
      });
    return () => { cancelled = true; };
  }, [hasPermission, requestPermission, show]);

  // Load the most recent gallery thumbnail for the bottom-left shortcut (Google Lens pattern).
  React.useEffect(() => {
    let cancelled = false;
    async function loadRecent() {
      try {
        // Never ambush the user with a broad photo-library permission
        // merely to decorate the gallery shortcut. If access already
        // exists, show a recent thumbnail; otherwise the glyph remains
        // truthful and the system picker asks only when the user chooses
        // Gallery. (Consistent with CreatorCamera's non-ambush pattern.)
        const mediaPermission = await MediaLibrary.getPermissionsAsync(false);
        if (!mediaPermission.granted || cancelled) return;
        const page = await MediaLibrary.getAssetsAsync({
          mediaType: 'photo',
          sortBy: [['creationTime', false]],
          first: 1 });
        if (!cancelled && page.assets[0]?.uri) {
          setLastImageUri(page.assets[0].uri);
        }
      } catch {
        // The thumbnail is optional; visual search remains usable if the
        // platform library is unavailable or its permission changes.
      }
    }
    void loadRecent();
    return () => { cancelled = true; };
  }, []);

  const toggleFlash = () => {
    haptic.selection();
    setFlash((prev) => (prev === 'off' ? 'on' : 'off'));
  };
  const toggleFacing = () => {
    haptic.light();
    setFacing((prev) => (prev === 'back' ? 'front' : 'back'));
  };

  const takePhoto = async () => {
    if (!device || isCapturing) return;
    setIsCapturing(true);
    try {
      const photo = await photoOutput.capturePhoto({ flashMode: flash }, {});
      const filePath = await photo.saveToTemporaryFileAsync();
      photo.dispose();
      haptic.medium();
      onPhotoCapture(`file://${filePath}`);
    } catch {
      show('Failed to capture photo', 'error');
    } finally {
      setIsCapturing(false);
    }
  };

  const handleShutterPress = () => {
    Animated.sequence([
      Animated.timing(scaleAnim, { toValue: 0.88, duration: Motion.duration.touch, useNativeDriver: false }),
      Animated.timing(scaleAnim, { toValue: 1, duration: Motion.duration.fast, useNativeDriver: false }),
    ]).start();
    takePhoto();
  };

  const handleTapFocus = (evt: GestureResponderEvent) => {
    const { locationX, locationY } = evt.nativeEvent;
    setFocusPoint({ x: locationX, y: locationY });
    focusAnim.setValue(0);
    Animated.sequence([
      Animated.timing(focusAnim, { toValue: 1, duration: Motion.duration.normal, useNativeDriver: false }),
      Animated.timing(focusAnim, { toValue: 0, duration: Motion.duration.normal, useNativeDriver: false, delay: 400 }),
    ]).start(() => setFocusPoint(null));
    // Perform real AE/AF/AWB focus metering if the device supports it,
    // matching the CreatorCamera pattern. The Camera view converts view
    // coordinates to camera coordinates internally.
    const cam = cameraRef.current;
    if (cam && device?.supportsFocusMetering) {
      void cam.focusTo(
        { x: locationX, y: locationY },
        { responsiveness: 'snappy', adaptiveness: 'continuous', autoResetAfter: 5 },
      ).catch(() => {
        // Focus request failed — the reticle still showed as a tap
        // indicator; we don't surface an error toast for a focus failure.
      });
    }
  };

  const handleOpenSettings = () => Linking.openSettings();

  if (permissionStatus === 'loading') {
    return (
      <View style={styles.permissionOverlay}>
        <ActivityIndicator size="large" color={colors.scrimTextPrimary} />
      </View>
    );
  }

  if (permissionStatus === 'denied') {
    return (
      <View style={styles.permissionOverlay}>
        <View style={styles.permissionContent}>
          <Ionicons name="camera-outline" size={48} color={colors.scrimTextPrimary} />
          <Text style={styles.permissionTitle} accessibilityRole="header">Camera access needed</Text>
          <Text style={styles.permissionText}>
            Enable camera permission in Settings to search with a photo.
          </Text>
          <Pressable
            style={styles.permissionBtn}
            onPress={handleOpenSettings}
            accessibilityRole="button"
            accessibilityLabel="Open device settings"
            accessibilityHint="Opens settings so you can allow camera access"
          >
            <Text style={styles.permissionBtnText}>Open Settings</Text>
          </Pressable>
          <Pressable
            style={styles.permissionSecondaryBtn}
            onPress={onGallery}
            accessibilityRole="button"
            accessibilityLabel="Use gallery instead"
            accessibilityHint="Choose a photo from your gallery to search with"
          >
            <Text style={styles.permissionSecondaryBtnText}>Use Gallery</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  if (!device) {
    return (
      <View style={styles.permissionOverlay}>
        <View style={styles.permissionContent}>
          <Ionicons name="camera-outline" size={48} color={colors.scrimTextPrimary} />
          <Text style={styles.permissionTitle} accessibilityRole="header">No camera available</Text>
          <Text style={styles.permissionText}>
            A camera could not be found on this device.
          </Text>
          <Pressable
            style={styles.permissionBtn}
            onPress={onGallery}
            accessibilityRole="button"
            accessibilityLabel="Choose from gallery"
            accessibilityHint="Choose a photo from your gallery to search with"
          >
            <Text style={styles.permissionBtnText}>Choose from Gallery</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={StyleSheet.absoluteFill}>
      {/* Full-screen camera feed with tap-to-focus */}
      <Pressable style={StyleSheet.absoluteFill} onPress={handleTapFocus} accessibilityRole="button" accessibilityLabel="Tap Focus">
        <Camera
          ref={cameraRef}
          style={StyleSheet.absoluteFill}
          device={device}
          outputs={[photoOutput]}
          isActive={cameraActive}
          torchMode={flash === 'on' ? 'on' : 'off'}
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
              ] },
          ]}
        />
      )}

      {/* Top controls */}
      <View style={[styles.topBar, { paddingTop: Math.max(insets.top, 16) + 8 }]} pointerEvents="box-none">
        <Pressable
          style={styles.topIconBtn}
          onPress={onClose}
          hitSlop={12}
          accessibilityLabel="Close visual search"
          accessibilityHint="Closes the camera and returns to the previous screen"
          accessibilityRole="button"
        >
          <Ionicons name="close" size={26} color={colors.scrimTextPrimary} style={styles.topIcon} />
        </Pressable>

        <View style={styles.topRightControls}>
          <Pressable
            style={styles.topIconBtn}
            onPress={onSavedSearches}
            hitSlop={12}
            accessibilityLabel="Saved visual searches"
            accessibilityHint="View your saved visual searches"
            accessibilityRole="button"
          >
            <Ionicons name="time-outline" size={24} color={colors.scrimTextPrimary} style={styles.topIcon} />
          </Pressable>
          <Pressable
            style={styles.topIconBtn}
            onPress={toggleFlash}
            hitSlop={12}
            accessibilityLabel={flash === 'on' ? 'Flash on' : 'Flash off'}
            accessibilityHint="Toggles the camera flash on or off"
            accessibilityRole="switch"
            accessibilityState={{ checked: flash === 'on' }}
          >
            <Ionicons name={flash === 'on' ? 'flash' : 'flash-off'} size={24} color={colors.scrimTextPrimary} style={styles.topIcon} />
          </Pressable>
        </View>
      </View>

      {/* Bottom controls */}
      <View style={[styles.bottomBar, { paddingBottom: Math.max(insets.bottom, 16) + 16 }]} pointerEvents="box-none">
        <Pressable
          style={styles.galleryBtn}
          onPress={onGallery}
          hitSlop={16}
          accessibilityLabel="Choose a photo from gallery"
        accessibilityRole="image"
        >
          {lastImageUri ? (
            <Image source={{ uri: lastImageUri }} style={styles.galleryThumb} />
          ) : (
            <Ionicons name="images-outline" size={24} color={colors.scrimTextPrimary} />
          )}
          <Text style={styles.bottomLabel}>Gallery</Text>
        </Pressable>

        <Pressable
          onPress={handleShutterPress}
          hitSlop={24}
          disabled={isCapturing}
          accessibilityLabel="Take photo"
          accessibilityHint="Captures a photo to search with"
          accessibilityRole="button"
          accessibilityState={{ busy: isCapturing }}
        >
          <Animated.View style={[styles.shutterOuter, { transform: [{ scale: scaleAnim }] }, isCapturing && styles.shutterBusy]}>
            <View style={styles.shutterInner} />
          </Animated.View>
        </Pressable>

        <Pressable
          style={styles.facingBtn}
          onPress={toggleFacing}
          hitSlop={16}
          accessibilityLabel="Switch camera"
          accessibilityRole="button"
        >
          <Ionicons name="camera-reverse-outline" size={24} color={colors.scrimTextPrimary} />
          <Text style={styles.bottomLabel}>Flip</Text>
        </Pressable>
      </View>

      {/* Mode indicator */}
      <View style={styles.modePill} pointerEvents="none">
        <Text style={styles.modeText}>Image</Text>
      </View>
    </View>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  permissionOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center' },
  permissionContent: {
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 40 },
  permissionTitle: {
    fontFamily: Typography.family.semibold,
    fontSize: TypographyV2.sectionTitle.size,
    color: colors.scrimTextPrimary,
    marginTop: Space.sm },
  permissionText: {
    fontFamily: TypographyV2.sectionTitle.fontFamily,
    fontSize: TypographyV2.body.size,
    color: colors.scrimTextSecondary,
    textAlign: 'center',
    lineHeight: 20 },
  permissionBtn: {
    marginTop: Space.md,
    paddingHorizontal: Space.lg,
    paddingVertical: 12,
    borderRadius: Radius.xxl,
    backgroundColor: colors.brand },
  permissionBtnText: {
    fontFamily: TypographyV2.body.fontFamily,
    fontSize: TypographyV2.body.size,
    color: colors.textInverse },
  permissionSecondaryBtn: {
    marginTop: Space.sm,
    paddingHorizontal: Space.md,
    paddingVertical: 10,
    borderRadius: Radius.xxl,
    borderWidth: Stroke.standard,
    borderColor: colors.scrimTextTertiary,
    backgroundColor: 'transparent' },
  permissionSecondaryBtnText: {
    fontFamily: TypographyV2.body.fontFamily,
    fontSize: TypographyV2.body.size,
    color: colors.scrimTextSecondary },
  focusReticle: {
    position: 'absolute',
    width: 60,
    height: 60,
    borderWidth: 2,
    borderColor: colors.scrimTextPrimary,
    borderRadius: Radius.sm,
    pointerEvents: 'none' },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingBottom: Space.sm },
  topRightControls: {
    flexDirection: 'row',
    gap: 8 },
  topIconBtn: {
    width: 44,
    height: 44,
    borderRadius: Radius.xxl,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center' },
  topIcon: {
    textShadowColor: colors.overlay,
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2 },
  bottomBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingHorizontal: Space.lg,
    paddingTop: Space.md },
  galleryBtn: {
    alignItems: 'center',
    gap: 6,
    width: 64 },
  galleryThumb: {
    width: 44,
    height: 44,
    borderRadius: Radius.xxl,
    borderWidth: 2,
    borderColor: colors.scrimTextPrimary,
    backgroundColor: colors.glassBorder },
  facingBtn: {
    alignItems: 'center',
    gap: 6,
    width: 64 },
  bottomLabel: {
    fontFamily: TypographyV2.body.fontFamily,
    fontSize: TypographyV2.meta.size,
    color: colors.scrimTextSecondary },
  shutterOuter: {
    width: SHUTTER_SIZE,
    height: SHUTTER_SIZE,
    borderRadius: SHUTTER_SIZE / 2,
    borderWidth: 5,
    borderColor: colors.scrimTextPrimary,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent' },
  shutterInner: {
    width: SHUTTER_INNER,
    height: SHUTTER_INNER,
    borderRadius: SHUTTER_INNER / 2,
    backgroundColor: colors.scrimTextPrimary },
  shutterBusy: {
    opacity: 0.5 },
  modePill: {
    position: 'absolute',
    bottom: 120,
    alignSelf: 'center',
    paddingHorizontal: Space.md,
    paddingVertical: 6,
    borderRadius: Radius.xl,
    backgroundColor: colors.overlay },
  modeText: {
    fontFamily: TypographyV2.meta.fontFamily,
    fontSize: TypographyV2.meta.size,
    color: colors.scrimTextPrimary } });
