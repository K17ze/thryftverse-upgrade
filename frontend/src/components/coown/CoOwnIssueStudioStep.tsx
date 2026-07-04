import React from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { useAppTheme } from '../../theme/ThemeContext';
import { Space, Radius, Type, Typography } from '../../theme/designTokens';
import { StyleProp } from 'react-native';

export interface CoOwnIssueStudioStepProps {
  stepNumber: number;
  totalSteps: number;
  title: string;
  description?: string;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

export function CoOwnIssueStudioStep({
  stepNumber,
  totalSteps,
  title,
  description,
  children,
  style,
}: CoOwnIssueStudioStepProps) {
  const { colors } = useAppTheme();

  return (
    <View style={style}>
      {/* Stage indicator */}
      <View style={styles.stageRow}>
        {Array.from({ length: totalSteps }, (_, i) => {
          const isActive = i + 1 === stepNumber;
          const isPast = i + 1 < stepNumber;
          const dotColor = isActive ? colors.brand : isPast ? colors.brand : colors.surfaceAlt;
          return (
            <View key={i} style={styles.stageDotWrap}>
              <View style={[styles.stageDot, { backgroundColor: dotColor }]} />
              {i < totalSteps - 1 ? (
                <View style={[styles.stageConnector, { backgroundColor: isPast ? colors.brand : colors.surfaceAlt }]} />
              ) : null}
            </View>
          );
        })}
      </View>

      <View style={styles.stageLabelRow}>
        <Text style={[styles.stageLabel, { color: colors.textMuted }]}>
          Step {stepNumber} of {totalSteps}
        </Text>
      </View>

      <Text style={[styles.title, { color: colors.textPrimary }]}>{title}</Text>
      {description ? (
        <Text style={[styles.description, { color: colors.textSecondary }]}>{description}</Text>
      ) : null}

      <View style={styles.contentWrap}>
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  stageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Space.xs,
  },
  stageDotWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  stageDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  stageConnector: {
    flex: 1,
    height: 2,
    marginHorizontal: Space.xs,
    borderRadius: 1,
  },
  stageLabelRow: {
    marginBottom: Space.sm,
  },
  stageLabel: {
    fontSize: Type.meta.size,
    fontFamily: Typography.family.medium,
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  title: {
    fontSize: Type.title.size,
    fontFamily: Typography.family.bold,
    letterSpacing: -0.5,
    lineHeight: Type.title.lineHeight,
    marginBottom: Space.xs,
  },
  description: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.regular,
    lineHeight: 20,
    marginBottom: Space.lg,
  },
  contentWrap: {
    gap: Space.md,
  },
});
