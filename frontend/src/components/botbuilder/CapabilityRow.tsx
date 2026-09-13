import React, { useMemo } from 'react';
import { Text, View } from 'react-native';
import { useAppTheme } from '../../theme/ThemeContext';
import { AnimatedPressable } from '../AnimatedPressable';
import { AppIcon } from '../common/AppIcon';
import { IconSize } from '../../theme/iconTokens';
import { createBotBuilderStyles } from './botBuilderStyles';
import type { RiskLevel } from './botBuilderTypes';

// ---------------------------------------------------------------------------
// CapabilityRow — a single typed capability grant
// ---------------------------------------------------------------------------

export function CapabilityRow({
  label,
  risk,
  enabled,
  onToggle,
  planned }: {
  label: string;
  risk: RiskLevel;
  enabled: boolean;
  onToggle?: () => void;
  planned?: boolean;
}) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createBotBuilderStyles(colors), [colors]);
  const isCritical = risk === 'critical';

  if (planned) {
    return (
      <View style={[styles.permissionRow, { opacity: 0.5 }]}>
        <View style={styles.permissionCopy}>
          <View style={styles.permissionLabelRow}>
            <AppIcon
              name="lock"
              size={IconSize.md}
              color="textMuted"
              opticalCenter
              accessible={false}
            />
            <Text style={[styles.permissionTitle, { color: colors.textMuted }]}>{label}</Text>
          </View>
        </View>
        <View style={styles.comingSoonBadge}>
          <Text style={styles.comingSoonText}>Coming soon</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.permissionRow}>
      <AnimatedPressable
        onPress={onToggle}
        style={styles.permissionCopy}
        scaleValue={0.985}
        hapticFeedback="selection"
        accessibilityRole="switch"
        accessibilityLabel={label}
        accessibilityState={{ checked: enabled }}
      >
        <View style={styles.permissionLabelRow}>
          <AppIcon
            name={enabled ? 'checkmark-circle' : 'ellipse-outline'}
            size={IconSize.md}
            color={enabled ? (isCritical ? 'danger' : 'textPrimary') : 'textMuted'}
            opticalCenter
            accessible={false}
          />
          <Text style={styles.permissionTitle}>{label}</Text>
        </View>
      </AnimatedPressable>
    </View>
  );
}
