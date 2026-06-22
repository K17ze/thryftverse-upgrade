import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Modal,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { Space, Radius, Type, Typography } from '../../theme/designTokens';
import { Colors } from '../../constants/colors';
import { PosterFrameCanvas } from './PosterFrameCanvas';
import { StickerEditorSheet } from './StickerEditorSheet';
import { createStableId } from '../../utils/createStableId';
import type { ComposerFrame } from './PosterFrameStrip';
import type { PosterStickerType, PosterStickerPayload } from '../../services/postersApi';
import { useToast } from '../../context/ToastContext';

const { width: SCREEN_W } = Dimensions.get('window');
const CANVAS_W = Math.min(SCREEN_W - 40, 360);
const CANVAS_H = CANVAS_W * (16 / 9);

const BG_COLORS = ['#1a1a1a', '#ffffff', '#ff3b30', '#ff9500', '#4cd964', '#5ac8fa', '#007aff', '#5856d6', '#ff2d55', '#f2f2f2'];

const SCALE_MIN = 0.4;
const SCALE_MAX = 3;
const SCALE_STEP = 0.1;
const ROTATION_STEP = 15;

const DURATION_OPTIONS = [
  { label: '3s', value: 3000 },
  { label: '5s', value: 5000 },
  { label: '7s', value: 7000 },
  { label: '10s', value: 10000 },
];

type MediaAction = 'take_photo' | 'choose_photo' | 'record_video' | 'choose_video' | 'text_canvas' | null;

interface PosterFrameComposerProps {
  frame: ComposerFrame;
  onUpdateFrame: (updates: Partial<ComposerFrame>) => void;
  onAddSticker: (sticker: ComposerFrame['stickers'][0]) => void;
  onUpdateSticker: (id: string, updates: Partial<ComposerFrame['stickers'][0]>) => void;
  onRemoveSticker: (id: string) => void;
  selectedStickerId: string | null;
  onSelectSticker: (id: string | null) => void;
  canvasWidth?: number;
  canvasHeight?: number;
}

export function PosterFrameComposer({
  frame,
  onUpdateFrame,
  onAddSticker,
  onUpdateSticker,
  onRemoveSticker,
  selectedStickerId,
  onSelectSticker,
  canvasWidth = CANVAS_W,
  canvasHeight = CANVAS_H,
}: PosterFrameComposerProps) {
  const { show } = useToast();

  const [editorVisible, setEditorVisible] = useState(false);
  const [editorType, setEditorType] = useState<PosterStickerType | null>(null);
  const [editingSticker, setEditingSticker] = useState<ComposerFrame['stickers'][0] | null>(null);
  const [mediaSheetVisible, setMediaSheetVisible] = useState(false);

  // ── Media Actions ──

  const handleMediaAction = useCallback(async (action: MediaAction) => {
    setMediaSheetVisible(false);
    if (!action) return;

    if (action === 'text_canvas') {
      onUpdateFrame({ mediaType: 'text', mediaUri: null, backgroundColor: '#1a1a1a', videoDurationMs: null, thumbnailUri: null });
      return;
    }

    try {
      if (action === 'take_photo' || action === 'record_video') {
        const camPerm = await ImagePicker.requestCameraPermissionsAsync();
        if (camPerm.status !== 'granted') {
          show('Camera access required', 'error');
          return;
        }
        const isVideo = action === 'record_video';
        const result = await ImagePicker.launchCameraAsync({
          mediaTypes: isVideo ? ImagePicker.MediaTypeOptions.Videos : ImagePicker.MediaTypeOptions.Images,
          quality: 0.85,
          videoMaxDuration: 30,
        });
        if (!result.canceled && result.assets?.[0]?.uri) {
          const asset = result.assets[0];
          if (isVideo && asset.duration && asset.duration > 30) {
            show('Videos can be up to 30 seconds.', 'error');
            return;
          }
          onUpdateFrame({
            mediaUri: asset.uri,
            mediaType: isVideo ? 'video' : 'image',
            backgroundColor: null,
            videoDurationMs: isVideo && asset.duration ? Math.round(asset.duration * 1000) : null,
            thumbnailUri: null,
          });
        }
      } else if (action === 'choose_photo' || action === 'choose_video') {
        const libPerm = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (libPerm.status !== 'granted') {
          show('Photo-library access required', 'error');
          return;
        }
        const isVideo = action === 'choose_video';
        const result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: isVideo ? ImagePicker.MediaTypeOptions.Videos : ImagePicker.MediaTypeOptions.Images,
          allowsMultipleSelection: false,
          selectionLimit: 1,
          quality: 0.85,
          videoMaxDuration: 30,
        });
        if (!result.canceled && result.assets?.[0]?.uri) {
          const asset = result.assets[0];
          if (isVideo && asset.duration && asset.duration > 30) {
            show('Videos can be up to 30 seconds.', 'error');
            return;
          }
          onUpdateFrame({
            mediaUri: asset.uri,
            mediaType: isVideo ? 'video' : 'image',
            backgroundColor: null,
            videoDurationMs: isVideo && asset.duration ? Math.round(asset.duration * 1000) : null,
            thumbnailUri: null,
          });
        }
      }
    } catch {
      show('Could not complete media action', 'error');
    }
  }, [show, onUpdateFrame]);

  // ── Sticker Editor ──

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
      const id = createStableId('sticker');
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
      onSelectSticker(id);
    }
    setEditorVisible(false);
    setEditingSticker(null);
    setEditorType(null);
  }, [editorType, editingSticker, onUpdateSticker, onAddSticker, frame.stickers.length, onSelectSticker]);

  const handleEditorDelete = useCallback(() => {
    if (editingSticker) {
      onRemoveSticker(editingSticker.id);
      onSelectSticker(null);
    }
    setEditorVisible(false);
    setEditingSticker(null);
    setEditorType(null);
  }, [editingSticker, onRemoveSticker, onSelectSticker]);

  const handleEditorClose = useCallback(() => {
    setEditorVisible(false);
    setEditingSticker(null);
    setEditorType(null);
  }, []);

  // ── Sticker Selection ──

  const handleStickerPress = useCallback((stickerId: string) => {
    if (selectedStickerId === stickerId) {
      const sticker = frame.stickers.find((s) => s.id === stickerId);
      if (sticker) openEditEditor(sticker);
    } else {
      onSelectSticker(stickerId);
    }
  }, [selectedStickerId, frame.stickers, onSelectSticker, openEditEditor]);

  const handleCanvasPress = useCallback(() => {
    onSelectSticker(null);
  }, [onSelectSticker]);

  const handleStickerPositionChange = useCallback((id: string, x: number, y: number) => {
    onUpdateSticker(id, { x, y });
  }, [onUpdateSticker]);

  // ── Scale / Rotate / Duplicate / Delete ──

  const selectedSticker = useMemo(
    () => frame.stickers.find((s) => s.id === selectedStickerId) ?? null,
    [frame.stickers, selectedStickerId]
  );

  const handleScaleChange = useCallback((delta: number) => {
    if (!selectedSticker) return;
    const newScale = Math.max(SCALE_MIN, Math.min(SCALE_MAX, selectedSticker.scale + delta));
    onUpdateSticker(selectedSticker.id, { scale: newScale });
  }, [selectedSticker, onUpdateSticker]);

  const handleRotate = useCallback((direction: 1 | -1) => {
    if (!selectedSticker) return;
    const newRotation = selectedSticker.rotation + direction * ROTATION_STEP;
    onUpdateSticker(selectedSticker.id, { rotation: newRotation });
  }, [selectedSticker, onUpdateSticker]);

  const handleDuplicate = useCallback(() => {
    if (!selectedSticker) return;
    const newId = createStableId('sticker');
    const offsetX = Math.min(0.9, selectedSticker.x + 0.05);
    const offsetY = Math.min(0.9, selectedSticker.y + 0.05);
    onAddSticker({
      ...selectedSticker,
      id: newId,
      x: offsetX,
      y: offsetY,
      sortOrder: frame.stickers.length,
    });
    onSelectSticker(newId);
  }, [selectedSticker, onAddSticker, frame.stickers.length, onSelectSticker]);

  const handleDelete = useCallback(() => {
    if (!selectedSticker) return;
    onRemoveSticker(selectedSticker.id);
    onSelectSticker(null);
  }, [selectedSticker, onRemoveSticker, onSelectSticker]);

  const isTextFrame = frame.mediaType === 'text' && !frame.mediaUri;
  const isVideo = frame.mediaType === 'video';
  const showDurationSelector = !isVideo;

  const toolRailItems: Array<{ type: PosterStickerType | 'media'; icon: string; label: string }> = [
    { type: 'media', icon: 'images-outline', label: 'Media' },
    { type: 'text', icon: 'text-outline', label: 'Text' },
    { type: 'mention', icon: 'at-outline', label: 'Mention' },
    { type: 'listing', icon: 'pricetag-outline', label: 'Item' },
    { type: 'look', icon: 'shirt-outline', label: 'Look' },
    { type: 'style_vote', icon: 'bar-chart-outline', label: 'Vote' },
  ];

  return (
    <View style={styles.container}>
      <PosterFrameCanvas
        frame={frame}
        mode="edit"
        width={canvasWidth}
        height={canvasHeight}
        selectedStickerId={selectedStickerId}
        onStickerPress={handleStickerPress}
        onStickerPositionChange={handleStickerPositionChange}
        onCanvasPress={handleCanvasPress}
      />

      {/* Background color selector for text frames */}
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
              accessibilityLabel={`Background colour ${c}`}
            />
          ))}
        </ScrollView>
      )}

      {/* Duration selector for image/text frames */}
      {showDurationSelector && (
        <View style={styles.durationRow}>
          {DURATION_OPTIONS.map((opt) => (
            <Pressable
              key={opt.value}
              onPress={() => onUpdateFrame({ durationMs: opt.value })}
              style={[
                styles.durationBtn,
                frame.durationMs === opt.value && styles.durationBtnActive,
              ]}
              accessibilityLabel={`Duration ${opt.label}`}
              accessibilityRole="button"
            >
              <Text style={[
                styles.durationText,
                frame.durationMs === opt.value && styles.durationTextActive,
              ]}>
                {opt.label}
              </Text>
            </Pressable>
          ))}
        </View>
      )}

      {/* Sticker manipulation toolbar */}
      {selectedSticker && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.stickerToolbar}>
          <Pressable style={styles.stickerToolBtn} onPress={() => openEditEditor(selectedSticker)} accessibilityLabel="Edit sticker">
            <Ionicons name="create-outline" size={20} color={Colors.textPrimary} />
            <Text style={styles.stickerToolLabel}>Edit</Text>
          </Pressable>
          <Pressable style={styles.stickerToolBtn} onPress={() => handleScaleChange(-SCALE_STEP)} accessibilityLabel="Make smaller">
            <Ionicons name="remove-circle-outline" size={20} color={Colors.textPrimary} />
            <Text style={styles.stickerToolLabel}>Smaller</Text>
          </Pressable>
          <Pressable style={styles.stickerToolBtn} onPress={() => handleScaleChange(SCALE_STEP)} accessibilityLabel="Make larger">
            <Ionicons name="add-circle-outline" size={20} color={Colors.textPrimary} />
            <Text style={styles.stickerToolLabel}>Larger</Text>
          </Pressable>
          <Pressable style={styles.stickerToolBtn} onPress={() => handleRotate(-1)} accessibilityLabel="Rotate left">
            <Ionicons name="return-up-back-outline" size={20} color={Colors.textPrimary} />
            <Text style={styles.stickerToolLabel}>Rotate L</Text>
          </Pressable>
          <Pressable style={styles.stickerToolBtn} onPress={() => handleRotate(1)} accessibilityLabel="Rotate right">
            <Ionicons name="return-up-forward-outline" size={20} color={Colors.textPrimary} />
            <Text style={styles.stickerToolLabel}>Rotate R</Text>
          </Pressable>
          <Pressable style={styles.stickerToolBtn} onPress={handleDuplicate} accessibilityLabel="Duplicate sticker">
            <Ionicons name="copy-outline" size={20} color={Colors.textPrimary} />
            <Text style={styles.stickerToolLabel}>Duplicate</Text>
          </Pressable>
          <Pressable style={styles.stickerToolBtn} onPress={handleDelete} accessibilityLabel="Delete sticker">
            <Ionicons name="trash-outline" size={20} color="#ff6b6b" />
            <Text style={[styles.stickerToolLabel, { color: '#ff6b6b' }]}>Delete</Text>
          </Pressable>
        </ScrollView>
      )}

      {/* Tool rail */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.toolRail}>
        {toolRailItems.map((item) => (
          <Pressable
            key={item.type}
            style={styles.railBtn}
            onPress={() => {
              if (item.type === 'media') {
                setMediaSheetVisible(true);
              } else {
                openAddEditor(item.type as PosterStickerType);
              }
            }}
            accessibilityLabel={`Add ${item.label}`}
            accessibilityRole="button"
          >
            <Ionicons name={item.icon as any} size={22} color={Colors.textPrimary} />
            <Text style={styles.railLabel}>{item.label}</Text>
          </Pressable>
        ))}
      </ScrollView>

      {/* Media action sheet */}
      <Modal visible={mediaSheetVisible} transparent animationType="fade" onRequestClose={() => setMediaSheetVisible(false)}>
        <Pressable style={styles.overlay} onPress={() => setMediaSheetVisible(false)}>
          <Pressable style={styles.actionSheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Add media</Text>
            {([
              { action: 'take_photo' as const, icon: 'camera-outline', label: 'Take photo' },
              { action: 'choose_photo' as const, icon: 'images-outline', label: 'Choose photo' },
              { action: 'record_video' as const, icon: 'videocam-outline', label: 'Record video' },
              { action: 'choose_video' as const, icon: 'film-outline', label: 'Choose video' },
              { action: 'text_canvas' as const, icon: 'text-outline', label: 'Text canvas' },
            ]).map((item) => (
              <Pressable
                key={item.action}
                style={styles.actionItem}
                onPress={() => handleMediaAction(item.action)}
                accessibilityLabel={item.label}
                accessibilityRole="button"
              >
                <Ionicons name={item.icon as any} size={22} color={Colors.textPrimary} />
                <Text style={styles.actionLabel}>{item.label}</Text>
              </Pressable>
            ))}
            <Pressable
              style={styles.cancelBtn}
              onPress={() => setMediaSheetVisible(false)}
              accessibilityLabel="Cancel"
              accessibilityRole="button"
            >
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

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
  bgScroll: {
    width: CANVAS_W,
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
  durationRow: {
    flexDirection: 'row',
    gap: Space.xs,
  },
  durationBtn: {
    paddingHorizontal: Space.md,
    paddingVertical: 6,
    borderRadius: Radius.md,
    backgroundColor: Colors.surfaceAlt,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
    minWidth: 44,
    alignItems: 'center',
  },
  durationBtnActive: {
    backgroundColor: Colors.brand,
    borderColor: Colors.brand,
  },
  durationText: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.semibold,
    color: Colors.textSecondary,
  },
  durationTextActive: {
    color: '#fff',
  },
  stickerToolbar: {
    width: CANVAS_W,
    maxHeight: 52,
  },
  stickerToolBtn: {
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: Space.sm,
    minWidth: 44,
    minHeight: 44,
    justifyContent: 'center',
  },
  stickerToolLabel: {
    fontSize: 10,
    fontFamily: Typography.family.medium,
    color: Colors.textSecondary,
  },
  toolRail: {
    width: CANVAS_W,
    maxHeight: 64,
  },
  railBtn: {
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Space.sm,
    minWidth: 52,
    minHeight: 44,
    justifyContent: 'center',
  },
  railLabel: {
    fontSize: 11,
    fontFamily: Typography.family.medium,
    color: Colors.textSecondary,
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  actionSheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    paddingHorizontal: Space.md,
    paddingBottom: Space.lg,
    gap: Space.sm,
  },
  sheetHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.border,
    alignSelf: 'center',
    marginTop: Space.sm,
  },
  sheetTitle: {
    fontSize: Type.subtitle.size,
    fontFamily: Typography.family.bold,
    color: Colors.textPrimary,
    marginBottom: Space.xs,
  },
  actionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
    paddingVertical: 12,
    minHeight: 44,
  },
  actionLabel: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.medium,
    color: Colors.textPrimary,
  },
  cancelBtn: {
    alignItems: 'center',
    paddingVertical: 14,
    marginTop: Space.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    minHeight: 44,
    justifyContent: 'center',
  },
  cancelText: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.semibold,
    color: Colors.textSecondary,
  },
});
