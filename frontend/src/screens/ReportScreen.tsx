import React, { useMemo, useState, useCallback } from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput, View, Image as RNImage, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { Space, Typography, Radius, Control, Stroke } from '../theme/designTokens';
import { TypographyV2 } from '../theme/typography.v2';
import { AnimatedPressable } from '../components/AnimatedPressable';
import {
  FlagshipHeader,
  FlagshipScreen } from '../components/flagship';
import { reportUser, blockUser, type ReportReason } from '../services/profileApi';
import { reportListing, type ListingReportReason } from '../services/listingsApi';
import { reportConversationOnApi } from '../services/chatApi';
import { useStore } from '../store/useStore';
import { useToast } from '../context/ToastContext';
import { useAppTheme, type ThemeColors } from '../theme/ThemeContext';
import { uploadMedia } from '../services/mediaUpload';
import { useConnectivity } from '../hooks/useConnectivity';

type EvidenceState = 'uploading' | 'attached' | 'submitted';

interface EvidenceItem {
  id: string;
  uri: string;
  state: EvidenceState;
}

type Props = NativeStackScreenProps<RootStackParamList, 'Report'>;

const REPORT_REASONS: Array<{
  key: ReportReason;
  label: string;
  description: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
}> = [
  {
    key: 'spam',
    label: 'Spam',
    description: 'Unwanted promotion, scams or repetitive messages',
    icon: 'mail-unread-outline' },
  {
    key: 'harassment',
    label: 'Harassment',
    description: 'Threatening, abusive or targeted unwanted contact',
    icon: 'warning-outline' },
  {
    key: 'hate_speech',
    label: 'Hate speech',
    description: 'Slurs, dehumanizing language, or attacks on protected groups',
    icon: 'megaphone-outline' },
  {
    key: 'counterfeit',
    label: 'Fake item',
    description: 'Counterfeit goods or misleading authenticity claims',
    icon: 'pricetag-outline' },
  {
    key: 'prohibited',
    label: 'Prohibited item',
    description: 'Weapons, drugs, wildlife, or other prohibited categories',
    icon: 'ban-outline' },
  {
    key: 'off_platform',
    label: 'Off-platform request',
    description: 'Asked to transact outside Thryftverse, against policy',
    icon: 'exit-outline' },
  {
    key: 'scam',
    label: 'Scam or fraud',
    description: 'Attempted financial fraud, phishing, or impersonation',
    icon: 'cash-outline' },
  {
    key: 'misinformation',
    label: 'Misleading content',
    description: 'False or misleading claims about an item',
    icon: 'information-circle-outline' },
  {
    key: 'privacy',
    label: 'Privacy violation',
    description: 'Shared private information without consent',
    icon: 'lock-closed-outline' },
  {
    key: 'impersonation',
    label: 'Impersonation',
    description: 'Pretending to be someone else',
    icon: 'person-outline' },
  {
    key: 'minor_safety',
    label: 'Minor safety',
    description: 'Content or behavior endangering minors',
    icon: 'shield-outline' },
  {
    key: 'other',
    label: 'Something else',
    description: 'Tell the moderation team what happened',
    icon: 'help-circle-outline' },
];

export default function ReportScreen({ navigation, route }: Props) {
  const { show } = useToast();
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { type, targetId } = route.params;
  const toggleBlocked = useStore((s) => s.toggleBlockedUser);
  const isBlocked = useStore((s) =>
    targetId ? s.blockedUsers.includes(targetId) : false
  );
  const { isOffline } = useConnectivity();
  const [selectedReason, setSelectedReason] =
    useState<ReportReason | null>(null);
  const [details, setDetails] = useState('');
  const [evidenceItems, setEvidenceItems] = useState<EvidenceItem[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isBlocking, setIsBlocking] = useState(false);
  const [hasBlocked, setHasBlocked] = useState(false);
  const [reportId, setReportId] = useState<string | null>(null);
  const [submittedAt, setSubmittedAt] = useState<string | null>(null);

  const canSubmit =
    Boolean(targetId) &&
    Boolean(selectedReason) &&
    !isSubmitting &&
    !isUploading;

  const handlePickEvidence = useCallback(async () => {
    if (evidenceItems.length >= 3) {
      show('Attach up to 3 photos.', 'info');
      return;
    }
    if (isOffline) {
      show('You appear to be offline. Check your connection and try again.', 'error');
      return;
    }
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        show('Allow photo access to upload evidence.', 'error');
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
                : it
            )
          );
          successCount++;
        } catch {
          setEvidenceItems((prev) => prev.filter((it) => it.id !== placeholders[i].id));
        }
      }
      if (successCount > 0) {
        show(`${successCount} photo${successCount > 1 ? 's' : ''} attached.`, 'success');
      } else {
        show('Unable to upload photo(s). Try again.', 'error');
      }
    } catch {
      show('Unable to upload photo(s). Try again.', 'error');
    } finally {
      setIsUploading(false);
    }
  }, [evidenceItems.length, isOffline, show]);

  const handleTakeEvidence = useCallback(async () => {
    if (evidenceItems.length >= 3) {
      show('Attach up to 3 photos.', 'info');
      return;
    }
    if (isOffline) {
      show('You appear to be offline. Check your connection and try again.', 'error');
      return;
    }
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        show('Allow camera access to take evidence photos.', 'error');
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
              : it
          )
        );
        show('Photo attached.', 'success');
      } catch {
        setEvidenceItems((prev) => prev.filter((it) => it.id !== placeholder.id));
        show('Unable to upload photo. Try again.', 'error');
      }
    } catch {
      show('Unable to upload photo. Try again.', 'error');
    } finally {
      setIsUploading(false);
    }
  }, [evidenceItems.length, isOffline, show]);

  const handleRemoveEvidence = useCallback((id: string) => {
    setEvidenceItems((prev) => prev.filter((it) => it.id !== id));
  }, []);

  const handleSubmit = async () => {
    if (!canSubmit || !selectedReason || !targetId) return;
    setIsSubmitting(true);
    try {
      const evidenceUris = evidenceItems
        .filter((e) => e.state === 'attached')
        .map((e) => e.uri);
      const evidenceParam = evidenceUris.length ? evidenceUris : undefined;
      let result: { reportId: string };
      if (type === 'user') {
        result = await reportUser(targetId, selectedReason, details.trim() || undefined, evidenceParam);
      } else if (type === 'group') {
        result = await reportConversationOnApi(
          targetId,
          selectedReason,
          details.trim() || undefined,
          undefined,
          undefined,
          evidenceParam,
        );
      } else {
        result = await reportListing(
          targetId,
          selectedReason as ListingReportReason,
          details.trim() || undefined,
          evidenceParam
        );
      }
      setReportId(result.reportId);
      setEvidenceItems((prev) => prev.map((it) => ({ ...it, state: 'submitted' as const })));
      setSubmittedAt(new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }));
      setIsSubmitted(true);
    } catch {
      show('The report could not be sent. Check your connection and try again.', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleBlockUser = async () => {
    if (!targetId || isBlocking || hasBlocked || isBlocked) return;
    setIsBlocking(true);
    try {
      await blockUser(targetId);
      toggleBlocked(targetId);
      setHasBlocked(true);
      show('Account blocked', 'success');
    } catch {
      show('Could not block this account. Try again.', 'error');
    } finally {
      setIsBlocking(false);
    }
  };

  if (isSubmitted) {
    const showBlockButton = type === 'user' && !isBlocked && !hasBlocked;
    return (
      <FlagshipScreen
        header={
          <FlagshipHeader
            title="Report received"
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
          <Text style={styles.completeTitle}>Report received</Text>
          {reportId ? (
            <Text style={styles.reportIdText}>
              Report #{reportId}
            </Text>
          ) : null}
          <Text style={styles.completeBody}>
            We'll review and let you know the outcome.
          </Text>
          {submittedAt ? (
            <Text style={styles.submittedAtText}>
              Received at {submittedAt}
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
          {reportId ? (
            <Text style={styles.reportIdNote}>
              Reference this number in future support contact.
            </Text>
          ) : null}
          {showBlockButton ? (
            <AnimatedPressable
              style={styles.blockAction}
              onPress={handleBlockUser}
              activeOpacity={0.78}
              scaleValue={0.98}
              disabled={isBlocking}
              accessibilityRole="button"
              accessibilityLabel="Block this user"
              accessibilityState={{ busy: isBlocking, disabled: isBlocking }}
            >
              {isBlocking ? (
                <ActivityIndicator size="small" color={colors.textInverse} />
              ) : (
                <>
                  <Ionicons
                    name="ban-outline"
                    size={16}
                    color={colors.textInverse}
                  />
                  <Text style={styles.blockActionText}>Block this user</Text>
                </>
              )}
            </AnimatedPressable>
          ) : null}
          {(isBlocked || hasBlocked) && type === 'user' ? (
            <View style={styles.blockedNote}>
              <Ionicons
                name="checkmark-circle"
                size={16}
                color={colors.success}
              />
              <Text style={styles.blockedNoteText}>
                This account is blocked and cannot contact you.
              </Text>
            </View>
          ) : null}
          <AnimatedPressable
            style={styles.doneAction}
            onPress={() => navigation.goBack()}
            activeOpacity={0.78}
            scaleValue={0.98}
            accessibilityRole="button"
            accessibilityLabel="Done"
          >
            <Text style={styles.doneActionText}>Done</Text>
          </AnimatedPressable>
        </View>
      </FlagshipScreen>
    );
  }

  if (!targetId) {
    return (
      <FlagshipScreen
        header={
          <FlagshipHeader
            title="Report"
            onBack={() => navigation.goBack()}
          />
        }
      >
        <View style={styles.complete}>
          <Ionicons
            name="alert-circle-outline"
            size={28}
            color={colors.textMuted}
          />
          <Text style={styles.completeTitle}>Report target unavailable</Text>
          <Text style={styles.completeBody}>
            This report was opened without a valid reference. Nothing
            has been submitted.
          </Text>
          <AnimatedPressable
            style={styles.secondaryDoneAction}
            onPress={() => navigation.goBack()}
            activeOpacity={0.72}
            scaleValue={0.98}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <Text style={styles.secondaryDoneText}>Go back</Text>
          </AnimatedPressable>
        </View>
      </FlagshipScreen>
    );
  }

  const reportTitle =
    type === 'user' ? 'Report account'
      : type === 'group' ? 'Report group'
      : 'Report listing';

  return (
    <FlagshipScreen
      header={
        <FlagshipHeader
          title={reportTitle}
          subtitle="Reports are confidential"
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
          accessibilityLabel="Send report"
          accessibilityState={{ disabled: !canSubmit, busy: isSubmitting }}
        >
          {isSubmitting ? (
            <ActivityIndicator size="small" color={colors.textInverse} />
          ) : (
            <Text style={styles.submitText}>Send report</Text>
          )}
        </AnimatedPressable>
      }
      footerInsetHeight={96}
    >
      <View style={styles.intro}>
        <Text style={styles.introTitle}>What happened?</Text>
        <Text style={styles.introBody}>
          Choose the reason that best describes the issue. Do not include
          passwords, payment details or other sensitive information.
        </Text>
      </View>

      <View style={styles.reasons}>
        {REPORT_REASONS.map((reason, index) => {
          const selected = selectedReason === reason.key;
          return (
            <AnimatedPressable
              key={reason.key}
              style={[
                styles.reason,
                index < REPORT_REASONS.length - 1 && styles.reasonDivider,
              ]}
              onPress={() => setSelectedReason(reason.key)}
              activeOpacity={0.68}
              scaleValue={0.99}
              hapticFeedback="selection"
              accessibilityRole="radio"
              accessibilityLabel={reason.label}
              accessibilityHint={reason.description}
              accessibilityState={{ selected }}
            >
              <View style={[styles.reasonIcon, selected && styles.reasonIconSelected]}>
                <Ionicons
                  name={reason.icon}
                  size={18}
                  color={selected ? colors.textPrimary : colors.textMuted}
                />
              </View>
              <View style={styles.reasonCopy}>
                <Text style={styles.reasonLabel}>{reason.label}</Text>
                <Text style={styles.reasonDescription}>
                  {reason.description}
                </Text>
              </View>
              <View style={[styles.radio, selected && styles.radioSelected]}>
                {selected ? <View style={styles.radioDot} /> : null}
              </View>
            </AnimatedPressable>
          );
        })}
      </View>

      {selectedReason ? (
        <View style={styles.details}>
          <Text style={styles.detailsLabel}>Additional details (optional)</Text>
          <TextInput
            style={styles.detailsInput}
            value={details}
            onChangeText={setDetails}
            placeholder="Describe what happened"
            placeholderTextColor={colors.textMuted}
            multiline
            maxLength={500}
            textAlignVertical="top"
            accessibilityLabel="Additional report details"
          />
          <Text style={styles.characterCount}>{details.length}/500</Text>

          {/* Evidence photo upload */}
          <Text style={styles.evidenceLabel}>Evidence photos (optional)</Text>
          {evidenceItems.length > 0 ? (
            <View style={styles.evidenceGrid}>
              {evidenceItems.map((item, i) => (
                <View key={item.id} style={styles.evidenceTileWrap}>
                  {item.uri ? (
                    <RNImage
                      source={{ uri: item.uri }}
                      style={styles.evidenceTile}
                      resizeMode="cover"
                      accessibilityLabel={`Evidence photo ${i + 1}`}
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
                      accessibilityLabel={`Remove evidence photo ${i + 1}`}
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
                accessibilityLabel="Take evidence photo with camera"
              >
                <Ionicons name="camera-outline" size={18} color={colors.textPrimary} />
                <Text style={styles.evidenceUploadText}>Camera</Text>
              </AnimatedPressable>
              <AnimatedPressable
                style={[styles.evidenceUploadBtn, { borderColor: colors.border, backgroundColor: colors.surface }]}
                onPress={handlePickEvidence}
                scaleValue={0.97}
                hapticFeedback="light"
                accessibilityRole="button"
                accessibilityLabel="Choose evidence photos from gallery"
              >
                {isUploading ? (
                  <ActivityIndicator size="small" color={colors.textPrimary} />
                ) : (
                  <Ionicons name="images-outline" size={18} color={colors.textPrimary} />
                )}
                <Text style={styles.evidenceUploadText}>Gallery</Text>
              </AnimatedPressable>
            </View>
          ) : null}
          <Text style={styles.evidenceCount}>
            {evidenceItems.length}/3 photos
          </Text>
        </View>
      ) : null}
    </FlagshipScreen>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
  intro: {
    paddingVertical: Space.md },
  introTitle: {
    color: colors.textPrimary,
    fontFamily: Typography.family.semibold,
    fontSize: TypographyV2.sectionTitle.size,
    lineHeight: TypographyV2.sectionTitle.lineHeight,
    letterSpacing: TypographyV2.sectionTitle.letterSpacing },
  introBody: {
    maxWidth: 340,
    marginTop: Space.xs,
    color: colors.textMuted,
    fontFamily: Typography.family.regular,
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight + 2 },
  reasons: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border },
  reason: {
    minHeight: Control.hit + Space.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    paddingHorizontal: Space.md },
  reasonDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border },
  reasonIcon: {
    width: Space.lg + Space.xs,
    height: Space.lg + Space.xs,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceAlt },
  reasonIconSelected: {
    // TODO: replace `${colors.textPrimary}14` with textPrimarySubtle token when available
    backgroundColor: `${colors.textPrimary}14` },
  reasonCopy: {
    minWidth: 0,
    flex: 1,
    gap: Space.xs / 2 },
  reasonLabel: {
    color: colors.textPrimary,
    fontFamily: Typography.family.semibold,
    fontSize: TypographyV2.body.size,
    lineHeight: TypographyV2.body.lineHeight },
  reasonDescription: {
    color: colors.textMuted,
    fontFamily: Typography.family.regular,
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight + 2 },
  radio: {
    width: Space.lg - Space.xs,
    height: Space.lg - Space.xs,
    borderRadius: Radius.full,
    borderWidth: Stroke.standard,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center' },
  radioSelected: {
    borderColor: colors.textPrimary },
  radioDot: {
    width: Space.sm + 2,
    height: Space.sm + 2,
    borderRadius: Radius.full,
    backgroundColor: colors.textPrimary },
  details: {
    marginTop: Space.lg },
  detailsLabel: {
    marginBottom: Space.xs + 2,
    color: colors.textPrimary,
    fontFamily: Typography.family.semibold,
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight },
  detailsInput: {
    minHeight: Space.xl * 3 + Space.md + Space.xs,
    padding: Space.md,
    borderWidth: Stroke.standard,
    borderColor: colors.border,
    borderRadius: Radius.md,
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
  evidenceLabel: {
    marginTop: Space.lg,
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
    borderRadius: Radius.md },
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
  reportIdText: {
    marginTop: Space.xs,
    color: colors.brand,
    fontFamily: Typography.family.bold,
    fontSize: TypographyV2.bodyStrong.size,
    lineHeight: TypographyV2.bodyStrong.lineHeight,
    letterSpacing: TypographyV2.bodyStrong.letterSpacing,
    textAlign: 'center' },
  reportIdNote: {
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
  blockAction: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space.xs,
    minWidth: 160,
    minHeight: Control.hit,
    marginTop: Space.md,
    paddingHorizontal: Space.lg,
    borderRadius: Radius.full,
    borderWidth: Stroke.standard,
    borderColor: colors.danger,
    backgroundColor: colors.danger },
  blockActionText: {
    color: colors.textInverse,
    fontFamily: Typography.family.semibold,
    fontSize: TypographyV2.body.size,
    lineHeight: TypographyV2.body.lineHeight },
  blockedNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
    marginTop: Space.md,
    maxWidth: 300 },
  blockedNoteText: {
    flex: 1,
    color: colors.success,
    fontFamily: Typography.family.medium,
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight + 2 },
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
