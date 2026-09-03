/**
 * DebouncedTextInput — controlled TextInput with local state + debounced
 * parent sync.
 *
 * Why this exists:
 *   In large forms (e.g. SellScreen with ~30 useState fields), a controlled
 *   TextInput calls onChangeText on every keystroke, which setState's the
 *   parent and re-renders the entire form subtree. For long-text fields
 *   (title, description), this means the whole form re-renders on every
 *   character typed.
 *
 *   This component keeps a local text state that updates immediately (no
 *   parent re-render), and debounces the parent's onChangeText callback so
 *   the parent only re-renders when the user pauses typing (default 300ms).
 *
 *   It also syncs external value changes (e.g. AI autofill) back to local
 *   state when the `value` prop changes and differs from local state.
 *
 * Anti-AI design: no over-scaffolding. One component, one responsibility.
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { TextInput, type TextInputProps, type StyleProp, type TextStyle } from 'react-native';

export interface DebouncedTextInputProps extends Omit<TextInputProps, 'value' | 'onChangeText'> {
  /** Controlled value from the parent. Synced to local state when it changes externally. */
  value: string;
  /**
   * Debounced callback — fires after the user stops typing for `debounceMs`.
   * Use this to update parent state (and trigger draft persistence, etc.).
   */
  onChangeText: (text: string) => void;
  /** Debounce window in ms. Default 300. Set to 0 for immediate (no debounce). */
  debounceMs?: number;
  /** Optional immediate callback — fires on every keystroke WITHOUT parent state. Use for clearing errors. */
  onImmediateChange?: (text: string) => void;
  style?: StyleProp<TextStyle>;
}

function DebouncedTextInputImpl({
  value,
  onChangeText,
  debounceMs = 300,
  onImmediateChange,
  style,
  ...rest
}: DebouncedTextInputProps) {
  const [localText, setLocalText] = useState(value);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isInternalChange = useRef(false);

  // Sync external value changes (e.g. autofill, draft restore) to local state.
  // Skip when the change originated from internal typing (debounce pending).
  useEffect(() => {
    if (!isInternalChange.current && value !== localText) {
      setLocalText(value);
    }
    isInternalChange.current = false;
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps -- localText is intentionally not a dep here

  // Cleanup pending debounce on unmount.
  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, []);

  const handleChangeText = useCallback(
    (text: string) => {
      setLocalText(text);
      onImmediateChange?.(text);

      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }

      if (debounceMs <= 0) {
        onChangeText(text);
        return;
      }

      isInternalChange.current = true;
      debounceRef.current = setTimeout(() => {
        debounceRef.current = null;
        onChangeText(text);
      }, debounceMs);
    },
    [onChangeText, onImmediateChange, debounceMs],
  );

  return (
    <TextInput
      {...rest}
      style={style}
      value={localText}
      onChangeText={handleChangeText}
    />
  );
}

export const DebouncedTextInput = React.memo(DebouncedTextInputImpl);
