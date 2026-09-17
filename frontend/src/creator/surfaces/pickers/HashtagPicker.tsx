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
import { PickerShell, baseLayer, createStyles, TEXT_COLORS, DEFAULT_STICKER_BG_COLOR } from './pickerShared';

// ── Hashtag Picker ────────────────────────────────────────────────

type HashtagPayload = Extract<CreatorLayer, { type: 'hashtag' }>['payload'];

export const HashtagPicker = React.memo(function HashtagPicker({ onClose, onAddLayer, editingLayer }: { onClose: () => void; onAddLayer: (layer: CreatorLayer) => void; editingLayer?: CreatorLayer | null }) {
  const { colors } = useAppTheme();
  const haptic = useHaptic();
  const { width: screenWidth } = useWindowDimensions();
  const styles = React.useMemo(() => createStyles(colors, screenWidth), [colors, screenWidth]);
  const isEditing = editingLayer?.type === 'hashtag';
  const existingPayload = editingLayer?.type === 'hashtag' ? editingLayer.payload : null;

  const [tag, setTag] = useState(existingPayload?.tag ?? '');

  const canSave = tag.trim().length > 0;

  const handleAdd = useCallback(() => {
    if (!canSave) return;
    const cleanTag = tag.trim().replace(/^#/, '');
    const payload: HashtagPayload = {
      tag: cleanTag,
      backgroundColor: DEFAULT_STICKER_BG_COLOR,
      textColor: TEXT_COLORS[0] };
    if (isEditing && editingLayer) {
      onAddLayer({ ...editingLayer, payload: { ...editingLayer.payload, ...payload } } as CreatorLayer);
    } else {
      onAddLayer({
        ...baseLayer(createStableId('hashtag'), 10),
        type: 'hashtag',
        width: 0.4,
        height: 0.06,
        payload });
    }
    haptic.medium();
    onClose();
  }, [tag, canSave, isEditing, editingLayer, onAddLayer, onClose, haptic]);

  return (
    <PickerShell title={isEditing ? 'Edit Hashtag' : 'Add Hashtag'} onClose={onClose} compact>
      <View style={styles.textPickerBody}>
        <View style={styles.stickerPreviewPill}>
          <Ionicons name="bag-handle-outline" size={IconGrammar.metadata} color={colors.scrimTextPrimary} aria-hidden={true} />
          <Text style={styles.stickerPreviewPillText}>#{tag.replace(/^#/, '') || 'hashtag'}</Text>
        </View>
        <Text style={styles.pickerSectionLabel}>Hashtag</Text>
        <TextInput
          style={styles.textInput}
          placeholder="thryftverse"
          placeholderTextColor={colors.textMuted}
          value={tag}
          onChangeText={setTag}
          maxLength={100}
          autoCapitalize="none"
          autoCorrect={false}
          accessibilityLabel="Hashtag"
          accessibilityHint="Type the hashtag"
        />
        <Pressable onPress={handleAdd} style={[styles.saveBtn, !canSave && styles.saveBtnDisabled]} disabled={!canSave} accessibilityLabel={isEditing ? 'Update hashtag' : 'Add hashtag'}
        accessibilityHint="Saves the hashtag sticker" accessibilityRole="button" accessibilityState={{ disabled: !canSave }} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Text style={styles.saveBtnText}>{isEditing ? 'Update' : 'Add Hashtag'}</Text>
        </Pressable>
      </View>
    </PickerShell>
  );
});
