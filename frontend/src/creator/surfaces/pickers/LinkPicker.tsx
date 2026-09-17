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

// ── Link Picker ───────────────────────────────────────────────────

type LinkPayload = Extract<CreatorLayer, { type: 'link' }>['payload'];

export const LinkPicker = React.memo(function LinkPicker({ onClose, onAddLayer, editingLayer }: { onClose: () => void; onAddLayer: (layer: CreatorLayer) => void; editingLayer?: CreatorLayer | null }) {
  const { colors } = useAppTheme();
  const haptic = useHaptic();
  const { width: screenWidth } = useWindowDimensions();
  const styles = React.useMemo(() => createStyles(colors, screenWidth), [colors, screenWidth]);
  const isEditing = editingLayer?.type === 'link';
  const existingPayload = editingLayer?.type === 'link' ? editingLayer.payload : null;

  const [url, setUrl] = useState(existingPayload?.url ?? '');
  const [ctaText, setCtaText] = useState(existingPayload?.ctaText ?? 'Link');
  const [bgColor, setBgColor] = useState(existingPayload?.backgroundColor ?? DEFAULT_STICKER_BG_COLOR);

  const canSave = url.trim().length > 0 && (url.startsWith('http://') || url.startsWith('https://'));

  const handleAdd = useCallback(() => {
    if (!canSave) return;
    const payload: LinkPayload = {
      url: url.trim(),
      ctaText: ctaText.trim() || 'Link',
      backgroundColor: bgColor,
      textColor: TEXT_COLORS[0] };
    if (isEditing && editingLayer) {
      onAddLayer({ ...editingLayer, payload: { ...editingLayer.payload, ...payload } } as CreatorLayer);
    } else {
      onAddLayer({
        ...baseLayer(createStableId('link'), 10),
        type: 'link',
        width: 0.5,
        height: 0.08,
        payload });
    }
    haptic.medium();
    onClose();
  }, [url, ctaText, bgColor, canSave, isEditing, editingLayer, onAddLayer, onClose, haptic]);

  return (
    <PickerShell title={isEditing ? 'Edit Link' : 'Add Link'} onClose={onClose} compact>
      <View style={styles.textPickerBody}>
        <View style={styles.stickerPreviewPill}>
          <Ionicons name="link-outline" size={IconGrammar.metadata} color={colors.scrimTextPrimary} aria-hidden={true} />
          <Text style={styles.stickerPreviewPillText}>{ctaText || 'Link'}</Text>
        </View>
        <Text style={styles.pickerSectionLabel}>URL</Text>
        <TextInput
          style={styles.textInput}
          placeholder="https://..."
          placeholderTextColor={colors.textMuted}
          value={url}
          onChangeText={setUrl}
          keyboardType="url"
          autoCapitalize="none"
          autoCorrect={false}
          accessibilityLabel="Link URL"
          accessibilityHint="Type the link URL"
        />
        <Text style={styles.pickerSectionLabel}>Button Text</Text>
        <TextInput
          style={styles.textInput}
          placeholder="Link"
          placeholderTextColor={colors.textMuted}
          value={ctaText}
          onChangeText={setCtaText}
          maxLength={40}
          accessibilityLabel="Link button text"
          accessibilityHint="Type the button label"
        />
        <Text style={styles.pickerSectionLabel}>Color</Text>
        <View style={styles.colorRow}>
          {['#C9A46A', '#9b0202', '#215634', '#06489A', '#000000', '#ffffff'].map((c) => (
            <Pressable
              key={c}
              onPress={() => { haptic.selection(); setBgColor(c); }}
              style={[styles.colorOption, { backgroundColor: c }, bgColor === c && styles.colorOptionActive]}
              accessibilityLabel={`Link color ${c}`}
              accessibilityHint="Sets the link color"
              accessibilityRole="button"
              accessibilityState={{ selected: bgColor === c }}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            />
          ))}
        </View>
        <Pressable onPress={handleAdd} style={[styles.saveBtn, !canSave && styles.saveBtnDisabled]} disabled={!canSave} accessibilityLabel={isEditing ? 'Update link' : 'Add link'}
        accessibilityHint="Saves the link sticker" accessibilityRole="button" accessibilityState={{ disabled: !canSave }} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Text style={styles.saveBtnText}>{isEditing ? 'Update' : 'Add Link'}</Text>
        </Pressable>
      </View>
    </PickerShell>
  );
});
