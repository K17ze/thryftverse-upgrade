import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, Modal, Pressable, TextInput, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { Space, Radius, Typography, Type } from '../../theme/designTokens';
import { AnimatedPressable } from '../AnimatedPressable';
import { AppButton } from '../ui/AppButton';
import { haptics } from '../../utils/haptics';

// ── Types ────────────────────────────────────────────────────────────────────

export interface SellerResponseComposerProps {
  visible: boolean;
  reviewId: string;
  reviewerName?: string;
  rating?: number;
  onClose: () => void;
  onSubmit: (reviewId: string, text: string) => Promise<void>;
}

// ── Component ────────────────────────────────────────────────────────────────

const MAX_LENGTH = 500;

export function SellerResponseComposer({
  visible,
  reviewId,
  reviewerName,
  rating,
  onClose,
  onSubmit,
}: SellerResponseComposerProps) {
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const [text, setText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const canSubmit = text.trim().length > 0 && !isSubmitting;

  const handleSubmit = useCallback(async () => {
    if (!canSubmit) return;
    haptics.press();
    setIsSubmitting(true);
    try {
      await onSubmit(reviewId, text.trim());
      setText('');
      haptics.success();
      onClose();
    } catch {
      haptics.error();
    } finally {
      setIsSubmitting(false);
    }
  }, [canSubmit, reviewId, text, onSubmit, onClose]);

  const handleClose = useCallback(() => {
    if (isSubmitting) return;
    haptics.tap();
    onClose();
  }, [isSubmitting, onClose]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={handleClose}
    >
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={handleClose} />
        <View style={styles.sheet}>
          <View style={styles.handle} />

          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <View style={styles.headerIcon}>
                <Ionicons name="chatbubble-ellipses-outline" size={18} color={colors.brand} />
              </View>
              <View>
                <Text style={styles.title}>Respond to review</Text>
                <Text style={styles.subtitle}>
                  {reviewerName ? `Replying to ${reviewerName}` : 'Replying to a buyer'}
                  {rating ? ` · ${rating} star${rating > 1 ? 's' : ''}` : ''}
                </Text>
              </View>
            </View>
            <Pressable
              onPress={handleClose}
              hitSlop={12}
              disabled={isSubmitting}
              accessibilityRole="button"
              accessibilityLabel="Close response composer"
              style={({ pressed }) => pressed && { opacity: 0.5 }}
            >
              <Ionicons name="close" size={22} color={colors.textMuted} />
            </Pressable>
          </View>

          {/* Guidance */}
          <View style={styles.guidanceBox}>
            <Ionicons name="information-circle-outline" size={14} color={colors.textMuted} />
            <Text style={styles.guidanceText}>
              Keep it professional and thank the buyer. Your response is public.
            </Text>
          </View>

          {/* Input */}
          <View style={styles.inputCard}>
            <TextInput
              style={styles.input}
              placeholder="Thank your buyer and address their feedback..."
              placeholderTextColor={colors.textMuted}
              multiline
              textAlignVertical="top"
              value={text}
              onChangeText={setText}
              maxLength={MAX_LENGTH}
              autoFocus
            />
            <Text style={styles.charCount}>{text.length}/{MAX_LENGTH}</Text>
          </View>

          {/* Actions */}
          <View style={styles.actions}>
            <AppButton
              title={isSubmitting ? 'Submitting...' : 'Post response'}
              onPress={handleSubmit}
              disabled={!canSubmit}
              variant="primary"
              size="md"
              hapticFeedback="medium"
              accessibilityLabel="Post seller response"
              icon={isSubmitting ? undefined : <Ionicons name="send-outline" size={16} color={colors.textInverse} />}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: colors.overlay,
  },
  sheet: {
    backgroundColor: colors.background,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    paddingBottom: Space.xl,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: Radius.sm,
    backgroundColor: colors.border,
    alignSelf: 'center',
    marginTop: Space.sm,
    marginBottom: Space.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: Space.md,
    paddingBottom: Space.sm,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Space.sm,
    flex: 1,
    paddingRight: Space.sm,
  },
  headerIcon: {
    width: 36,
    height: 36,
    borderRadius: Radius.full,
    backgroundColor: `${colors.brand}15`,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  title: {
    fontSize: Type.subtitle.size,
    fontFamily: Typography.family.bold,
    color: colors.textPrimary,
    letterSpacing: -0.3,
    marginBottom: 2,
  },
  subtitle: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.regular,
    color: colors.textSecondary,
    lineHeight: Type.caption.lineHeight,
  },
  guidanceBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Space.xs + 2,
    marginHorizontal: Space.md,
    marginBottom: Space.sm,
    backgroundColor: colors.surfaceAlt,
    borderRadius: Radius.md,
    padding: Space.sm,
  },
  guidanceText: {
    flex: 1,
    fontSize: Type.caption.size,
    fontFamily: Typography.family.regular,
    color: colors.textMuted,
    lineHeight: Type.caption.lineHeight,
  },
  inputCard: {
    marginHorizontal: Space.md,
    backgroundColor: colors.surface,
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: Space.md,
  },
  input: {
    minHeight: 100,
    maxHeight: 200,
    color: colors.textPrimary,
    fontSize: Type.body.size,
    fontFamily: Typography.family.regular,
    textAlignVertical: 'top',
  },
  charCount: {
    fontSize: Type.meta.size,
    fontFamily: Typography.family.regular,
    color: colors.textMuted,
    textAlign: 'right',
    marginTop: Space.xs,
  },
  actions: {
    paddingHorizontal: Space.md,
    paddingTop: Space.md,
  },
  });
}
