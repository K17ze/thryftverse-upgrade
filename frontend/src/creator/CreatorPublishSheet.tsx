import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  TextInput,
  Switch,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { Space, Radius, Type, Typography } from '../theme/designTokens';
import { Colors } from '../constants/colors';
import { useCreator } from './CreatorContext';
import { CreatorCanvas } from './CreatorCanvas';
import { createStableId } from '../utils/createStableId';
import { createLookOnApi } from '../services/looksApi';
import { createPosterStory } from '../services/postersApi';
import type { CreatorStoryCreateFrame } from './publishTypes';
import { CreatorAnalytics } from './creatorAnalytics';
import { uploadAllLocalMedia, hasLocalUris } from './mediaUploadPipeline';

export interface CreatorPublishSheetProps {
  visible: boolean;
  onClose: () => void;
}

export function CreatorPublishSheet({ visible, onClose }: CreatorPublishSheetProps) {
  const { document, saveDraft } = useCreator();
  const navigation = useNavigation<any>();
  const [stage, setStage] = useState<'review' | 'uploading' | 'publishing' | 'success' | 'error'>('review');
  const [errorMessage, setErrorMessage] = useState('');
  const [publishedId, setPublishedId] = useState('');
  const [uploadProgress, setUploadProgress] = useState('');

  const handleClose = useCallback(() => {
    if (stage === 'publishing' || stage === 'uploading') return;
    setStage('review');
    setErrorMessage('');
    onClose();
  }, [stage, onClose]);

  const handlePublish = useCallback(async () => {
    CreatorAnalytics.publishStart(document.type);
    try {
      let workingDoc = document;

      // Upload all local media URIs before publishing
      if (hasLocalUris(document)) {
        setStage('uploading');
        workingDoc = await uploadAllLocalMedia(document, (progress) => {
          if (progress.total > 0) {
            setUploadProgress(`Uploading media ${progress.completed + 1} of ${progress.total}`);
          }
        });
      }

      setStage('publishing');
      setUploadProgress('');

      if (workingDoc.type === 'look') {
        const mediaLayer = workingDoc.pages[0].layers.find((l) => l.type === 'media');
        if (!mediaLayer || mediaLayer.type !== 'media') {
          throw new Error('No media found in document');
        }
        const tags = workingDoc.pages[0].layers
          .filter((l) => l.type === 'product')
          .map((l) => ({
            id: l.id,
            listingId: l.type === 'product' ? l.payload.listingId : undefined,
            label: l.type === 'product' ? l.payload.snapshotTitle : '',
            x: l.x,
            y: l.y,
          }));

        const result = await createLookOnApi({
          id: createStableId('look'),
          title: workingDoc.metadata.title || 'Untitled Look',
          caption: workingDoc.metadata.caption,
          mediaUrl: mediaLayer.payload.mediaUri,
          visibility: workingDoc.metadata.visibility,
          tags,
          status: 'published',
        });
        setPublishedId(result.lookId);
        setStage('success');
        CreatorAnalytics.publishSuccess('look', result.lookId);
      } else {
        const frames: CreatorStoryCreateFrame[] = workingDoc.pages.map((page, i) => ({
          id: page.id,
          mediaType: page.layers.find((l) => l.type === 'media')?.type === 'media'
            ? (page.layers.find((l) => l.type === 'media') as any).payload.mediaType
            : 'text',
          mediaUrl: page.layers.find((l) => l.type === 'media')?.type === 'media'
            ? (page.layers.find((l) => l.type === 'media') as any).payload.mediaUri
            : undefined,
          caption: page.layers.find((l) => l.type === 'text')?.type === 'text'
            ? (page.layers.find((l) => l.type === 'text') as any).payload.text
            : '',
          durationMs: page.durationMs ?? 5000,
          sortOrder: i,
          stickers: page.layers
            .filter((l) => l.type !== 'media' && !(l.type === 'text' && l.id.startsWith('caption_')))
            .map((l, si) => ({
              id: l.id,
              type: mapLayerTypeToStickerType(l.type),
              x: l.x,
              y: l.y,
              scale: l.scale,
              rotation: l.rotation,
              payload: extractPayload(l),
              sortOrder: si,
            })),
        }));

        const result = await createPosterStory({
          id: createStableId('story'),
          audience: workingDoc.metadata.visibility,
          allowReplies: workingDoc.metadata.allowReplies,
          allowReactions: workingDoc.metadata.allowReactions,
          expiresInHours: workingDoc.metadata.expiresInHours ?? 24,
          frames,
        });
        setPublishedId(result.storyId);
        setStage('success');
        CreatorAnalytics.publishSuccess('poster', result.storyId);
      }
    } catch (err: any) {
      setErrorMessage(err?.message ?? 'Publishing failed');
      setStage('error');
      CreatorAnalytics.publishError(document.type, err?.message ?? 'Unknown error');
    }
  }, [document]);

  if (!visible) return null;

  return (
    <View style={styles.overlay}>
      <Pressable style={styles.backdrop} onPress={handleClose} />
      <View style={styles.sheet}>
        <View style={styles.handle} />
        <View style={styles.header}>
          <Text style={styles.title}>Publish</Text>
          <Pressable onPress={handleClose} style={styles.closeBtn} disabled={stage === 'publishing'} accessibilityLabel="Close publish" accessibilityRole="button">
            <Ionicons name="close" size={20} color={Colors.textSecondary} />
          </Pressable>
        </View>

        {stage === 'review' && (
          <PublishReview document={document} onPublish={handlePublish} onSaveDraft={saveDraft} />
        )}

        {stage === 'uploading' && (
          <View style={styles.centerState}>
            <ActivityIndicator size="large" color={Colors.brand} />
            <Text style={styles.centerStateText}>{uploadProgress || 'Uploading media...'}</Text>
          </View>
        )}

        {stage === 'publishing' && (
          <View style={styles.centerState}>
            <ActivityIndicator size="large" color={Colors.brand} />
            <Text style={styles.centerStateText}>Publishing...</Text>
          </View>
        )}

        {stage === 'success' && (
          <View style={styles.centerState}>
            <Ionicons name="checkmark-circle" size={48} color="#4cd964" />
            <Text style={styles.centerStateTitle}>Published!</Text>
            <Text style={styles.centerStateText}>Your {document.type} is now live.</Text>
            <Pressable
              onPress={() => {
                onClose();
                setStage('review');
                if (document.type === 'look') {
                  navigation.replace('LookDetail', { lookId: publishedId });
                } else {
                  navigation.replace('PosterViewer', { storyId: publishedId });
                }
              }}
              style={styles.retryBtn}
              accessibilityLabel="View published content"
              accessibilityRole="button"
            >
              <Text style={styles.retryBtnText}>View</Text>
            </Pressable>
          </View>
        )}

        {stage === 'error' && (
          <View style={styles.centerState}>
            <Ionicons name="warning" size={48} color="#ff6b6b" />
            <Text style={styles.centerStateTitle}>Publishing failed</Text>
            <Text style={styles.centerStateText}>{errorMessage}</Text>
            <Pressable onPress={() => setStage('review')} style={styles.retryBtn}>
              <Text style={styles.retryBtnText}>Try again</Text>
            </Pressable>
          </View>
        )}
      </View>
    </View>
  );
}

function PublishReview({
  document,
  onPublish,
  onSaveDraft,
}: {
  document: ReturnType<typeof useCreator>['document'];
  onPublish: () => void;
  onSaveDraft: () => Promise<void>;
}) {
  const { updateMetadata } = useCreator();
  const canvasWidth = 280;
  const canvasHeight = Math.floor(canvasWidth / document.canvas.aspectRatio);

  return (
    <ScrollView style={styles.scrollBody} contentContainerStyle={styles.scrollContent}>
      {/* Preview — all pages */}
      {document.pages.length > 1 && (
        <Text style={styles.sectionLabel}>Preview ({document.pages.length} pages)</Text>
      )}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.previewScroll}
        contentContainerStyle={styles.previewContainer}
      >
        {document.pages.map((page) => (
          <View key={page.id} style={styles.previewPageWrapper}>
            <CreatorCanvas
              document={document}
              page={page}
              canvasWidth={canvasWidth}
              canvasHeight={canvasHeight}
              mode="preview"
            />
          </View>
        ))}
      </ScrollView>

      {/* Caption */}
      <Text style={styles.sectionLabel}>Caption</Text>
      <TextInput
        style={styles.textInput}
        placeholder="Write a caption..."
        placeholderTextColor={Colors.textMuted}
        value={document.metadata.caption}
        onChangeText={(v) => updateMetadata({ caption: v })}
        multiline
        maxLength={500}
        accessibilityLabel="Caption"
      />

      {/* Visibility */}
      <Text style={styles.sectionLabel}>Visibility</Text>
      <View style={styles.toggleRow}>
        <Text style={styles.toggleLabel}>Public</Text>
        <Switch
          value={document.metadata.visibility === 'public'}
          onValueChange={(v) => updateMetadata({ visibility: v ? 'public' : 'private' })}
          trackColor={{ false: Colors.surfaceAlt, true: `${Colors.brand}40` }}
          thumbColor={document.metadata.visibility === 'public' ? Colors.brand : Colors.textMuted}
        />
      </View>

      {/* Poster-specific */}
      {document.type === 'poster' && (
        <>
          <View style={styles.toggleRow}>
            <Text style={styles.toggleLabel}>Allow replies</Text>
            <Switch
              value={document.metadata.allowReplies}
              onValueChange={(v) => updateMetadata({ allowReplies: v })}
              trackColor={{ false: Colors.surfaceAlt, true: `${Colors.brand}40` }}
              thumbColor={document.metadata.allowReplies ? Colors.brand : Colors.textMuted}
            />
          </View>
          <View style={styles.toggleRow}>
            <Text style={styles.toggleLabel}>Allow reactions</Text>
            <Switch
              value={document.metadata.allowReactions}
              onValueChange={(v) => updateMetadata({ allowReactions: v })}
              trackColor={{ false: Colors.surfaceAlt, true: `${Colors.brand}40` }}
              thumbColor={document.metadata.allowReactions ? Colors.brand : Colors.textMuted}
            />
          </View>
        </>
      )}

      {/* Actions */}
      <View style={styles.actionRow}>
        <Pressable onPress={onSaveDraft} style={styles.draftBtn} accessibilityLabel="Save as draft" accessibilityRole="button">
          <Ionicons name="save-outline" size={18} color={Colors.textSecondary} />
          <Text style={styles.draftBtnText}>Save draft</Text>
        </Pressable>
        <Pressable onPress={onPublish} style={styles.publishBtn} accessibilityLabel="Publish now" accessibilityRole="button">
          <Text style={styles.publishBtnText}>Publish now</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

function mapLayerTypeToStickerType(type: string): 'text' | 'mention' | 'listing' | 'look' | 'style_vote' {
  switch (type) {
    case 'text': return 'text';
    case 'mention': return 'mention';
    case 'product': return 'listing';
    case 'look': return 'look';
    case 'vote': return 'style_vote';
    default: return 'text';
  }
}

function extractPayload(layer: any): Record<string, unknown> {
  return layer.payload as Record<string, unknown>;
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFill,
    zIndex: 1000,
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    maxHeight: '85%',
    backgroundColor: Colors.surface,
    borderTopLeftRadius: Radius.lg,
    borderTopRightRadius: Radius.lg,
    overflow: 'hidden',
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.border,
    alignSelf: 'center',
    marginTop: Space.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
  },
  title: {
    fontFamily: Typography.family.semibold,
    fontSize: Type.title.size,
    color: Colors.textPrimary,
  },
  closeBtn: {
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: Radius.sm,
  },
  scrollBody: {
    paddingHorizontal: Space.md,
  },
  scrollContent: {
    paddingBottom: Space.xl,
    gap: Space.sm,
  },
  previewContainer: {
    alignItems: 'center',
    paddingVertical: Space.sm,
    gap: Space.md,
  },
  previewScroll: {
    marginHorizontal: -Space.md,
  },
  previewPageWrapper: {
    marginHorizontal: Space.md,
  },
  sectionLabel: {
    fontFamily: Typography.family.semibold,
    fontSize: Type.caption.size,
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  textInput: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
    fontSize: Type.body.size,
    color: Colors.textPrimary,
    minHeight: 60,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  toggleLabel: {
    fontFamily: Typography.family.medium,
    fontSize: Type.body.size,
    color: Colors.textPrimary,
  },
  actionRow: {
    flexDirection: 'row',
    gap: Space.sm,
    marginTop: Space.md,
  },
  draftBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: Space.md,
    height: 44,
    borderRadius: Radius.md,
    backgroundColor: Colors.surfaceAlt,
  },
  draftBtnText: {
    fontFamily: Typography.family.medium,
    fontSize: Type.body.size,
    color: Colors.textSecondary,
  },
  publishBtn: {
    flex: 1,
    height: 44,
    borderRadius: Radius.md,
    backgroundColor: Colors.brand,
    justifyContent: 'center',
    alignItems: 'center',
  },
  publishBtnText: {
    color: '#fff',
    fontFamily: Typography.family.semibold,
    fontSize: Type.body.size,
  },
  centerState: {
    alignItems: 'center',
    paddingVertical: Space.xl,
    gap: Space.sm,
  },
  centerStateTitle: {
    fontFamily: Typography.family.semibold,
    fontSize: Type.title.size,
    color: Colors.textPrimary,
  },
  centerStateText: {
    fontFamily: Typography.family.regular,
    fontSize: Type.body.size,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  retryBtn: {
    paddingHorizontal: Space.md + 4,
    height: 40,
    borderRadius: Radius.md,
    backgroundColor: Colors.brand,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: Space.sm,
  },
  retryBtnText: {
    color: '#fff',
    fontFamily: Typography.family.semibold,
    fontSize: Type.body.size,
  },
});
