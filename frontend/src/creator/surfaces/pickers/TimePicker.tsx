import React, {
  useState,
  useCallback } from 'react';
import {
  View,
  Text,
  Pressable,
  useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { IconGrammar } from '../../../theme/designTokens';
import { useAppTheme } from '../../../theme/ThemeContext';
import { createStableId } from '../../../utils/createStableId';
import { useHaptic } from '../../../hooks/useHaptic';
import type { CreatorLayer } from '../../core/projectStore/composition';
import { PickerShell, baseLayer, createStyles, TEXT_COLORS } from './pickerShared';

// ── Time Picker ───────────────────────────────────────────────────

type TimePayload = Extract<CreatorLayer, { type: 'time' }>['payload'];

export const TimePicker = React.memo(function TimePicker({ onClose, onAddLayer, editingLayer }: { onClose: () => void; onAddLayer: (layer: CreatorLayer) => void; editingLayer?: CreatorLayer | null }) {
  const { colors } = useAppTheme();
  const haptic = useHaptic();
  const { width: screenWidth } = useWindowDimensions();
  const styles = React.useMemo(() => createStyles(colors, screenWidth), [colors, screenWidth]);
  const isEditing = editingLayer?.type === 'time';
  const existingPayload = editingLayer?.type === 'time' ? editingLayer.payload : null;

  const [format, setFormat] = useState<'time' | 'date' | 'datetime'>(existingPayload?.format ?? 'time');
  const now = new Date();
  const previewStr = format === 'time'
    ? now.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
    : format === 'date'
    ? now.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
    : now.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

  const handleAdd = useCallback(() => {
    const payload: TimePayload = {
      displayTime: new Date().toISOString(),
      format,
      textColor: TEXT_COLORS[0] };
    if (isEditing && editingLayer) {
      onAddLayer({ ...editingLayer, payload: { ...editingLayer.payload, ...payload } } as CreatorLayer);
    } else {
      onAddLayer({
        ...baseLayer(createStableId('time'), 10),
        type: 'time',
        width: 0.3,
        height: 0.06,
        payload });
    }
    haptic.medium();
    onClose();
  }, [format, isEditing, editingLayer, onAddLayer, onClose, haptic]);

  return (
    <PickerShell title={isEditing ? 'Edit Time' : 'Add Time'} onClose={onClose} compact>
      <View style={styles.textPickerBody}>
        <View style={styles.stickerPreviewPill}>
          <Ionicons name="time-outline" size={IconGrammar.metadata} color={colors.scrimTextPrimary} aria-hidden={true} />
          <Text style={styles.stickerPreviewPillText}>{previewStr}</Text>
        </View>
        <Text style={styles.pickerSectionLabel}>Format</Text>
        <View style={styles.alignmentRow}>
          {([
            { key: 'time' as const, label: 'Time', icon: 'time-outline' as const },
            { key: 'date' as const, label: 'Date', icon: 'calendar-outline' as const },
            { key: 'datetime' as const, label: 'Both', icon: 'calendar-number-outline' as const },
          ] as const).map((f) => (
            <Pressable
              key={f.key}
              onPress={() => { haptic.selection(); setFormat(f.key); }}
              style={[styles.alignmentOption, format === f.key && styles.alignmentOptionActive]}
              accessibilityLabel={`Time format ${f.label}`}
              accessibilityHint="Sets the time display format"
              accessibilityRole="button"
              accessibilityState={{ selected: format === f.key }}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Ionicons name={f.icon} size={IconGrammar.standard} color={format === f.key ? colors.brand : colors.textSecondary} aria-hidden={true} />
            </Pressable>
          ))}
        </View>
        <Pressable onPress={handleAdd} style={styles.saveBtn} accessibilityLabel={isEditing ? 'Update time' : 'Add time'}
        accessibilityHint="Saves the time sticker" accessibilityRole="button" hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Text style={styles.saveBtnText}>{isEditing ? 'Update' : 'Add Time'}</Text>
        </Pressable>
      </View>
    </PickerShell>
  );
});
