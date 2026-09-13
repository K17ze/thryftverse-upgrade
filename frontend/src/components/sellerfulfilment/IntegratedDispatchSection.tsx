import React, { useMemo } from 'react';
import { View, Text, Pressable, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme/ThemeContext';
import { createSellerFulfilmentStyles } from './sellerFulfilmentScreenStyles';

export interface IntegratedDispatchSectionProps {
  generatedLabelUrl: string | null;
  shipByLabel: string | null;
  isGeneratingLabel: boolean;
  isDispatching: boolean;
  labelError: string | null;
  onShowQR: () => void;
  onFindDropOff: () => void;
  onGenerateLabel: () => void;
  onDroppedOffRecovery: () => void;
}

/**
 * Integrated shipping section. The carrier's first scan is authoritative —
 * the seller never confirms dispatch manually. Two states:
 *  - label ready → QR preview replaces the get-label button (no "done" card)
 *  - no label yet → one dominant "Get shipping label" action
 */
export function IntegratedDispatchSection({
  generatedLabelUrl,
  shipByLabel,
  isGeneratingLabel,
  isDispatching,
  labelError,
  onShowQR,
  onFindDropOff,
  onGenerateLabel,
  onDroppedOffRecovery }: IntegratedDispatchSectionProps) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createSellerFulfilmentStyles(colors), [colors]);

  if (generatedLabelUrl) {
    /* Label ready — REPLACES the get-label button with QR/drop-off
       state. No "Step 1: done" card above. */
    return (
      <View style={styles.actionSection}>
        <Pressable
          style={styles.qrPreview}
          onPress={onShowQR}
          accessibilityRole="button"
          accessibilityLabel="Show shipping label QR code"
        >
          <Ionicons name="qr-code-outline" size={48} color={colors.brand} aria-hidden={true} />
          <Text style={styles.qrPreviewText}>Tap to view label / QR code</Text>
        </Pressable>

        <Text style={styles.dropOffLine}>
          Drop off by {shipByLabel ?? 'soon'}
        </Text>

        <Pressable
          style={styles.findLocationLink}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          onPress={onFindDropOff}
          accessibilityRole="link"
          accessibilityLabel="Find a drop-off location"
        >
          <Text style={styles.findLocationText}>Find a drop-off location</Text>
        </Pressable>

        <Text style={styles.waitingLine}>Waiting for carrier scan</Text>
        <Text style={styles.waitingHint}>
          The carrier's first scan will update the order to "in transit" automatically.
        </Text>

        {/* Recovery — quiet text link, no footer panel, no Alert.alert. The
            handoff assertion is visibly labelled as the seller's claim;
            carrier truth remains the scan. */}
        <Pressable
          style={styles.recoveryLink}
          onPress={onDroppedOffRecovery}
          disabled={isDispatching}
          accessibilityRole="button"
          accessibilityLabel="Mark as dropped off — handoff assertion"
        >
          {isDispatching ? (
            <ActivityIndicator size="small" color={colors.textMuted} />
          ) : (
            <Text style={styles.recoveryLinkText}>
              I dropped it off but tracking hasn't updated
            </Text>
          )}
        </Pressable>
      </View>
    );
  }

  /* No label yet — one dominant action. */
  return (
    <View style={styles.actionSection}>
      <Text style={styles.actionContext}>Pack the item</Text>
      <Pressable
        style={[styles.dominantBtn, isGeneratingLabel && styles.dominantBtnDisabled]}
        onPress={onGenerateLabel}
        disabled={isGeneratingLabel}
        accessibilityRole="button"
        accessibilityLabel="Get shipping label"
      >
        {isGeneratingLabel ? (
          <ActivityIndicator size="small" color={colors.textInverse} />
        ) : (
          <Text style={styles.dominantBtnText}>Get shipping label</Text>
        )}
      </Pressable>

      {/* Label errors stay attached to the label action with retry. */}
      {labelError && (
        <View style={styles.labelErrorInline}>
          <Ionicons name="alert-circle-outline" size={16} color={colors.danger} aria-hidden={true} />
          <Text style={styles.labelErrorText}>{labelError}</Text>
        </View>
      )}
    </View>
  );
}
