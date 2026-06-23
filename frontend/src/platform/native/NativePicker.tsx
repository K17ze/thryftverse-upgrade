import React from 'react';
import { Picker as ExpoPicker, type PickerItemValue, type PickerAppearance } from '@expo/ui';

export interface NativePickerOption<T extends PickerItemValue = string> {
  label: string;
  value: T;
}

export interface NativePickerProps<T extends PickerItemValue = string> {
  selectedValue: T;
  onValueChange: (value: T) => void;
  options: NativePickerOption<T>[];
  appearance?: PickerAppearance;
  enabled?: boolean;
  testID?: string;
}

export function NativePicker<T extends PickerItemValue = string>({
  selectedValue,
  onValueChange,
  options,
  appearance = 'menu',
  enabled = true,
  testID,
}: NativePickerProps<T>) {
  return (
    <ExpoPicker
      selectedValue={selectedValue}
      onValueChange={onValueChange}
      appearance={appearance}
      enabled={enabled}
      testID={testID}
    >
      {options.map((opt) => (
        <ExpoPicker.Item key={String(opt.value)} label={opt.label} value={opt.value} />
      ))}
    </ExpoPicker>
  );
}
