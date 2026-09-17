import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Pressable, ScrollView, TextInput, Switch, useWindowDimensions, Keyboard } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme/ThemeContext';
import { Space, IconGrammar } from '../../theme/designTokens';
import { useCreator } from '../studio/CreatorContext';
import { CreatorCanvas } from '../studio/CreatorCanvas';
import { AppDatePicker } from '../../components/primitives/AppDatePicker';
import { PressScale } from '../shared/CreatorAnimations';
import { useHaptic } from '../../hooks/useHaptic';
import { useConnectivity } from '../../hooks/useConnectivity';
import { KeyboardAwareScrollView, KeyboardStickyView } from '../../platform/keyboard/KeyboardProvider';
import { createPublishStyles as createStyles } from './CreatorPublishStyles';
export function PublishReview({
  document, onPublish, onSaveDraft, onOpenPreview,
}: {
  document: ReturnType<typeof useCreator>['document'];
  onPublish: () => void;
  onSaveDraft: () => Promise<void>;
  onOpenPreview?: () => void;
}) {
  const { updateMetadata } = useCreator();
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const haptic = useHaptic();
  const { isOffline } = useConnectivity();
  const { width } = useWindowDimensions();
  const captionRef = useRef<TextInput>(null);
  const [captionError, setCaptionError] = useState('');
  const [captionFocused, setCaptionFocused] = useState(false);
  const [footerHeight, setFooterHeight] = useState(112);
  const isMultiPage = document.pages.length > 1;
  const coverPageIndex = Math.min(document.metadata.coverPageIndex ?? 0, Math.max(0, document.pages.length - 1));
  const coverPage = document.pages[coverPageIndex];
  const ratio = document.canvas.aspectRatio;
  const previewWidth = Math.min(width - Space.md * 4, 240 * ratio);
  const previewHeight = previewWidth / ratio;
  const thumbWidth = 64;
  const thumbHeight = thumbWidth / ratio;
  const audience = document.metadata.visibility === 'public' ? 'public' : 'private';
  const captionRequired = document.type === 'poster';

  const validateCaption = useCallback(() => {
    const invalid = captionRequired && document.metadata.caption.trim().length === 0;
    setCaptionError(invalid ? 'Add a caption before sharing.' : '');
    return !invalid;
  }, [captionRequired, document.metadata.caption]);

  // ── Publish scheduling ────────────────────────────────────────────
  // `metadata.scheduledFor` is the contract: the workflow creates a
  // server-owned schedule row when set and publishes at that time.
  const scheduledFor = document.metadata.scheduledFor;
  const scheduledDate = useMemo(() => (scheduledFor ? new Date(scheduledFor) : null), [scheduledFor]);
  const isScheduled = scheduledDate != null;
  // Local draft while picking — committed to the document on a 400ms
  // debounce so wheel ticks don't produce a history entry per tick.
  const [scheduleDraft, setScheduleDraft] = useState<Date>(() => scheduledDate ?? new Date(Date.now() + 60 * 60 * 1000));
  const scheduleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (scheduleTimerRef.current) clearTimeout(scheduleTimerRef.current); }, []);

  const handleSchedulePick = useCallback((date: Date) => {
    setScheduleDraft(date);
    if (scheduleTimerRef.current) clearTimeout(scheduleTimerRef.current);
    scheduleTimerRef.current = setTimeout(() => {
      updateMetadata({ scheduledFor: date.toISOString() });
    }, 400);
  }, [updateMetadata]);

  const scheduleError = useMemo(() => {
    if (!scheduledDate) return '';
    return scheduledDate.getTime() <= Date.now() ? 'Pick a time in the future.' : '';
  }, [scheduledDate]);

  const formattedSchedule = useMemo(() => {
    if (!scheduledDate) return '';
    return scheduledDate.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  }, [scheduledDate]);

  const handlePublish = () => {
    if (!validateCaption()) {
      haptic.warning();
      captionRef.current?.focus();
      return;
    }
    if (scheduleError) {
      haptic.warning();
      return;
    }
    Keyboard.dismiss();
    onPublish();
  };

  return (
    <View style={styles.reviewBody}>
      <KeyboardAwareScrollView
        style={styles.scrollBody}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        bottomOffset={footerHeight + Space.md}
      >
        <View style={styles.previewSection}>
          <Pressable
            onPress={onOpenPreview}
            disabled={!onOpenPreview}
            style={({ pressed }) => [styles.coverPreview, { width: previewWidth, height: previewHeight, opacity: pressed ? 0.86 : 1 }]}
            accessibilityLabel={isMultiPage ? `Preview page ${coverPageIndex + 1} of ${document.pages.length}` : 'Preview composition'}
            accessibilityHint={onOpenPreview ? 'Opens the full-screen preview' : undefined}
            accessibilityRole={onOpenPreview ? 'button' : 'image'}
            accessibilityState={{ disabled: !onOpenPreview }}
          >
            {coverPage && <CreatorCanvas document={document} page={coverPage} canvasWidth={previewWidth} canvasHeight={previewHeight} mode="preview" />}
            {onOpenPreview && (
              <View style={styles.previewExpand}>
                <Ionicons name="expand-outline" size={20} color={colors.textPrimary} aria-hidden />
              </View>
            )}
          </Pressable>
          {isMultiPage && (
            <>
              <Text style={styles.previewHint}>Cover · Page {coverPageIndex + 1} of {document.pages.length}</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.coverContainer}>
                {document.pages.map((page, index) => (
                  <Pressable
                    key={page.id}
                    onPress={() => { haptic.selection(); updateMetadata({ coverPageIndex: index }); }}
                    style={({ pressed }) => [styles.coverThumbWrap, coverPageIndex === index && styles.coverThumbActive, { opacity: pressed ? 0.86 : 1 }]}
                    accessibilityLabel={`Use page ${index + 1} as cover`}
                    accessibilityHint="Sets this page as the cover"
                    accessibilityRole="button"
                    accessibilityState={{ selected: coverPageIndex === index }}
                  >
                    <CreatorCanvas document={document} page={page} canvasWidth={thumbWidth} canvasHeight={thumbHeight} mode="preview" />
                    {coverPageIndex === index && <View style={styles.coverBadge}><Ionicons name="checkmark" size={IconGrammar.badge} color={colors.textInverse} aria-hidden /></View>}
                  </Pressable>
                ))}
              </ScrollView>
            </>
          )}
        </View>

        <View style={styles.captionHeader}>
          <Text style={styles.sectionLabel}>Caption{captionRequired ? '' : ' (optional)'}</Text>
          <Text style={styles.captionCount} accessibilityLabel={`${document.metadata.caption.length} of 2200 characters`}
          accessibilityHint="Shows the caption character count">{document.metadata.caption.length}/2,200</Text>
        </View>
        <TextInput
          ref={captionRef}
          style={[styles.captionInput, captionFocused && { borderColor: colors.brand }, Boolean(captionError) && { borderColor: colors.danger }]}
          placeholder="Write a caption…"
          placeholderTextColor={colors.textMuted}
          value={document.metadata.caption}
          onChangeText={(caption) => {
            updateMetadata({ caption });
            if (captionError && caption.trim()) setCaptionError('');
          }}
          onFocus={() => setCaptionFocused(true)}
          onBlur={() => { setCaptionFocused(false); validateCaption(); }}
          multiline
          maxLength={2200}
          accessibilityLabel={captionRequired ? 'Caption, required' : 'Caption, optional'}
          accessibilityHint={captionError || 'Up to 2200 characters'}
        />
        {Boolean(captionError) && <Text style={styles.captionErrorText} accessibilityRole="alert" accessibilityLiveRegion="polite">{captionError}</Text>}

        <Text style={styles.sectionLabel}>Audience</Text>
        <View style={styles.audienceSegment} accessibilityRole="radiogroup" accessibilityLabel="Audience"
        accessibilityHint="Choose who can view this post">
          {(['public', 'private'] as const).map((option) => {
            const selected = audience === option;
            return (
              <Pressable
                key={option}
                onPress={() => { haptic.selection(); updateMetadata({ visibility: option }); }}
                style={({ pressed }) => [styles.audienceSegmentBtn, selected && styles.audienceSegmentBtnActive, { opacity: pressed ? 0.86 : 1 }]}
                accessibilityLabel={option === 'public' ? 'Public' : 'Private'}
                accessibilityHint="Sets the audience to this option"
                accessibilityRole="radio"
                accessibilityState={{ checked: selected }}
              >
                <Ionicons name={option === 'public' ? 'globe-outline' : 'lock-closed-outline'} size={20} color={selected ? colors.textInverse : colors.textSecondary} aria-hidden />
                <Text style={[styles.audienceSegmentText, selected && styles.audienceSegmentTextActive]}>{option === 'public' ? 'Public' : 'Private'}</Text>
              </Pressable>
            );
          })}
        </View>
        <Text style={styles.previewHint}>{audience === 'public' ? 'Visible to everyone.' : 'Only you can view this post.'}</Text>

        {document.type === 'poster' && (
          <View>
            <View style={styles.publishOptionRow}>
              <Text style={styles.publishOptionLabel}>Allow replies</Text>
              <Switch value={document.metadata.allowReplies} onValueChange={(allowReplies) => { haptic.selection(); updateMetadata({ allowReplies }); }} accessibilityLabel="Allow replies"
              accessibilityHint="Lets viewers reply to this post" trackColor={{ false: colors.border, true: colors.brand }} thumbColor={colors.surface} />
            </View>
            <View style={styles.publishOptionRow}>
              <Text style={styles.publishOptionLabel}>Allow reactions</Text>
              <Switch value={document.metadata.allowReactions} onValueChange={(allowReactions) => { haptic.selection(); updateMetadata({ allowReactions }); }} accessibilityLabel="Allow reactions" accessibilityHint="Lets viewers react to this post" trackColor={{ false: colors.border, true: colors.brand }} thumbColor={colors.surface} />
            </View>
          </View>
        )}

        {/* Publish time — "Now" or a scheduled slot. The schedule path is
            server-owned (worker publishes at dueAt); this control only sets
            `metadata.scheduledFor`, which the publish workflow reads. */}
        <Text style={styles.sectionLabel}>Publish time</Text>
        <View style={styles.audienceSegment} accessibilityRole="radiogroup" accessibilityLabel="Publish time"
        accessibilityHint="Choose when the post goes live">
          {(['now', 'later'] as const).map((option) => {
            const selected = (option === 'later') === isScheduled;
            return (
              <Pressable
                key={option}
                onPress={() => {
                  haptic.selection();
                  if (option === 'now') {
                    if (scheduleTimerRef.current) clearTimeout(scheduleTimerRef.current);
                    updateMetadata({ scheduledFor: undefined });
                  } else {
                    updateMetadata({ scheduledFor: scheduleDraft.toISOString() });
                  }
                }}
                style={({ pressed }) => [styles.audienceSegmentBtn, selected && styles.audienceSegmentBtnActive, { opacity: pressed ? 0.86 : 1 }]}
                accessibilityLabel={option === 'now' ? 'Share now' : 'Schedule for later'}
                accessibilityHint="Sets the publish timing"
                accessibilityRole="radio"
                accessibilityState={{ checked: selected }}
              >
                <Ionicons name={option === 'now' ? 'send-outline' : 'time-outline'} size={20} color={selected ? colors.textInverse : colors.textSecondary} aria-hidden />
                <Text style={[styles.audienceSegmentText, selected && styles.audienceSegmentTextActive]}>{option === 'now' ? 'Now' : 'Later'}</Text>
              </Pressable>
            );
          })}
        </View>
        {isScheduled && (
          <View>
            <AppDatePicker
              value={scheduleDraft}
              mode="datetime"
              minDate={new Date(Date.now() + 5 * 60 * 1000)}
              maxDate={new Date(Date.now() + 75 * 24 * 60 * 60 * 1000)}
              label="Publish at"
              onChange={handleSchedulePick}
            />
            {scheduleError ? (
              <Text style={styles.captionErrorText} accessibilityRole="alert">{scheduleError}</Text>
            ) : (
              <Text style={styles.previewHint}>Goes live {formattedSchedule}</Text>
            )}
          </View>
        )}
      </KeyboardAwareScrollView>

      <KeyboardStickyView>
        <View style={styles.stickyFooter} onLayout={(event) => setFooterHeight(event.nativeEvent.layout.height)}>
          {isOffline && <Text style={styles.offlineBannerText} accessibilityLiveRegion="polite">You're offline. Save a draft and share when you're connected.</Text>}
          <PressScale
            onPress={handlePublish}
            disabled={isOffline}
            style={[styles.publishBtn, isOffline ? styles.publishBtnDisabled : {}]}
            accessibilityLabel={isScheduled ? 'Schedule post' : 'Share'}
            accessibilityHint={isScheduled ? `Schedules the post for ${formattedSchedule}` : (audience === 'public' ? 'Publishes for everyone to view' : 'Publishes privately, visible only to you')}
            accessibilityState={{ disabled: isOffline }}
            scale={0.98}
          >
            <Text style={styles.publishBtnText}>{isScheduled ? 'Schedule' : 'Share'}</Text>
          </PressScale>
          <Pressable onPress={() => { Keyboard.dismiss(); void onSaveDraft(); }} style={({ pressed }) => [styles.draftBtn, { opacity: pressed ? 0.7 : 1 }]} accessibilityLabel="Save as draft" accessibilityHint="Saves without publishing" accessibilityRole="button">
            <Text style={styles.draftBtnText}>Save draft</Text>
          </Pressable>
        </View>
      </KeyboardStickyView>
    </View>
  );
}
