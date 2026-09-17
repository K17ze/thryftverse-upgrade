import React, {
  useState,
  useCallback } from 'react';
import {
  View,
  Text,
  Pressable,
  TextInput,
  useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  Space,
  IconGrammar } from '../../../theme/designTokens';
import { TypographyV2 } from '../../../theme/typography.v2';
import { useAppTheme } from '../../../theme/ThemeContext';
import { createStableId } from '../../../utils/createStableId';
import { useHaptic } from '../../../hooks/useHaptic';
import type { CreatorLayer } from '../../core/projectStore/composition';
import { PickerShell, baseLayer, createStyles, TEXT_COLORS } from './pickerShared';

// ── Countdown Picker ──────────────────────────────────────────────
// Instagram 2026 parity: countdown to a date/time sticker.

type CountdownPayload = Extract<CreatorLayer, { type: 'countdown' }>['payload'];

export const CountdownPicker = React.memo(function CountdownPicker({ onClose, onAddLayer, editingLayer }: { onClose: () => void; onAddLayer: (layer: CreatorLayer) => void; editingLayer?: CreatorLayer | null }) {
  const { colors } = useAppTheme();
  const haptic = useHaptic();
  const { width: screenWidth } = useWindowDimensions();
  const styles = React.useMemo(() => createStyles(colors, screenWidth), [colors, screenWidth]);
  const isEditing = editingLayer?.type === 'countdown';
  const existing = editingLayer?.type === 'countdown' ? editingLayer.payload : null;

  const COUNTDOWN_COLORS = ['#C9A46A', '#9b0202', '#215634', '#06489A', '#6B3245', '#1a1a1a'];

  const [label, setLabel] = useState(existing?.label ?? '');
  const [endDate, setEndDate] = useState(() => {
    if (existing?.endDateTime) return new Date(existing.endDateTime);
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(18, 0, 0, 0);
    return d;
  });
  const [color, setColor] = useState(existing?.color ?? COUNTDOWN_COLORS[0]);

  const handleAdd = useCallback(() => {
    if (!label.trim()) return;
    haptic.medium();
    const payload: CountdownPayload = {
      label: label.trim(),
      endDateTime: endDate.toISOString(),
      color,
      textColor: TEXT_COLORS[0] };
    if (isEditing && editingLayer) {
      onAddLayer({ ...editingLayer, payload: { ...editingLayer.payload, ...payload } } as CreatorLayer);
    } else {
      onAddLayer({
        ...baseLayer(createStableId('countdown'), 10),
        type: 'countdown',
        width: 0.5,
        height: 0.12,
        payload });
    }
    onClose();
  }, [label, endDate, color, isEditing, editingLayer, onAddLayer, onClose, haptic]);

  const formatDate = (d: Date) => {
    const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' };
    return d.toLocaleDateString('en-US', opts);
  };

  return (
    <PickerShell title={isEditing ? 'Edit Countdown' : 'Countdown'} onClose={onClose} compact>
      <View style={styles.textPickerBody}>
        <View style={[styles.textPreview, { backgroundColor: color }]}>
          <Text style={{ color: colors.scrimTextPrimary, fontFamily: TypographyV2.bodyStrong.fontFamily, fontSize: TypographyV2.bodyStrong.size }}>
            {label.trim() || 'Event countdown'}
          </Text>
          <Text style={{ color: colors.scrimTextPrimary, fontFamily: TypographyV2.screenTitle.fontFamily, fontSize: TypographyV2.screenTitle.size, marginTop: Space.xs }}>
            {formatDate(endDate)}
          </Text>
        </View>
        <TextInput
          style={styles.textInput}
          placeholder="Countdown label..."
          placeholderTextColor={colors.textMuted}
          value={label}
          onChangeText={setLabel}
          maxLength={40}
          autoFocus
          accessibilityLabel="Countdown label"
          accessibilityHint="Type the countdown label"
        />
        <Text style={styles.pickerSectionLabel}>End Date & Time</Text>
        <Pressable
          onPress={() => {
            haptic.selection();
            // Simple date adjustment: cycle through next 7 days at 6pm
            const d = new Date(endDate);
            d.setDate(d.getDate() + 1);
            if (d.getDate() === 1) d.setDate(endDate.getDate() - 6);
            setEndDate(d);
          }}
          style={styles.countdownDateBtn}
          accessibilityLabel="Adjust end date"
          accessibilityHint="Cycles to the next day"
          accessibilityRole="button"
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Ionicons name="calendar-outline" size={IconGrammar.standard} color={colors.brand} aria-hidden={true} />
          <Text style={styles.countdownDateText}>{formatDate(endDate)}</Text>
          <Ionicons name="chevron-forward" size={IconGrammar.metadata} color={colors.textMuted} aria-hidden={true} />
        </Pressable>
        <Text style={styles.pickerSectionLabel}>Color</Text>
        <View style={styles.colorRow}>
          {COUNTDOWN_COLORS.map((c) => (
            <Pressable
              key={c}
              onPress={() => { haptic.selection(); setColor(c); }}
              style={[styles.colorOption, { backgroundColor: c }, color === c && styles.colorOptionActive]}
              accessibilityLabel={`Countdown color ${c}`}
              accessibilityHint="Sets the countdown color"
              accessibilityRole="button"
              accessibilityState={{ selected: color === c }}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            />
          ))}
        </View>
        <Pressable
          onPress={handleAdd}
          disabled={!label.trim()}
          style={[styles.saveBtn, !label.trim() && styles.saveBtnDisabled]}
          accessibilityLabel={isEditing ? 'Update countdown' : 'Add countdown'}
          accessibilityHint="Saves the countdown sticker"
          accessibilityRole="button"
          accessibilityState={{ disabled: !label.trim() }}
          hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}
        >
          <Text style={styles.saveBtnText}>{isEditing ? 'Update' : 'Add Countdown'}</Text>
        </Pressable>
      </View>
    </PickerShell>
  );
});
