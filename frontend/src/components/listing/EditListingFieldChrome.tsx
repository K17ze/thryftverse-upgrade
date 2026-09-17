import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { AppIcon } from '../common/AppIcon';
import { IconSize } from '../../theme/iconTokens';
import { t } from '../../i18n';
import { editListingStyles as styles, useEditListingThemedStyles } from './editListingStyles';

/**
 * Shared field chrome for the edit-listing form — the hairline separator,
 * the label/status row (filled check | optional | required) and the flat
 * pressable picker row used by the details and shipping sections. Extracted
 * verbatim from EditListingScreen; every surface keeps identical geometry
 * and colour overlays.
 */

export function EditListingHairline() {
  const themed = useEditListingThemedStyles();
  return <View style={[styles.hairline, themed.hairline]} />;
}

export type EditFieldStatus = 'filled' | 'optional' | 'required' | 'none';

export function EditListingFieldLabel({ label, status }: { label: string; status: EditFieldStatus }) {
  const themed = useEditListingThemedStyles();
  return (
    <View style={styles.fieldLabelRow}>
      <Text style={[styles.fieldLabel, themed.fieldLabel]}>{label}</Text>
      {status === 'filled' ? (
        <AppIcon name="checkmark-circle" size={12} color="success" opticalCenter accessible={false} />
      ) : status === 'optional' ? (
        <Text style={[styles.fieldRequiredHint, themed.fieldRequiredHint]}>{t('listing.create.optional')}</Text>
      ) : status === 'required' ? (
        <Text style={[styles.fieldRequiredHint, themed.fieldRequiredHint]}>{t('listing.create.required')}</Text>
      ) : null}
    </View>
  );
}

interface EditListingPickerRowProps {
  label: string;
  /** Current value — falsy renders the placeholder copy. */
  value: string | null | undefined;
  placeholder: string;
  status: EditFieldStatus;
  icon: string;
  onPress?: () => void;
  disabled: boolean;
  accessibilityLabel: string;
}

export function EditListingPickerRow({
  label,
  value,
  placeholder,
  status,
  icon,
  onPress,
  disabled,
  accessibilityLabel,
}: EditListingPickerRowProps) {
  const themed = useEditListingThemedStyles();
  return (
    <Pressable
      style={({ pressed }) => [styles.pickerRow, pressed && { opacity: 0.85 }]}
      onPress={() => !disabled && onPress?.()}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
    >
      <View style={styles.pickerRowInner}>
        {status === 'none' ? (
          // Bare label (shipping rows) — no status row, single margin.
          <Text style={[styles.fieldLabel, themed.fieldLabel]}>{label}</Text>
        ) : (
          <EditListingFieldLabel label={label} status={status} />
        )}
        <Text style={[styles.pickerValue, themed.pickerValue, !value && styles.pickerPlaceholder, !value && themed.pickerPlaceholder]}>
          {value || placeholder}
        </Text>
      </View>
      <AppIcon name={icon} size={IconSize.sm} color="textMuted" opticalCenter accessible={false} />
    </Pressable>
  );
}
