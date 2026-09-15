/**
 * EditGroupIssueBanner — the inline save-issue banner for the edit-group
 * screen: hairline-bracketed warning copy, plus the "Check result"
 * recovery action when a save's outcome was unknown (the request may have
 * landed server-side). Presentation only; extracted verbatim from
 * EditGroupScreen.
 */

import React, { useMemo } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { AnimatedPressable } from '../AnimatedPressable';
import { AppIcon } from '../common/AppIcon';
import { Caption } from '../ui/Text';
import { Control, Space, Typography } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';

export interface EditGroupIssueBannerProps {
  issue: string;
  outcomeUnknown: boolean;
  isChecking: boolean;
  onCheckResult: () => void;
}

export function EditGroupIssueBanner({
  issue,
  outcomeUnknown,
  isChecking,
  onCheckResult,
}: EditGroupIssueBannerProps) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={styles.issue} accessibilityLiveRegion="polite">
      <AppIcon name="alert" size="sm" color="warning" accessible={false} />
      <View style={styles.issueText}>
        <Caption color={colors.textSecondary}>{issue}</Caption>
        {outcomeUnknown ? (
          <AnimatedPressable
            onPress={onCheckResult}
            disabled={isChecking}
            style={styles.checkResultAction}
            activeOpacity={0.65}
            scaleValue={0.98}
            accessibilityRole="button"
            accessibilityLabel="Check group update result"
            accessibilityState={{ busy: isChecking }}
          >
            {isChecking ? (
              <ActivityIndicator size="small" color={colors.brand} />
            ) : null}
            <Text style={styles.checkResultText}>
              {isChecking ? 'Checking…' : 'Check result'}
            </Text>
          </AnimatedPressable>
        ) : null}
      </View>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    issue: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: Space.sm,
      paddingVertical: Space.sm,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    issueText: {
      flex: 1,
    },
    checkResultAction: {
      minHeight: Control.hit,
      alignSelf: 'flex-start',
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs,
      justifyContent: 'center',
      marginTop: Space.xs,
      paddingHorizontal: Space.sm,
    },
    checkResultText: {
      color: colors.brand,
      fontFamily: Typography.family.medium,
      fontSize: TypographyV2.meta.size,
    },
  });
}
