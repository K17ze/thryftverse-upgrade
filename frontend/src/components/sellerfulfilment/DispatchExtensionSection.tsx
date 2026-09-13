import React, { useMemo } from 'react';
import { View, Text, Pressable, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme/ThemeContext';
import { haptics } from '../../utils/haptics';
import type { DispatchExtension } from '../orders/orderCapabilities';
import { formatShipByDate } from './fulfilmentViewModels';
import { createSellerFulfilmentStyles } from './sellerFulfilmentScreenStyles';

export interface DispatchExtensionSectionProps {
  pendingExtension: DispatchExtension | null;
  canProposeExtension: boolean;
  pickerOpen: boolean;
  selectedDays: number | null;
  isProposing: boolean;
  onToggle: () => void;
  onSelectDays: (days: number) => void;
  onConfirm: () => void;
}

/**
 * Dispatch extension — quiet row, not a panel. The seller proposes extra
 * days; the buyer must approve before the new ship-by date takes effect.
 * When one is already pending we show a single muted status line instead.
 */
export function DispatchExtensionSection({
  pendingExtension,
  canProposeExtension,
  pickerOpen,
  selectedDays,
  isProposing,
  onToggle,
  onSelectDays,
  onConfirm }: DispatchExtensionSectionProps) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createSellerFulfilmentStyles(colors), [colors]);

  if (pendingExtension) {
    return (
      <Text style={styles.extensionPendingLine}>
        Extension requested · dispatch by{' '}
        {formatShipByDate(pendingExtension.proposedShipBy) ?? 'the proposed date'}{' '}
        · awaiting buyer
      </Text>
    );
  }

  if (!canProposeExtension) return null;

  return (
    <View style={styles.extensionBlock}>
      <Pressable
        style={styles.extensionToggle}
        onPress={() => { haptics.tap(); onToggle(); }}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        accessibilityRole="button"
        accessibilityLabel="Request more time to dispatch"
        accessibilityState={{ expanded: pickerOpen }}
      >
        <Text style={styles.extensionToggleText}>Need more time to dispatch?</Text>
        <Ionicons
          name={pickerOpen ? 'chevron-up' : 'chevron-down'}
          size={14}
          color={colors.textSecondary}
          aria-hidden={true}
        />
      </Pressable>
      {pickerOpen && (
        <View style={styles.extensionPicker}>
          <View style={styles.extensionChips}>
            {[1, 2, 3, 4, 5, 6, 7].map((d) => (
              <Pressable
                key={d}
                style={[
                  styles.extensionChip,
                  selectedDays === d && { borderColor: colors.brand },
                ]}
                onPress={() => { haptics.selection(); onSelectDays(d); }}
                accessibilityRole="button"
                accessibilityLabel={`Request ${d} more day${d === 1 ? '' : 's'}`}
                accessibilityState={{ selected: selectedDays === d }}
              >
                <Text
                  style={[
                    styles.extensionChipText,
                    selectedDays === d && { color: colors.brand },
                  ]}
                >
                  +{d}d
                </Text>
              </Pressable>
            ))}
          </View>
          <Text style={styles.extensionHint}>
            The buyer must approve the new dispatch date.
          </Text>
          {selectedDays != null && (
            <Pressable
              style={[styles.extensionConfirm, isProposing && styles.extensionConfirmDisabled]}
              onPress={onConfirm}
              disabled={isProposing}
              accessibilityRole="button"
              accessibilityLabel={`Request ${selectedDays} more day${selectedDays === 1 ? '' : 's'}`}
            >
              {isProposing ? (
                <ActivityIndicator size="small" color={colors.brand} />
              ) : (
                <Text style={styles.extensionConfirmText}>
                  Request {selectedDays} more day{selectedDays === 1 ? '' : 's'}
                </Text>
              )}
            </Pressable>
          )}
        </View>
      )}
    </View>
  );
}
