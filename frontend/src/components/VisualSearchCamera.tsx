import React from 'react';
import {
  View,
  StyleSheet,
  Pressable,
  Animated,
  Text,
  Image,
  ActivityIndicator,
  GestureResponderEvent,
} from 'react-native';
import { CameraView, useCameraPermissions, CameraType } from 'expo-camera';
import * as MediaLibrary from 'expo-media-library/legacy';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '../constants/colors';
import { Typography } from '../theme/designTokens';
import { useToast } from '../context/ToastContext';
import { Linking } from 'react-native';

const SHUTTER_SIZE = 80;
const SHUTTER_INNER = 64;
const CORNER_SIZE = 40;
const CORNER_STROKE = 3;

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
  onSavedSearches,
}: VisualSearchCameraProps) {
  const { show } = useToast();
  const insets = useSafeAreaInsets();
  const cameraRef = React.useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [facing, setFacing] = React.useState<CameraType>('back');
  const [flash, setFlash] = React.useState<'off' | 'on'>('off');
  const scaleAnim = React.useRef(new Animated.Value(1)).current;
  const [focusPoint, setFocusPoint] = React.useState<{ x: number; y: number } | null>(null);
  const focusAnim = React.useRef(new Animated.Value(0)).current;
  const [lastImageUri, setLastImageUri] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!permission?.granted) {
      requestPermission().catch(() => {
        show('Camera permission is required for visual search', 'error');
      });
    }
  }, [permission, requestPermission, show]);

  // Load the most recent gallery thumbnail for the bottom-left shortcut (Google Lens pattern).
  React.useEffect(() => {
    let cancelled = false;
    async function loadRecent() {
      try {
        const mediaPermission = await MediaLibrary.requestPermissionsAsync(false);
        if (!mediaPermission.granted || cancelled) return;
        const page = await MediaLibrary.getAssetsAsync({
          mediaType: 'photo',
          sortBy: [['creationTime', false]],
          first: 1,
        });
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

  const toggleFlash = () => setFlash((prev) => (prev === 'off' ? 'on' : 'off'));
  const toggleFacing = () => setFacing((prev) => (prev === 'back' ? 'front' : 'back'));

  const takePhoto = async () => {
    if (!cameraRef.current) return;
    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.92,
        skipProcessing: false,
      });
      if (photo?.uri) {
        onPhotoCapture(photo.uri);
      }
    } catch {
      show('Failed to capture photo', 'error');
    }
  };

  const handleShutterPress = () => {
    Animated.sequence([
      Animated.timing(scaleAnim, { toValue: 0.88, duration: 80, useNativeDriver: true }),
      Animated.timing(scaleAnim, { toValue: 1, duration: 120, useNativeDriver: true }),
    ]).start();
    takePhoto();
  };

  const handleTapFocus = (evt: GestureResponderEvent) => {
    const { locationX, locationY } = evt.nativeEvent;
    setFocusPoint({ x: locationX, y: locationY });
    focusAnim.setValue(0);
    Animated.sequence([
      Animated.timing(focusAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
      Animated.timing(focusAnim, { toValue: 0, duration: 200, useNativeDriver: true, delay: 400 }),
    ]).start(() => setFocusPoint(null));
  };

  const handleOpenSettings = () => Linking.openSettings();

  if (!permission) {
    return (
      <View style={styles.permissionOverlay}>
        <ActivityIndicator size="large" color={Colors.brand} />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.permissionOverlay}>
        <View style={styles.permissionContent}>
          <Ionicons name="camera-outline" size={48} color="#fff" />
          <Text style={styles.permissionTitle}>Camera access needed</Text>
          <Text style={styles.permissionText}>
            Enable camera permission in Settings to search with a photo.
          </Text>
          <Pressable style={styles.permissionBtn} onPress={handleOpenSettings}>
            <Text style={styles.permissionBtnText}>Open Settings</Text>
          </Pressable>
        </View>
      </View>
    );
  }

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

      {/* Corner brackets */}
      <View style={styles.bracketTL} />
      <View style={styles.bracketTR} />
      <View style={styles.bracketBL} />
      <View style={styles.bracketBR} />

      {/* Center crosshair */}
      <View style={styles.crosshair} pointerEvents="none">
        <View style={styles.crosshairH} />
        <View style={styles.crosshairV} />
      </View>

      {/* Top controls */}
      <View style={[styles.topBar, { paddingTop: Math.max(insets.top, 16) + 8 }]} pointerEvents="box-none">
        <Pressable style={styles.topIconBtn} onPress={onClose} hitSlop={12} accessibilityLabel="Close visual search">
          <Ionicons name="close" size={26} color="#fff" />
        </Pressable>

        <View style={styles.topRightControls}>
          <Pressable
            style={styles.topIconBtn}
            onPress={onSavedSearches}
            hitSlop={12}
            accessibilityLabel="Saved visual searches"
          >
            <Ionicons name="time-outline" size={24} color="#fff" />
          </Pressable>
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

      {/* Bottom controls */}
      <View style={[styles.bottomBar, { paddingBottom: Math.max(insets.bottom, 16) + 16 }]} pointerEvents="box-none">
        <Pressable
          style={styles.galleryBtn}
          onPress={onGallery}
          hitSlop={16}
          accessibilityLabel="Choose a photo from gallery"
        >
          {lastImageUri ? (
            <Image source={{ uri: lastImageUri }} style={styles.galleryThumb} />
          ) : (
            <Ionicons name="images-outline" size={24} color="#fff" />
          )}
          <Text style={styles.bottomLabel}>Gallery</Text>
        </Pressable>

        <Pressable onPress={handleShutterPress} hitSlop={24} accessibilityLabel="Take photo">
          <Animated.View style={[styles.shutterOuter, { transform: [{ scale: scaleAnim }] }]}>
            <View style={styles.shutterInner} />
          </Animated.View>
        </Pressable>

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

      {/* Mode indicator */}
      <View style={styles.modePill} pointerEvents="none">
        <Text style={styles.modeText}>Image</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
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
    backgroundColor: Colors.brand,
  },
  permissionBtnText: {
    fontFamily: Typography.family.semibold,
    fontSize: 14,
    color: Colors.textInverse,
  },
  focusReticle: {
    position: 'absolute',
    width: 60,
    height: 60,
    borderWidth: 2,
    borderColor: '#fff',
    borderRadius: 4,
    pointerEvents: 'none',
  },
  // Corner brackets
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
  modePill: {
    position: 'absolute',
    bottom: 120,
    alignSelf: 'center',
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
});
