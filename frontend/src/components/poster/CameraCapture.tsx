import React from 'react';
import {
  View,
  StyleSheet,
  Pressable,
  Animated,
  Dimensions,
  ActivityIndicator,
} from 'react-native';
import { CameraView, useCameraPermissions, CameraType } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/colors';
import { useToast } from '../../context/ToastContext';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const SHUTTER_SIZE = 78;
const INNER_SHUTTER_SIZE = 64;
const MAX_VIDEO_DURATION_MS = 15000;

interface CameraCaptureProps {
  onPhotoCapture: (uri: string) => void;
  onVideoCapture?: (uri: string) => void;
  onClose: () => void;
}

export default function CameraCapture({ onPhotoCapture, onVideoCapture, onClose }: CameraCaptureProps) {
  const { show } = useToast();
  const cameraRef = React.useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [facing, setFacing] = React.useState<CameraType>('back');
  const [flash, setFlash] = React.useState<'off' | 'on'>('off');
  const [isRecording, setIsRecording] = React.useState(false);
  const [recordProgress, setRecordProgress] = React.useState(0);
  const recordTimerRef = React.useRef<ReturnType<typeof setInterval> | null>(null);
  const recordStartRef = React.useRef<number>(0);
  const scaleAnim = React.useRef(new Animated.Value(1)).current;

  React.useEffect(() => {
    if (!permission?.granted) {
      requestPermission().catch(() => {
        show('Camera permission is required to capture posters', 'error');
      });
    }
  }, [permission]);

  React.useEffect(() => {
    return () => {
      if (recordTimerRef.current) {
        clearInterval(recordTimerRef.current);
      }
    };
  }, []);

  const toggleFacing = () => {
    setFacing((prev) => (prev === 'back' ? 'front' : 'back'));
  };

  const toggleFlash = () => {
    setFlash((prev) => (prev === 'off' ? 'on' : 'off'));
  };

  const takePhoto = async () => {
    if (!cameraRef.current || isRecording) return;
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

  const startRecording = async () => {
    if (!cameraRef.current || isRecording) return;
    try {
      setIsRecording(true);
      recordStartRef.current = Date.now();

      recordTimerRef.current = setInterval(() => {
        const elapsed = Date.now() - recordStartRef.current;
        const progress = Math.min(elapsed / MAX_VIDEO_DURATION_MS, 1);
        setRecordProgress(progress);
        if (progress >= 1) {
          stopRecording();
        }
      }, 50);

      Animated.spring(scaleAnim, {
        toValue: 0.85,
        useNativeDriver: true,
        friction: 3,
      }).start();

      const video = await cameraRef.current.recordAsync({
        maxDuration: MAX_VIDEO_DURATION_MS / 1000,
      });

      if (video?.uri && onVideoCapture) {
        onVideoCapture(video.uri);
      }
    } catch {
      show('Failed to record video', 'error');
      setIsRecording(false);
      setRecordProgress(0);
    }
  };

  const stopRecording = () => {
    if (!isRecording) return;

    if (recordTimerRef.current) {
      clearInterval(recordTimerRef.current);
      recordTimerRef.current = null;
    }

    try {
      cameraRef.current?.stopRecording();
    } catch {
      // Ignore if already stopped
    }

    setIsRecording(false);
    setRecordProgress(0);

    Animated.spring(scaleAnim, {
      toValue: 1,
      useNativeDriver: true,
      friction: 3,
    }).start();
  };

  const handleShutterPressIn = () => {
    Animated.timing(scaleAnim, {
      toValue: 0.88,
      duration: 120,
      useNativeDriver: true,
    }).start();
  };

  const handleShutterPressOut = () => {
    if (!isRecording) {
      Animated.timing(scaleAnim, {
        toValue: 1,
        duration: 120,
        useNativeDriver: true,
      }).start();
    }
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
    <View style={StyleSheet.absoluteFillObject}>
      <CameraView
        ref={cameraRef}
        style={StyleSheet.absoluteFillObject}
        facing={facing}
        flash={flash}
        mode={isRecording ? 'video' : 'picture'}
        enableTorch={flash === 'on'}
      />

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

      {/* Shutter button */}
      <View style={styles.shutterWrap} pointerEvents="box-none">
        <Pressable
          onPress={takePhoto}
          onLongPress={startRecording}
          onPressOut={() => {
            handleShutterPressOut();
            if (isRecording) {
              stopRecording();
            }
          }}
          onPressIn={handleShutterPressIn}
          delayLongPress={350}
          hitSlop={20}
        >
          <Animated.View style={[styles.shutterOuter, { transform: [{ scale: scaleAnim }] }]}>
            {/* Recording progress ring */}
            {isRecording && (
              <View style={styles.progressRing}>
                <View
                  style={[
                    styles.progressFill,
                    {
                      width: `${recordProgress * 100}%`,
                      backgroundColor: '#ff3b30',
                    },
                  ]}
                />
              </View>
            )}
            <View
              style={[
                styles.shutterInner,
                isRecording && styles.shutterInnerRecording,
              ]}
            />
          </Animated.View>
        </Pressable>
        <View style={styles.hintRow}>
          <Ionicons name="hand-left-outline" size={12} color="rgba(255,255,255,0.6)" />
          <View style={styles.hintTextWrap}>
            <Ionicons name="ellipse" size={6} color="rgba(255,255,255,0.6)" />
          </View>
          <Ionicons name="time-outline" size={12} color="rgba(255,255,255,0.6)" />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  permissionOverlay: {
    ...StyleSheet.absoluteFillObject,
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
    borderWidth: 4,
    borderColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  shutterInner: {
    width: INNER_SHUTTER_SIZE,
    height: INNER_SHUTTER_SIZE,
    borderRadius: INNER_SHUTTER_SIZE / 2,
    backgroundColor: '#fff',
  },
  shutterInnerRecording: {
    width: 32,
    height: 32,
    borderRadius: 6,
    backgroundColor: '#ff3b30',
  },
  progressRing: {
    position: 'absolute',
    top: -6,
    left: -6,
    right: -6,
    bottom: -6,
    borderRadius: SHUTTER_SIZE / 2 + 6,
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.25)',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: SHUTTER_SIZE / 2 + 6,
  },
  hintRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 12,
  },
  hintTextWrap: {
    width: 4,
    height: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
