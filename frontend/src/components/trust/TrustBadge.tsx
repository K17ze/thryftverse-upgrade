/**
 * TrustBadge — a compact, single-signal trust badge.
 *
 * Shows an icon + label in a single row. On press, reveals the full
 * description via a lightweight popover (React Native Modal) — no heavy
 * BottomSheet dependency for a one-line explanation.
 *
 * Anti-AI / truthful-UI (AGENTS.md §4, §11):
 *  - Design tokens only — no hardcoded colours, radii, or spacing.
 *  - One icon family (Ionicons), one radius grammar (Radius.sm utility chip).
 *  - `verified` signals carry a subtle shield/check treatment; behavioural
 *    metrics use a neutral chip so users can distinguish evidence from metric.
 *  - `accessibilityLabel` includes the full description so screen readers get
 *    the complete trust picture in one announcement.
 *  - hitSlop ensures the 44pt touch target even when `compact` renders only an
 *    icon (visible shape ≠ hit area, per AGENTS.md §4).
 */
import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Modal,
  TouchableWithoutFeedback,
  Platform,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { Space, Radius, Stroke, Control, IconGrammar } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { useHaptic } from '../../hooks/useHaptic';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import {
  TRUST_ICON_REGISTRY,
  type TrustSignal,
} from './trustSignals';

export interface TrustBadgeProps {
  signal: TrustSignal;
  /** When true, renders an icon-only chip for inline use. */
  compact?: boolean;
  /** Override the icon concept (otherwise uses signal.iconConcept). */
  iconConcept?: string;
  style?: StyleProp<ViewStyle>;
}

export function TrustBadge({ signal, compact = false, iconConcept, style }: TrustBadgeProps) {
  const { colors } = useAppTheme();
  const haptic = useHaptic();
  const reducedMotion = useReducedMotion();
  const [open, setOpen] = useState(false);

  const glyph = TRUST_ICON_REGISTRY[iconConcept ?? signal.iconConcept];
  const accent = signal.verified ? colors.success : colors.textSecondary;
  const chipBg = signal.verified ? colors.successSubtle : colors.surfaceAlt;
  const chipBorder = signal.verified ? colors.successBorder : colors.borderSubtle;

  const handlePress = useCallback(() => {
    if (!reducedMotion) haptic.light();
    setOpen(true);
  }, [haptic, reducedMotion]);

  const close = useCallback(() => setOpen(false), []);

  const a11yLabel = `${signal.label}. ${signal.description}${
    signal.metric ? `. ${signal.metric}` : ''
  }${signal.verified ? '. Verified by the platform.' : ''}`;

  return (
    <>
      <Pressable
        onPress={handlePress}
        hitSlop={{ top: 9, bottom: 9, left: 9, right: 9 }}
        accessibilityRole="button"
        accessibilityLabel={a11yLabel}
        accessibilityHint="Opens a short explanation of this trust signal"
        style={({ pressed }) => [
          styles.chip,
          { backgroundColor: chipBg, borderColor: chipBorder },
          compact && styles.chipCompact,
          pressed && { opacity: 0.6 },
          style,
        ]}
      >
        <Ionicons name={glyph} size={IconGrammar.badge} color={accent} />
        {!compact && (
          <Text
            style={[styles.label, { color: accent }]}
            numberOfLines={1}
            maxFontSizeMultiplier={1}
          >
            {signal.label}
          </Text>
        )}
        {signal.verified && !compact && (
          <Ionicons name="checkmark" size={IconGrammar.badge} color={accent} style={styles.check} />
        )}
      </Pressable>

      <Modal
        visible={open}
        transparent
        animationType={reducedMotion ? 'none' : 'fade'}
        onRequestClose={close}
        statusBarTranslucent={Platform.OS === 'android'}
      >
        <TouchableWithoutFeedback onPress={close} accessible={false}>
          <View style={[styles.overlay, { backgroundColor: colors.overlay }]}>
            <TouchableWithoutFeedback accessible={false}>
              <View
                style={[
                  styles.popover,
                  { backgroundColor: colors.surfaceElevated, borderColor: colors.border },
                ]}
                accessibilityRole="none"
                accessibilityLabel={a11yLabel}
              >
                <View style={styles.popoverHeader}>
                  <Ionicons name={glyph} size={16} color={accent} />
                  <Text
                    style={[styles.popoverTitle, { color: colors.textPrimary }]}
                    numberOfLines={2}
                  >
                    {signal.label}
                  </Text>
                </View>
                <Text
                  style={[styles.popoverBody, { color: colors.textSecondary }]}
                >
                  {signal.description}
                </Text>
                {signal.metric && (
                  <Text
                    style={[styles.popoverMetric, { color: colors.textPrimary }]}
                  >
                    {signal.metric}
                  </Text>
                )}
                {signal.verified && (
                  <View style={styles.popoverVerifiedRow}>
                    <Ionicons name="shield-checkmark" size={12} color={colors.success} />
                    <Text style={[styles.popoverVerified, { color: colors.success }]}>
                      Verified by the platform
                    </Text>
                  </View>
                )}
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
    paddingHorizontal: Space.sm,
    paddingVertical: Space.xs / 2 + 1,
    borderRadius: Radius.sm,
    borderWidth: Stroke.hairline,
    minHeight: 28,
  },
  chipCompact: {
    paddingHorizontal: Space.xs + 2,
    paddingVertical: Space.xs + 2,
    gap: 0,
  },
  label: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: TypographyV2.meta.fontFamily,
    letterSpacing: TypographyV2.meta.letterSpacing,
  },
  check: {
    marginLeft: -2,
  },
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Space.lg,
  },
  popover: {
    width: '100%',
    maxWidth: 320,
    borderRadius: Radius.lg,
    borderWidth: Stroke.standard,
    padding: Space.md,
    gap: Space.sm,
  },
  popoverHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
  },
  popoverTitle: {
    fontSize: TypographyV2.bodyStrong.size,
    lineHeight: TypographyV2.bodyStrong.lineHeight,
    fontFamily: TypographyV2.bodyStrong.fontFamily,
    flexShrink: 1,
  },
  popoverBody: {
    fontSize: TypographyV2.body.size,
    lineHeight: TypographyV2.body.lineHeight,
    fontFamily: TypographyV2.body.fontFamily,
  },
  popoverMetric: {
    fontSize: TypographyV2.numericMeta.size,
    lineHeight: TypographyV2.numericMeta.lineHeight,
    fontFamily: TypographyV2.numericMeta.fontFamily,
    fontVariant: ['tabular-nums'],
  },
  popoverVerifiedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
    paddingTop: Space.xs,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'transparent',
  },
  popoverVerified: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: TypographyV2.meta.fontFamily,
    letterSpacing: TypographyV2.meta.letterSpacing,
  },
});
