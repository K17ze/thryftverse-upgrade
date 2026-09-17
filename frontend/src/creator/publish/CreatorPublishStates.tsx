import React, { useMemo, useEffect } from 'react';
import { View, Text, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Reanimated, { useSharedValue, useAnimatedStyle, withSpring, withTiming, type SharedValue } from 'react-native-reanimated';
import { IconGrammar } from '../../theme/designTokens';
import type { ThemeColors } from '../../theme/ThemeContext';
import { PressScale } from '../shared/CreatorAnimations';
import type { useHaptic } from '../../hooks/useHaptic';
import { Motion } from '../../theme/motionTokens';
import { createPublishStyles as createStyles } from './CreatorPublishStyles';

function humanizePublishError(error: string): string {
  if (!error || /\b[45]\d{2}\b/.test(error) || /error[: ]|exception|abort|failed to fetch|network request failed/i.test(error)) {
    return 'Something went wrong. Try again.';
  }
  return error;
}
interface SharingStateViewProps {
  colors: ThemeColors;
  stage: 'uploading' | 'processing' | 'publishing';
  progressAnimatedStyle: ReturnType<typeof useAnimatedStyle>;
  progressWidth: SharedValue<number>;
  onCancel?: () => void;
  /** True when uploads are in the server-confirmation phase (bytes done, awaiting DB row + moderation). */
  isConfirming?: boolean;
  /** True when an upload has stalled (no progress for an extended period). */
  isStalled?: boolean;
  /** True when the queue is parked because there is no usable connection. */
  isOffline?: boolean;
  /** Rolling ETA in seconds — shown only while a real rate is known. */
  etaSeconds?: number;
}

export function SharingStateView({
  colors,
  stage,
  progressAnimatedStyle,
  progressWidth,
  onCancel,
  isConfirming,
  isStalled,
  isOffline,
  etaSeconds }: SharingStateViewProps) {
  const localStyles = useMemo(() => createStyles(colors), [colors]);
  const showCancel = stage === 'uploading' && !!onCancel;
  const percentLabel = useMemo(() => {
    const pct = Math.round(progressWidth.value * 100);
    return `${Math.min(100, Math.max(0, pct))}%`;
  }, [progressWidth.value]);

  // Truthful phase label — distinguishes "bytes transferring" from
  // "server confirming" from "stalled". Never shows 100% until the
  // server has confirmed the DB row + moderation (AGENTS.md §11).
  const phaseLabel = useMemo(() => {
    if (stage !== 'uploading') return 'Sharing…';
    // Parked queue (no route or captive portal) takes precedence over a
    // stall — the bytes aren't moving because nothing can leave the device.
    if (isOffline) return 'Waiting for connection…';
    if (isStalled) return 'Taking longer than usual…';
    if (isConfirming) return 'Confirming…';
    return `Uploading… ${percentLabel}`;
  }, [stage, isOffline, isStalled, isConfirming, percentLabel]);

  // Time-remaining sublabel — only while a measured rate exists, so it
  // never appears fabricated during confirmation or stalls.
  const etaLabel = useMemo(() => {
    if (stage !== 'uploading' || isOffline || isStalled || isConfirming || etaSeconds === undefined) return null;
    if (etaSeconds < 5) return 'A few seconds left';
    if (etaSeconds < 60) return `About ${etaSeconds}s left`;
    const minutes = Math.ceil(etaSeconds / 60);
    return `About ${minutes} min left`;
  }, [stage, isOffline, isStalled, isConfirming, etaSeconds]);

  return (
    <View style={localStyles.progressState}>
      <View style={localStyles.progressBarTrack} accessibilityRole="progressbar">
        <Reanimated.View style={[localStyles.progressBarFill, progressAnimatedStyle]} />
      </View>
      <Text style={localStyles.progressLabel}>
        {phaseLabel}
      </Text>
      {etaLabel && (
        <Text style={localStyles.progressSubLabel}>
          {etaLabel}
        </Text>
      )}
      {showCancel && (
        <Pressable
          onPress={onCancel}
          style={localStyles.cancelUploadBtn}
          accessibilityLabel="Cancel upload"
          accessibilityHint="Cancels the in-progress upload and returns to review"
          accessibilityRole="button"
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Text style={localStyles.cancelUploadText}>Cancel</Text>
        </Pressable>
      )}
    </View>
  );
}

// ── Error State View with spring entrance and retry ────────────────
interface ErrorStateViewProps {
  colors: ThemeColors;
  reduceMotion: boolean;
  errorMessage: string;
  onRetry: () => void;
  onSaveDraft: () => void;
  haptic: ReturnType<typeof useHaptic>;
}

export function ErrorStateView({
  colors,
  reduceMotion,
  errorMessage,
  onRetry,
  onSaveDraft }: ErrorStateViewProps) {
  const localStyles = useMemo(() => createStyles(colors), [colors]);
  const opacity = useSharedValue(0);

  useEffect(() => {
    if (reduceMotion) {
      opacity.value = 1;
    } else {
      opacity.value = withTiming(1, { duration: Motion.duration.normal, easing: Motion.easing.entrance });
    }
  }, [reduceMotion, opacity]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value }));

  return (
    <Reanimated.View style={[localStyles.centerState, animatedStyle]}>
      <Ionicons name="alert-circle-outline" size={24} color={colors.danger} aria-hidden={true} />
      <Text style={localStyles.errorTitle}>Couldn't publish</Text>
      <Text style={localStyles.errorDetail}>{humanizePublishError(errorMessage)}</Text>
      <PressScale
        onPress={onRetry}
        style={localStyles.retryBtn}
        accessibilityLabel="Retry publish"
        accessibilityHint="Retries the failed publish attempt"
        scale={0.95}
        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
      >
        <Text style={localStyles.retryBtnText}>Retry</Text>
      </PressScale>
      <Pressable
        onPress={onSaveDraft}
        style={localStyles.saveDraftLink}
        accessibilityLabel="Save as draft"
        accessibilityHint="Saves the current creation as a draft and closes the sheet"
        accessibilityRole="button"
        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
      >
        <Text style={localStyles.saveDraftLinkText}>Save as draft</Text>
      </Pressable>
    </Reanimated.View>
  );
}

// ── Success state — minimal and confident ──────────────────────────
// A checkmark inside a 72pt success-tinted circle with a spring scale
// entrance, "Shared" in 17pt semibold, and one full-width "Done" button.
interface SuccessViewProps {
  colors: ThemeColors;
  reduceMotion: boolean;
  onDone: () => void;
  onView?: () => void;
  /** Opens the system share sheet for the published post (share-out). */
  onShare?: () => void;
}

export function SuccessView({
  colors,
  reduceMotion,
  onDone,
  onView,
  onShare }: SuccessViewProps) {
  const localStyles = useMemo(() => createStyles(colors), [colors]);
  const contentOpacity = useSharedValue(reduceMotion ? 1 : 0);
  const iconScale = useSharedValue(reduceMotion ? 1 : 0.7);

  useEffect(() => {
    contentOpacity.value = reduceMotion
      ? 1
      : withTiming(1, { duration: Motion.duration.normal, easing: Motion.easing.entrance });
    iconScale.value = reduceMotion
      ? 1
      : withSpring(1, Motion.spring.settle);
  }, [reduceMotion, contentOpacity, iconScale]);

  const contentStyle = useAnimatedStyle(() => ({ opacity: contentOpacity.value }));
  const iconStyle = useAnimatedStyle(() => ({ transform: [{ scale: iconScale.value }] }));

  return (
    <Reanimated.View style={[localStyles.centerState, contentStyle]}>
      <Reanimated.View style={[localStyles.successCircle, iconStyle]}>
        <Ionicons name="checkmark" size={IconGrammar.hero} color={colors.success} aria-hidden={true} />
      </Reanimated.View>
      <Text style={localStyles.successTitle}>Shared</Text>
      <PressScale
        onPress={onDone}
        style={localStyles.doneBtn}
        accessibilityLabel="Done"
        accessibilityHint="Closes the publish sheet"
        scale={0.97}
        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
      >
        <Text style={localStyles.doneBtnText}>Done</Text>
      </PressScale>
      <View style={localStyles.successLinks}>
        {onView && (
          <Pressable
            onPress={onView}
            style={localStyles.viewLink}
            accessibilityRole="button"
            accessibilityLabel="View post"
            accessibilityHint="Opens the published content"
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Text style={localStyles.viewLinkText}>View</Text>
          </Pressable>
        )}
        {onShare && (
          <Pressable
            onPress={onShare}
            style={localStyles.viewLink}
            accessibilityRole="button"
            accessibilityLabel="Share post"
            accessibilityHint="Opens the system share sheet for this post"
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Text style={localStyles.viewLinkText}>Share</Text>
          </Pressable>
        )}
      </View>
    </Reanimated.View>
  );
}

interface UnknownOutcomeViewProps {
  colors: ThemeColors;
  reduceMotion: boolean;
  detail: string;
  isChecking: boolean;
  onCheck: () => void;
  /** Label for the check button (e.g. "Check publication" or "Check schedule"). */
  checkLabel?: string;
}

export function UnknownOutcomeView({
  colors,
  reduceMotion,
  detail,
  isChecking,
  onCheck,
  checkLabel = 'Check publication' }: UnknownOutcomeViewProps) {
  const localStyles = useMemo(() => createStyles(colors), [colors]);
  const opacity = useSharedValue(0);

  useEffect(() => {
    opacity.value = reduceMotion
      ? 1
      : withTiming(1, { duration: Motion.duration.normal, easing: Motion.easing.entrance });
  }, [opacity, reduceMotion]);

  const animatedStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <Reanimated.View
      style={[localStyles.centerState, animatedStyle]}
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
    >
      <View style={localStyles.unknownCircle}>
        <Ionicons name="help" size={IconGrammar.hero} color={colors.warning} aria-hidden={true} />
      </View>
      <Text style={localStyles.centerStateTitle}>Result unknown</Text>
      <Text style={localStyles.centerStateText}>
        Connection lost. Your post may be live.
      </Text>
      {detail ? <Text style={localStyles.unknownDetail}>{detail}</Text> : null}
      <PressScale
        onPress={onCheck}
        disabled={isChecking}
        style={isChecking
          ? [localStyles.retryBtn, localStyles.publishBtnDisabled]
          : localStyles.retryBtn}
        accessibilityLabel={isChecking ? 'Checking…' : checkLabel}
        accessibilityHint="Checks the server before attempting another action"
        accessibilityState={{ disabled: isChecking, busy: isChecking }}
        scale={0.97}
        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
      >
        <Ionicons name="refresh-outline" size={IconGrammar.metadata} color={colors.textInverse} style={{ marginRight: 6 }} aria-hidden={true} />
        <Text style={localStyles.retryBtnText}>{isChecking ? 'Checking…' : checkLabel}</Text>
      </PressScale>
    </Reanimated.View>
  );
}

// ── Conflict state — document was edited on another device ──────────
interface ConflictStateViewProps {
  colors: ThemeColors;
  reduceMotion: boolean;
  errorMessage: string;
  onReload: () => void;
  onDuplicate: () => void;
}

export function ConflictStateView({
  colors,
  reduceMotion,
  errorMessage,
  onReload,
  onDuplicate }: ConflictStateViewProps) {
  const localStyles = useMemo(() => createStyles(colors), [colors]);
  const opacity = useSharedValue(0);

  useEffect(() => {
    opacity.value = reduceMotion
      ? 1
      : withTiming(1, { duration: Motion.duration.normal, easing: Motion.easing.entrance });
  }, [opacity, reduceMotion]);

  const animatedStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <Reanimated.View style={[localStyles.centerState, animatedStyle]}>
      <View style={localStyles.errorCircle}>
        <Ionicons name="sync-outline" size={IconGrammar.hero} color={colors.warning} aria-hidden={true} />
      </View>
      <Text style={localStyles.centerStateTitle}>Document was edited elsewhere</Text>
      <Text style={localStyles.centerStateText}>
        {errorMessage || 'Changed on another device. Reload or duplicate.'}
      </Text>
      <View style={localStyles.successBtnGroup}>
        <PressScale
          onPress={onReload}
          style={localStyles.viewBtn}
          accessibilityLabel="Reload from server"
          accessibilityHint="Reloads the latest server version of the document"
          scale={0.97}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Text style={localStyles.viewBtnText}>Reload</Text>
        </PressScale>
        <PressScale
          onPress={onDuplicate}
          style={localStyles.createBtn}
          accessibilityLabel="Duplicate as new draft"
          accessibilityHint="Creates a new document from your local changes"
          scale={0.97}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Text style={localStyles.createBtnText}>Duplicate</Text>
        </PressScale>
      </View>
    </Reanimated.View>
  );
}

// ── Schedule failed — honest state ─────────────────────────────────
// Under the orchestrated flow a failed schedule POST means NOTHING was
// published — the schedule row only creates a pending publication the
// worker executes later. This view must not claim the content is live.
interface ScheduleFailedViewProps {
  colors: ThemeColors;
  reduceMotion: boolean;
  scheduleError: string;
  onRetrySchedule: () => void;
  onPublishNow: () => void;
  onBack: () => void;
}

export function ScheduleFailedView({
  colors,
  reduceMotion,
  scheduleError,
  onRetrySchedule,
  onPublishNow,
  onBack }: ScheduleFailedViewProps) {
  const localStyles = useMemo(() => createStyles(colors), [colors]);
  const opacity = useSharedValue(0);

  useEffect(() => {
    if (reduceMotion) {
      opacity.value = 1;
    } else {
      opacity.value = withTiming(1, { duration: Motion.duration.normal, easing: Motion.easing.entrance });
    }
  }, [reduceMotion, opacity]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value }));

  return (
    <Reanimated.View style={[localStyles.centerState, animatedStyle]}>
      <View style={localStyles.errorCircle}>
        <Ionicons name="time-outline" size={IconGrammar.hero} color={colors.danger} aria-hidden={true} />
      </View>
      <Text style={localStyles.centerStateTitle}>Couldn't schedule</Text>
      <Text style={localStyles.centerStateText}>
        Nothing was published. Retry the schedule or publish it now.
      </Text>
      {scheduleError ? (
        <Text style={localStyles.scheduleFailedDetail}>{scheduleError}</Text>
      ) : null}
      <View style={localStyles.successBtnGroup}>
        <PressScale
          onPress={onRetrySchedule}
          style={localStyles.viewBtn}
          accessibilityLabel="Retry scheduling"
          accessibilityHint="Attempts to schedule the content for the selected date"
          scale={0.97}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Text style={localStyles.viewBtnText}>Retry schedule</Text>
        </PressScale>
        <PressScale
          onPress={onPublishNow}
          style={localStyles.createBtn}
          accessibilityLabel="Publish now instead"
          accessibilityHint="Publishes the content immediately instead of scheduling"
          scale={0.97}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Text style={localStyles.createBtnText}>Publish now</Text>
        </PressScale>
        <PressScale
          onPress={onBack}
          style={localStyles.scheduleFailedViewBtn}
          accessibilityLabel="Back to publish options"
          accessibilityHint="Returns to the publish sheet"
          scale={0.97}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Text style={localStyles.scheduleFailedViewText}>Back</Text>
        </PressScale>
      </View>
    </Reanimated.View>
  );
}

// ── Confirmation — shared success & scheduled states ──────────────
// One quiet confirmation surface for both "Published" and "Scheduled"
// outcomes. A single hero icon, a one-line body, and a primary +
// secondary action. No confetti, no oversized icon, no multi-step
// entrance choreography.
export function formatScheduledDate(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  });
}

interface ConfirmationAction {
  label: string;
  onPress: () => void;
  accessibilityLabel: string;
  accessibilityHint: string;
}

interface ConfirmationViewProps {
  colors: ThemeColors;
  reduceMotion: boolean;
  icon: keyof typeof Ionicons.glyphMap;
  iconColor: string;
  title: string;
  body: string;
  primaryAction: ConfirmationAction;
  secondaryAction: ConfirmationAction;
}

export function ConfirmationView({
  colors,
  reduceMotion,
  icon,
  iconColor,
  title,
  body,
  primaryAction,
  secondaryAction }: ConfirmationViewProps) {
  const styles = useMemo(() => createStyles(colors), [colors]);
  const contentOpacity = useSharedValue(reduceMotion ? 1 : 0);

  useEffect(() => {
    contentOpacity.value = reduceMotion
      ? 1
      : withTiming(1, { duration: Motion.duration.normal, easing: Motion.easing.entrance });
  }, [reduceMotion, contentOpacity]);

  const contentStyle = useAnimatedStyle(() => ({ opacity: contentOpacity.value }));

  return (
    <Reanimated.View style={[styles.centerState, contentStyle]}>
      <Ionicons name={icon} size={IconGrammar.hero} color={iconColor} aria-hidden={true} />
      <Text style={styles.successTitle}>{title}</Text>
      <Text style={styles.centerStateText}>{body}</Text>
      <View style={styles.successBtnGroup}>
        <PressScale
          onPress={primaryAction.onPress}
          style={styles.viewBtn}
          accessibilityLabel={primaryAction.accessibilityLabel}
          accessibilityHint={primaryAction.accessibilityHint}
          scale={0.97}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Text style={styles.viewBtnText}>{primaryAction.label}</Text>
        </PressScale>
        <PressScale
          onPress={secondaryAction.onPress}
          style={styles.createBtn}
          accessibilityLabel={secondaryAction.accessibilityLabel}
          accessibilityHint={secondaryAction.accessibilityHint}
          scale={0.97}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Text style={styles.createBtnText}>{secondaryAction.label}</Text>
        </PressScale>
      </View>
    </Reanimated.View>
  );
}
