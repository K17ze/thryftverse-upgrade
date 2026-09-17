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
import { IconGrammar } from '../../../theme/designTokens';
import { useAppTheme } from '../../../theme/ThemeContext';
import { createStableId } from '../../../utils/createStableId';
import { useHaptic } from '../../../hooks/useHaptic';
import type { CreatorLayer } from '../../core/projectStore/composition';
import { PickerShell, baseLayer, createStyles } from './pickerShared';

// ── Location Picker ───────────────────────────────────────────────

type LocationPayload = Extract<CreatorLayer, { type: 'location' }>['payload'];

export const LocationPicker = React.memo(function LocationPicker({ onClose, onAddLayer, editingLayer }: { onClose: () => void; onAddLayer: (layer: CreatorLayer) => void; editingLayer?: CreatorLayer | null }) {
  const { colors } = useAppTheme();
  const haptic = useHaptic();
  const { width: screenWidth } = useWindowDimensions();
  const styles = React.useMemo(() => createStyles(colors, screenWidth), [colors, screenWidth]);
  const isEditing = editingLayer?.type === 'location';
  const existingPayload = editingLayer?.type === 'location' ? editingLayer.payload : null;

  const [placeName, setPlaceName] = useState(existingPayload?.placeName ?? '');

  const canSave = placeName.trim().length > 0;

  const handleAdd = useCallback(() => {
    if (!canSave) return;
    const payload: LocationPayload = {
      placeName: placeName.trim() };
    if (isEditing && editingLayer) {
      onAddLayer({ ...editingLayer, payload: { ...editingLayer.payload, ...payload } } as CreatorLayer);
    } else {
      onAddLayer({
        ...baseLayer(createStableId('location'), 10),
        type: 'location',
        width: 0.4,
        height: 0.06,
        payload });
    }
    haptic.medium();
    onClose();
  }, [placeName, canSave, isEditing, editingLayer, onAddLayer, onClose, haptic]);

  return (
    <PickerShell title={isEditing ? 'Edit Location' : 'Add Location'} onClose={onClose} compact>
      <View style={styles.textPickerBody}>
        <View style={styles.stickerPreviewPill}>
          <Ionicons name="location-outline" size={IconGrammar.metadata} color={colors.scrimTextPrimary} aria-hidden={true} />
          <Text style={styles.stickerPreviewPillText}>{placeName || 'Location'}</Text>
        </View>
        <Text style={styles.pickerSectionLabel}>Place Name</Text>
        <TextInput
          style={styles.textInput}
          placeholder="e.g. London, UK"
          placeholderTextColor={colors.textMuted}
          value={placeName}
          onChangeText={setPlaceName}
          maxLength={80}
          accessibilityLabel="Location name"
          accessibilityHint="Type the location name"
        />
        <Pressable onPress={handleAdd} style={[styles.saveBtn, !canSave && styles.saveBtnDisabled]} disabled={!canSave} accessibilityLabel={isEditing ? 'Update location' : 'Add location'}
        accessibilityHint="Saves the location sticker" accessibilityRole="button" accessibilityState={{ disabled: !canSave }} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Text style={styles.saveBtnText}>{isEditing ? 'Update' : 'Add Location'}</Text>
        </Pressable>
      </View>
    </PickerShell>
  );
});
