import React from 'react';
import { Pressable, Text, View } from 'react-native';
import type { ThemeColors } from '../../theme/ThemeContext';
import { AppIcon } from '../common/AppIcon';
import { IconSize } from '../../theme/iconTokens';
import type { BotBuilderStyles } from './botBuilderStyles';

// ---------------------------------------------------------------------------
// CollapsibleStep — progressive disclosure section with completion checkmark
// ---------------------------------------------------------------------------

export function CollapsibleStep({
  stepNumber,
  title,
  detail,
  complete,
  open,
  onToggle,
  alwaysOpen,
  colors,
  styles,
  children }: {
  stepNumber: number;
  title: string;
  detail: string;
  complete: boolean;
  open?: boolean;
  onToggle?: () => void;
  alwaysOpen?: boolean;
  colors: ThemeColors;
  styles: BotBuilderStyles;
  children: React.ReactNode;
}) {
  const isOpen = alwaysOpen ?? open ?? false;
  return (
    <View style={styles.stepSection}>
      <Pressable
        style={({ pressed }) => [
          styles.stepHeader,
          { opacity: pressed ? 0.6 : 1 },
        ]}
        onPress={alwaysOpen ? undefined : onToggle}
        disabled={alwaysOpen}
        accessibilityRole={alwaysOpen ? undefined : 'button'}
        accessibilityLabel={alwaysOpen ? undefined : `${isOpen ? 'Collapse' : 'Expand'} ${title}`}
      >
        <View style={styles.stepHeaderLeft}>
          {complete ? (
            <AppIcon name="checkmark-circle" size={IconSize.sm} color="success" opticalCenter accessible={false} />
          ) : (
            <Text style={[styles.stepNumber, { color: colors.textMuted }]}>{stepNumber}</Text>
          )}
          <View style={styles.stepHeaderText}>
            <Text style={[styles.stepTitle, { color: colors.textPrimary }]}>{title}</Text>
            <Text style={[styles.stepDetail, { color: colors.textMuted }]} numberOfLines={1}>
              {detail}
            </Text>
          </View>
        </View>
        {alwaysOpen ? null : (
          <AppIcon
            name={isOpen ? 'chevronUp' : 'chevronDown'}
            size={IconSize.sm}
            color="textMuted"
            opticalCenter
            accessible={false}
          />
        )}
      </Pressable>
      {isOpen ? <View style={styles.stepBody}>{children}</View> : null}
    </View>
  );
}
