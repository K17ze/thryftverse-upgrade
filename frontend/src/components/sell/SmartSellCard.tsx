import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Pressable,
  LayoutChangeEvent,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Reanimated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { useHaptic } from '../../hooks/useHaptic';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import {
  Space,
  Radius,
  Stroke,
  Typography,
  Type,
  Control,
} from '../../theme/designTokens';
import { PremiumToggle } from '../PremiumToggle';
import {
  SMART_SELL_DEMO_MODE,
  type SmartSellConfig,
} from '../../services/smartSellApi';

export interface SmartSellCardProps {
  /** Listing id the config applies to. */
  listingId: string;
  /** Current Smart Sell configuration. */
  config: SmartSellConfig;
  /** Called whenever the seller edits the config (enabled flag or thresholds). */
  onConfigChange: (config: SmartSellConfig) => void;
  /** Optional listing price (GBP) used to seed sensible threshold defaults. */
  listingPrice?: number;
}

/**
 * Smart Sell card — lets a seller enable and configure auto-negotiation
 * thresholds for a listing. Per AGENTS.md §11, the card is clearly labelled
 * "Demo mode" while `SMART_SELL_DEMO_MODE` is true; it never claims a real
 * negotiation is taking place.
 */
export function SmartSellCard({
  listingId,
  config,
  onConfigChange,
  listingPrice,
}: SmartSellCardProps) {
  const { colors } = useAppTheme();
  const haptic = useHaptic();
  const reducedMotion = useReducedMotion();
  const styles = useMemo(() => createStyles(colors), [colors]);

  // Local numeric inputs so the seller can type freely before committing.
  const [minPriceText, setMinPriceText] = useState<string>(
    config.minPrice ? String(config.minPrice) : '',
  );
  const [acceptText, setAcceptText] = useState<string>(
    config.autoAcceptThreshold ? String(config.autoAcceptThreshold) : '',
  );

  // Range slider geometry
  const [sliderWidth, setSliderWidth] = useState(0);
  const handleSliderLayout = useCallback((e: LayoutChangeEvent) => {
    setSliderWidth(e.nativeEvent.layout.width);
  }, []);

  // Normalised positions for the accept/decline zones (0–1).
  const maxScale = useMemo(() => {
    const ceiling = Math.max(
      Number(acceptText) || 0,
      Number(minPriceText) || 0,
      listingPrice || 0,
      10,
    );
    return ceiling * 1.25; // headroom so the accept zone is visible
  }, [acceptText, minPriceText, listingPrice]);

  const minPos = Math.min(1, (Number(minPriceText) || 0) / maxScale);
  const acceptPos = Math.min(1, (Number(acceptText) || 0) / maxScale);

  // Animated reveal of the configuration panel.
  const panelProgress = useSharedValue(config.enabled ? 1 : 0);
  React.useEffect(() => {
    panelProgress.value = withTiming(config.enabled ? 1 : 0, {
      duration: reducedMotion ? 0 : 220,
    });
  }, [config.enabled, panelProgress, reducedMotion]);

  const panelStyle = useAnimatedStyle(() => ({
    opacity: panelProgress.value,
    height: panelProgress.value === 0 ? 0 : undefined,
  }));

  const emitConfig = useCallback(
    (patch: Partial<SmartSellConfig>) => {
      onConfigChange({
        ...config,
        ...patch,
        listingId,
        updatedAt: new Date().toISOString(),
        isDemo: SMART_SELL_DEMO_MODE,
      });
    },
    [config, listingId, onConfigChange],
  );

  const handleToggle = useCallback(
    (next: boolean) => {
      haptic.light();
      // Seed sensible defaults from the listing price on first enable.
      let patch: Partial<SmartSellConfig> = { enabled: next };
      if (next && listingPrice && !config.autoAcceptThreshold) {
        const accept = Math.round(listingPrice * 0.9 * 100) / 100;
        const floor = Math.round(listingPrice * 0.6 * 100) / 100;
        patch = {
          enabled: true,
          autoAcceptThreshold: accept,
          minPrice: floor,
          declineThreshold: floor,
        };
        setAcceptText(String(accept));
        setMinPriceText(String(floor));
      }
      emitConfig(patch);
    },
    [config.autoAcceptThreshold, emitConfig, haptic, listingPrice],
  );

  const commitMinPrice = useCallback(
    (text: string) => {
      setMinPriceText(text);
      const value = Number(text) || 0;
      emitConfig({ minPrice: value, declineThreshold: value });
    },
    [emitConfig],
  );

  const commitAccept = useCallback(
    (text: string) => {
      setAcceptText(text);
      const value = Number(text) || 0;
      emitConfig({ autoAcceptThreshold: value });
    },
    [emitConfig],
  );

  return (
    <View
      style={styles.card}
      accessibilityLabel="Smart Sell auto-negotiation"
    >
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerText}>
          <View style={styles.titleRow}>
            <Ionicons
              name="trending-up-outline"
              size={20}
              color={colors.brand}
              style={styles.titleIcon}
            />
            <Text style={styles.title}>Smart Sell</Text>
          </View>
          <Text style={styles.subtitle}>
            Auto-accept offers above your threshold. 60% more likely to sell in 7 days.
          </Text>
        </View>
        <PremiumToggle
          value={config.enabled}
          onValueChange={handleToggle}
        />
      </View>

      {/* Configuration panel */}
      {config.enabled && (
        <Reanimated.View
          style={panelStyle}
        >
          <View
            style={styles.divider}
            accessible={false}
          />

          {/* Threshold inputs */}
          <View style={styles.inputRow}>
            <ThresholdField
              label="Min price (floor)"
              hint="Auto-decline below this"
              value={minPriceText}
              onChangeText={commitMinPrice}
              colors={colors}
              styles={styles}
              prefix="£"
            />
            <ThresholdField
              label="Auto-accept at"
              hint="Accept offers at or above"
              value={acceptText}
              onChangeText={commitAccept}
              colors={colors}
              styles={styles}
              prefix="£"
            />
          </View>

          {/* Range slider showing accept / manual / decline zones */}
          <View
            style={styles.rangeWrap}
            onLayout={handleSliderLayout}
            accessibilityLabel="Smart Sell threshold range"
            accessibilityRole="adjustable"
          >
            <RangeBar
              width={sliderWidth}
              minPos={minPos}
              acceptPos={acceptPos}
              colors={colors}
            />
            <View style={styles.rangeLabels}>
              <Text style={styles.rangeLabel}>Decline</Text>
              <Text style={styles.rangeLabel}>Manual</Text>
              <Text style={styles.rangeLabel}>Auto-accept</Text>
            </View>
          </View>

          {/* Stats preview */}
          <View style={styles.statsPreview}>
            <Ionicons
              name="trending-up-outline"
              size={14}
              color={colors.success}
              style={styles.statsIcon}
            />
            <Text style={styles.statsText}>
              Based on similar listings, expect ~3–5 offers/week
            </Text>
          </View>
        </Reanimated.View>
      )}

      {/* Demo mode indicator (truthful UI) */}
      {SMART_SELL_DEMO_MODE && (
        <View style={styles.demoBadge}>
          <Ionicons
            name="information-circle-outline"
            size={12}
            color={colors.textMuted}
            style={styles.demoIcon}
          />
          <Text style={styles.demoText}>
            Demo mode — Smart Sell settings are illustrative.
          </Text>
        </View>
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Threshold field
// ---------------------------------------------------------------------------

interface ThresholdFieldProps {
  label: string;
  hint: string;
  value: string;
  onChangeText: (text: string) => void;
  colors: ThemeColors;
  styles: ReturnType<typeof createStyles>;
  prefix?: string;
}

const ThresholdField = React.memo(function ThresholdField({
  label,
  hint,
  value,
  onChangeText,
  colors,
  styles,
  prefix,
}: ThresholdFieldProps) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View
        style={[
          styles.fieldInputWrap,
          {
            backgroundColor: colors.input,
            borderColor: colors.border,
          },
        ]}
      >
        {prefix ? <Text style={styles.fieldPrefix}>{prefix}</Text> : null}
        <TextInput
          style={[styles.fieldInput, { color: colors.textPrimary }]}
          value={value}
          onChangeText={onChangeText}
          placeholder="0.00"
          placeholderTextColor={colors.textMuted}
          keyboardType="decimal-pad"
          accessibilityLabel={label}
          accessibilityHint={hint}
          returnKeyType="done"
        />
      </View>
      <Text style={styles.fieldHint}>{hint}</Text>
    </View>
  );
});

// ---------------------------------------------------------------------------
// Range bar — visualises the decline / manual / accept zones
// ---------------------------------------------------------------------------

interface RangeBarProps {
  width: number;
  minPos: number;
  acceptPos: number;
  colors: ThemeColors;
}

function RangeBar({ width, minPos, acceptPos, colors }: RangeBarProps) {
  const styles = useMemo(() => createRangeStyles(colors), [colors]);
  const declineWidth = Math.max(0, Math.min(1, minPos)) * width;
  const manualWidth = Math.max(0, acceptPos - minPos) * width;
  const acceptWidth = Math.max(0, 1 - acceptPos) * width;

  return (
    <View style={styles.track}>
      <View
        style={[styles.zoneDecline, { width: declineWidth }]}
        accessibilityLabel="Decline zone"
      />
      <View
        style={[styles.zoneManual, { width: manualWidth }]}
        accessibilityLabel="Manual review zone"
      />
      <View
        style={[styles.zoneAccept, { width: acceptWidth }]}
        accessibilityLabel="Auto-accept zone"
      />
      {/* Threshold markers */}
      {declineWidth > 0 && (
        <View style={[styles.marker, { left: declineWidth }]} />
      )}
      {acceptPos > 0 && acceptPos < 1 && (
        <View style={[styles.marker, { left: acceptPos * width }]} />
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

function createRangeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    track: {
      height: Space.sm,
      borderRadius: Radius.full,
      flexDirection: 'row',
      overflow: 'hidden',
      backgroundColor: colors.surfaceAlt,
    },
    zoneDecline: {
      backgroundColor: colors.danger,
      opacity: 0.5,
    },
    zoneManual: {
      backgroundColor: colors.surfaceAlt,
    },
    zoneAccept: {
      backgroundColor: colors.success,
      opacity: 0.7,
    },
    marker: {
      position: 'absolute',
      top: -Space.xs / 2,
      width: Stroke.emphasis,
      height: Space.sm + Space.xs,
      backgroundColor: colors.textPrimary,
      borderRadius: Radius.sm,
    },
  });
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    card: {
      backgroundColor: colors.surface,
      borderRadius: Radius.lg,
      borderWidth: Stroke.standard,
      borderColor: colors.border,
      padding: Space.md,
      marginBottom: Space.md,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: Space.sm,
    },
    headerText: {
      flex: 1,
      paddingRight: Space.sm,
    },
    titleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs,
    },
    titleIcon: {
      marginRight: Space.xs / 2,
    },
    title: {
      fontSize: Type.subtitle.size,
      fontFamily: Typography.family.bold,
      color: colors.textPrimary,
      letterSpacing: -0.3,
    },
    subtitle: {
      marginTop: Space.xs,
      fontSize: Type.caption.size,
      fontFamily: Typography.family.regular,
      color: colors.textSecondary,
      lineHeight: Type.caption.lineHeight,
    },
    divider: {
      height: Stroke.hairline,
      backgroundColor: colors.borderSubtle,
      marginVertical: Space.md,
    },
    inputRow: {
      flexDirection: 'row',
      gap: Space.sm,
    },
    field: {
      flex: 1,
    },
    fieldLabel: {
      fontSize: Type.captionElevated.size,
      fontFamily: Typography.family.semibold,
      color: colors.textSecondary,
      marginBottom: Space.xs + 2,
    },
    fieldInputWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      borderRadius: Radius.xl,
      borderWidth: Stroke.standard,
      paddingHorizontal: Space.sm + 2,
      minHeight: 52,
    },
    fieldPrefix: {
      fontSize: Type.bodyEmphasis.size,
      fontFamily: Typography.family.bold,
      color: colors.textSecondary,
      marginRight: Space.xs,
    },
    fieldInput: {
      flex: 1,
      fontSize: Type.bodyEmphasis.size,
      fontFamily: Typography.family.medium,
      paddingVertical: Space.sm,
    },
    fieldHint: {
      marginTop: Space.xs + 2,
      fontSize: Type.meta.size,
      fontFamily: Typography.family.regular,
      color: colors.textMuted,
      lineHeight: Type.meta.lineHeight,
    },
    rangeWrap: {
      marginTop: Space.md,
    },
    rangeLabels: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginTop: Space.xs + 2,
    },
    rangeLabel: {
      fontSize: Type.meta.size,
      fontFamily: Typography.family.medium,
      color: colors.textMuted,
      letterSpacing: 0.15,
    },
    statsPreview: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: Space.md,
      gap: Space.xs,
    },
    statsIcon: {
      marginRight: Space.xs / 2,
    },
    statsText: {
      flex: 1,
      fontSize: Type.caption.size,
      fontFamily: Typography.family.regular,
      color: colors.textSecondary,
      lineHeight: Type.caption.lineHeight,
    },
    demoBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: Space.md,
      paddingTop: Space.sm,
      borderTopWidth: Stroke.hairline,
      borderTopColor: colors.borderSubtle,
      gap: Space.xs,
    },
    demoIcon: {
      marginRight: Space.xs / 2,
    },
    demoText: {
      flex: 1,
      fontSize: Type.meta.size,
      fontFamily: Typography.family.medium,
      color: colors.textMuted,
      letterSpacing: 0.15,
    },
  });
}
