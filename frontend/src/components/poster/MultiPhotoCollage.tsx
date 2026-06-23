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

  const renderSlot = (slotIndex: number, slotStyle: any) => {
    const uri = photos[slotIndex];
    return (
      <View key={slotIndex} style={[styles.slot, slotStyle]}>
        {uri ? (
          <Image source={{ uri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
        ) : (
          <Pressable style={styles.addBtn} onPress={() => handlePickPhoto(slotIndex)}>
            <Ionicons name="add" size={28} color="rgba(255,255,255,0.7)" />
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
            {renderSlot(0, { flex: 1, borderRadius: 4 })}
            {renderSlot(1, { flex: 1, borderRadius: 4 })}
          </View>
          <View style={{ flex: 1, flexDirection: 'row', gap: slotGap }}>
            {renderSlot(2, { flex: 1, borderRadius: 4 })}
            {renderSlot(3, { flex: 1, borderRadius: 4 })}
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
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  addBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});