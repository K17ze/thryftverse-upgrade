import React from 'react';
import {
  View,
  StyleSheet,
  Pressable,
  Image,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { LayoutType } from './LayoutPicker';
import { useToast } from '../../context/ToastContext';

import { Radius } from '../../theme/designTokens';
const { width: SCREEN_W } = Dimensions.get('window');

interface MultiPhotoCollageProps {
  layout: LayoutType;
  photos: string[];
  onPhotosChange: (photos: string[]) => void;
  canvasSize: { width: number; height: number };
}

export default function MultiPhotoCollage({ layout, photos, onPhotosChange, canvasSize }: MultiPhotoCollageProps) {
  const { show } = useToast();

  const handlePickPhoto = async (slotIndex: number) => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      show('Allow photo library access', 'error');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.92,
    });

    if (!result.canceled && result.assets?.[0]?.uri) {
      const newPhotos = [...photos];
      newPhotos[slotIndex] = result.assets[0].uri;
      onPhotosChange(newPhotos);
    }
  };

  const renderSlot = (slotIndex: number, slotStyle: any, cellRadius: number = Radius.sm) => {
    const uri = photos[slotIndex];
    return (
      <View
        key={slotIndex}
        style={[
          styles.slot,
          slotStyle,
          { borderRadius: cellRadius },
          !uri && styles.slotEmpty,
        ]}
      >
        {uri ? (
          <Image
            source={{ uri }}
            style={[StyleSheet.absoluteFill, { borderRadius: cellRadius }]}
            resizeMode="cover"
          />
        ) : (
          <Pressable
            style={styles.addBtn}
            onPress={() => handlePickPhoto(slotIndex)}
            android_ripple={{ color: 'rgba(255,255,255,0.06)', radius: 60 }}
            accessibilityLabel={`Add photo to slot ${slotIndex + 1}`}
            accessibilityHint="Opens your photo library to choose a photo"
            accessibilityRole="button"
          >
            <View style={styles.addCircle}>
              <Ionicons name="add" size={22} color="rgba(255,255,255,0.75)" />
            </View>
          </Pressable>
        )}
      </View>
    );
  };

  if (layout === 'single') return null;

  const slotGap = 3;

  switch (layout) {
    case 'split-h':
      return (
        <View style={[StyleSheet.absoluteFill, { flexDirection: 'row', gap: slotGap }]}>
          {renderSlot(0, { flex: 1 })}
          {renderSlot(1, { flex: 1 })}
        </View>
      );
    case 'split-v':
      return (
        <View style={[StyleSheet.absoluteFill, { flexDirection: 'column', gap: slotGap }]}>
          {renderSlot(0, { flex: 1 })}
          {renderSlot(1, { flex: 1 })}
        </View>
      );
    case 'triple-h':
      return (
        <View style={[StyleSheet.absoluteFill, { flexDirection: 'row', gap: slotGap }]}>
          {renderSlot(0, { flex: 1 })}
          {renderSlot(1, { flex: 1 })}
          {renderSlot(2, { flex: 1 })}
        </View>
      );
    case 'grid-2x2':
      return (
        <View style={[StyleSheet.absoluteFill, { gap: slotGap }]}>
          <View style={{ flex: 1, flexDirection: 'row', gap: slotGap }}>
            {renderSlot(0, { flex: 1 })}
            {renderSlot(1, { flex: 1 })}
          </View>
          <View style={{ flex: 1, flexDirection: 'row', gap: slotGap }}>
            {renderSlot(2, { flex: 1 })}
            {renderSlot(3, { flex: 1 })}
          </View>
        </View>
      );
    case 'photo-booth':
      return (
        <View style={[StyleSheet.absoluteFill, { gap: slotGap, padding: 20, backgroundColor: '#fff' }]}>
          <View style={{ flex: 1, flexDirection: 'row', gap: slotGap }}>
            {renderSlot(0, { flex: 1 })}
            {renderSlot(1, { flex: 1 })}
          </View>
          <View style={{ flex: 1, flexDirection: 'row', gap: slotGap }}>
            {renderSlot(2, { flex: 1 })}
            {renderSlot(3, { flex: 1 })}
          </View>
        </View>
      );
    default:
      return null;
  }
}

const styles = StyleSheet.create({
  slot: {
    overflow: 'hidden',
    backgroundColor: 'rgba(0,0,0,0.22)',
  },
  slotEmpty: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
  },
  addBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addCircle: {
    width: 38,
    height: 38,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.28)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
