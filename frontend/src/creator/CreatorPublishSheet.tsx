import React from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { IconGrammar } from '../theme/designTokens';
import { SheetContainer, PressScale } from './CreatorAnimations';
import { useCreatorPublishWorkflow, REVIEW_STATE, type CreatorPublishSheetProps } from './useCreatorPublishWorkflow';
export type { CreatorPublishSheetProps } from './useCreatorPublishWorkflow';
import { PublishReview } from './publish/CreatorPublishReview';
import { SharingStateView, ErrorStateView, SuccessView, UnknownOutcomeView, ConflictStateView, ScheduleFailedView, ConfirmationView, formatScheduledDate } from './publish/CreatorPublishStates';

export function CreatorPublishSheet({ visible, onClose, editingLookId, onOpenPreview }: CreatorPublishSheetProps) {
  const { document, navigation, colors, haptic, reduceMotion, publishState, setPublishState, isCheckingResult, serverDocMetaRef, publishGuardRef, styles, stage, progressWidth, progressAnimatedStyle, uploadManager, handleClose, handlePublish, handleSaveDraftWithState, handleCancelUpload, handleRetry, handleSaveDraftFromError, handleCheckPublishResult, handleCheckSchedule, handleRetrySchedule, handleAcceptImmediate, errorMessage, publishedId, scheduleError } = useCreatorPublishWorkflow({ visible, onClose, editingLookId });
  if (!visible && stage === 'review') return null;
  return (
    <SheetContainer visible={visible} onClose={handleClose} maxHeight={0.85}>
        <View style={styles.header}>
          <Text style={styles.title}>Share</Text>
          <PressScale onPress={handleClose} style={styles.closeBtn} accessibilityLabel="Close share" accessibilityHint="Closes the share sheet" hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Ionicons name="close" size={IconGrammar.standard} color={colors.textPrimary} aria-hidden={true} />
          </PressScale>
        </View>

        {stage === 'review' && (
          <PublishReview document={document} onPublish={handlePublish} onSaveDraft={handleSaveDraftWithState} onOpenPreview={onOpenPreview} />
        )}

        {stage === 'saving' && (
          <View style={styles.centerState}>
            <ActivityIndicator size="small" color={colors.brand} />
            <Text style={styles.centerStateTitle}>Saving draft…</Text>
          </View>
        )}

        {(stage === 'uploading' || stage === 'processing' || stage === 'publishing') && (
          <SharingStateView
            colors={colors}
            stage={stage}
            progressAnimatedStyle={progressAnimatedStyle}
            progressWidth={progressWidth}
            onCancel={stage === 'uploading' ? handleCancelUpload : undefined}
            isConfirming={stage === 'uploading' && uploadManager.isConfirming}
            isStalled={stage === 'uploading' && uploadManager.isStalled}
          />
        )}

        {stage === 'success' && (
          <SuccessView
            colors={colors}
            reduceMotion={reduceMotion}
            onDone={() => {
              haptic.selection();
              onClose();
              setPublishState(REVIEW_STATE);
            }}
            onView={publishedId ? () => {
              haptic.selection();
              onClose();
              setPublishState(REVIEW_STATE);
              if (document.type === 'look') {
                navigation.replace('LookDetail', { lookId: publishedId });
              } else {
                navigation.replace('PosterViewer', { storyId: publishedId });
              }
            } : undefined}
          />
        )}

        {stage === 'scheduled' && (
          <ConfirmationView
            colors={colors}
            reduceMotion={reduceMotion}
            icon="time-outline"
            iconColor={colors.brand}
            title="Scheduled"
            body={publishState.tag === 'scheduled' && publishState.dueAt
              ? `${document.type === 'look' ? 'Your look will go live' : 'Your story will go live'}\n${formatScheduledDate(publishState.dueAt)}`
              : (document.type === 'look' ? 'Your look is scheduled' : 'Your story is scheduled')}
            primaryAction={{
              label: 'New',
              onPress: () => {
                haptic.selection();
                onClose();
                setPublishState(REVIEW_STATE);
                navigation.navigate('CreatorStudio', { type: document.type });
              },
              accessibilityLabel: 'Create new post',
              accessibilityHint: 'Starts a new creation in the studio',
            }}
            secondaryAction={{
              label: 'Done',
              onPress: () => {
                haptic.selection();
                onClose();
                setPublishState(REVIEW_STATE);
                navigation.navigate('CreatorStudio', { type: document.type });
              },
              accessibilityLabel: 'Back to studio',
              accessibilityHint: 'Returns to the creator studio',
            }}
          />
        )}

        {stage === 'error' && (
          <ErrorStateView
            colors={colors}
            reduceMotion={reduceMotion}
            errorMessage={errorMessage}
            onRetry={handleRetry}
            onSaveDraft={handleSaveDraftFromError}
            haptic={haptic}
          />
        )}

        {stage === 'unknown' && (
          <UnknownOutcomeView
            colors={colors}
            reduceMotion={reduceMotion}
            detail={errorMessage}
            isChecking={isCheckingResult}
            onCheck={handleCheckPublishResult}
          />
        )}

        {stage === 'scheduleUnknown' && (
          <UnknownOutcomeView
            colors={colors}
            reduceMotion={reduceMotion}
            detail={errorMessage}
            isChecking={isCheckingResult}
            onCheck={handleCheckSchedule}
            checkLabel="Check schedule"
          />
        )}

        {stage === 'conflict' && (
          <ConflictStateView
            colors={colors}
            reduceMotion={reduceMotion}
            errorMessage={errorMessage}
            onReload={() => {
              haptic.selection();
              serverDocMetaRef.current = null;
              setPublishState(REVIEW_STATE);
              progressWidth.value = 0;
              publishGuardRef.current.reset();
            }}
            onDuplicate={() => {
              haptic.selection();
              serverDocMetaRef.current = null;
              setPublishState(REVIEW_STATE);
              progressWidth.value = 0;
              publishGuardRef.current.reset();
            }}
          />
        )}

        {stage === 'scheduleFailed' && (
          <ScheduleFailedView
            colors={colors}
            reduceMotion={reduceMotion}
            scheduleError={scheduleError}
            onRetrySchedule={handleRetrySchedule}
            onAcceptImmediate={handleAcceptImmediate}
            onView={() => {
              haptic.selection();
              onClose();
              setPublishState(REVIEW_STATE);
              if (document.type === 'look') {
                navigation.replace('LookDetail', { lookId: publishedId });
              } else {
                navigation.replace('PosterViewer', { storyId: publishedId });
              }
            }}
          />
        )}
    </SheetContainer>
  );
}
