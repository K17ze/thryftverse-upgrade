import React from 'react';
import {
  View,
  StyleSheet,
  Pressable,
  ScrollView,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type * as MediaLibrary from 'expo-media-library/legacy';

interface BottomControlBarProps {
  onGalleryPress: () => void;
  onFlipCamera: () => void;
  recentPhotos: (MediaLibrary.Asset & { uri?: string })[];
  onRecentPhotoPress: (uri: string) => void;
  showCameraControls: boolean;
  onRotateCamera?: () => void;
}

export default function BottomControlBar({
  onGalleryPress,
  onFlipCamera,
  recentPhotos,
  onRecentPhotoPress,
  showCameraControls,
  onRotateCamera,
}: BottomControlBarProps) {
  return (
    <View style={styles.container} pointerEvents="box-none">
      {/* Gallery strip + camera flip */}
      <View style={styles.bottomRow}>
        <Pressable style={styles.galleryThumb} onPress={onGalleryPress} hitSlop={12}>
          {recentPhotos[0] ? (
            <Image
              source={{ uri: recentPhotos[0].uri ?? '' }}
              style={StyleSheet.absoluteFill}
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
              onPress={() => onRecentPhotoPress(photo.uri ?? '')}
            >
              <Image source={{ uri: photo.uri ?? '' }} style={StyleSheet.absoluteFill} resizeMode="cover" />
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
