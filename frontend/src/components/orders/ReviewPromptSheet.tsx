import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, Modal, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/colors';
import { Space, Radius, Typography, Type } from '../../theme/designTokens';
import { AnimatedPressable } from '../AnimatedPressable';
import { AppButton } from '../ui/AppButton';
import { CachedImage } from '../CachedImage';
import { haptics } from '../../utils/haptics';

// ── Types ────────────────────────────────────────────────────────────────────

export interface ReviewPromptSheetProps {
  visible: boolean;
  itemTitle?: string;
  itemImage?: string | null;
  sellerName?: string;
  onClose: () => void;
  onWriteReview: (rating?: number) => void;
}

// ── Component ────────────────────────────────────────────────────────────────

export function ReviewPromptSheet({
  visible,
  itemTitle,
  itemImage,
  sellerName,
  onClose,
  onWriteReview,
}: ReviewPromptSheetProps) {
  const [selectedRating, setSelectedRating] = useState(0);

  const handleStarPress = useCallback((star: number) => {
    haptics.tap();
    setSelectedRating(star);
  }, []);

  const handleWriteReview = useCallback(() => {
    haptics.press();
    onWriteReview(selectedRating > 0 ? selectedRating : undefined);
  }, [selectedRating, onWriteReview]);

  const handleSkip = useCallback(() => {
    haptics.tap();
    onClose();
  }, [onClose]);

  const ratingLabel = selectedRating > 0
    ? ['Poor', 'Fair', 'Good', 'Very Good', 'Excellent'][selectedRating - 1]
    : null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.handle} />

          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerIcon}>
              <Ionicons name="star-outline" size={20} color={Colors.brand} />
            </View>
            <Text style={styles.title}>How was your order?</Text>
            <Text style={styles.subtitle}>
              Your review helps other buyers and supports {sellerName ?? 'the seller'}.
            </Text>
          </View>

          {/* Item context */}
          {(itemTitle || itemImage) && (
            <View style={styles.itemRow}>
              {itemImage ? (
                <CachedImage
                  uri={itemImage}
                  style={styles.itemImage}
                  containerStyle={{ width: 48, height: 48, borderRadius: Radius.md }}
                  contentFit="cover"
                />
              ) : (
                <View style={[styles.itemImage, styles.itemImageFallback]}>
                  <Ionicons name="shirt-outline" size={18} color={Colors.textMuted} />
                </View>
              )}
              <Text style={styles.itemTitle} numberOfLines={2}>{itemTitle ?? 'Your item'}</Text>
            </View>
          )}

          {/* Quick star rating */}
          <View style={styles.starsContainer}>
            {[1, 2, 3, 4, 5].map((star) => (
              <AnimatedPressable
                key={star}
                onPress={() => handleStarPress(star)}
                activeOpacity={0.7}
                scaleValue={0.9}
                hapticFeedback="light"
                accessibilityRole="button"
                accessibilityLabel={`${star} star${star > 1 ? 's' : ''}`}
              >
                <Ionicons
                  name={selectedRating >= star ? 'star' : 'star-outline'}
                  size={36}
                  color={selectedRating >= star ? Colors.brand : Colors.textMuted}
                />
              </AnimatedPressable>
            ))}
          </View>

          {ratingLabel && (
            <Text style={styles.ratingLabel}>{ratingLabel}</Text>
          )}

          {/* Actions */}
          <View style={styles.actions}>
            <AppButton
              title="Write a review"
              icon={<Ionicons name="create-outline" size={16} color={Colors.textInverse} />}
              variant="primary"
              size="md"
              onPress={handleWriteReview}
              accessibilityLabel="Write a detailed review"
              style={styles.writeBtn}
            />
            <Pressable
              onPress={handleSkip}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="Skip review for now"
            >
              <Text style={styles.skipText}>Maybe later</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  sheet: {
    backgroundColor: Colors.background,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    paddingBottom: Space.xl,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(0,0,0,0.15)',
    alignSelf: 'center',
    marginTop: Space.sm,
    marginBottom: Space.md,
  },
  header: {
    alignItems: 'center',
    paddingHorizontal: Space.md,
    gap: Space.xs,
  },
  headerIcon: {
    width: 40,
    height: 40,
    borderRadius: Radius.full,
    backgroundColor: `${Colors.brand}15`,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Space.xs,
  },
  title: {
    fontSize: Type.title.size,
    fontFamily: Typography.family.bold,
    color: Colors.textPrimary,
    letterSpacing: -0.3,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.regular,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    paddingHorizontal: Space.md,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    marginHorizontal: Space.md,
    marginTop: Space.md,
    backgroundColor: Colors.surfaceAlt,
    borderRadius: Radius.lg,
    padding: Space.sm + 2,
  },
  itemImage: {
    width: 48,
    height: 48,
    borderRadius: Radius.md,
    flexShrink: 0,
  },
  itemImageFallback: {
    backgroundColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemTitle: {
    flex: 1,
    fontSize: Type.body.size,
    fontFamily: Typography.family.semibold,
    color: Colors.textPrimary,
    lineHeight: 18,
  },
  starsContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 10,
    marginTop: Space.lg,
  },
  ratingLabel: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.semibold,
    color: Colors.brand,
    textAlign: 'center',
    marginTop: Space.sm,
  },
  actions: {
    alignItems: 'center',
    gap: Space.md,
    marginTop: Space.lg,
    paddingHorizontal: Space.md,
  },
  writeBtn: {
    width: '100%',
  },
  skipText: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.medium,
    color: Colors.textMuted,
    paddingVertical: Space.xs,
  },
});
