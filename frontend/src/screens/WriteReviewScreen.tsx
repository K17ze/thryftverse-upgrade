import React, { useState, useCallback, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  ActivityIndicator,
  Pressable } from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useToast } from '../context/ToastContext';
import { Space, Radius, Stroke } from '../theme/designTokens';
import { TypographyV2 } from '../theme/typography.v2';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { AppButton } from '../components/ui/AppButton';
import { FlagshipScreen, FlagshipHeader } from '../components/flagship';
import { WriteReviewSkeleton } from '../components/skeletons/WriteReviewSkeleton';
import { KeyboardAwareScrollView } from '../platform/keyboard/KeyboardProvider';
import { useAppTheme, type ThemeColors } from '../theme/ThemeContext';
import { useHaptic } from '../hooks/useHaptic';
import { useConnectivity } from '../hooks/useConnectivity';
import { RootStackParamList } from '../navigation/types';
import { getOrder, CommerceOrder } from '../services/commerceApi';
import { getOrderReview, createOrderReview, OrderReview } from '../services/reviewApi';
import { parseApiError } from '../lib/apiClient';
import { CachedImage } from '../components/CachedImage';
import { getListingCoverUri } from '../utils/media';
import { uploadMedia } from '../services/mediaUpload';

type RouteT = RouteProp<RootStackParamList, 'WriteReview'>;

const RATING_LABELS = ['Poor', 'Fair', 'Good', 'Very good', 'Excellent'];

export default function WriteReviewScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<RouteT>();
  const { orderId, initialRating } = route.params;
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { show } = useToast();
  const { isOffline } = useConnectivity();
  const haptic = useHaptic();

  const [rating, setRating] = useState(initialRating ?? 0);
  const [review, setReview] = useState('');
  const [photoUris, setPhotoUris] = useState<string[]>([]);
  const [isUploadingPhotos, setIsUploadingPhotos] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [existingReview, setExistingReview] = useState<OrderReview | null>(null);
  const [order, setOrder] = useState<CommerceOrder | null>(null);
  // Unknown-outcome: when the network drops before the response, the outcome
  // is ambiguous — not success, not error. Show "Checking your review" instead
  // of fabricating success (AGENTS.md §11 — Truthful UI).
  const [isUnknownOutcome, setIsUnknownOutcome] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const loadData = async () => {
      try {
        const [fetchedOrder, fetchedReview] = await Promise.all([
          getOrder(orderId),
          getOrderReview(orderId),
        ]);
        if (cancelled) return;
        setOrder(fetchedOrder);
        if (fetchedReview) {
          setExistingReview(fetchedReview);
          setRating(fetchedReview.rating);
          setReview(fetchedReview.comment ?? '');
        }
      } catch {
        // Non-critical; user can still attempt to submit
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };
    void loadData();
    return () => { cancelled = true; };
  }, [orderId]);

  const canSubmit = rating > 0 && !isSubmitting && !isLoading && !existingReview && !isUnknownOutcome;

  const handlePickPhotos = useCallback(async () => {
    if (photoUris.length >= 4) {
      show('Attach up to 4 photos.', 'info');
      return;
    }
    haptic.light();
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        show('Allow gallery access to upload photos.', 'error');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false,
        quality: 0.85,
        selectionLimit: 4 - photoUris.length });
      if (result.canceled || !result.assets?.length) return;
      setIsUploadingPhotos(true);
      const uploaded: string[] = [];
      for (const asset of result.assets) {
        const uploadedMedia = await uploadMedia(asset.uri, 'review');
        uploaded.push(uploadedMedia.publicUrl);
      }
      setPhotoUris((prev) => [...prev, ...uploaded]);
      show(`${uploaded.length} photo${uploaded.length > 1 ? 's' : ''} attached.`, 'success');
    } catch {
      show('Unable to upload photo(s). Try again.', 'error');
    } finally {
      setIsUploadingPhotos(false);
    }
  }, [photoUris.length, haptic, show]);

  const handleRemovePhoto = useCallback((index: number) => {
    haptic.light();
    setPhotoUris((prev) => prev.filter((_, i) => i !== index));
  }, [haptic]);

  const handleSubmit = useCallback(async () => {
    if (!canSubmit) return;
    haptic.medium();
    setIsSubmitting(true);
    setIsUnknownOutcome(false);
    try {
      await createOrderReview(orderId, rating, review.trim() || undefined, photoUris.length > 0 ? photoUris : undefined);
      haptic.success();
      show('Review published', 'success');
      navigation.goBack();
    } catch (err) {
      const isNetworkError = isOffline || (err instanceof Error && /network|fetch|timeout/i.test(err.message));
      if (isNetworkError) {
        // Unknown outcome — the request may have reached the server. Show a
        // distinct state, not a success or a hard error (AGENTS.md §11).
        setIsUnknownOutcome(true);
        show('Checking your review — connection was lost. Your review may have been published.', 'info');
      } else {
        const parsed = parseApiError(err);
        show(parsed.message, 'error');
      }
    } finally {
      setIsSubmitting(false);
    }
  }, [canSubmit, haptic, orderId, rating, review, show, navigation, isOffline, photoUris]);

  if (isLoading) {
    return (
      <FlagshipScreen header={<FlagshipHeader title="Review" onBack={() => navigation.goBack()} />}>
        <WriteReviewSkeleton />
      </FlagshipScreen>
    );
  }

  return (
    <FlagshipScreen
      header={<FlagshipHeader title="Review" onBack={() => navigation.goBack()} />}
      scrollEnabled={false}
      contentStyle={{ paddingHorizontal: 0, paddingTop: 0 }}
    >
      <KeyboardAwareScrollView
        style={styles.content}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
      >
          {/* Order context — flat, no card chrome. The listing image is the
              dominant object; title and order number are subordinate metadata. */}
          {order && (
            <View style={styles.orderRow}>
              {order.listingImageUrl && (
                <CachedImage
                  uri={getListingCoverUri([order.listingImageUrl], '')}
                  style={styles.orderThumb}
                  contentFit="cover"
                />
              )}
              <View style={styles.orderInfo}>
                <Text style={styles.orderTitle} numberOfLines={2}>{order.listingTitle}</Text>
                <Text style={styles.orderMeta}>Order #{orderId.slice(-8).toUpperCase()}</Text>
              </View>
            </View>
          )}

          {existingReview ? (
            <View style={styles.existingState}>
              <Ionicons name="checkmark-circle" size={28} color={colors.success} />
              <Text style={styles.existingTitle}>Review published</Text>
              <Text style={styles.existingSub}>
                {existingReview.rating} star{existingReview.rating > 1 ? 's' : ''} ·{' '}
                {new Date(existingReview.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
              </Text>
              {existingReview.comment ? (
                <Text style={styles.existingComment}>{existingReview.comment}</Text>
              ) : null}
              {existingReview.photoUrls && existingReview.photoUrls.length > 0 && (
                <View style={styles.existingPhotos}>
                  {existingReview.photoUrls.map((uri, i) => (
                    <CachedImage
                      key={uri + i}
                      uri={uri}
                      style={styles.existingPhoto}
                      containerStyle={{ width: 64, height: 64, borderRadius: Radius.md }}
                      contentFit="cover"
                    />
                  ))}
                </View>
              )}
            </View>
          ) : (
            <>
              {/* Rating — the dominant interaction. Left-aligned, not centered.
                  The star row is the primary control; the label confirms the
                  selection without competing for visual weight. */}
              <View style={styles.ratingSection}>
                <Text style={styles.ratingPrompt}>Rate this purchase</Text>
                <View style={styles.starsRow}>
                  {[1, 2, 3, 4, 5].map((star) => (
                    <AnimatedPressable
                      key={star}
                      onPress={() => { haptic.light(); setRating(star); }}
                      activeOpacity={0.7}
                      scaleValue={0.9}
                      accessibilityRole="button"
                      accessibilityLabel={`${star} of 5${star > 1 ? 's' : ''}${rating === star ? ', selected' : ''}`}
                      accessibilityState={{ selected: rating === star }}
                    >
                      <Ionicons
                        name={rating >= star ? 'star' : 'star-outline'}
                        size={36}
                        color={rating >= star ? colors.brand : colors.textMuted}
                      />
                    </AnimatedPressable>
                  ))}
                </View>
                {rating > 0 && (
                  <Text style={styles.ratingLabel}>{RATING_LABELS[rating - 1]}</Text>
                )}
              </View>

              {/* Text — no eyebrow label. The placeholder is the prompt.
                  Flat input with a hairline border, no card chrome. */}
              <View style={styles.textSection}>
                <TextInput
                  style={styles.textInput}
                  placeholder="What should another buyer know?"
                  placeholderTextColor={colors.textMuted}
                  multiline
                  textAlignVertical="top"
                  value={review}
                  onChangeText={setReview}
                  maxLength={2000}
                  accessibilityLabel="Review text"
                  accessibilityHint="Share your experience, up to 2000 characters"
                />
                <Text style={styles.charCount}>{review.length}/2000</Text>
              </View>

              {/* Photos — optional, with privacy guidance. No eyebrow label.
                  The add control is a hairline-bordered tile, not an elevated card. */}
              <View style={styles.photoSection}>
                {photoUris.length > 0 && (
                  <View style={styles.photoGrid}>
                    {photoUris.map((uri, index) => (
                      <View key={uri + index} style={styles.photoTileWrap}>
                        <CachedImage
                          uri={uri}
                          style={styles.photoTile}
                          containerStyle={{ width: 72, height: 72, borderRadius: Radius.md }}
                          contentFit="cover"
                        />
                        <Pressable
                          style={styles.photoRemoveBtn}
                          onPress={() => handleRemovePhoto(index)}
                          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                          accessibilityRole="button"
                          accessibilityLabel={`Remove photo ${index + 1}`}
                        >
                          <Ionicons name="close-circle" size={20} color={colors.danger} />
                        </Pressable>
                      </View>
                    ))}
                  </View>
                )}

                {photoUris.length < 4 && (
                  <AnimatedPressable
                    style={styles.photoAddBtn}
                    onPress={handlePickPhotos}
                    activeOpacity={0.8}
                    scaleValue={0.97}
                    hapticFeedback="light"
                    accessibilityRole="button"
                    accessibilityLabel="Add photos to your review"
                  >
                    {isUploadingPhotos ? (
                      <ActivityIndicator size="small" color={colors.brand} />
                    ) : (
                      <>
                        <Ionicons name="camera-outline" size={20} color={colors.brand} />
                        <Text style={styles.photoAddText}>
                          {photoUris.length > 0 ? 'Add more' : 'Add photos'}
                        </Text>
                      </>
                    )}
                    <Text style={styles.photoAddHint}>{photoUris.length}/4</Text>
                  </AnimatedPressable>
                )}

                <Text style={styles.photoPrivacy}>
                  Remove labels, addresses and faces you don't want public.
                </Text>
              </View>
            </>
          )}

        {!existingReview && (
          <View style={styles.footer}>
            <AppButton
              title={
                isUnknownOutcome ? 'Checking your review'
                : isSubmitting ? 'Publishing...'
                : 'Publish review'
              }
              onPress={handleSubmit}
              disabled={!canSubmit}
              variant="primary"
              size="lg"
              hapticFeedback="medium"
              accessibilityLabel="Publish review"
            />
          </View>
        )}
      </KeyboardAwareScrollView>
    </FlagshipScreen>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
  content: { flex: 1 },
  scrollContent: {
    paddingHorizontal: Space.md,
    paddingTop: Space.md,
    paddingBottom: Space.xl,
    gap: Space.lg },
  // Order context — flat row, no card
  orderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    paddingBottom: Space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border },
  orderThumb: {
    width: 48,
    height: 48,
    borderRadius: Radius.md },
  orderInfo: {
    flex: 1,
    gap: 2 },
  orderTitle: {
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily,
    color: colors.textPrimary },
  orderMeta: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    color: colors.textSecondary },
  // Rating — left-aligned, dominant
  ratingSection: {
    gap: Space.sm },
  ratingPrompt: {
    fontSize: TypographyV2.screenTitle.size,
    fontFamily: TypographyV2.screenTitle.fontFamily,
    color: colors.textPrimary },
  starsRow: {
    flexDirection: 'row',
    gap: Space.sm },
  ratingLabel: {
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily,
    color: colors.brand },
  // Text — flat input, hairline border
  textSection: {
    gap: Space.xs },
  textInput: {
    minHeight: 120,
    maxHeight: 240,
    color: colors.textPrimary,
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily,
    textAlignVertical: 'top',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: Radius.md,
    padding: Space.md },
  charCount: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    color: colors.textMuted,
    textAlign: 'right' },
  // Photos — hairline add tile, privacy guidance
  photoSection: {
    gap: Space.sm },
  photoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Space.sm },
  photoTileWrap: {
    position: 'relative' },
  photoTile: {
    width: 72,
    height: 72,
    borderRadius: Radius.md },
  photoRemoveBtn: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: colors.background,
    borderRadius: Radius.lg },
  photoAddBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: Radius.md,
    paddingVertical: Space.md },
  photoAddText: {
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily,
    color: colors.brand,
    flex: 1 },
  photoAddHint: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    color: colors.textMuted },
  photoPrivacy: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    color: colors.textMuted,
    lineHeight: TypographyV2.meta.lineHeight },
  // Existing review state — flat, no card
  existingState: {
    gap: Space.sm,
    paddingVertical: Space.md },
  existingTitle: {
    fontSize: TypographyV2.screenTitle.size,
    fontFamily: TypographyV2.screenTitle.fontFamily,
    color: colors.textPrimary },
  existingSub: {
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily,
    color: colors.textSecondary },
  existingComment: {
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily,
    color: colors.textPrimary,
    lineHeight: TypographyV2.body.lineHeight + 4,
    marginTop: Space.xs },
  existingPhotos: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Space.sm,
    marginTop: Space.sm },
  existingPhoto: {
    width: 64,
    height: 64,
    borderRadius: Radius.md },
  footer: {
    paddingHorizontal: Space.md,
    paddingVertical: Space.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border } });
}