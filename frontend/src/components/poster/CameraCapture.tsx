import React from 'react';
import {
  View,
  StyleSheet,
  Pressable,
  Animated,
  Dimensions,
  ActivityIndicator,
  Text,
  GestureResponderEvent,
} from 'react-native';
import { CameraView, useCameraPermissions, CameraType } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/colors';
import { useToast } from '../../context/ToastContext';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const SHUTTER_SIZE = 88;
const INNER_SHUTTER_SIZE = 72;

interface CameraCaptureProps {
  onPhotoCapture: (uri: string) => void;
  onClose: () => void;
}

export default function CameraCapture({ onPhotoCapture, onClose }: CameraCaptureProps) {
  const { show } = useToast();
  const cameraRef = React.useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [facing, setFacing] = React.useState<CameraType>('back');
  const [flash, setFlash] = React.useState<'off' | 'on'>('off');
  const [zoom, setZoom] = React.useState(0);
  const [focusPoint, setFocusPoint] = React.useState<{ x: number; y: number } | null>(null);
  const focusAnim = React.useRef(new Animated.Value(0)).current;
  const scaleAnim = React.useRef(new Animated.Value(1)).current;

  React.useEffect(() => {
    if (!permission?.granted) {
      requestPermission().catch(() => {
        show('Camera permission is required to capture posters', 'error');
      });
    }
  }, [permission]);

  const toggleFacing = () => {
    setFacing((prev) => (prev === 'back' ? 'front' : 'back'));
  };

  const toggleFlash = () => {
    setFlash((prev) => (prev === 'off' ? 'on' : 'off'));
  };

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

  const handleTapFocus = (evt: GestureResponderEvent) => {
    const { locationX, locationY } = evt.nativeEvent;
    setFocusPoint({ x: locationX, y: locationY });

    focusAnim.setValue(0);
    Animated.sequence([
      Animated.timing(focusAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
      Animated.timing(focusAnim, { toValue: 0, duration: 200, useNativeDriver: true, delay: 400 }),
    ]).start(() => setFocusPoint(null));

    const focusX = (locationX / SCREEN_W) * 2 - 1;
    const focusY = (locationY / SCREEN_H) * 2 - 1;

    try {
      (cameraRef.current as any)?.focus?.({ x: focusX, y: focusY });
    } catch {
      // focus method may not be available on all platforms
    }
  };

  const handleZoomChange = (delta: number) => {
    setZoom((prev) => Math.min(Math.max(prev + delta, 0), 1));
  };

  const handleShutterPress = () => {
    Animated.sequence([
      Animated.timing(scaleAnim, { toValue: 0.88, duration: 80, useNativeDriver: true }),
      Animated.timing(scaleAnim, { toValue: 1, duration: 120, useNativeDriver: true }),
    ]).start();
    takePhoto();
  };

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
        <Pressable style={styles.permissionBtn} onPress={requestPermission}>
          <Ionicons name="camera-outline" size={32} color="#fff" />
        </Pressable>
      </View>
    );
  }

  return (
    <View style={StyleSheet.absoluteFill}>
      {/* Camera preview with tap-to-focus */}
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

      {/* Focus reticle */}
      {focusPoint && (
        <Animated.View
          style={[
            styles.focusReticle,
            {
              left: focusPoint.x - 30,
              top: focusPoint.y - 30,
              opacity: focusAnim,
              transform: [{ scale: focusAnim.interpolate({ inputRange: [0, 1], outputRange: [1.4, 1] }) }],
            },
          ]}
        />
      )}

      {/* Top controls */}
      <View style={styles.topBar} pointerEvents="box-none">
        <Pressable style={styles.topIconBtn} onPress={onClose} hitSlop={12}>
          <Ionicons name="close" size={26} color="#fff" />
        </Pressable>

        <Pressable style={styles.topIconBtn} onPress={toggleFlash} hitSlop={12}>
          <Ionicons
            name={flash === 'on' ? 'flash' : 'flash-off'}
            size={24}
            color="#fff"
          />
        </Pressable>

        <Pressable style={styles.topIconBtn} onPress={toggleFacing} hitSlop={12}>
          <Ionicons name="camera-reverse-outline" size={24} color="#fff" />
        </Pressable>
      </View>

      {/* Zoom slider (right edge) */}
      <View style={styles.zoomBar} pointerEvents="box-none">
        <Pressable style={styles.zoomBtn} onPress={() => handleZoomChange(-0.1)} hitSlop={8}>
          <Ionicons name="remove" size={16} color="#fff" />
        </Pressable>
        <Text style={styles.zoomText}>{Math.round(zoom * 10)}x</Text>
        <Pressable style={styles.zoomBtn} onPress={() => handleZoomChange(0.1)} hitSlop={8}>
          <Ionicons name="add" size={16} color="#fff" />
        </Pressable>
      </View>

      {/* Shutter button */}
      <View style={styles.shutterWrap} pointerEvents="box-none">
        <Pressable onPress={handleShutterPress} hitSlop={24}>
          <Animated.View style={[styles.shutterOuter, { transform: [{ scale: scaleAnim }] }]}>
            <View style={styles.shutterInner} />
          </Animated.View>
        </Pressable>
        <Text style={styles.hintText}>Tap to capture</Text>
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
  permissionBtn: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 52,
    paddingBottom: 12,
  },
  topIconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  focusReticle: {
    position: 'absolute',
    width: 60,
    height: 60,
    borderWidth: 2,
    borderColor: '#ffcc00',
    borderRadius: 4,
    pointerEvents: 'none',
  },
  zoomBar: {
    position: 'absolute',
    right: 12,
    top: SCREEN_H * 0.35,
    alignItems: 'center',
    gap: 8,
  },
  zoomBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  zoomText: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 11,
    fontFamily: 'Inter_700Bold',
  },
  shutterWrap: {
    position: 'absolute',
    bottom: 100,
    left: 0,
    right: 0,
    alignItems: 'center',
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
    shadowColor: '#fff',
    shadowOpacity: 0.25,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 0 },
  },
  shutterInner: {
    width: INNER_SHUTTER_SIZE,
    height: INNER_SHUTTER_SIZE,
    borderRadius: INNER_SHUTTER_SIZE / 2,
    backgroundColor: '#fff',
  },
  hintText: {
    color: 'rgba(255,255,255,0.65)',
    fontSize: 12,
    fontFamily: 'Inter_500Medium',
    marginTop: 14,
  },
});