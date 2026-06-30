import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/colors';
import { Space, Radius } from '../../theme/designTokens';
import { AnimatedPressable } from '../AnimatedPressable';
import { AppButton } from '../ui/AppButton';
import { AppInput } from '../ui/AppInput';
import { Headline, Meta, Body, BodyEmphasis } from '../ui/Text';

interface UnitsComposerProps {
  visible: boolean;
  assetTitle: string;
  composerMode: 'buy' | 'sell';
  unitsInput: string;
  availableUnits: number;
  yourUnits: number;
  unitPriceGBP: number;
  avgEntryPriceGBP?: number;
  estimatedIze: string;
  estimatedFiat: string;
  estimatedRealized?: string;
  isSubmitting: boolean;
  onUnitsChange: (value: string) => void;
  onQuickSet: (units: number) => void;
  onCancel: () => void;
  onSubmit: () => void;
}

export function UnitsComposer({
  visible,
  assetTitle,
  composerMode,
  unitsInput,
  availableUnits,
  yourUnits,
  estimatedIze,
  estimatedFiat,
  estimatedRealized,
  isSubmitting,
  onUnitsChange,
  onQuickSet,
  onCancel,
  onSubmit,
}: UnitsComposerProps) {
  if (!visible) {
    return null;
  }

  const maxQuickUnits = [1, 5, 10, 20];

  return (
    <View style={styles.overlay}>
      <AnimatedPressable
        style={styles.dismissLayer}
        activeOpacity={1}
        onPress={onCancel}
        accessibilityRole="button"
        accessibilityLabel="Dismiss order composer"
        accessibilityHint="Closes the units order modal"
      />

      <View style={styles.card}>
        <Meta style={styles.modeLabel}>
          {composerMode === 'buy' ? 'Buy Units' : 'Sell Units'}
        </Meta>
        <Headline style={styles.title} numberOfLines={1}>
          {assetTitle}
        </Headline>
        <Meta style={styles.hint}>
          {composerMode === 'buy'
            ? `${availableUnits} units available`
            : `${yourUnits} units held`}
        </Meta>

        <AppInput
          value={unitsInput}
          onChangeText={onUnitsChange}
          keyboardType="number-pad"
          placeholder="1"
          prefix="Units"
          accessibilityLabel="Units to trade"
          accessibilityHint="Enter number of units to buy or sell"
          containerStyle={styles.input}
        />

        <View style={styles.quickRow}>
          {maxQuickUnits.map((u) => (
            <AppButton
              key={u}
              title={String(u)}
              style={styles.quickChip}
              variant="secondary"
              size="sm"
              onPress={() => onQuickSet(u)}
              accessibilityLabel={`Set units to ${u}`}
            />
          ))}
        </View>

        <View style={styles.quoteSection}>
          <Body style={styles.quoteLabel}>
            {composerMode === 'buy' ? 'Estimated spend' : 'Estimated receive'}
          </Body>
          <BodyEmphasis style={styles.quoteValue}>{estimatedIze}</BodyEmphasis>
          <Meta style={styles.quoteSub}>{estimatedFiat}</Meta>
          {estimatedRealized && (
            <BodyEmphasis
              style={[
                styles.quoteRealized,
                estimatedRealized.startsWith('+')
                  ? { color: Colors.success }
                  : { color: Colors.danger },
              ]}
            >
              {estimatedRealized}
            </BodyEmphasis>
          )}
        </View>

        <View style={styles.actions}>
          <AppButton
            style={styles.actionBtn}
            onPress={onCancel}
            variant="secondary"
            size="sm"
            align="center"
            title="Cancel"
            accessibilityLabel="Cancel order"
          />
          <AppButton
            style={[styles.actionBtn, styles.submitBtn]}
            onPress={onSubmit}
            disabled={isSubmitting}
            variant="primary"
            size="sm"
            align="center"
            title={
              isSubmitting
                ? 'Submitting...'
                : composerMode === 'buy'
                  ? 'Buy Units'
                  : 'Sell Units'
            }
            hapticFeedback="medium"
            accessibilityLabel={
              composerMode === 'buy' ? 'Submit buy order' : 'Submit sell order'
            }
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFill,
    zIndex: 300,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  dismissLayer: {
    ...StyleSheet.absoluteFill,
  },
  card: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    paddingHorizontal: Space.md,
    paddingTop: Space.lg,
    paddingBottom: Space.xl,
    borderTopWidth: 1,
    borderColor: Colors.border,
  },
  modeLabel: {
    textAlign: 'center',
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  title: {
    marginBottom: 4,
    textAlign: 'center',
  },
  hint: {
    textAlign: 'center',
    marginBottom: Space.md,
  },
  input: {
    marginBottom: Space.sm,
  },
  quickRow: {
    flexDirection: 'row',
    gap: Space.sm,
    marginBottom: Space.md,
  },
  quickChip: {
    flex: 1,
  },
  quoteSection: {
    alignItems: 'center',
    marginBottom: Space.md,
    paddingVertical: Space.sm,
    backgroundColor: Colors.surfaceAlt,
    borderRadius: Radius.md,
  },
  quoteLabel: {
    color: Colors.textSecondary,
    marginBottom: 2,
  },
  quoteValue: {
    color: Colors.textPrimary,
  },
  quoteSub: {
    marginTop: 2,
  },
  quoteRealized: {
    marginTop: 4,
  },
  actions: {
    flexDirection: 'row',
    gap: Space.sm,
  },
  actionBtn: {
    flex: 1,
  },
  submitBtn: {
    flex: 1.5,
  },
});