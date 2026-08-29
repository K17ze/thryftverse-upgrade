import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { AnimatedPressable } from '../AnimatedPressable';
import { useAppTheme } from '../../theme/ThemeContext';
import {
  Space,
  FontFamily,
  Stroke,
  Control } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import type { BlockingIssue } from '../../services/catalogImportApi';

interface Props {
  issues: BlockingIssue[];
  currentIndex: number;
  total: number;
  onPrevious: () => void;
  onNext: () => void;
}

const BAR_CONTENT_HEIGHT = 60;

/**
 * ImportIssueNavigator — a compact utility bar pinned to the bottom of the
 * item editor for stepping through items that need attention.
 *
 * This is a utility bar, not a feature card. No decorative elements: just
 * the issue counter on the left, the current message in the centre, and two
 * compact chevron controls on the right. When the current issue carries a
 * recovery hint it appears beneath the message in muted caption type.
 */
export function ImportIssueNavigator({
  issues,
  currentIndex,
  total,
  onPrevious,
  onNext }: Props) {
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);

  const safeIssue = issues[currentIndex];
  const canGoBack = currentIndex > 0;
  const canGoForward = currentIndex < total - 1;

  const handlePrevious = React.useCallback(() => {
    if (canGoBack) onPrevious();
  }, [canGoBack, onPrevious]);

  const handleNext = React.useCallback(() => {
    if (canGoForward) onNext();
  }, [canGoForward, onNext]);

  if (total === 0) return null;

  return (
    <View style={styles.bar}>
      <SafeAreaView edges={['bottom']} style={styles.safeArea}>
        <View style={styles.row}>
          <Text style={styles.counter} numberOfLines={1}>
            {`Issue ${currentIndex + 1} of ${total}`}
          </Text>

          <Text
            style={styles.message}
            numberOfLines={1}
            ellipsizeMode="tail"
          >
            {safeIssue?.message ?? ''}
          </Text>

          <View style={styles.navControls}>
            <AnimatedPressable
              style={styles.iconButton}
              onPress={handlePrevious}
              disabled={!canGoBack}
              scaleValue={0.97}
              hapticFeedback="selection"
              accessibilityRole="button"
              accessibilityLabel="Previous issue"
              accessibilityState={{ disabled: !canGoBack }}
            >
              <Ionicons
                name="chevron-back"
                size={Control.iconCompact}
                color={canGoBack ? colors.textPrimary : colors.textMuted}
              />
            </AnimatedPressable>

            <AnimatedPressable
              style={styles.iconButton}
              onPress={handleNext}
              disabled={!canGoForward}
              scaleValue={0.97}
              hapticFeedback="selection"
              accessibilityRole="button"
              accessibilityLabel="Next issue"
              accessibilityState={{ disabled: !canGoForward }}
            >
              <Ionicons
                name="chevron-forward"
                size={Control.iconCompact}
                color={canGoForward ? colors.textPrimary : colors.textMuted}
              />
            </AnimatedPressable>
          </View>
        </View>

        {safeIssue?.recoveryHint ? (
          <Text
            style={styles.recoveryHint}
            numberOfLines={1}
            ellipsizeMode="tail"
          >
            {safeIssue.recoveryHint}
          </Text>
        ) : null}
      </SafeAreaView>
    </View>
  );
}

const createStyles = (colors: ReturnType<typeof useAppTheme>['colors']) =>
  StyleSheet.create({
    bar: {
      backgroundColor: colors.surface,
      borderTopWidth: Stroke.hairline,
      borderTopColor: colors.borderSubtle },
    safeArea: {
      minHeight: BAR_CONTENT_HEIGHT,
      paddingHorizontal: Space.md,
      paddingVertical: Space.sm,
      gap: Space.xxs },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.sm },
    counter: {
      flexShrink: 0,
      fontFamily: FontFamily.regular,
      fontSize: TypographyV2.meta.size,
      lineHeight: TypographyV2.meta.lineHeight,
      letterSpacing: TypographyV2.meta.letterSpacing,
      color: colors.textSecondary },
    message: {
      flex: 1,
      fontFamily: FontFamily.regular,
      fontSize: TypographyV2.body.size,
      lineHeight: TypographyV2.body.lineHeight,
      letterSpacing: TypographyV2.body.letterSpacing,
      color: colors.textPrimary },
    navControls: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs },
    iconButton: {
      width: Control.hit,
      height: Control.hit,
      alignItems: 'center',
      justifyContent: 'center' },
    recoveryHint: {
      fontFamily: FontFamily.regular,
      fontSize: TypographyV2.meta.size,
      lineHeight: TypographyV2.meta.lineHeight,
      letterSpacing: TypographyV2.meta.letterSpacing,
      color: colors.textMuted } });
