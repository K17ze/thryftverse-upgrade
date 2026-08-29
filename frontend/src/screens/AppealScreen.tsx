import React, { useMemo, useState, useCallback, useEffect } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TextInput,
  View,
  Image as RNImage,
  Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { Space, Typography, Radius, Control, Stroke } from '../theme/designTokens';
import { TypographyV2 } from '../theme/typography.v2';
import { AnimatedPressable } from '../components/AnimatedPressable';
import {
  FlagshipHeader,
  FlagshipScreen,
  FlagshipState } from '../components/flagship';
import {
  fetchDecisionSummary,
  appealDecisionOnApi,
  type DecisionSummary } from '../services/profileApi';
import { useToast } from '../context/ToastContext';
import { useAppTheme, type ThemeColors } from '../theme/ThemeContext';
import { uploadMedia } from '../services/mediaUpload';
import { useConnectivity } from '../hooks/useConnectivity';
import { useAppTranslation } from '../i18n/useAppTranslation';

type EvidenceState = 'uploading' | 'attached' | 'submitted';

interface EvidenceItem {
  id: string;
  uri: string;
  state: EvidenceState;
}

type Props = NativeStackScreenProps<RootStackParamList, 'Appeal'>;

const DECISION_LABEL_KEYS: Record<string, string> = {
  no_violation: 'decision.noViolation',
  restrict: 'decision.restrict',
  escalate: 'decision.escalate',
  emergency_hold: 'decision.emergencyHold' };

function formatDecisionDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString([], {
      day: 'numeric',
      month: 'short',
      year: 'numeric' });
  } catch {
    return iso;
  }
}

export default function AppealScreen({ navigation, route }: Props) {
  const { show } = useToast();
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { decisionId } = route.params;
  const { isOffline } = useConnectivity();
  const { t } = useAppTranslation('appeal');

  const [decision, setDecision] = useState<DecisionSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const [grounds, setGrounds] = useState('');
  const [evidenceItems, setEvidenceItems] = useState<EvidenceItem[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [appealId, setAppealId] = useState<string | null>(null);
  const [submittedAt, setSubmittedAt] = useState<string | null>(null);

  // ── Fetch decision summary on mount ──────────────────────────────────
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const summary = await fetchDecisionSummary(decisionId);
        if (mounted) {
          setDecision(summary);
          setIsLoading(false);
        }
      } catch {
        if (mounted) {
          setLoadError(true);
          setIsLoading(false);
        }
      }
    })();
    return () => {
      mounted = false;
    };
  }, [decisionId]);

  const canSubmit =
    Boolean(decision) &&
    grounds.trim().length >= 10 &&
    !isSubmitting &&
    !isUploading;

  // ── Evidence handlers (reuse ReportScreen filmstrip pattern) ──────────
  const handlePickEvidence = useCallback(async () => {
    if (evidenceItems.length >= 3) {
      show(t('toast.attachUpTo3'), 'info');
      return;
    }
    if (isOffline) {
      show(t('toast.offline'), 'error');
      return;
    }
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        show(t('toast.allowPhotoAccess'), 'error');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false,
        quality: 0.85,
        selectionLimit: 3 - evidenceItems.length });
      if (result.canceled || !result.assets?.length) return;
      const placeholders: EvidenceItem[] = result.assets.map((_, idx) => ({
        id: `pick_${Date.now()}_${idx}`,
        uri: '',
        state: 'uploading' }));
      setEvidenceItems((prev) => [...prev, ...placeholders]);
      setIsUploading(true);
      let successCount = 0;
      for (let i = 0; i < result.assets.length; i++) {
        try {
          const media = await uploadMedia(result.assets[i].uri, 'evidence');
          setEvidenceItems((prev) =>
            prev.map((it) =>
              it.id === placeholders[i].id
                ? { ...it, uri: media.publicUrl, state: 'attached' }
                : it,
            ),
          );
          successCount++;
        } catch {
          setEvidenceItems((prev) => prev.filter((it) => it.id !== placeholders[i].id));
        }
      }
      if (successCount > 0) {
        show(t('toast.photosAttached', { count: successCount }), 'success');
      } else {
        show(t('toast.uploadFailed'), 'error');
      }
    } catch {
      show(t('toast.uploadFailed'), 'error');
    } finally {
      setIsUploading(false);
    }
  }, [evidenceItems.length, isOffline, show, t]);

  const handleTakeEvidence = useCallback(async () => {
    if (evidenceItems.length >= 3) {
      show(t('toast.attachUpTo3'), 'info');
      return;
    }
    if (isOffline) {
      show(t('toast.offline'), 'error');
      return;
    }
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        show(t('toast.allowCameraAccess'), 'error');
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.85 });
      if (result.canceled || !result.assets?.length) return;
      const placeholder: EvidenceItem = {
        id: `cam_${Date.now()}`,
        uri: '',
        state: 'uploading' };
      setEvidenceItems((prev) => [...prev, placeholder]);
      setIsUploading(true);
      try {
        const media = await uploadMedia(result.assets[0].uri, 'evidence');
        setEvidenceItems((prev) =>
          prev.map((it) =>
            it.id === placeholder.id
              ? { ...it, uri: media.publicUrl, state: 'attached' }
              : it,
          ),
        );
        show(t('toast.photoAttached'), 'success');
      } catch {
        setEvidenceItems((prev) => prev.filter((it) => it.id !== placeholder.id));
        show(t('toast.singleUploadFailed'), 'error');
      }
    } catch {
      show(t('toast.singleUploadFailed'), 'error');
    } finally {
      setIsUploading(false);
    }
  }, [evidenceItems.length, isOffline, show, t]);

  const handleRemoveEvidence = useCallback((id: string) => {
    setEvidenceItems((prev) => prev.filter((it) => it.id !== id));
  }, []);

  // ── Submit ────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!canSubmit || !decision) return;
    setIsSubmitting(true);
    try {
      const evidenceUris = evidenceItems
        .filter((e) => e.state === 'attached')
        .map((e) => e.uri);
      const evidenceParam = evidenceUris.length ? evidenceUris : undefined;
      const result = await appealDecisionOnApi(
        decisionId,
        grounds.trim(),
        evidenceParam,
      );
      setAppealId(result.appealId);
      setEvidenceItems((prev) =>
        prev.map((it) => ({ ...it, state: 'submitted' as const })),
      );
      setSubmittedAt(
        new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
      );
      setIsSubmitted(true);
    } catch {
      show(t('toast.appealFailed'), 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── Success state ─────────────────────────────────────────────────────
  if (isSubmitted) {
    return (
      <FlagshipScreen
        header={
          <FlagshipHeader
            title={t('submitted.title')}
            onBack={() => navigation.goBack()}
          />
        }
      >
        <View style={styles.complete}>
          <Ionicons
            name="checkmark-circle-outline"
            size={28}
            color={colors.textPrimary}
          />
          <Text style={styles.completeTitle}>{t('submitted.title')}</Text>
          {appealId ? (
            <Text style={styles.appealIdText}>{t('submitted.appealId', { appealId })}</Text>
          ) : null}
          <Text style={styles.completeBody}>
            {t('submitted.body')}
          </Text>
          {submittedAt ? (
            <Text style={styles.submittedAtText}>
              {t('submitted.submittedAt', { time: submittedAt })}
            </Text>
          ) : null}
          {evidenceItems.length > 0 ? (
            <View style={styles.submittedEvidence}>
              {evidenceItems.map((item) => (
                <View key={item.id} style={styles.evidenceTileWrap}>
                  <RNImage
                    source={{ uri: item.uri }}
                    style={styles.evidenceTile}
                    resizeMode="cover"
                  />
                  <View style={styles.evidenceStateBadge}>
                    <Ionicons name="checkmark" size={12} color={colors.textInverse} />
                  </View>
                </View>
              ))}
            </View>
          ) : null}
          {appealId ? (
            <Text style={styles.appealIdNote}>
              {t('submitted.referenceNote')}
            </Text>
          ) : null}
          <AnimatedPressable
            style={styles.doneAction}
            onPress={() => navigation.goBack()}
            activeOpacity={0.78}
            scaleValue={0.98}
            accessibilityRole="button"
            accessibilityLabel={t('submitted.done')}
          >
            <Text style={styles.doneActionText}>{t('submitted.done')}</Text>
          </AnimatedPressable>
        </View>
      </FlagshipScreen>
    );
  }

  // ── Loading state ─────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <FlagshipScreen
        header={
          <FlagshipHeader
            title={t('header.title')}
            onBack={() => navigation.goBack()}
          />
        }
      >
        <FlagshipState
          variant="loading"
          title={t('loading.title')}
          subtitle={t('loading.subtitle')}
        />
      </FlagshipScreen>
    );
  }

  // ── Error state ───────────────────────────────────────────────────────
  if (loadError || !decision) {
    return (
      <FlagshipScreen
        header={
          <FlagshipHeader
            title={t('header.title')}
            onBack={() => navigation.goBack()}
          />
        }
      >
        <FlagshipState
          variant="error"
          title={t('error.title')}
          subtitle={t('error.subtitle')}
          actionLabel={t('error.tryAgain')}
          onAction={() => {
            setLoadError(false);
            setIsLoading(true);
          }}
          secondaryActionLabel={t('error.goBack')}
          onSecondaryAction={() => navigation.goBack()}
        />
      </FlagshipScreen>
    );
  }

  // ── Denied state (outside complaint window) ──────────────────────────
  if (!decision.withinComplaintWindow) {
    return (
      <FlagshipScreen
        header={
          <FlagshipHeader
            title={t('header.title')}
            onBack={() => navigation.goBack()}
          />
        }
      >
        <View style={styles.complete}>
          <Ionicons
            name="time-outline"
            size={28}
            color={colors.textMuted}
          />
          <Text style={styles.completeTitle}>{t('windowClosed.title')}</Text>
          <Text style={styles.completeBody}>
            {t('windowClosed.body', { date: formatDecisionDate(decision.decidedAt) })}
          </Text>
          <AnimatedPressable
            style={styles.secondaryDoneAction}
            onPress={() => navigation.goBack()}
            activeOpacity={0.72}
            scaleValue={0.98}
            accessibilityRole="button"
            accessibilityLabel={t('windowClosed.goBack')}
          >
            <Text style={styles.secondaryDoneText}>{t('windowClosed.goBack')}</Text>
          </AnimatedPressable>
        </View>
      </FlagshipScreen>
    );
  }

  // ── Offline state ─────────────────────────────────────────────────────
  if (isOffline && !isSubmitting) {
    return (
      <FlagshipScreen
        header={
          <FlagshipHeader
            title={t('header.title')}
            onBack={() => navigation.goBack()}
          />
        }
      >
        <FlagshipState
          variant="offline"
          title={t('offline.title')}
          subtitle={t('offline.subtitle')}
          actionLabel={t('offline.tryAgain')}
          onAction={() => {
            // Re-trigger a no-op state change to re-render
            setLoadError(false);
          }}
          secondaryActionLabel={t('offline.goBack')}
          onSecondaryAction={() => navigation.goBack()}
        />
      </FlagshipScreen>
    );
  }

  const decisionLabelKey = DECISION_LABEL_KEYS[decision.decision];
  const decisionLabel = decisionLabelKey
    ? t(decisionLabelKey)
    : decision.decision;

  return (
    <FlagshipScreen
      header={
        <FlagshipHeader
          title={t('header.title')}
          onBack={() => navigation.goBack()}
        />
      }
      stickyFooter={
        <AnimatedPressable
          style={[styles.submitAction, !canSubmit && styles.submitDisabled]}
          onPress={handleSubmit}
          activeOpacity={0.78}
          scaleValue={0.985}
          disabled={!canSubmit}
          accessibilityRole="button"
          accessibilityLabel={t('submit.label')}
          accessibilityState={{ disabled: !canSubmit, busy: isSubmitting }}
        >
          {isSubmitting ? (
            <ActivityIndicator size="small" color={colors.textInverse} />
          ) : (
            <Text style={styles.submitText}>{t('submit.label')}</Text>
          )}
        </AnimatedPressable>
      }
      footerInsetHeight={96}
    >
      {/* ── Decision summary — flat with hairline border, no shadow card ── */}
      <View style={styles.decisionSummary}>
        <View style={styles.decisionSummaryHeader}>
          <View style={styles.decisionIcon}>
            <Ionicons
              name="shield-outline"
              size={18}
              color={colors.textPrimary}
            />
          </View>
          <View style={styles.decisionSummaryCopy}>
            <Text style={styles.decisionLabel}>{decisionLabel}</Text>
            <Text style={styles.decisionDate}>
              {formatDecisionDate(decision.decidedAt)}
            </Text>
          </View>
        </View>
        {decision.summary ? (
          <Text style={styles.decisionReason} numberOfLines={3}>
            {decision.summary}
          </Text>
        ) : null}
        {decision.durationKind === 'temporary' && decision.durationUntil ? (
          <Text style={styles.decisionDuration}>
            {t('duration.until', { date: formatDecisionDate(decision.durationUntil) })}
          </Text>
        ) : decision.durationKind === 'permanent' ? (
          <Text style={styles.decisionDuration}>{t('duration.permanent')}</Text>
        ) : null}
      </View>

      {/* ── Grounds — the dominant input ── */}
      <View style={styles.grounds}>
        <Text style={styles.groundsLabel}>
          {t('grounds.label')}
        </Text>
        <TextInput
          style={styles.groundsInput}
          value={grounds}
          onChangeText={setGrounds}
          placeholder={t('grounds.placeholder')}
          placeholderTextColor={colors.textMuted}
          multiline
          maxLength={2000}
          textAlignVertical="top"
          accessibilityLabel={t('accessibility.groundsInput')}
        />
        <Text style={styles.characterCount}>{t('grounds.characterCount', { current: grounds.length, max: 2000 })}</Text>
      </View>

      {/* ── Evidence filmstrip (reuses ReportScreen visual language) ── */}
      <View style={styles.evidence}>
        <Text style={styles.evidenceLabel}>{t('evidence.label')}</Text>
        {evidenceItems.length > 0 ? (
          <View style={styles.evidenceGrid}>
            {evidenceItems.map((item, i) => (
              <View key={item.id} style={styles.evidenceTileWrap}>
                {item.uri ? (
                  <RNImage
                    source={{ uri: item.uri }}
                    style={styles.evidenceTile}
                    resizeMode="cover"
                    accessibilityLabel={t('accessibility.evidencePhoto', { index: i + 1 })}
                  />
                ) : (
                  <View style={[styles.evidenceTile, styles.evidenceTilePlaceholder]} />
                )}
                {item.state === 'uploading' ? (
                  <View style={styles.evidenceStateOverlay}>
                    <ActivityIndicator size="small" color={colors.textPrimary} />
                  </View>
                ) : null}
                {item.state === 'attached' ? (
                  <View style={styles.evidenceStateBadge}>
                    <Ionicons name="checkmark" size={12} color={colors.textInverse} />
                  </View>
                ) : null}
                {item.state === 'attached' ? (
                  <Pressable
                    style={styles.evidenceRemoveBtn}
                    onPress={() => handleRemoveEvidence(item.id)}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel={t('accessibility.removeEvidencePhoto', { index: i + 1 })}
                  >
                    <Ionicons name="close-circle" size={22} color={colors.danger} />
                  </Pressable>
                ) : null}
              </View>
            ))}
          </View>
        ) : null}
        {evidenceItems.length < 3 ? (
          <View style={styles.evidenceUploadRow}>
            <AnimatedPressable
              style={[styles.evidenceUploadBtn, { borderColor: colors.border, backgroundColor: colors.surface }]}
              onPress={handleTakeEvidence}
              scaleValue={0.97}
              hapticFeedback="light"
              accessibilityRole="button"
              accessibilityLabel={t('accessibility.takeEvidenceCamera')}
            >
              <Ionicons name="camera-outline" size={18} color={colors.textPrimary} />
              <Text style={styles.evidenceUploadText}>{t('evidence.camera')}</Text>
            </AnimatedPressable>
            <AnimatedPressable
              style={[styles.evidenceUploadBtn, { borderColor: colors.border, backgroundColor: colors.surface }]}
              onPress={handlePickEvidence}
              scaleValue={0.97}
              hapticFeedback="light"
              accessibilityRole="button"
              accessibilityLabel={t('accessibility.chooseEvidenceGallery')}
            >
              {isUploading ? (
                <ActivityIndicator size="small" color={colors.textPrimary} />
              ) : (
                <Ionicons name="images-outline" size={18} color={colors.textPrimary} />
              )}
              <Text style={styles.evidenceUploadText}>{t('evidence.gallery')}</Text>
            </AnimatedPressable>
          </View>
        ) : null}
        <Text style={styles.evidenceCount}>
          {t('evidence.count', { count: evidenceItems.length })}
        </Text>
      </View>
    </FlagshipScreen>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    // ── Decision summary ──────────────────────────────────────────────
    decisionSummary: {
      paddingVertical: Space.md,
      paddingHorizontal: Space.md,
      borderWidth: Stroke.standard,
      borderColor: colors.border,
      borderRadius: Radius.lg,
      backgroundColor: colors.surface },
    decisionSummaryHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.sm },
    decisionIcon: {
      width: Space.lg + Space.xs,
      height: Space.lg + Space.xs,
      borderRadius: Radius.md,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surfaceAlt },
    decisionSummaryCopy: {
      flex: 1,
      gap: Space.xs / 2 },
    decisionLabel: {
      color: colors.textPrimary,
      fontFamily: Typography.family.semibold,
      fontSize: TypographyV2.sectionTitle.size,
      lineHeight: TypographyV2.sectionTitle.lineHeight,
      letterSpacing: TypographyV2.sectionTitle.letterSpacing },
    decisionDate: {
      color: colors.textMuted,
      fontFamily: Typography.family.regular,
      fontSize: TypographyV2.meta.size,
      lineHeight: TypographyV2.meta.lineHeight + 2 },
    decisionReason: {
      marginTop: Space.sm,
      color: colors.textSecondary,
      fontFamily: Typography.family.regular,
      fontSize: TypographyV2.body.size,
      lineHeight: TypographyV2.body.lineHeight + 2 },
    decisionDuration: {
      marginTop: Space.xs,
      color: colors.textMuted,
      fontFamily: Typography.family.medium,
      fontSize: TypographyV2.meta.size,
      lineHeight: TypographyV2.meta.lineHeight,
      letterSpacing: TypographyV2.meta.letterSpacing },

    // ── Grounds textarea ──────────────────────────────────────────────
    grounds: {
      marginTop: Space.lg },
    groundsLabel: {
      marginBottom: Space.xs + 2,
      color: colors.textPrimary,
      fontFamily: Typography.family.semibold,
      fontSize: TypographyV2.sectionTitle.size,
      lineHeight: TypographyV2.sectionTitle.lineHeight,
      letterSpacing: TypographyV2.sectionTitle.letterSpacing },
    groundsInput: {
      minHeight: Space.xl * 3 + Space.md + Space.xs,
      padding: Space.md,
      borderWidth: Stroke.standard,
      borderColor: colors.border,
      borderRadius: Radius.lg,
      color: colors.textPrimary,
      backgroundColor: colors.background,
      fontFamily: Typography.family.regular,
      fontSize: TypographyV2.body.size,
      lineHeight: TypographyV2.body.lineHeight },
    characterCount: {
      marginTop: Space.xs,
      color: colors.textMuted,
      fontFamily: Typography.family.regular,
      fontSize: TypographyV2.meta.size,
      lineHeight: TypographyV2.meta.lineHeight,
      letterSpacing: TypographyV2.meta.letterSpacing,
      textAlign: 'right' },

    // ── Evidence filmstrip ────────────────────────────────────────────
    evidence: {
      marginTop: Space.lg },
    evidenceLabel: {
      marginBottom: Space.xs + 2,
      color: colors.textPrimary,
      fontFamily: Typography.family.semibold,
      fontSize: TypographyV2.meta.size,
      lineHeight: TypographyV2.meta.lineHeight },
    evidenceGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: Space.sm },
    evidenceTileWrap: {
      position: 'relative' },
    evidenceTile: {
      width: Space.xxl + Space.xl,
      height: Space.xxl + Space.xl,
      borderRadius: Radius.lg },
    evidenceRemoveBtn: {
      position: 'absolute',
      top: -Space.xs,
      right: -Space.xs,
      width: Control.chrome,
      height: Control.chrome,
      alignItems: 'center',
      justifyContent: 'center' },
    evidenceTilePlaceholder: {
      backgroundColor: colors.surfaceAlt },
    evidenceStateOverlay: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      alignItems: 'center',
      justifyContent: 'center' },
    evidenceStateBadge: {
      position: 'absolute',
      bottom: Space.xs,
      left: Space.xs,
      width: Space.lg - Space.xs,
      height: Space.lg - Space.xs,
      borderRadius: Radius.full,
      backgroundColor: colors.success,
      alignItems: 'center',
      justifyContent: 'center' },
    evidenceUploadRow: {
      flexDirection: 'row',
      gap: Space.sm,
      marginTop: Space.sm },
    evidenceUploadBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs,
      paddingHorizontal: Space.md,
      paddingVertical: Space.sm + 2,
      borderRadius: Radius.md,
      borderWidth: Stroke.standard,
      minHeight: Control.hit },
    evidenceUploadText: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      color: colors.textPrimary },
    evidenceCount: {
      marginTop: Space.xs,
      color: colors.textMuted,
      fontFamily: Typography.family.regular,
      fontSize: TypographyV2.meta.size,
      lineHeight: TypographyV2.meta.lineHeight,
      letterSpacing: TypographyV2.meta.letterSpacing },

    // ── Submit button ─────────────────────────────────────────────────
    submitAction: {
      minHeight: Space.xxl,
      borderRadius: Radius.full,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.textPrimary },
    submitDisabled: {
      opacity: 0.36 },
    submitText: {
      color: colors.textInverse,
      fontFamily: Typography.family.semibold,
      fontSize: TypographyV2.body.size,
      lineHeight: TypographyV2.body.lineHeight },

    // ── Success / denied states ───────────────────────────────────────
    complete: {
      alignItems: 'center',
      paddingHorizontal: Space.xl,
      paddingTop: Control.hit * 2 },
    completeTitle: {
      marginTop: Space.md,
      color: colors.textPrimary,
      fontFamily: Typography.family.semibold,
      fontSize: TypographyV2.sectionTitle.size,
      lineHeight: TypographyV2.sectionTitle.lineHeight,
      letterSpacing: TypographyV2.sectionTitle.letterSpacing,
      textAlign: 'center' },
    appealIdText: {
      marginTop: Space.xs,
      color: colors.brand,
      fontFamily: Typography.family.bold,
      fontSize: TypographyV2.bodyStrong.size,
      lineHeight: TypographyV2.bodyStrong.lineHeight,
      letterSpacing: TypographyV2.bodyStrong.letterSpacing,
      textAlign: 'center' },
    appealIdNote: {
      marginTop: Space.xs,
      color: colors.textMuted,
      fontFamily: Typography.family.regular,
      fontSize: TypographyV2.meta.size,
      lineHeight: TypographyV2.meta.lineHeight + 2,
      textAlign: 'center' },
    completeBody: {
      maxWidth: 330,
      marginTop: Space.xs,
      color: colors.textMuted,
      fontFamily: Typography.family.regular,
      fontSize: TypographyV2.meta.size,
      lineHeight: TypographyV2.meta.lineHeight + 2,
      textAlign: 'center' },
    submittedAtText: {
      marginTop: Space.xs,
      color: colors.textMuted,
      fontFamily: Typography.family.regular,
      fontSize: TypographyV2.meta.size,
      lineHeight: TypographyV2.meta.lineHeight,
      letterSpacing: TypographyV2.meta.letterSpacing,
      textAlign: 'center' },
    submittedEvidence: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: Space.sm,
      marginTop: Space.md,
      justifyContent: 'center' },
    doneAction: {
      minWidth: 150,
      minHeight: Control.hit,
      marginTop: Space.lg,
      paddingHorizontal: Space.lg,
      borderRadius: Radius.full,
      backgroundColor: colors.textPrimary,
      alignItems: 'center',
      justifyContent: 'center' },
    doneActionText: {
      color: colors.textInverse,
      fontFamily: Typography.family.semibold,
      fontSize: TypographyV2.body.size,
      lineHeight: TypographyV2.body.lineHeight },
    secondaryDoneAction: {
      minWidth: 140,
      minHeight: Control.hit,
      marginTop: Space.lg,
      paddingHorizontal: Space.lg,
      borderWidth: Stroke.standard,
      borderColor: colors.border,
      borderRadius: Radius.full,
      alignItems: 'center',
      justifyContent: 'center' },
    secondaryDoneText: {
      color: colors.textPrimary,
      fontFamily: Typography.family.semibold,
      fontSize: TypographyV2.body.size,
      lineHeight: TypographyV2.body.lineHeight } });
}
