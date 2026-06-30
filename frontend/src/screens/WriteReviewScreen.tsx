import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  StatusBar,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Reanimated, { FadeInDown } from 'react-native-reanimated';
import { Colors } from '../constants/colors';
import { useToast } from '../context/ToastContext';
import { Typography, Space, Radius, Type, Elevation } from '../theme/designTokens';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { AppButton } from '../components/ui/AppButton';
import { ScreenHeader } from '../components/ui/ScreenHeader';
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

  const handleSubmit = useCallback(async () => {
    if (!canSubmit) return;
    haptic.medium();
    setIsSubmitting(true);
    try {
      await createOrderReview(orderId, rating, review.trim() || undefined);
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

      <KeyboardAvoidingView
        style={styles.content}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
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
            </>
          )}
        </ScrollView>

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
      </KeyboardAvoidingView>
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