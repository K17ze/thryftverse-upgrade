import React, { useState, useCallback, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  TextInput,
  Switch,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { Space, Radius, Type, Typography } from '../theme/designTokens';
import { useAppTheme } from '../theme/ThemeContext';
import { useCreator } from './CreatorContext';
import { CreatorCanvas } from './CreatorCanvas';
import { SheetContainer, PressScale } from './CreatorAnimations';
import { createLookOnApi } from '../services/looksApi';
import { createPosterStory } from '../services/postersApi';
import { CreatorAnalytics } from './creatorAnalytics';
import { uploadAllLocalMedia, hasLocalUris } from './mediaUploadPipeline';
import {
  validateForPublish,
  serialiseToLookPayload,
  serialiseToPosterPayload,
  PublishGuard,
} from './compositionContract';

export interface CreatorPublishSheetProps {
  visible: boolean;
  onClose: () => void;
}

export function CreatorPublishSheet({ visible, onClose }: CreatorPublishSheetProps) {
  const { document, saveDraft } = useCreator();
  const navigation = useNavigation<any>();
  const { colors } = useAppTheme();
  const [stage, setStage] = useState<'review' | 'uploading' | 'publishing' | 'success' | 'error'>('review');
  const [errorMessage, setErrorMessage] = useState('');
  const [publishedId, setPublishedId] = useState('');
  const [uploadProgress, setUploadProgress] = useState('');
  const publishGuardRef = useRef(new PublishGuard());
  const styles = useMemo(() => createStyles(colors), [colors]);

  const handleClose = useCallback(() => {
    if (stage === 'publishing' || stage === 'uploading') return;
    setStage('review');
    setErrorMessage('');
    setUploadProgress('');
    publishGuardRef.current.reset();
    onClose();
  }, [stage, onClose]);

  const handlePublish = useCallback(async () => {
    // Prevent duplicate submissions
    if (!publishGuardRef.current.begin(document.id)) {
      return;
    }

    CreatorAnalytics.publishStart(document.type);
    try {
      // 1. Validate the document before any upload
      const validation = validateForPublish(document);
      if (!validation.valid) {
        throw new Error(validation.errors.join('; '));
      }

      let workingDoc = document;

      // 2. Upload all local media URIs before publishing
      if (hasLocalUris(document)) {
        setStage('uploading');
        workingDoc = await uploadAllLocalMedia(document, (progress) => {
          if (progress.total > 0) {
            setUploadProgress(`Uploading media ${progress.completed + 1} of ${progress.total}`);
          }
        });
      }

      // 3. Re-validate after upload to ensure no local URIs remain
      const postUploadValidation = validateForPublish(workingDoc);
      if (!postUploadValidation.valid) {
        throw new Error(postUploadValidation.errors.join('; '));
      }

      setStage('publishing');
      setUploadProgress('');

      if (workingDoc.type === 'look') {
        // 4. Serialise to canonical look payload
        const { payload } = serialiseToLookPayload(workingDoc);

        // 5. Send real publish request
        const result = await createLookOnApi(payload);

        // 6. Confirm server success
        publishGuardRef.current.complete(workingDoc.id);
        setPublishedId(result.lookId);
        setStage('success');
        CreatorAnalytics.publishSuccess('look', result.lookId);
      } else {
        // 4. Serialise to canonical poster payload
        const { payload } = serialiseToPosterPayload(workingDoc);

        // 5. Send real publish request
        const result = await createPosterStory(payload);

        // 6. Confirm server success
        publishGuardRef.current.complete(workingDoc.id);
        setPublishedId(result.storyId);
        setStage('success');
        CreatorAnalytics.publishSuccess('poster', result.storyId);
      }
    } catch (err: any) {
      publishGuardRef.current.fail();
      setErrorMessage(err?.message ?? 'Publishing failed');
      setStage('error');
      CreatorAnalytics.publishError(document.type, err?.message ?? 'Unknown error');
    }
  }, [document]);

  if (!visible && stage === 'review') return null;

  return (
    <SheetContainer visible={visible} onClose={handleClose} maxHeight={0.85}>
        <View style={styles.header}>
          <Text style={styles.title}>Publish</Text>
          <PressScale onPress={handleClose} style={styles.closeBtn} accessibilityLabel="Close publish">
            <Ionicons name="close" size={22} color={colors.textSecondary} />
          </PressScale>
        </View>

        {stage === 'review' && (
          <PublishReview document={document} onPublish={handlePublish} onSaveDraft={saveDraft} />
        )}

        {stage === 'uploading' && (
          <View style={styles.centerState}>
            <ActivityIndicator size="large" color={colors.brand} />
            <Text style={styles.centerStateText}>{uploadProgress || 'Uploading media...'}</Text>
          </View>
        )}

        {stage === 'publishing' && (
          <View style={styles.centerState}>
            <ActivityIndicator size="large" color={colors.brand} />
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
            <Ionicons name="warning" size={48} color={colors.danger} />
            <Text style={styles.centerStateTitle}>Publishing failed</Text>
            <Text style={styles.centerStateText}>{errorMessage}</Text>
            <Pressable onPress={() => setStage('review')} style={styles.retryBtn}>
              <Text style={styles.retryBtnText}>Try again</Text>
            </Pressable>
          </View>
        )}
    </SheetContainer>
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
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
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
        placeholderTextColor={colors.textMuted}
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
          trackColor={{ false: colors.surfaceAlt, true: `${colors.brand}40` }}
          thumbColor={document.metadata.visibility === 'public' ? colors.brand : colors.textMuted}
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
              trackColor={{ false: colors.surfaceAlt, true: `${colors.brand}40` }}
              thumbColor={document.metadata.allowReplies ? colors.brand : colors.textMuted}
            />
          </View>
          <View style={styles.toggleRow}>
            <Text style={styles.toggleLabel}>Allow reactions</Text>
            <Switch
              value={document.metadata.allowReactions}
              onValueChange={(v) => updateMetadata({ allowReactions: v })}
              trackColor={{ false: colors.surfaceAlt, true: `${colors.brand}40` }}
              thumbColor={document.metadata.allowReactions ? colors.brand : colors.textMuted}
            />
          </View>
        </>
      )}

      {/* Actions */}
      <View style={styles.actionRow}>
        <Pressable onPress={onSaveDraft} style={styles.draftBtn} accessibilityLabel="Save as draft" accessibilityRole="button">
          <Ionicons name="save-outline" size={18} color={colors.textSecondary} />
          <Text style={styles.draftBtnText}>Save draft</Text>
        </Pressable>
        <Pressable onPress={onPublish} style={styles.publishBtn} accessibilityLabel="Publish now" accessibilityRole="button">
          <Text style={styles.publishBtnText}>Publish now</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

type ThemeColors = ReturnType<typeof useAppTheme>['colors'];

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: Space.md,
      paddingVertical: Space.sm,
    },
    title: {
      fontFamily: Typography.family.semibold,
      fontSize: Type.subtitle.size,
      color: colors.textPrimary,
    },
    closeBtn: {
      width: 44,
      height: 44,
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
      color: colors.textSecondary,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    textInput: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: Radius.md,
      paddingHorizontal: Space.md,
      paddingVertical: Space.sm,
      fontSize: Type.body.size,
      color: colors.textPrimary,
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
      color: colors.textPrimary,
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
      backgroundColor: colors.surfaceAlt,
    },
    draftBtnText: {
      fontFamily: Typography.family.medium,
      fontSize: Type.body.size,
      color: colors.textSecondary,
    },
    publishBtn: {
      flex: 1,
      height: 44,
      borderRadius: Radius.md,
      backgroundColor: colors.brand,
      justifyContent: 'center',
      alignItems: 'center',
    },
    publishBtnText: {
      color: colors.textInverse,
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
      color: colors.textPrimary,
    },
    centerStateText: {
      fontFamily: Typography.family.regular,
      fontSize: Type.body.size,
      color: colors.textSecondary,
      textAlign: 'center',
    },
    retryBtn: {
      paddingHorizontal: Space.md + 4,
      height: 40,
      borderRadius: Radius.md,
      backgroundColor: colors.brand,
      justifyContent: 'center',
      alignItems: 'center',
      marginTop: Space.sm,
    },
    retryBtnText: {
      color: colors.textInverse,
      fontFamily: Typography.family.semibold,
      fontSize: Type.body.size,
    },
  });
}
