import React, { useMemo } from 'react';
import { View, Text, Pressable, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useAppTheme } from '../../theme/ThemeContext';
import { haptics } from '../../utils/haptics';
import { MANUAL_CARRIERS } from './fulfilmentViewModels';
import { createSellerFulfilmentStyles } from './sellerFulfilmentScreenStyles';

export interface ManualDispatchFormProps {
  trackingNumber: string;
  onChangeTrackingNumber: (value: string) => void;
  shippingProvider: string;
  showCarrierDropdown: boolean;
  onToggleCarrierDropdown: () => void;
  onSelectCarrier: (carrier: string) => void;
}

/**
 * Manual shipping form: carrier picker + tracking input. Rendered as the
 * primary content in manual mode, and as the fallback path when integrated
 * label generation is unavailable — one authored block shared by both.
 */
export function ManualDispatchForm({
  trackingNumber,
  onChangeTrackingNumber,
  shippingProvider,
  showCarrierDropdown,
  onToggleCarrierDropdown,
  onSelectCarrier }: ManualDispatchFormProps) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createSellerFulfilmentStyles(colors), [colors]);

  return (
    <>
      <Text style={styles.inputLabel}>Carrier</Text>
      <Pressable
        style={styles.carrierSelector}
        onPress={() => { haptics.tap(); onToggleCarrierDropdown(); }}
        accessibilityRole="button"
        accessibilityLabel="Select carrier"
      >
        <Text style={[styles.carrierSelectorText, !shippingProvider && styles.placeholderText]}>
          {shippingProvider || 'Select carrier'}
        </Text>
        <Ionicons name={showCarrierDropdown ? 'chevron-up' : 'chevron-down'} size={16} color={colors.textMuted} aria-hidden={true} />
      </Pressable>

      {showCarrierDropdown && (
        <View style={styles.carrierDropdown}>
          {MANUAL_CARRIERS.map((carrier) => (
            <Pressable
              key={carrier}
              style={styles.carrierOption}
              onPress={() => {
                haptics.selection();
                onSelectCarrier(carrier);
              }}
              accessibilityRole="button"
              accessibilityLabel={`Select ${carrier}`}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Text style={[
                styles.carrierOptionText,
                shippingProvider === carrier && styles.carrierOptionTextActive,
              ]}>
                {carrier}
              </Text>
              {shippingProvider === carrier && (
                <Ionicons name="checkmark" size={16} color={colors.brand} aria-hidden={true} />
              )}
            </Pressable>
          ))}
        </View>
      )}

      <Text style={styles.inputLabel}>Tracking number</Text>
      <View style={styles.trackingInputRow}>
        <TextInput
          style={[styles.textInput, styles.trackingInputField]}
          placeholder="Enter tracking number"
          placeholderTextColor={colors.textMuted}
          value={trackingNumber}
          onChangeText={onChangeTrackingNumber}
          autoCapitalize="none"
          autoCorrect={false}
          accessibilityLabel="Tracking number"
        />
        {/* Tracking numbers are almost always copied from the carrier site —
            a paste affordance avoids the long-press dance. */}
        <Pressable
          onPress={async () => {
            const text = await Clipboard.getStringAsync();
            const trimmed = text.trim();
            if (trimmed) {
              haptics.selection();
              onChangeTrackingNumber(trimmed);
            }
          }}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityRole="button"
          accessibilityLabel="Paste tracking number from clipboard"
        >
          <Ionicons name="clipboard-outline" size={18} color={colors.brand} accessible={false} />
        </Pressable>
      </View>

      <Text style={styles.hintText}>
        A valid tracking number is required to confirm dispatch. The buyer will receive it automatically.
      </Text>
    </>
  );
}
