import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { Space, FontFamily, Radius, Stroke, Control } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { RadiusRoleValue } from '../../theme/surfaceRadiusRules';

interface Props {
  /** Whether the toggle row renders. */
  visible: boolean;
  enabled: boolean;
  onToggle: () => void;
}

/**
 * Item verification add-on — a buyer-initiated request that the ordered
 * item goes through Thryft's authentication pipeline (AI photo triage,
 * then expert/lab escalation by value tier).
 *
 * Truthful copy rules (AGENTS.md §11): the backend exposes no verification
 * fee or dispatch SLA, so the row shows "Free" and promises only the check
 * itself — never invented prices or business-day claims.
 */
function CheckoutVerificationSectionBase({ visible, enabled, onToggle }: Props) {
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);

  if (!visible) return null;

  return (
    <View style={styles.row}>
      <Pressable
        style={({ pressed }) => [styles.toggle, pressed && styles.togglePressed]}
        onPress={onToggle}
        accessibilityRole="switch"
        accessibilityLabel="Item verification"
        accessibilityHint="Ask Thryft to check this item's photos and details for signs of inauthenticity"
        accessibilityState={{ checked: enabled }}
      >
        <View style={[styles.switchTrack, enabled && styles.switchTrackOn]}>
          <View style={[styles.switchKnob, enabled && styles.switchKnobOn]} />
        </View>
        <View style={styles.textCol}>
          <View style={styles.labelRow}>
            <Text style={styles.label} maxFontSizeMultiplier={2}>Item verification</Text>
            <Text style={styles.freeTag} maxFontSizeMultiplier={2}>Free</Text>
          </View>
          <Text style={styles.subtitle} maxFontSizeMultiplier={2}>
            Thryft checks this item's photos and details for signs of inauthenticity
          </Text>
        </View>
      </Pressable>

      {enabled ? (
        <View style={styles.enabledBadge}>
          <Ionicons name="shield-checkmark-outline" size={12} color={colors.success} importantForAccessibility="no" />
          <Text style={styles.enabledText} maxFontSizeMultiplier={2}>
            Verification requested — a record is added to your order
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const CheckoutVerificationSection = React.memo(CheckoutVerificationSectionBase);
CheckoutVerificationSection.displayName = 'CheckoutVerificationSection';
export { CheckoutVerificationSection };

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  row: {
    marginTop: Space.sm,
  },
  toggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm + 2,
    paddingVertical: Space.sm + 2,
    paddingHorizontal: Space.md,
    borderRadius: Radius.none,
    borderWidth: 0,
    borderColor: colors.border,
  },
  togglePressed: {
    opacity: 0.7,
  },
  switchTrack: {
    width: Space.xxl - Space.sm,
    height: Space.lg,
    borderRadius: RadiusRoleValue.pillAvatar,
    borderWidth: Stroke.standard,
    justifyContent: 'center',
    padding: Space.xs,
    backgroundColor: colors.surfaceAlt,
    borderColor: colors.border,
  },
  switchTrackOn: {
    backgroundColor: colors.success,
    borderColor: colors.success,
  },
  switchKnob: {
    width: Control.iconCompact,
    height: Control.iconCompact,
    borderRadius: RadiusRoleValue.pillAvatar,
    alignSelf: 'flex-start',
    backgroundColor: colors.textMuted,
  },
  switchKnobOn: {
    backgroundColor: colors.textInverse,
  },
  textCol: {
    flex: 1,
    gap: Space.xs - 3,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
  },
  label: {
    fontSize: TypographyV2.meta.size,
    fontFamily: FontFamily.semibold,
    color: colors.textPrimary,
  },
  freeTag: {
    fontSize: TypographyV2.meta.size,
    fontFamily: FontFamily.semibold,
    color: colors.success,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  subtitle: {
    fontSize: TypographyV2.body.size,
    fontFamily: FontFamily.regular,
    color: colors.textMuted,
  },
  enabledBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
    marginTop: Space.xs,
    paddingVertical: Space.xs,
    paddingHorizontal: Space.sm,
    borderRadius: RadiusRoleValue.compactControl,
    alignSelf: 'flex-start',
    backgroundColor: colors.successSubtle,
  },
  enabledText: {
    fontSize: TypographyV2.meta.size,
    fontFamily: FontFamily.semibold,
    color: colors.success,
  },
});
