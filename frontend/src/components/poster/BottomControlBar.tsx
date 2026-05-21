import React from 'react';
import {
  View,
  StyleSheet,
  Pressable,
  Text,
  ScrollView,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as MediaLibrary from 'expo-media-library';

export type CaptureMode = 'poster' | 'reel' | 'live';

interface BottomControlBarProps {
  mode: CaptureMode;
  onModeChange: (mode: CaptureMode) => void;
  onGalleryPress: () => void;
  onFlipCamera: () => void;
  recentPhotos: MediaLibrary.Asset[];
  onRecentPhotoPress: (uri: string) => void;
  showCameraControls: boolean;
  onRotateCamera?: () => void;
}

const MODES: { key: CaptureMode; label: string }[] = [
  { key: 'poster', label: 'POSTER' },
  { key: 'reel', label: 'REEL' },
  { key: 'live', label: 'LIVE' },
];

export default function BottomControlBar({
  mode,
  onModeChange,
  onGalleryPress,
  onFlipCamera,
  recentPhotos,
  onRecentPhotoPress,
  showCameraControls,
  onRotateCamera,
}: BottomControlBarProps) {
  return (
    <View style={styles.container} pointerEvents="box-none">
      {/* Mode tabs */}
      <View style={styles.modeRow}>
        {MODES.map((m) => (
          <Pressable
            key={m.key}
            style={styles.modePill}
            onPress={() => onModeChange(m.key)}
            hitSlop={8}
          >
            <Text
              style={[
                styles.modeText,
                mode === m.key && styles.modeTextActive,
                m.key !== 'poster' && styles.modeTextStub,
              ]}
            >
              {m.label}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* Gallery strip + camera flip */}
      <View style={styles.bottomRow}>
        <Pressable style={styles.galleryThumb} onPress={onGalleryPress} hitSlop={12}>
          {recentPhotos[0] ? (
            <Image
              source={{ uri: recentPhotos[0].uri }}
              style={StyleSheet.absoluteFillObject}
              resizeMode="cover"
            />
          ) : (
            <Ionicons name="images-outline" size={20} color="#fff" />
          )}
          <View style={styles.galleryOverlay}>
            <Ionicons name="chevron-up" size={14} color="#fff" />
          </View>
        </Pressable>

        {showCameraControls && (
          <Pressable style={styles.flipBtn} onPress={onRotateCamera || onFlipCamera} hitSlop={12}>
            <Ionicons name="sync-outline" size={22} color="#fff" />
          </Pressable>
        )}
      </View>

      {/* Recent photos horizontal strip */}
      {recentPhotos.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.photoStrip}
        >
          {recentPhotos.slice(0, 10).map((photo) => (
            <Pressable
              key={photo.id}
              style={styles.photoThumb}
              onPress={() => onRecentPhotoPress(photo.uri)}
            >
              <Image source={{ uri: photo.uri }} style={StyleSheet.absoluteFillObject} resizeMode="cover" />
            </Pressable>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingBottom: 24,
    paddingHorizontal: 16,
    gap: 12,
  },
  modeRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 20,
    marginBottom: 4,
  },
  modePill: {
    paddingHorizontal: 4,
    paddingVertical: 4,
  },
  modeText: {
    fontSize: 12,
    fontFamily: 'Inter_700Bold',
    color: 'rgba(255,255,255,0.55)',
    letterSpacing: 1.5,
  },
  modeTextActive: {
    color: '#fff',
  },
  modeTextStub: {
    opacity: 0.4,
  },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    marginBottom: 8,
  },
  galleryThumb: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  galleryOverlay: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  flipBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoStrip: {
    gap: 8,
    paddingHorizontal: 16,
    paddingBottom: 4,
  },
  photoThumb: {
    width: 56,
    height: 56,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
});
