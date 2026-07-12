import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  StatusBar,
  ActivityIndicator,
  Pressable,
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import Reanimated, { FadeInDown } from 'react-native-reanimated';
import { Colors } from '../constants/colors';
import { useToast } from '../context/ToastContext';
import { Typography, Space, Radius, Type, Elevation } from '../theme/designTokens';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { AppButton } from '../components/ui/AppButton';
import { ScreenHeader } from '../components/ui/ScreenHeader';
import { KeyboardAwareScrollView } from '../platform/keyboard/KeyboardProvider';
import { useAppTheme } from '../theme/ThemeContext';
import { useHaptic } from '../hooks/useHaptic';
import { Meta, BodyEmphasis, Caption } from '../components/ui/Text';
import { ElevatedSurface } from '../components/ui/ElevatedSurface';
import { RootStackParamList } from '../navigation/types';
import { getOrder, CommerceOrder } from '../services/commerceApi';
import { getOrderReview, createOrderReview, OrderReview } from '../services/reviewApi';
import { parseApiError } from '../lib/apiClient';
import { CachedImage } from '../components/CachedImage';
import { getListingCoverUri } from '../utils/media';
import { uploadMedia } from '../services/mediaUpload';

type RouteT = RouteProp<RootStackParamList, 'WriteReview'>;

export default function WriteReviewScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<RouteT>();
  const { orderId } = route.params;
  const { isDark } = useAppTheme();
  const { show } = useToast();
  const haptic = useHaptic();

  const [rating, setRating] = useState(0);
  const [review, setReview] = useState('');
  const [photoUris, setPhotoUris] = useState<string[]>([]);
  const [isUploadingPhotos, setIsUploadingPhotos] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [existingReview, setExistingReview] = useState<OrderReview | null>(null);
  const [order, setOrder] = useState<CommerceOrder | null>(null);

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

  const canSubmit = rating > 0 && !isSubmitting && !isLoading && !existingReview;

  const handlePickPhotos = useCallback(async () => {
    if (photoUris.length >= 4) {
      show('You can attach up to 4 photos.', 'info');
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
        selectionLimit: 4 - photoUris.length,
      });
      if (result.canceled || !result.assets?.length) return;
      setIsUploadingPhotos(true);
      const uploaded: string[] = [];
      for (const asset of result.assets) {
        const publicUrl = await uploadMedia(asset.uri, 'review');
        uploaded.push(publicUrl);
      }
      setPhotoUris((prev) => [...prev, ...uploaded]);
      show(`${uploaded.length} photo${uploaded.length > 1 ? 's' : ''} attached.`, 'success');
    } catch {
      show('Unable to upload photo(s). Please try again.', 'error');
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
    try {
      await createOrderReview(orderId, rating, review.trim() || undefined, photoUris.length > 0 ? photoUris : undefined);
      show('Review submitted successfully', 'success');
      navigation.goBack();
    } catch (err) {
      const parsed = parseApiError(err);
      show(parsed.message, 'error');
    } finally {
      setIsSubmitting(false);
    }
  }, [canSubmit, haptic, orderId, rating, review, show, navigation]);

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
        <ScreenHeader title="Write a Review" onBack={() => navigation.goBack()} />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.brand} />
          <Text style={styles.loadingText}>Loading…</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

      <ScreenHeader title="Write a Review" onBack={() => navigation.goBack()} />

      <KeyboardAwareScrollView
        style={styles.content}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
      >
          {/* Order context */}
          {order && (
            <Reanimated.View entering={FadeInDown.duration(300).delay(0)}>
              <ElevatedSurface variant="surface" style={styles.orderCard}>
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
              </ElevatedSurface>
            </Reanimated.View>
          )}

          {existingReview ? (
            <Reanimated.View entering={FadeInDown.duration(300).delay(20)} style={styles.existingCard}>
              <Ionicons name="checkmark-circle" size={32} color={Colors.success} />
              <BodyEmphasis style={styles.existingTitle}>Review already submitted</BodyEmphasis>
              <Caption color={Colors.textSecondary} style={styles.existingSub}>
                You rated this order {existingReview.rating} star{existingReview.rating > 1 ? 's' : ''} on{' '}
                {new Date(existingReview.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}.
              </Caption>
              {existingReview.comment && (
                <View style={styles.existingCommentBox}>
                  <Text style={styles.existingCommentText}>{existingReview.comment}</Text>
                </View>
              )}
            </Reanimated.View>
          ) : (
            <>
              <Reanimated.View entering={FadeInDown.duration(300).delay(20)}>
                <Text style={styles.promptText}>How was your experience?</Text>

                <View style={styles.starsContainer}>
                  {[1, 2, 3, 4, 5].map((star) => (
                    <AnimatedPressable
                      key={star}
                      onPress={() => { haptic.light(); setRating(star); }}
                      activeOpacity={0.7}
                      scaleValue={0.9}
                      accessibilityRole="button"
                      accessibilityLabel={`${star} star${star > 1 ? 's' : ''}`}
                    >
                      <Ionicons
                        name={rating >= star ? 'star' : 'star-outline'}
                        size={44}
                        color={rating >= star ? Colors.brand : Colors.textMuted}
                      />
                    </AnimatedPressable>
                  ))}
                </View>

                {rating > 0 && (
                  <Text style={styles.ratingLabel}>
                    {['Poor', 'Fair', 'Good', 'Very Good', 'Excellent'][rating - 1]}
                  </Text>
                )}
              </Reanimated.View>

              <Reanimated.View entering={FadeInDown.duration(300).delay(60)}>
                <Meta color={Colors.textMuted} style={styles.sectionLabel}>DETAILED REVIEW (OPTIONAL)</Meta>
                <View style={styles.inputCard}>
                  <TextInput
                    style={styles.input}
                    placeholder="Tell others what you thought about the item and seller..."
                    placeholderTextColor={Colors.textMuted}
                    multiline
                    textAlignVertical="top"
                    value={review}
                    onChangeText={setReview}
                    maxLength={2000}
                  />
                  <Text style={styles.charCount}>{review.length}/2000</Text>
                </View>
              </Reanimated.View>

              {/* Photo upload section */}
              <Reanimated.View entering={FadeInDown.duration(300).delay(80)}>
                <Meta color={Colors.textMuted} style={styles.sectionLabel}>PHOTOS (OPTIONAL)</Meta>
                <View style={styles.photoSection}>
                  {photoUris.length > 0 && (
                    <View style={styles.photoGrid}>
                      {photoUris.map((uri, index) => (
                        <View key={uri + index} style={styles.photoTileWrap}>
                          <CachedImage
                            uri={uri}
                            style={styles.photoTile}
                            containerStyle={{ width: 76, height: 76, borderRadius: Radius.md }}
                            contentFit="cover"
                          />
                          <Pressable
                            style={styles.photoRemoveBtn}
                            onPress={() => handleRemovePhoto(index)}
                            hitSlop={8}
                            accessibilityRole="button"
                            accessibilityLabel={`Remove photo ${index + 1}`}
                          >
                            <Ionicons name="close-circle" size={20} color={Colors.danger} />
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
                        <ActivityIndicator size="small" color={Colors.brand} />
                      ) : (
                        <>
                          <Ionicons name="camera-outline" size={22} color={Colors.brand} />
                          <Text style={styles.photoAddText}>
                            {photoUris.length > 0 ? 'Add more photos' : 'Add photos'}
                          </Text>
                        </>
                      )}
                      <Text style={styles.photoAddHint}>{photoUris.length}/4</Text>
                    </AnimatedPressable>
                  )}
                </View>
              </Reanimated.View>
            </>
          )}

        {!existingReview && (
          <View style={styles.footer}>
            <AppButton
              title={isSubmitting ? 'Submitting...' : 'Submit Review'}
              onPress={handleSubmit}
              disabled={!canSubmit}
              variant="primary"
              size="lg"
              hapticFeedback="medium"
              accessibilityLabel="Submit review"
            />
          </View>
        )}
      </KeyboardAwareScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { flex: 1 },
  scrollContent: {
    paddingHorizontal: Space.md,
    paddingTop: Space.sm,
    paddingBottom: Space.xl,
    gap: Space.lg,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: Space.md,
  },
  loadingText: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.regular,
    color: Colors.textMuted,
  },
  orderCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: Space.md,
    ...Elevation.subtle,
  },
  orderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
  },
  orderThumb: {
    width: 48,
    height: 48,
    borderRadius: Radius.md,
  },
  orderInfo: {
    flex: 1,
    gap: 2,
  },
  orderTitle: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.semibold,
    color: Colors.textPrimary,
  },
  orderMeta: {
    fontSize: Type.meta.size,
    fontFamily: Typography.family.regular,
    color: Colors.textSecondary,
  },
  promptText: {
    fontSize: Type.title.size,
    fontFamily: Typography.family.semibold,
    color: Colors.textPrimary,
    textAlign: 'center',
    marginBottom: Space.md,
  },
  starsContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 12,
    marginBottom: Space.sm,
  },
  ratingLabel: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.medium,
    color: Colors.brand,
    textAlign: 'center',
  },
  sectionLabel: {
    marginLeft: Space.sm,
    letterSpacing: 1.2,
    marginBottom: Space.sm,
  },
  inputCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: Space.md,
    ...Elevation.subtle,
  },
  input: {
    minHeight: 120,
    maxHeight: 240,
    color: Colors.textPrimary,
    fontSize: Type.body.size,
    fontFamily: Typography.family.regular,
    textAlignVertical: 'top',
  },
  photoSection: {
    gap: Space.sm,
  },
  photoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Space.sm,
  },
  photoTileWrap: {
    position: 'relative',
  },
  photoTile: {
    width: 76,
    height: 76,
    borderRadius: Radius.md,
  },
  photoRemoveBtn: {
    position: 'absolute',
    top: -6,
    right: -6,
    backgroundColor: Colors.background,
    borderRadius: 10,
  },
  photoAddBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space.sm,
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
    paddingVertical: Space.md,
    ...Elevation.subtle,
  },
  photoAddText: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.semibold,
    color: Colors.brand,
    flex: 1,
  },
  photoAddHint: {
    fontSize: Type.meta.size,
    fontFamily: Typography.family.medium,
    color: Colors.textMuted,
  },
  charCount: {
    fontSize: Type.meta.size,
    fontFamily: Typography.family.regular,
    color: Colors.textMuted,
    textAlign: 'right',
    marginTop: Space.xs,
  },
  existingCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: Space.lg,
    alignItems: 'center',
    gap: Space.sm,
    ...Elevation.subtle,
  },
  existingTitle: {
    fontSize: Type.title.size,
    fontFamily: Typography.family.bold,
    color: Colors.textPrimary,
    marginTop: Space.sm,
  },
  existingSub: {
    textAlign: 'center',
    lineHeight: Type.caption.lineHeight + 2,
  },
  existingCommentBox: {
    backgroundColor: Colors.surfaceAlt,
    borderRadius: Radius.md,
    padding: Space.md,
    width: '100%',
    marginTop: Space.sm,
  },
  existingCommentText: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.regular,
    color: Colors.textPrimary,
    lineHeight: Type.body.lineHeight + 4,
  },
  footer: {
    paddingHorizontal: Space.md,
    paddingVertical: Space.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
  },
});