import React, { useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { Space, Radius, Stroke, Control, FontFamily } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { AnimatedPressable } from '../AnimatedPressable';
import { AppButton } from '../ui/AppButton';
import type { ConversationOwnershipState } from '../../contracts/support';
import { stateBannerTextFor } from './supportConversationViewModels';

export interface SupportStateBannerProps {
  ownershipState: ConversationOwnershipState;
  showFeedback: boolean;
  isConfirming: boolean;
  onFeedback: (rating: 'helpful' | 'unhelpful') => void;
  onConfirmResolution: (resolved: boolean) => void;
}

export function SupportStateBanner({
  ownershipState,
  showFeedback,
  isConfirming,
  onFeedback,
  onConfirmResolution }: SupportStateBannerProps) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  if (ownershipState === 'ai_active' || ownershipState === 'human_active') {
    return null;
  }

  // Feedback prompt — armed by the resolution-confirm flow, which sets
  // ownershipState to 'closed'. (Previously gated on 'resolved' &&
  // showFeedback, which was unreachable because confirming resolution
  // always transitions ownership to 'closed'.)
  if (showFeedback) {
    return (
      <View style={styles.stateBanner}>
        <Text style={styles.stateBannerText}>Was this helpful?</Text>
        <View style={styles.stateBannerActions}>
          <AnimatedPressable
            onPress={() => onFeedback('helpful')}
            style={[styles.feedbackBtn, { borderColor: colors.border }]}
            hapticFeedback="light"
            accessibilityRole="button"
            accessibilityLabel="Yes, this was helpful"
          >
            <Ionicons name="thumbs-up-outline" size={16} color={colors.textSecondary} />
            <Text style={styles.feedbackBtnText}>Yes</Text>
          </AnimatedPressable>
          <AnimatedPressable
            onPress={() => onFeedback('unhelpful')}
            style={[styles.feedbackBtn, { borderColor: colors.border }]}
            hapticFeedback="light"
            accessibilityRole="button"
            accessibilityLabel="No, this was not helpful"
          >
            <Ionicons name="thumbs-down-outline" size={16} color={colors.textSecondary} />
            <Text style={styles.feedbackBtnText}>No</Text>
          </AnimatedPressable>
        </View>
      </View>
    );
  }

  if (ownershipState === 'resolved') {
    return (
      <View style={styles.stateBanner}>
        <Text style={styles.stateBannerText}>Is this resolved?</Text>
        <View style={styles.stateBannerActions}>
          <AppButton
            title="Yes, resolved"
            variant="primary"
            size="sm"
            onPress={() => onConfirmResolution(true)}
            loading={isConfirming}
            hapticFeedback="medium"
            accessibilityLabel="Confirm resolved"
            style={styles.stateActionBtn}
          />
          <AppButton
            title="Still need help"
            variant="secondary"
            size="sm"
            onPress={() => onConfirmResolution(false)}
            disabled={isConfirming}
            hapticFeedback="light"
            accessibilityLabel="Still need help"
            style={styles.stateActionBtn}
          />
        </View>
      </View>
    );
  }

  const text = stateBannerTextFor(ownershipState);
  if (!text) return null;

  return (
    <View style={styles.stateBanner}>
      <Text style={styles.stateBannerText}>{text}</Text>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    stateBanner: {
      paddingHorizontal: Space.md,
      paddingVertical: Space.sm,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border },
    stateBannerText: {
      fontSize: TypographyV2.body.size,
      fontFamily: FontFamily.medium,
      color: colors.textPrimary,
      lineHeight: TypographyV2.body.lineHeight,
      letterSpacing: TypographyV2.body.letterSpacing,
      marginBottom: Space.sm },
    stateBannerActions: {
      flexDirection: 'row',
      gap: Space.sm },
    stateActionBtn: {
      flex: 1 },
    feedbackBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: Space.xs,
      paddingVertical: Space.sm,
      borderRadius: Radius.md,
      borderWidth: Stroke.standard,
      flex: 1,
      minHeight: Control.hit },
    feedbackBtnText: {
      fontSize: TypographyV2.body.size,
      fontFamily: FontFamily.semibold,
      color: colors.textPrimary,
      letterSpacing: TypographyV2.body.letterSpacing } });
}
