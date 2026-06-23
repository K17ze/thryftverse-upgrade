import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  StatusBar,
  TextInput,
  FlatList,
  ActivityIndicator,
  Pressable,
  Dimensions,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { StackScreenProps } from '@react-navigation/stack';
import { RootStackParamList } from '../navigation/types';
import { Colors } from '../constants/colors';
import { Space, Radius, Type, Typography } from '../theme/designTokens';
import { useAppTheme } from '../theme/ThemeContext';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { useToast } from '../context/ToastContext';
import { useStore } from '../store/useStore';
import {
  fetchPosterStoryArchive,
  fetchPosterHighlights,
  createPosterHighlight,
  updatePosterHighlight,
  deletePosterHighlight,
  addFrameToHighlight,
  removeFrameFromHighlight,
} from '../services/postersApi';
import type { PosterStory, PosterHighlight, PosterHighlightFrame } from '../services/postersApi';
import { CachedImage } from '../components/CachedImage';

type Props = StackScreenProps<RootStackParamList, 'PosterHighlightEditor'>;

const { width: SCREEN_W } = Dimensions.get('window');
const THUMB_W = (SCREEN_W - Space.md * 4) / 3;
const THUMB_H = THUMB_W * (16 / 9);

export default function PosterHighlightEditorScreen({ navigation, route }: Props) {
  const { isDark } = useAppTheme();
  const { show } = useToast();
  const currentUser = useStore((state) => state.currentUser);

  const highlightId = route.params?.highlightId;
  const isEditing = !!highlightId;

  const [title, setTitle] = useState('');
  const [stories, setStories] = useState<PosterStory[]>([]);
  const [selectedFrameIds, setSelectedFrameIds] = useState<Set<string>>(new Set());
  const [existingHighlight, setExistingHighlight] = useState<PosterHighlight | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const loadData = async () => {
      if (!currentUser) {
        setIsLoading(false);
        return;
      }
      try {
        const [archiveRes, highlightsRes] = await Promise.all([
          fetchPosterStoryArchive({ includeActive: true }),
          fetchPosterHighlights(currentUser.id),
        ]);
        setStories(archiveRes.items);

        if (highlightId) {
          const existing = highlightsRes.items.find((h) => h.id === highlightId);
          if (existing) {
            setExistingHighlight(existing);
            setTitle(existing.title);
            setSelectedFrameIds(new Set(existing.frames.map((f) => f.frameId)));
          }
        }
      } catch {
        show('Could not load data', 'error');
      } finally {
        setIsLoading(false);
      }
    };
    loadData();
  }, [currentUser, highlightId, show]);

  const allFrames = stories.flatMap((story) =>
    story.frames.map((frame) => ({
      frameId: frame.id,
      storyId: story.id,
      mediaUrl: frame.mediaUrl,
      mediaType: frame.mediaType,
      caption: frame.caption,
      backgroundColor: frame.backgroundColor,
      createdAt: story.createdAt,
    }))
  );

  const toggleFrame = (frameId: string) => {
    setSelectedFrameIds((prev) => {
      const next = new Set(prev);
      if (next.has(frameId)) next.delete(frameId);
      else next.add(frameId);
      return next;
    });
  };

  const handleSave = async () => {
    if (!title.trim()) {
      show('Enter a title for your highlight', 'error');
      return;
    }
    if (selectedFrameIds.size === 0) {
      show('Select at least one frame', 'error');
      return;
    }
    if (!currentUser) {
      show('Sign in to save', 'error');
      return;
    }

    setIsSaving(true);
    try {
      if (isEditing && existingHighlight) {
        await updatePosterHighlight(existingHighlight.id, {
          title: title.trim(),
          coverFrameId: Array.from(selectedFrameIds)[0],
        });

        const existingFrameIds = new Set(existingHighlight.frames.map((f) => f.frameId));
        const toAdd = Array.from(selectedFrameIds).filter((id) => !existingFrameIds.has(id));
        const toRemove = existingHighlight.frames
          .filter((f) => !selectedFrameIds.has(f.frameId))
          .map((f) => f.frameId);

        await Promise.all([
          ...toAdd.map((id) => addFrameToHighlight(existingHighlight.id, id)),
          ...toRemove.map((id) => removeFrameFromHighlight(existingHighlight.id, id)),
        ]);

        show('Highlight updated', 'success');
      } else {
        const newHighlightId = `highlight_${typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36)}`;
        await createPosterHighlight({
          id: newHighlightId,
          title: title.trim(),
          coverFrameId: Array.from(selectedFrameIds)[0],
          frameIds: Array.from(selectedFrameIds),
        });
        show('Highlight created', 'success');
      }
      navigation.goBack();
    } catch {
      show('Failed to save highlight', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = () => {
    if (!existingHighlight) return;
    Alert.alert(
      'Delete highlight?',
      'This will permanently remove this highlight.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deletePosterHighlight(existingHighlight.id);
              show('Highlight deleted', 'info');
              navigation.goBack();
            } catch {
              show('Failed to delete highlight', 'error');
            }
          },
        },
      ]
    );
  };

  const renderFrame = ({ item }: { item: typeof allFrames[0] }) => {
    const isSelected = selectedFrameIds.has(item.frameId);
    return (
      <Pressable
        onPress={() => toggleFrame(item.frameId)}
        style={[
          styles.frameThumb,
          isSelected && styles.frameThumbSelected,
        ]}
        accessibilityLabel={`Frame ${item.frameId}${isSelected ? ' (selected)' : ''}`}
        accessibilityRole="button"
      >
        {item.mediaUrl ? (
          <CachedImage
            uri={item.mediaUrl}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            containerStyle={{ borderRadius: Radius.md, overflow: 'hidden' }}
          />
        ) : (
          <View style={[styles.framePlaceholder, { backgroundColor: item.backgroundColor ?? Colors.surfaceAlt }]}>
            <Text style={styles.framePlaceholderText} numberOfLines={2}>{item.caption || 'Text'}</Text>
          </View>
        )}
        {isSelected && (
          <View style={styles.selectedOverlay}>
            <Ionicons name="checkmark-circle" size={24} color={Colors.brand} />
          </View>
        )}
      </Pressable>
    );
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
        <View style={styles.topBar}>
          <AnimatedPressable onPress={() => navigation.goBack()} style={styles.iconBtn} activeOpacity={0.7} scaleValue={0.9} hapticFeedback="light">
            <Ionicons name="close" size={26} color={Colors.textPrimary} />
          </AnimatedPressable>
          <Text style={styles.topTitle}>{isEditing ? 'Edit Highlight' : 'New Highlight'}</Text>
          <View style={styles.iconBtn} />
        </View>
        <View style={styles.loadingBody}>
          <ActivityIndicator size="large" color={Colors.brand} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

      <View style={styles.topBar}>
        <AnimatedPressable
          onPress={() => navigation.goBack()}
          style={styles.iconBtn}
          activeOpacity={0.7}
          scaleValue={0.9}
          hapticFeedback="light"
        >
          <Ionicons name="close" size={26} color={Colors.textPrimary} />
        </AnimatedPressable>
        <Text style={styles.topTitle}>{isEditing ? 'Edit Highlight' : 'New Highlight'}</Text>
        <AnimatedPressable
          onPress={handleSave}
          style={styles.iconBtn}
          activeOpacity={0.7}
          scaleValue={0.9}
          hapticFeedback="light"
          disabled={isSaving}
        >
          {isSaving ? (
            <ActivityIndicator size="small" color={Colors.brand} />
          ) : (
            <Text style={styles.saveText}>Save</Text>
          )}
        </AnimatedPressable>
      </View>

      <View style={styles.titleSection}>
        <TextInput
          style={styles.titleInput}
          placeholder="Highlight title..."
          placeholderTextColor={Colors.textMuted}
          value={title}
          onChangeText={setTitle}
          maxLength={50}
          accessibilityLabel="Highlight title"
        />
        <Text style={styles.titleCount}>{title.length}/50</Text>
      </View>

      <Text style={styles.sectionLabel}>
        Select frames ({selectedFrameIds.size} selected)
      </Text>

      <FlatList
        data={allFrames}
        keyExtractor={(item) => item.frameId}
        renderItem={renderFrame}
        numColumns={3}
        contentContainerStyle={styles.listContent}
        columnWrapperStyle={styles.columnWrapper}
        ListEmptyComponent={
          <View style={styles.emptyBody}>
            <Ionicons name="images-outline" size={40} color={Colors.textMuted} />
            <Text style={styles.emptyText}>No frames available</Text>
            <Text style={styles.emptySubtext}>Create poster stories first to build highlights</Text>
          </View>
        }
      />

      {isEditing && (
        <Pressable onPress={handleDelete} style={styles.deleteBtn}>
          <Ionicons name="trash-outline" size={18} color="#ff6b6b" />
          <Text style={styles.deleteBtnText}>Delete Highlight</Text>
        </Pressable>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Space.sm,
    paddingVertical: 10,
  },
  topTitle: {
    fontSize: Type.subtitle.size,
    fontFamily: Typography.family.bold,
    color: Colors.textPrimary,
    letterSpacing: Type.subtitle.letterSpacing,
  },
  iconBtn: {
    width: 44,
    height: 44,
    borderRadius: Radius.full,
    justifyContent: 'center',
    alignItems: 'center',
  },
  saveText: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.semibold,
    color: Colors.brand,
  },
  loadingBody: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  titleSection: {
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
    gap: 4,
  },
  titleInput: {
    fontSize: Type.subtitle.size,
    fontFamily: Typography.family.semibold,
    color: Colors.textPrimary,
    minHeight: 48,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    paddingHorizontal: Space.md,
    backgroundColor: Colors.surfaceAlt,
  },
  titleCount: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.regular,
    color: Colors.textMuted,
    textAlign: 'right',
  },
  sectionLabel: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.semibold,
    color: Colors.textSecondary,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
  },
  listContent: {
    paddingHorizontal: Space.md,
    paddingBottom: Space.xl,
  },
  columnWrapper: {
    gap: Space.sm,
    marginBottom: Space.sm,
  },
  frameThumb: {
    width: THUMB_W,
    height: THUMB_H,
    borderRadius: Radius.md,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  frameThumbSelected: {
    borderColor: Colors.brand,
  },
  framePlaceholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  framePlaceholderText: {
    color: '#fff',
    fontSize: 10,
    fontFamily: Typography.family.medium,
    textAlign: 'center',
  },
  selectedOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyBody: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: Space.xxl,
    gap: Space.sm,
  },
  emptyText: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.medium,
    color: Colors.textMuted,
  },
  emptySubtext: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.regular,
    color: Colors.textMuted,
    textAlign: 'center',
  },
  deleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space.sm,
    paddingVertical: Space.md,
    marginHorizontal: Space.md,
    marginBottom: Space.md,
    borderRadius: Radius.lg,
    backgroundColor: 'rgba(255, 107, 107, 0.1)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255, 107, 107, 0.3)',
  },
  deleteBtnText: {
    color: '#ff6b6b',
    fontSize: Type.body.size,
    fontFamily: Typography.family.semibold,
  },
});
