import React, {
  useState,
  useCallback } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  TextInput,
  useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { IconGrammar } from '../../../theme/designTokens';
import { TypographyV2 } from '../../../theme/typography.v2';
import { useAppTheme } from '../../../theme/ThemeContext';
import { createStableId } from '../../../utils/createStableId';
import { useHaptic } from '../../../hooks/useHaptic';
import type { CreatorLayer } from '../../core/projectStore/composition';
import { PickerShell, baseLayer, createStyles } from './pickerShared';

// ── Quiz Picker ───────────────────────────────────────────────────
// Instagram 2026 parity: multiple-choice quiz with correct answer.

type QuizPayload = Extract<CreatorLayer, { type: 'quiz' }>['payload'];

const QUIZ_EMOJIS = ['🎯', '🔥', '💡', '❓', '✅', '⭐', '🎨', '👍'];

export const QuizPicker = React.memo(function QuizPicker({ onClose, onAddLayer, editingLayer }: { onClose: () => void; onAddLayer: (layer: CreatorLayer) => void; editingLayer?: CreatorLayer | null }) {
  const { colors } = useAppTheme();
  const haptic = useHaptic();
  const { width: screenWidth } = useWindowDimensions();
  const styles = React.useMemo(() => createStyles(colors, screenWidth), [colors, screenWidth]);
  const isEditing = editingLayer?.type === 'quiz';
  const existing = editingLayer?.type === 'quiz' ? editingLayer.payload : null;

  const [question, setQuestion] = useState(existing?.question ?? '');
  const [options, setOptions] = useState<string[]>(existing?.options?.map((o) => o.label) ?? ['', '']);
  const [correctIdx, setCorrectIdx] = useState<number>(() => {
    if (existing?.correctOptionId && existing?.options) {
      return existing.options.findIndex((o) => o.id === existing.correctOptionId);
    }
    return 0;
  });
  const [emoji, setEmoji] = useState(existing?.emoji ?? '🎯');
  const [timerMs, setTimerMs] = useState<number | null>(existing?.timerMs ?? null);

  const QUIZ_TIMER_OPTIONS = [
    { label: 'No timer', value: null as number | null },
    { label: '15s', value: 15000 },
    { label: '30s', value: 30000 },
    { label: '1m', value: 60000 },
    { label: '5m', value: 300000 },
  ];

  const handleAdd = useCallback(() => {
    if (!question.trim() || options.filter(o => o.trim()).length < 2) return;
    haptic.light();
    const cleanOptions = options.filter(o => o.trim()).slice(0, 4);
    const optionObjs = cleanOptions.map((label, i) => ({ id: `opt_${i}_${Date.now()}`, label: label.trim() }));
    const payload: QuizPayload = {
      question: question.trim(),
      options: optionObjs,
      correctOptionId: optionObjs[correctIdx]?.id ?? optionObjs[0].id,
      emoji,
      ...(timerMs ? { timerMs } : {}) };
    if (isEditing && editingLayer) {
      onAddLayer({ ...editingLayer, payload: { ...editingLayer.payload, ...payload } } as CreatorLayer);
    } else {
      onAddLayer({
        ...baseLayer(createStableId('quiz'), 10),
        type: 'quiz',
        width: 0.7,
        height: 0.25,
        payload });
    }
    onClose();
  }, [question, options, correctIdx, emoji, timerMs, isEditing, editingLayer, onAddLayer, onClose, haptic]);

  return (
    <PickerShell title={isEditing ? 'Edit Quiz' : 'Add Quiz'} onClose={onClose} compact>
      <View style={styles.textPickerBody}>
        {/* Live preview — mini quiz sticker */}
        <View style={styles.quizPreviewWrap}>
          <View style={styles.quizPreviewHeader}>
            <Text style={styles.quizPreviewEmoji}>{emoji}</Text>
            <Text style={styles.quizPreviewQuestion} numberOfLines={2}>
              {question.trim() || 'Ask a question...'}
            </Text>
          </View>
          {options.filter(o => o.trim()).slice(0, 4).map((opt, i) => (
            <View key={i} style={[styles.quizPreviewOption, correctIdx === i && styles.quizPreviewOptionCorrect]}>
              <Text style={styles.quizPreviewOptionText} numberOfLines={1}>{opt.trim()}</Text>
              {correctIdx === i && (
                <Ionicons name="checkmark-circle" size={IconGrammar.metadata} color={colors.successText} aria-hidden={true} />
              )}
            </View>
          ))}
          {options.filter(o => o.trim()).length === 0 && (
            <View style={styles.quizPreviewOption}>
              <Text style={[styles.quizPreviewOptionText, { opacity: 0.5 }]}>Add options...</Text>
            </View>
          )}
        </View>
        <TextInput
          style={styles.textInput}
          placeholder="Ask a question..."
          placeholderTextColor={colors.textMuted}
          value={question}
          onChangeText={setQuestion}
          maxLength={100}
          autoFocus
          accessibilityLabel="Quiz question"
          accessibilityHint="Type the quiz question"
        />
        <Text style={styles.pickerSectionLabel}>Options (tap to mark correct)</Text>
        {options.map((opt, i) => (
          <View key={i} style={styles.quizOptionRow}>
            <Pressable
              onPress={() => { haptic.selection(); setCorrectIdx(i); }}
              style={[styles.quizCorrectDot, correctIdx === i && { backgroundColor: colors.success }]}
              accessibilityLabel={`Mark option ${i + 1} as correct`}
              accessibilityHint="Sets this as the correct answer"
              accessibilityRole="button"
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              {correctIdx === i && <Ionicons name="checkmark" size={IconGrammar.metadata} color={colors.scrimTextPrimary} aria-hidden={true} />}
            </Pressable>
            <TextInput
              style={[styles.textInput, { flex: 1, minHeight: 44 }]}
              placeholder={`Option ${i + 1}`}
              placeholderTextColor={colors.textMuted}
              value={opt}
              onChangeText={(v) => setOptions(prev => prev.map((o, idx) => idx === i ? v : o))}
              maxLength={50}
              accessibilityLabel={`Quiz option ${i + 1}`}
              accessibilityHint="Type the option text"
            />
            {options.length > 2 && (
              <Pressable
                onPress={() => {
                  haptic.warning();
                  setOptions(prev => prev.filter((_, idx) => idx !== i));
                  if (correctIdx >= i && correctIdx > 0) setCorrectIdx(correctIdx - 1);
                }}
                style={styles.quizRemoveBtn}
                accessibilityLabel={`Remove option ${i + 1}`}
                accessibilityHint="Removes this option"
                accessibilityRole="button"
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              >
                <Ionicons name="close-circle" size={IconGrammar.standard} color={colors.dangerText} aria-hidden={true} />
              </Pressable>
            )}
          </View>
        ))}
        {options.length < 4 && (
          <Pressable
            onPress={() => { haptic.selection(); setOptions(prev => [...prev, '']); }}
            style={styles.quizAddOptionBtn}
            accessibilityLabel="Add option"
            accessibilityHint="Adds another answer option"
            accessibilityRole="button"
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Ionicons name="add-circle-outline" size={IconGrammar.standard} color={colors.brand} aria-hidden={true} />
            <Text style={styles.quizAddOptionText}>Add Option</Text>
          </Pressable>
        )}
        <Text style={styles.pickerSectionLabel}>Emoji</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.styleScroll}>
          {QUIZ_EMOJIS.map((e) => (
            <Pressable
              key={e}
              onPress={() => { haptic.selection(); setEmoji(e); }}
              style={[styles.styleOption, emoji === e && styles.styleOptionActive]}
              accessibilityLabel={`Emoji ${e}`}
              accessibilityHint="Selects this emoji"
              accessibilityRole="button"
              accessibilityState={{ selected: emoji === e }}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Text style={{ fontSize: TypographyV2.screenTitle.size }}>{e}</Text>
            </Pressable>
          ))}
        </ScrollView>
        {/* Timer selection */}
        <Text style={styles.pickerSectionLabel}>Timer</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.styleScroll}>
          {QUIZ_TIMER_OPTIONS.map((t) => {
            const isActive = timerMs === t.value;
            return (
              <Pressable
                key={t.label}
                onPress={() => { haptic.selection(); setTimerMs(t.value); }}
                style={({ pressed }) => [
                  styles.timerChip,
                  isActive && { backgroundColor: colors.brand, borderColor: colors.brand },
                  pressed && { opacity: 0.7 },
                ]}
                accessibilityLabel={`Timer: ${t.label}`}
                accessibilityHint="Sets the answer timer"
                accessibilityRole="button"
                accessibilityState={{ selected: isActive }}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              >
                <Text style={[styles.timerChipText, isActive && { color: colors.scrimTextPrimary }]}>
                  {t.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
        <Pressable
          onPress={handleAdd}
          disabled={!question.trim() || options.filter(o => o.trim()).length < 2}
          style={[styles.saveBtn, (!question.trim() || options.filter(o => o.trim()).length < 2) && styles.saveBtnDisabled]}
          accessibilityLabel={isEditing ? 'Update quiz' : 'Add quiz'}
          accessibilityHint="Saves the quiz sticker"
          accessibilityRole="button"
          accessibilityState={{ disabled: !question.trim() || options.filter(o => o.trim()).length < 2 }}
          hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}
        >
          <Text style={styles.saveBtnText}>{isEditing ? 'Update' : 'Add Quiz'}</Text>
        </Pressable>
      </View>
    </PickerShell>
  );
});
