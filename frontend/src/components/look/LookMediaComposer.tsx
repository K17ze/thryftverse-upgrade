import React, { useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  Pressable,
  ActivityIndicator,
  GestureResponderEvent,
  PanResponder,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { CachedImage } from '../CachedImage';
import { Colors } from '../../constants/colors';
import { Space, Radius, Typography } from '../../theme/designTokens';
import { useHaptic } from '../../hooks/useHaptic';
import { useToast } from '../../context/ToastContext';

const { width: SCREEN_W } = Dimensions.get('window');

export interface OutfitTag {
  id: string;
  label: string;
  listingId?: string;
  x: number;
  y: number;
}

export interface LookMediaComposerProps {
  imageUri: string | null;
  onImageChange: (uri: string | null) => void;
  tags: OutfitTag[];
  onTagsChange: (tags: OutfitTag[]) => void;
  editable: boolean;
}

export function LookMediaComposer({
  imageUri,
  onImageChange,
  tags,
  onTagsChange,
  editable,
}: LookMediaComposerProps) {
  const haptic = useHaptic();
  const { show } = useToast();
  const [isPicking, setIsPicking] = useState(false);
  const [activeTagId, setActiveTagId] = useState<string | null>(null);
  const layoutRef = useRef<{ width: number; height: number } | null>(null);

  const handlePickImage = useCallback(
    async (source: 'gallery' | 'camera') => {
      if (isPicking) return;
      setIsPicking(true);
      try {
        if (source === 'gallery') {
          const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
          if (!permission.granted) {
            show('Allow photo library access', 'error');
            return;
          }
          const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            allowsEditing: true,
            aspect: [4, 5],
            quality: 0.92,
          });
          if (!result.canceled && result.assets?.[0]?.uri) {
            onImageChange(result.assets[0].uri);
            haptic.light();
          }
        } else {
          const permission = await ImagePicker.requestCameraPermissionsAsync();
          if (!permission.granted) {
            show('Allow camera access', 'error');
            return;
          }
          const result = await ImagePicker.launchCameraAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            allowsEditing: true,
            aspect: [4, 5],
            quality: 0.92,
          });
          if (!result.canceled && result.assets?.[0]?.uri) {
            onImageChange(result.assets[0].uri);
            haptic.light();
          }
        }
      } catch {
        show('Failed to pick image', 'error');
      } finally {
        setIsPicking(false);
      }
    },
    [isPicking, onImageChange, haptic, show]
  );

  const handlePhotoPress = useCallback(
    (evt: GestureResponderEvent) => {
      if (!imageUri || !editable || !layoutRef.current) return;
      const { locationX, locationY } = evt.nativeEvent;
      const { width, height } = layoutRef.current;
      const x = Math.min(Math.max(locationX / width, 0.05), 0.95);
      const y = Math.min(Math.max(locationY / height, 0.05), 0.95);
      const tagId = `tag_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      onTagsChange([...tags, { id: tagId, label: '', x, y }]);
      setActiveTagId(tagId);
      haptic.light();
    },
    [imageUri, editable, tags, onTagsChange, haptic]
  );

  const handleTagLabelChange = useCallback(
    (tagId: string, label: string) => {
      onTagsChange(tags.map((t) => (t.id === tagId ? { ...t, label } : t)));
    },
    [tags, onTagsChange]
  );

  const handleTagRemove = useCallback(
    (tagId: string) => {
      onTagsChange(tags.filter((t) => t.id !== tagId));
      if (activeTagId === tagId) setActiveTagId(null);
    },
    [tags, onTagsChange, activeTagId]
  );

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => false,
      onPanResponderRelease: (_evt, _gestureState) => {},
    })
  ).current;

  if (!imageUri) {
    return (
      <View style={styles.placeholderWrap}>
        <Pressable
          style={styles.placeholderBtn}
          onPress={() => handlePickImage('gallery')}
          accessibilityRole="button"
          accessibilityLabel="Choose photo from gallery"
        >
          {isPicking ? (
            <ActivityIndicator size="large" color={Colors.brand} />
          ) : (
            <>
              <Ionicons name="camera-outline" size={40} color={Colors.textMuted} />
              <Text style={styles.placeholderTitle}>Add your outfit photo</Text>
              <Text style={styles.placeholderSubtitle}>Tap to choose from gallery or camera</Text>
            </>
          )}
        </Pressable>
        <View style={styles.sourceRow}>
          <Pressable
            style={styles.sourceBtn}
            onPress={() => handlePickImage('gallery')}
            accessibilityRole="button"
            accessibilityLabel="Pick from gallery"
          >
            <Ionicons name="images-outline" size={20} color={Colors.textSecondary} />
            <Text style={styles.sourceBtnText}>Gallery</Text>
          </Pressable>
          <Pressable
            style={styles.sourceBtn}
            onPress={() => handlePickImage('camera')}
            accessibilityRole="button"
            accessibilityLabel="Take a photo"
          >
            <Ionicons name="camera-outline" size={20} color={Colors.textSecondary} />
            <Text style={styles.sourceBtnText}>Camera</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View
      style={styles.imageWrap}
      onLayout={(e) => {
        layoutRef.current = {
          width: e.nativeEvent.layout.width,
          height: e.nativeEvent.layout.height,
        };
      }}
      {...panResponder.panHandlers}
    >
      <Pressable onPress={handlePhotoPress} style={StyleSheet.absoluteFillObject}>
        <CachedImage uri={imageUri} style={styles.image} contentFit="cover" />
      </Pressable>

      {tags.map((tag) => {
        const isActive = activeTagId === tag.id;
        return (
          <View
            key={tag.id}
            style={[styles.tagWrap, { left: `${tag.x * 100}%`, top: `${tag.y * 100}%` }]}
          >
            <Pressable
              hitSlop={20}
              onPress={() => {
                if (!editable) return;
                setActiveTagId(isActive ? null : tag.id);
                haptic.light();
              }}
            >
              <View style={[styles.tagDot, isActive && styles.tagDotActive]} />
            </Pressable>
            {isActive && editable && (
              <View style={styles.tagEditor}>
                <Text style={styles.tagEditorLabel}>Label</Text>
                <Text style={styles.tagEditorHint}>Tap the dot to set label</Text>
                <Pressable
                  style={styles.tagRemoveBtn}
                  onPress={() => handleTagRemove(tag.id)}
                  accessibilityRole="button"
                  accessibilityLabel="Remove tag"
                >
                  <Ionicons name="close-circle" size={20} color={Colors.danger} />
                </Pressable>
              </View>
            )}
            {tag.label && !isActive && (
              <View style={styles.tagPill}>
                <Text style={styles.tagPillText} numberOfLines={1}>{tag.label}</Text>
              </View>
            )}
          </View>
        );
      })}

      {editable && (
        <Pressable
          style={styles.changePhotoBtn}
          onPress={() => handlePickImage('gallery')}
          accessibilityRole="button"
          accessibilityLabel="Change photo"
        >
          <Ionicons name="swap-horizontal" size={16} color="#fff" />
          <Text style={styles.changePhotoText}>Change</Text>
        </Pressable>
      )}

      {editable && tags.length === 0 && (
        <View style={styles.tapHint}>
          <Text style={styles.tapHintText}>Tap on the photo to tag a piece</Text>
        </View>
      )}
    </View>
  );
}

const IMAGE_HEIGHT = SCREEN_W * 1.25;

const styles = StyleSheet.create({
  placeholderWrap: {
    width: SCREEN_W,
    height: IMAGE_HEIGHT,
    backgroundColor: Colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space.md,
  },
  placeholderBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space.sm,
    padding: Space.xl,
  },
  placeholderTitle: {
    fontSize: 18,
    fontFamily: Typography.family.semibold,
    color: Colors.textSecondary,
  },
  placeholderSubtitle: {
    fontSize: 14,
    fontFamily: Typography.family.medium,
    color: Colors.textMuted,
  },
  sourceRow: {
    flexDirection: 'row',
    gap: Space.md,
  },
  sourceBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
    backgroundColor: Colors.surface,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  sourceBtnText: {
    fontSize: 14,
    fontFamily: Typography.family.medium,
    color: Colors.textSecondary,
  },
  imageWrap: {
    width: SCREEN_W,
    height: IMAGE_HEIGHT,
    position: 'relative',
    backgroundColor: Colors.surfaceAlt,
    overflow: 'hidden',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  tagWrap: {
    position: 'absolute',
    width: 44,
    height: 44,
    marginLeft: -22,
    marginTop: -22,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 3,
  },
  tagDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderWidth: 2,
    borderColor: 'rgba(0,0,0,0.25)',
  },
  tagDotActive: {
    backgroundColor: Colors.brand,
    borderColor: '#fff',
    width: 18,
    height: 18,
    borderRadius: 9,
  },
  tagPill: {
    position: 'absolute',
    top: 24,
    backgroundColor: 'rgba(0,0,0,0.8)',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 4,
    maxWidth: 120,
  },
  tagPillText: {
    color: '#fff',
    fontSize: 11,
    fontFamily: Typography.family.medium,
  },
  tagEditor: {
    position: 'absolute',
    top: 26,
    backgroundColor: 'rgba(0,0,0,0.88)',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    gap: 2,
    minWidth: 100,
  },
  tagEditorLabel: {
    color: '#fff',
    fontSize: 12,
    fontFamily: Typography.family.semibold,
  },
  tagEditorHint: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 10,
    fontFamily: Typography.family.medium,
  },
  tagRemoveBtn: {
    position: 'absolute',
    top: -8,
    right: -8,
  },
  changePhotoBtn: {
    position: 'absolute',
    bottom: Space.sm,
    right: Space.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: Radius.full,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  changePhotoText: {
    color: '#fff',
    fontSize: 12,
    fontFamily: Typography.family.medium,
  },
  tapHint: {
    position: 'absolute',
    bottom: Space.sm,
    left: Space.sm,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: Radius.full,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  tapHintText: {
    color: '#fff',
    fontSize: 12,
    fontFamily: Typography.family.medium,
  },
});
