import React, { useState, useCallback, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useAppTheme, type ThemeColors } from '../theme/ThemeContext';
import { Typography, Space, Radius, Type, Control, LetterSpacing } from '../theme/designTokens';
import { FlagshipScreen, FlagshipHeader, FlagshipState } from '../components/flagship';
import { CachedImage } from '../components/CachedImage';
import { AppButton } from '../components/ui/AppButton';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { KeyboardAwareScrollView } from '../platform/keyboard/KeyboardProvider';
import { useToast } from '../context/ToastContext';
import { useHaptic } from '../hooks/useHaptic';
import { useStore } from '../store/useStore';
import {
  fetchCoOwnRecourseStatus,
  respondToVerificationDemand,
  type CoOwnVerificationDemand,
  type CoOwnRecourseStatus,
} from '../services/marketApi';
import { uploadMedia } from '../services/mediaUpload';
import { parseApiError } from '../lib/apiClient';
import { RootStackParamList } from '../navigation/types';

type RouteT = RouteProp<RootStackParamList, 'VerificationResponse'>;

const DEMAND_TYPE_LABELS: Record<string, string> = {
  authenticity: 'Authenticity proof',
  possession: 'Possession proof',
  condition: 'Condition report',
  inspection: 'In-person inspection',
};

const DEMAND_TYPE_GUIDANCE: Record<string, string> = {
  authenticity:
    'Provide photos showing authenticity markers, serial numbers, certificates of authenticity, receipts, or brand verification documentation.',
  possession:
    'Provide a photo or video of the item in your possession, ideally with a visible timestamp or today\'s newspaper to prove current custody.',
  condition:
    'Provide detailed photos of the item from multiple angles, showing the current condition including any wear, tags, labels, and packaging.',
  inspection:
    'The buyer has requested an in-person inspection. Provide proposed dates/times for inspection, or photos/videos if remote inspection is acceptable.',
};

export default function VerificationResponseScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<RouteT>();
  const assetId = route.params?.assetId ?? '';
  const demandId = route.params?.demandId ?? 0;
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { show } = useToast();
  const haptic = useHaptic();

  const [recourseStatus, setRecourseStatus] = useState<CoOwnRecourseStatus | null>(null);
  const [demand, setDemand] = useState<CoOwnVerificationDemand | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [evidencePhotos, setEvidencePhotos] = useState<string[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [evidenceNotes, setEvidenceNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasResponded, setHasResponded] = useState(false);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const status = await fetchCoOwnRecourseStatus(assetId);
      setRecourseStatus(status);
      const found = status.verificationDemands.find((d) => d.id === demandId) ?? null;
      setDemand(found);
      if (found?.status === 'responded' || found?.status === 'compliant') {
        setHasResponded(true);
      }
    } catch (err) {
      const parsed = parseApiError(err);
      setError(parsed.message);
    } finally {
      setIsLoading(false);
    }
  }, [assetId, demandId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handlePickPhotos = useCallback(async () => {
    if (evidencePhotos.length >= 6) {
      show('Attach up to 6 photos.', 'info');
      return;
    }
    haptic.light();
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        show('Allow gallery access to upload evidence.', 'error');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false,
        quality: 0.85,
        selectionLimit: 6 - evidencePhotos.length,
      });
      if (result.canceled || !result.assets?.length) return;
      setIsUploading(true);
      const uploaded: string[] = [];
      for (const asset of result.assets) {
        const uploadedMedia = await uploadMedia(asset.uri, 'evidence');
        uploaded.push(uploadedMedia.publicUrl);
      }
      setEvidencePhotos((prev) => [...prev, ...uploaded]);
      show(`${uploaded.length} photo${uploaded.length > 1 ? 's' : ''} attached.`, 'success');
    } catch {
      show('Unable to upload photo(s). Try again.', 'error');
    } finally {
      setIsUploading(false);
    }
  }, [evidencePhotos.length, haptic, show]);

  const handleTakePhoto = useCallback(async () => {
    if (evidencePhotos.length >= 6) {
      show('Attach up to 6 photos.', 'info');
      return;
    }
    haptic.light();
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        show('Allow camera access to take evidence photos.', 'error');
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false,
        quality: 0.85,
      });
      if (result.canceled || !result.assets?.length) return;
      setIsUploading(true);
      const asset = result.assets[0];
      const uploadedMedia = await uploadMedia(asset.uri, 'evidence');
      setEvidencePhotos((prev) => [...prev, uploadedMedia.publicUrl]);
      show('Photo attached.', 'success');
    } catch {
      show('Unable to upload photo. Try again.', 'error');
    } finally {
      setIsUploading(false);
    }
  }, [evidencePhotos.length, haptic, show]);

  const handleRemovePhoto = useCallback((index: number) => {
    haptic.light();
    setEvidencePhotos((prev) => prev.filter((_, i) => i !== index));
  }, [haptic]);

  const handleSubmit = useCallback(async () => {
    if (evidencePhotos.length === 0) {
      show('Attach at least one photo as evidence.', 'error');
      return;
    }
    haptic.medium();
    setIsSubmitting(true);
    try {
      // Use the first photo as primary evidence URL; all photos are uploaded already
      const primaryEvidenceUrl = evidencePhotos[0];
      const allEvidenceUrls = evidencePhotos.join(', ');
      const notes = evidenceNotes.trim()
        ? `${evidenceNotes.trim()}${evidencePhotos.length > 1 ? `\n\nEvidence photos: ${allEvidenceUrls}` : ''}`
        : (evidencePhotos.length > 1 ? `Evidence photos: ${allEvidenceUrls}` : undefined);

      await respondToVerificationDemand(assetId, demandId, primaryEvidenceUrl, notes);
      show('Evidence submitted successfully. The buyer has been notified.', 'success');
      setHasResponded(true);
      haptic.success();
      // Navigate back after a brief delay so the user sees the success state
      setTimeout(() => {
        navigation.goBack();
      }, 1200);
    } catch (err) {
      const parsed = parseApiError(err);
      show(parsed.message, 'error');
    } finally {
      setIsSubmitting(false);
    }
  }, [evidencePhotos, evidenceNotes, assetId, demandId, haptic, show, navigation]);

  // ── States ──
  if (isLoading) {
    return (
      <FlagshipScreen header={<FlagshipHeader title="Respond to Verification" onBack={() => navigation.goBack()} />}>
        <FlagshipState variant="loading" title="Loading verification request..." />
      </FlagshipScreen>
    );
  }

  if (error) {
    return (
      <FlagshipScreen header={<FlagshipHeader title="Respond to Verification" onBack={() => navigation.goBack()} />}>
        <FlagshipState
          variant="error"
          title="Could not load request"
          subtitle={error}
          actionLabel="Try again"
          onAction={() => void loadData()}
        />
      </FlagshipScreen>
    );
  }

  if (!demand) {
    return (
      <FlagshipScreen header={<FlagshipHeader title="Respond to Verification" onBack={() => navigation.goBack()} />}>
        <FlagshipState
          variant="empty"
          title="Request not found"
          subtitle="This verification request may have been withdrawn."
          actionLabel="Go back"
          onAction={() => navigation.goBack()}
        />
      </FlagshipScreen>
    );
  }

  // If already responded or closed
  if (hasResponded || demand.status === 'responded' || demand.status === 'compliant') {
    return (
      <FlagshipScreen header={<FlagshipHeader title="Respond to Verification" onBack={() => navigation.goBack()} />}>
        <View style={styles.respondedContainer}>
          <View style={[styles.respondedIcon, { backgroundColor: colors.surfaceAlt }]}>
            <Ionicons name="checkmark-circle" size={48} color={colors.success} />
          </View>
          <Text style={[styles.respondedTitle, { color: colors.textPrimary }]}>
            Evidence submitted
          </Text>
          <Text style={[styles.respondedSub, { color: colors.textSecondary }]}>
            The buyer has been notified. You'll be informed of the platform's verdict.
          </Text>
          {demand.evidenceUrl && (
            <View style={[styles.evidencePreview, { backgroundColor: colors.surface, borderColor: colors.borderSubtle }]}>
              <CachedImage
                uri={demand.evidenceUrl}
                style={styles.evidenceThumb}
                contentFit="cover"
              />
              <View style={styles.evidenceInfo}>
                <Text style={[styles.evidenceLabel, { color: colors.textMuted }]}>
                  EVIDENCE SUBMITTED
                </Text>
                <Text style={[styles.evidenceDate, { color: colors.textSecondary }]}>
                  {demand.respondedAt
                    ? new Date(demand.respondedAt).toLocaleDateString('en-GB', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      })
                    : ''}
                </Text>
              </View>
            </View>
          )}
        </View>
      </FlagshipScreen>
    );
  }

  // If demand is no longer pending (expired, failed, etc.)
  if (demand.status !== 'pending') {
    const statusLabel = demand.status === 'expired' ? 'Deadline passed' : demand.status;
    const statusIcon: React.ComponentProps<typeof Ionicons>['name'] = demand.status === 'expired' ? 'time-outline'
      : demand.status === 'failed' ? 'close-circle'
      : 'alert-circle-outline';

    return (
      <FlagshipScreen header={<FlagshipHeader title="Respond to Verification" onBack={() => navigation.goBack()} />}>
        <View style={styles.respondedContainer}>
          <View style={[styles.respondedIcon, { backgroundColor: colors.surfaceAlt }]}>
            <Ionicons name={statusIcon} size={48} color={colors.textMuted} />
          </View>
          <Text style={[styles.respondedTitle, { color: colors.textPrimary }]}>
            {statusLabel}
          </Text>
          <Text style={[styles.respondedSub, { color: colors.textSecondary }]}>
            {demand.status === 'expired'
              ? 'The deadline for this verification request has passed. Recourse may have been triggered.'
              : demand.status === 'failed'
              ? 'This verification was marked as failed. Recourse has been triggered.'
              : 'This verification request is no longer pending.'}
          </Text>
        </View>
      </FlagshipScreen>
    );
  }

  // ── Main response form ──
  const deadline = new Date(demand.deadline);
  const now = new Date();
  const daysLeft = Math.ceil((deadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  const isOverdue = deadline < now;
  const canSubmit = evidencePhotos.length > 0 && !isSubmitting && !isUploading;

  return (
    <FlagshipScreen
      header={<FlagshipHeader title="Respond to Verification" onBack={() => navigation.goBack()} />}
      scrollEnabled={false}
      contentStyle={{ paddingHorizontal: 0, paddingTop: 0 }}
    >
      <KeyboardAwareScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
      >
        {/* Demand details */}
        <View>
          <View style={[styles.demandCard, { backgroundColor: colors.surface, borderColor: colors.borderSubtle }]}>
            <View style={styles.demandTypeRow}>
              <View style={[styles.demandTypeIcon, { backgroundColor: colors.surfaceAlt }]}>
                <Ionicons
                  name={demand.demandType === 'inspection' ? 'eye-outline' : 'document-text-outline'}
                  size={20}
                  color={colors.brand}
                />
              </View>
              <View style={styles.demandTypeInfo}>
                <Text style={[styles.demandTypeLabel, { color: colors.textMuted }]}>
                  VERIFICATION REQUEST
                </Text>
                <Text style={[styles.demandTypeTitle, { color: colors.textPrimary }]}>
                  {DEMAND_TYPE_LABELS[demand.demandType] ?? demand.demandType}
                </Text>
              </View>
            </View>

            {/* Deadline badge */}
            <View style={[styles.deadlineBadge, {
              backgroundColor: isOverdue ? colors.dangerSubtle : colors.surfaceAlt,
            }]}>
              <Ionicons
                name={isOverdue ? 'warning-outline' : 'time-outline'}
                size={14}
                color={isOverdue ? colors.danger : colors.textMuted}
              />
              <Text style={[styles.deadlineBadgeText, {
                color: isOverdue ? colors.danger : colors.textSecondary,
              }]}>
                {isOverdue
                  ? 'Deadline passed — respond immediately'
                  : daysLeft <= 0
                  ? 'Due today'
                  : daysLeft === 1
                  ? '1 day remaining'
                  : `${daysLeft} days remaining`}
              </Text>
            </View>

            {/* Guidance */}
            <Text style={[styles.guidanceText, { color: colors.textSecondary }]}>
              {DEMAND_TYPE_GUIDANCE[demand.demandType] ?? 'Provide evidence to verify this asset.'}
            </Text>
          </View>
        </View>

        {/* Evidence photo upload */}
        <View>
          <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>
            EVIDENCE PHOTOS
          </Text>
          <Text style={[styles.sectionHint, { color: colors.textSecondary }]}>
            Upload photos proving {demand.demandType === 'authenticity' ? 'authenticity' : demand.demandType === 'possession' ? 'possession' : 'the item\'s condition'}. At least 1 required.
          </Text>

          {evidencePhotos.length > 0 && (
            <View style={styles.photoGrid}>
              {evidencePhotos.map((uri, index) => (
                <View key={uri + index} style={styles.photoTileWrap}>
                  <CachedImage
                    uri={uri}
                    style={styles.photoTile}
                    containerStyle={{ width: 100, height: 100, borderRadius: Radius.md }}
                    contentFit="cover"
                  />
                  <Pressable
                    style={styles.photoRemoveBtn}
                    onPress={() => handleRemovePhoto(index)}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel={`Remove photo ${index + 1}`}
                  >
                    <Ionicons name="close-circle" size={22} color={colors.danger} />
                  </Pressable>
                </View>
              ))}
            </View>
          )}

          {/* Upload buttons */}
          <View style={styles.uploadRow}>
            <AnimatedPressable
              style={[styles.uploadBtn, { borderColor: colors.border, backgroundColor: colors.surface }]}
              onPress={handleTakePhoto}
              activeOpacity={0.8}
              scaleValue={0.97}
              hapticFeedback="light"
              accessibilityRole="button"
              accessibilityLabel="Take a photo with camera"
            >
              <Ionicons name="camera-outline" size={22} color={colors.brand} />
              <Text style={[styles.uploadBtnText, { color: colors.textPrimary }]}>
                Camera
              </Text>
            </AnimatedPressable>

            <AnimatedPressable
              style={[styles.uploadBtn, { borderColor: colors.border, backgroundColor: colors.surface }]}
              onPress={handlePickPhotos}
              activeOpacity={0.8}
              scaleValue={0.97}
              hapticFeedback="light"
              accessibilityRole="button"
              accessibilityLabel="Choose photos from gallery"
            >
              {isUploading ? (
                <ActivityIndicator size="small" color={colors.brand} />
              ) : (
                <Ionicons name="images-outline" size={22} color={colors.brand} />
              )}
              <Text style={[styles.uploadBtnText, { color: colors.textPrimary }]}>
                Gallery
              </Text>
            </AnimatedPressable>
          </View>
          <Text style={[styles.photoCount, { color: colors.textMuted }]}>
            {evidencePhotos.length}/6 photos
          </Text>
        </View>

        {/* Evidence notes */}
        <View>
          <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>
            NOTES (OPTIONAL)
          </Text>
          <View style={[styles.inputCard, { backgroundColor: colors.surface, borderColor: colors.borderSubtle }]}>
            <TextInput
              style={[styles.input, { color: colors.textPrimary }]}
              placeholder="Add context about your evidence — serial numbers, certificates, dates, etc."
              placeholderTextColor={colors.textMuted}
              multiline
              textAlignVertical="top"
              value={evidenceNotes}
              onChangeText={setEvidenceNotes}
              maxLength={2000}
            />
            <Text style={[styles.charCount, { color: colors.textMuted }]}>
              {evidenceNotes.length}/2000
            </Text>
          </View>
        </View>

        {/* Liability warning */}
        <View>
          <View style={[styles.warningBox, { backgroundColor: colors.warningSubtle, borderColor: colors.warningBorder }]}>
            <Ionicons name="shield-outline" size={18} color={colors.warning} />
            <Text style={[styles.warningText, { color: colors.textSecondary }]}>
              Your personal liability guarantee is active. Failure to provide satisfactory evidence may trigger recourse proceedings.
            </Text>
          </View>
        </View>

        {/* Submit button */}
        <View style={styles.footer}>
          <AppButton
            title={isSubmitting ? 'Submitting...' : 'Submit evidence'}
            onPress={handleSubmit}
            disabled={!canSubmit}
            variant="primary"
            size="lg"
            hapticFeedback="medium"
            accessibilityLabel="Submit evidence to buyer"
          />
        </View>
      </KeyboardAwareScrollView>
    </FlagshipScreen>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    scrollContent: {
      paddingHorizontal: Space.md,
      paddingTop: Space.sm,
      paddingBottom: Space.xl,
    },
    respondedContainer: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: Space.xxl,
      paddingHorizontal: Space.lg,
    },
    respondedIcon: {
      width: Space.xxl + Space.xl,
      height: Space.xxl + Space.xl,
      borderRadius: Radius.full,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: Space.md,
    },
    respondedTitle: {
      fontSize: Type.title.size,
      fontFamily: Typography.family.bold,
      lineHeight: Type.title.lineHeight,
      letterSpacing: Type.title.letterSpacing,
      textAlign: 'center',
      marginBottom: Space.sm,
    },
    respondedSub: {
      fontSize: Type.body.size,
      fontFamily: Typography.family.regular,
      lineHeight: Type.body.lineHeight,
      textAlign: 'center',
      maxWidth: Space.xxl * 6 - Space.sm,
    },
    evidencePreview: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.sm,
      marginTop: Space.lg,
      padding: Space.md,
      borderRadius: Radius.lg,
      borderWidth: StyleSheet.hairlineWidth,
    },
    evidenceThumb: {
      width: Space.xxl + Space.sm,
      height: Space.xxl + Space.sm,
      borderRadius: Radius.md,
    },
    evidenceInfo: {
      flex: 1,
      gap: Space.xs / 2,
    },
    evidenceLabel: {
      fontSize: Type.meta.size,
      fontFamily: Typography.family.semibold,
      letterSpacing: LetterSpacing.wide + 0.18,
      textTransform: 'uppercase',
    },
    evidenceDate: {
      fontSize: Type.body.size,
      fontFamily: Typography.family.regular,
    },
    demandCard: {
      borderRadius: Radius.lg,
      borderWidth: StyleSheet.hairlineWidth,
      padding: Space.md,
      marginBottom: Space.lg,
    },
    demandTypeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.sm,
      marginBottom: Space.sm,
    },
    demandTypeIcon: {
      width: Control.chrome + Space.xs,
      height: Control.chrome + Space.xs,
      borderRadius: Radius.md,
      alignItems: 'center',
      justifyContent: 'center',
    },
    demandTypeInfo: {
      flex: 1,
      gap: Space.xs / 2,
    },
    demandTypeLabel: {
      fontSize: Type.meta.size,
      fontFamily: Typography.family.semibold,
      letterSpacing: LetterSpacing.wide + 0.18,
      textTransform: 'uppercase',
    },
    demandTypeTitle: {
      fontSize: Type.subtitle.size,
      fontFamily: Typography.family.semibold,
      lineHeight: Type.subtitle.lineHeight,
      letterSpacing: Type.subtitle.letterSpacing,
    },
    deadlineBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs,
      paddingHorizontal: Space.sm,
      paddingVertical: Space.xs + 2,
      borderRadius: Radius.md,
      marginBottom: Space.sm,
      alignSelf: 'flex-start',
    },
    deadlineBadgeText: {
      fontSize: Type.caption.size,
      fontFamily: Typography.family.medium,
    },
    guidanceText: {
      fontSize: Type.body.size,
      fontFamily: Typography.family.regular,
      lineHeight: Type.body.lineHeight,
    },
    sectionLabel: {
      fontSize: Type.meta.size,
      fontFamily: Typography.family.semibold,
      letterSpacing: LetterSpacing.wide + 0.18,
      textTransform: 'uppercase',
      marginBottom: Space.xs,
    },
    sectionHint: {
      fontSize: Type.caption.size,
      fontFamily: Typography.family.regular,
      lineHeight: Type.caption.lineHeight,
      marginBottom: Space.sm,
    },
    photoGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: Space.sm,
      marginBottom: Space.sm,
    },
    photoTileWrap: {
      position: 'relative',
    },
    photoTile: {
      width: Space.xxl * 2 + Space.xs,
      height: Space.xxl * 2 + Space.xs,
      borderRadius: Radius.md,
    },
    photoRemoveBtn: {
      position: 'absolute',
      top: -6,
      right: -6,
      zIndex: 1,
    },
    uploadRow: {
      flexDirection: 'row',
      gap: Space.sm,
    },
    uploadBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: Space.xs,
      paddingVertical: Space.smMd,
      borderRadius: Radius.lg,
      borderWidth: StyleSheet.hairlineWidth,
    },
    uploadBtnText: {
      fontSize: Type.body.size,
      fontFamily: Typography.family.semibold,
    },
    photoCount: {
      fontSize: Type.caption.size,
      fontFamily: Typography.family.regular,
      marginTop: Space.xs,
      textAlign: 'center',
    },
    inputCard: {
      borderRadius: Radius.lg,
      borderWidth: StyleSheet.hairlineWidth,
      padding: Space.md,
      minHeight: Space.lg * 5,
    },
    input: {
      fontSize: Type.body.size,
      fontFamily: Typography.family.regular,
      lineHeight: Type.body.lineHeight,
      minHeight: Space.xxl + Space.xl,
      padding: 0,
    },
    charCount: {
      fontSize: Type.meta.size,
      fontFamily: Typography.family.regular,
      textAlign: 'right',
      marginTop: Space.xs,
    },
    warningBox: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: Space.sm,
      padding: Space.md,
      borderRadius: Radius.lg,
      borderWidth: StyleSheet.hairlineWidth,
      marginTop: Space.lg,
    },
    warningText: {
      flex: 1,
      fontSize: Type.caption.size,
      fontFamily: Typography.family.regular,
      lineHeight: Type.caption.lineHeight + 2,
    },
    footer: {
      marginTop: Space.lg,
    },
  });
}
