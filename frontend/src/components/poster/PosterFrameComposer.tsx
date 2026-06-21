import React, { useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  Dimensions,
  Pressable,
  Alert,
  ScrollView,
  ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { Space, Radius, Type, Typography } from '../../theme/designTokens';
import { Colors } from '../../constants/colors';
import { PosterStickerLayer } from './PosterStickerLayer';
import type { ComposerFrame } from './PosterFrameStrip';
import { useToast } from '../../context/ToastContext';

const { width: SCREEN_W } = Dimensions.get('window');
const CANVAS_W = Math.min(SCREEN_W - 40, 360);
const CANVAS_H = CANVAS_W * (16 / 9);

const BG_COLORS = ['#1a1a1a', '#ffffff', '#ff3b30', '#ff9500', '#4cd964', '#5ac8fa', '#007aff', '#5856d6', '#ff2d55', '#f2f2f2'];

interface PosterFrameComposerProps {
  frame: ComposerFrame;
  onUpdateFrame: (updates: Partial<ComposerFrame>) => void;
  onAddSticker: (sticker: ComposerFrame['stickers'][0]) => void;
  onUpdateSticker: (id: string, updates: Partial<ComposerFrame['stickers'][0]>) => void;
  onRemoveSticker: (id: string) => void;
  canvasWidth?: number;
  canvasHeight?: number;
}

export function PosterFrameComposer({
  frame,
  onUpdateFrame,
  onAddSticker,
  onUpdateSticker,
  onRemoveSticker,
  canvasWidth = CANVAS_W,
  canvasHeight = CANVAS_H,
}: PosterFrameComposerProps) {
  const { show } = useToast();
  const canvasRef = useRef<View>(null);

  const pickImage = useCallback(async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        show('Photo library access required', 'error');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.All,
        allowsMultipleSelection: false,
        selectionLimit: 1,
        quality: 0.85,
      });
      if (!result.canceled && result.assets?.[0]?.uri) {
        const asset = result.assets[0];
        const mediaType: 'image' | 'video' = asset.type === 'video' ? 'video' : 'image';
        onUpdateFrame({
          mediaUri: asset.uri,
          mediaType,
          backgroundColor: null,
        });
      }
    } catch {
      show('Could not open gallery.', 'error');
    }
  }, [show, onUpdateFrame]);

  const addTextSticker = useCallback(() => {
    const id = `sticker_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
    onAddSticker({
      id,
      type: 'text',
      x: 0.5,
      y: 0.5,
      scale: 1,
      rotation: 0,
      payload: { text: 'Your text', textColor: '#ffffff', textStyle: 'editorial' },
      sortOrder: frame.stickers.length,
    });
  }, [onAddSticker, frame.stickers.length]);

  const handleStickerPress = useCallback((sticker: ComposerFrame['stickers'][0]) => {
    if (sticker.type === 'text') {
      Alert.alert(
        'Text sticker',
        undefined,
        [
          { text: 'Edit text', onPress: () => {
            Alert.prompt?.('Edit text', 'Enter sticker text', (text) => {
              if (text) onUpdateSticker(sticker.id, { payload: { ...sticker.payload, text } });
            });
          }},
          { text: 'Delete', style: 'destructive', onPress: () => onRemoveSticker(sticker.id) },
          { text: 'Cancel', style: 'cancel' },
        ]
      );
    } else {
      Alert.alert(
        'Sticker',
        undefined,
        [
          { text: 'Delete', style: 'destructive', onPress: () => onRemoveSticker(sticker.id) },
          { text: 'Cancel', style: 'cancel' },
        ]
      );
    }
  }, [onUpdateSticker, onRemoveSticker]);

  const isTextFrame = frame.mediaType === 'text' && !frame.mediaUri;

  return (
    <View style={styles.container}>
      <View
        ref={canvasRef}
        style={[
          styles.canvas,
          {
            width: canvasWidth,
            height: canvasHeight,
            backgroundColor: frame.backgroundColor ?? (isTextFrame ? '#1a1a1a' : Colors.surfaceAlt),
          },
        ]}
      >
        {frame.mediaUri ? (
          <Image source={{ uri: frame.mediaUri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
        ) : isTextFrame ? (
          <View style={styles.textFrameContent}>
            <Text
              style={[
                styles.textFrameText,
                { color: frame.backgroundColor === '#ffffff' ? '#000' : '#fff' },
              ]}
            >
              {frame.caption || 'Type your text...'}
            </Text>
          </View>
        ) : null}

        <PosterStickerLayer
          stickers={frame.stickers as unknown as Array<import('../../services/postersApi').PosterSticker>}
          onStickerPress={handleStickerPress as (s: import('../../services/postersApi').PosterSticker) => void}
          containerWidth={canvasWidth}
          containerHeight={canvasHeight}
        />
      </View>

      <View style={styles.toolbar}>
        <Pressable style={styles.toolBtn} onPress={pickImage} accessibilityLabel="Add media">
          <Ionicons name="images-outline" size={20} color={Colors.textPrimary} />
          <Text style={styles.toolLabel}>Media</Text>
        </Pressable>
        <Pressable style={styles.toolBtn} onPress={addTextSticker} accessibilityLabel="Add text sticker">
          <Ionicons name="text-outline" size={20} color={Colors.textPrimary} />
          <Text style={styles.toolLabel}>Text</Text>
        </Pressable>
        {isTextFrame && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.bgScroll}>
            {BG_COLORS.map((c) => (
              <Pressable
                key={c}
                onPress={() => onUpdateFrame({ backgroundColor: c })}
                style={[
                  styles.bgDot,
                  { backgroundColor: c },
                  frame.backgroundColor === c && styles.bgDotActive,
                ]}
              />
            ))}
          </ScrollView>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    gap: Space.sm,
  },
  canvas: {
    borderRadius: Radius.lg,
    overflow: 'hidden',
    backgroundColor: Colors.surfaceAlt,
  },
  textFrameContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Space.md,
  },
  textFrameText: {
    fontFamily: Typography.family.semibold,
    fontSize: Type.title.size,
    textAlign: 'center',
  },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
    paddingHorizontal: Space.md,
  },
  toolBtn: {
    alignItems: 'center',
    gap: 4,
  },
  toolLabel: {
    fontSize: 11,
    fontFamily: Typography.family.medium,
    color: Colors.textSecondary,
  },
  bgScroll: {
    flex: 1,
  },
  bgDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: 'transparent',
    marginRight: 6,
  },
  bgDotActive: {
    borderColor: Colors.textPrimary,
  },
});
