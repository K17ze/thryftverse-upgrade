import React, { useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  Dimensions,
  Pressable,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { Space, Radius, Type, Typography } from '../../theme/designTokens';
import { Colors } from '../../constants/colors';
import { PosterStickerLayer } from './PosterStickerLayer';
import { StickerEditorSheet } from './StickerEditorSheet';
import type { ComposerFrame } from './PosterFrameStrip';
import type { PosterStickerType, PosterStickerPayload } from '../../services/postersApi';
import { useToast } from '../../context/ToastContext';

function generateUUID(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

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

  const [editorVisible, setEditorVisible] = useState(false);
  const [editorType, setEditorType] = useState<PosterStickerType | null>(null);
  const [editingSticker, setEditingSticker] = useState<ComposerFrame['stickers'][0] | null>(null);

  const openAddEditor = useCallback((type: PosterStickerType) => {
    setEditingSticker(null);
    setEditorType(type);
    setEditorVisible(true);
  }, []);

  const openEditEditor = useCallback((sticker: ComposerFrame['stickers'][0]) => {
    setEditingSticker(sticker);
    setEditorType(sticker.type);
    setEditorVisible(true);
  }, []);

  const handleEditorSave = useCallback((payload: PosterStickerPayload) => {
    if (!editorType) return;
    if (editingSticker) {
      onUpdateSticker(editingSticker.id, {
        payload: { ...editingSticker.payload, ...payload } as Record<string, unknown>,
      });
    } else {
      const id = generateUUID();
      onAddSticker({
        id,
        type: editorType,
        x: 0.5,
        y: 0.5,
        scale: 1,
        rotation: 0,
        payload: payload as Record<string, unknown>,
        sortOrder: frame.stickers.length,
      });
    }
    setEditorVisible(false);
    setEditingSticker(null);
    setEditorType(null);
  }, [editorType, editingSticker, onUpdateSticker, onAddSticker, frame.stickers.length]);

  const handleEditorDelete = useCallback(() => {
    if (editingSticker) {
      onRemoveSticker(editingSticker.id);
    }
    setEditorVisible(false);
    setEditingSticker(null);
    setEditorType(null);
  }, [editingSticker, onRemoveSticker]);

  const handleEditorClose = useCallback(() => {
    setEditorVisible(false);
    setEditingSticker(null);
    setEditorType(null);
  }, []);

  const handleStickerPress = useCallback((sticker: ComposerFrame['stickers'][0]) => {
    openEditEditor(sticker);
  }, [openEditEditor]);

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
        <Pressable style={styles.toolBtn} onPress={() => openAddEditor('text')} accessibilityLabel="Add text sticker">
          <Ionicons name="text-outline" size={20} color={Colors.textPrimary} />
          <Text style={styles.toolLabel}>Text</Text>
        </Pressable>
        <Pressable style={styles.toolBtn} onPress={() => openAddEditor('mention')} accessibilityLabel="Add mention sticker">
          <Ionicons name="at-outline" size={20} color={Colors.textPrimary} />
          <Text style={styles.toolLabel}>Mention</Text>
        </Pressable>
        <Pressable style={styles.toolBtn} onPress={() => openAddEditor('listing')} accessibilityLabel="Add listing sticker">
          <Ionicons name="pricetag-outline" size={20} color={Colors.textPrimary} />
          <Text style={styles.toolLabel}>Listing</Text>
        </Pressable>
        <Pressable style={styles.toolBtn} onPress={() => openAddEditor('look')} accessibilityLabel="Add look sticker">
          <Ionicons name="shirt-outline" size={20} color={Colors.textPrimary} />
          <Text style={styles.toolLabel}>Look</Text>
        </Pressable>
        <Pressable style={styles.toolBtn} onPress={() => openAddEditor('style_vote')} accessibilityLabel="Add style vote sticker">
          <Ionicons name="bar-chart-outline" size={20} color={Colors.textPrimary} />
          <Text style={styles.toolLabel}>Vote</Text>
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

      <StickerEditorSheet
        visible={editorVisible}
        stickerType={editorType}
        existingSticker={editingSticker}
        onSave={handleEditorSave}
        onDelete={handleEditorDelete}
        onClose={handleEditorClose}
      />
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
    paddingHorizontal: Space.md,
    gap: Space.sm,
    flexWrap: 'wrap',
    justifyContent: 'center',
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
