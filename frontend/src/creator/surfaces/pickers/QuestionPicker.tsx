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
import { PickerShell, baseLayer, createStyles, TEXT_COLORS } from './pickerShared';

// ── Question Picker ───────────────────────────────────────────────
// Instagram 2026 parity: open-ended question box sticker.

type QuestionPayload = Extract<CreatorLayer, { type: 'question' }>['payload'];

export const QuestionPicker = React.memo(function QuestionPicker({ onClose, onAddLayer, editingLayer }: { onClose: () => void; onAddLayer: (layer: CreatorLayer) => void; editingLayer?: CreatorLayer | null }) {
  const { colors } = useAppTheme();
  const haptic = useHaptic();
  const { width: screenWidth } = useWindowDimensions();
  const styles = React.useMemo(() => createStyles(colors, screenWidth), [colors, screenWidth]);
  const isEditing = editingLayer?.type === 'question';
  const existing = editingLayer?.type === 'question' ? editingLayer.payload : null;

  const QUESTION_BG_COLORS = ['#9b0202', '#215634', '#06489A', '#6B3245', '#1a1a1a', '#C9A46A'];

  const [prompt, setPrompt] = useState(existing?.prompt ?? '');
  const [placeholder, setPlaceholder] = useState(existing?.placeholder ?? 'Type something...');
  const [bgColor, setBgColor] = useState(existing?.backgroundColor ?? QUESTION_BG_COLORS[0]);

  const handleAdd = useCallback(() => {
    if (!prompt.trim()) return;
    haptic.medium();
    const payload: QuestionPayload = {
      prompt: prompt.trim(),
      placeholder: placeholder.trim() || 'Type something...',
      backgroundColor: bgColor,
      textColor: TEXT_COLORS[0] };
    if (isEditing && editingLayer) {
      onAddLayer({ ...editingLayer, payload: { ...editingLayer.payload, ...payload } } as CreatorLayer);
    } else {
      onAddLayer({
        ...baseLayer(createStableId('question'), 10),
        type: 'question',
        width: 0.6,
        height: 0.12,
        payload });
    }
    onClose();
  }, [prompt, placeholder, bgColor, isEditing, editingLayer, onAddLayer, onClose, haptic]);

  return (
    <PickerShell title={isEditing ? 'Edit Question' : 'Ask Me'} onClose={onClose} compact>
      <View style={styles.textPickerBody}>
        <View style={[styles.questionPreviewWrap, { backgroundColor: bgColor }]}>
          <View style={styles.questionPreviewIconRow}>
            <Ionicons name="chatbubble-ellipses" size={IconGrammar.metadata} color={colors.scrimTextSecondary} aria-hidden={true} />
          </View>
          <Text style={styles.questionPreviewPrompt}>
            {prompt.trim() || 'Ask me a question'}
          </Text>
          <View style={styles.questionPreviewInputRow}>
            <Text style={styles.questionPreviewPlaceholder}>
              {placeholder.trim() || 'Type something...'}
            </Text>
            <View style={styles.questionPreviewSendDot} />
          </View>
        </View>
        <TextInput
          style={styles.textInput}
          placeholder="Question prompt..."
          placeholderTextColor={colors.textMuted}
          value={prompt}
          onChangeText={setPrompt}
          maxLength={100}
          autoFocus
          accessibilityLabel="Question prompt"
          accessibilityHint="Type the question"
        />
        <TextInput
          style={styles.textInput}
          placeholder="Placeholder text..."
          placeholderTextColor={colors.textMuted}
          value={placeholder}
          onChangeText={setPlaceholder}
          maxLength={80}
          accessibilityLabel="Question placeholder"
          accessibilityHint="Type the placeholder text"
        />
        <Text style={styles.pickerSectionLabel}>Background</Text>
        <View style={styles.colorRow}>
          {QUESTION_BG_COLORS.map((c) => (
            <Pressable
              key={c}
              onPress={() => { haptic.selection(); setBgColor(c); }}
              style={[styles.colorOption, { backgroundColor: c }, bgColor === c && styles.colorOptionActive]}
              accessibilityLabel={`Background ${c}`}
              accessibilityHint="Sets the background color"
              accessibilityRole="button"
              accessibilityState={{ selected: bgColor === c }}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            />
          ))}
        </View>
        <Pressable
          onPress={handleAdd}
          disabled={!prompt.trim()}
          style={[styles.saveBtn, !prompt.trim() && styles.saveBtnDisabled]}
          accessibilityLabel={isEditing ? 'Update question' : 'Add question'}
          accessibilityHint="Saves the question sticker"
          accessibilityRole="button"
          accessibilityState={{ disabled: !prompt.trim() }}
          hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}
        >
          <Text style={styles.saveBtnText}>{isEditing ? 'Update' : 'Add Question'}</Text>
        </Pressable>
      </View>
    </PickerShell>
  );
});
