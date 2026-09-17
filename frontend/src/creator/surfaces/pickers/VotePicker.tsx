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
import {
  Typography,
  IconGrammar } from '../../../theme/designTokens';
import { TypographyV2 } from '../../../theme/typography.v2';
import { useAppTheme } from '../../../theme/ThemeContext';
import { createStableId } from '../../../utils/createStableId';
import { useHaptic } from '../../../hooks/useHaptic';
import { withAlpha } from '../../../components/poster/shared/colorUtils';
import type { CreatorLayer } from '../../core/projectStore/composition';
import { PickerShell, baseLayer, createStyles } from './pickerShared';

// ── Vote Picker ────────────────────────────────────────────────────

export const VotePicker = React.memo(function VotePicker({ onClose, onAddLayer }: { onClose: () => void; onAddLayer: (layer: CreatorLayer) => void }) {
  const { colors } = useAppTheme();
  const haptic = useHaptic();
  const { width: screenWidth } = useWindowDimensions();
  const styles = React.useMemo(() => createStyles(colors, screenWidth), [colors, screenWidth]);
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState<string[]>(['', '']);
  const [timerMs, setTimerMs] = useState<number | null>(null);

  const TIMER_OPTIONS = [
    { label: 'No timer', value: null as number | null },
    { label: '1h', value: 3600000 },
    { label: '6h', value: 21600000 },
    { label: '24h', value: 86400000 },
    { label: '3d', value: 259200000 },
  ];

  const canSave = question.trim().length > 0 && options.filter(o => o.trim().length > 0).length >= 2;

  const updateOption = (index: number, value: string) => {
    setOptions(prev => prev.map((o, i) => i === index ? value : o));
  };

  const addOption = () => {
    if (options.length < 4) {
      setOptions(prev => [...prev, '']);
      haptic.selection();
    }
  };

  const removeOption = (index: number) => {
    if (options.length > 2) {
      setOptions(prev => prev.filter((_, i) => i !== index));
      haptic.warning();
    }
  };

  const handleAdd = useCallback(() => {
    if (!canSave) return;
    haptic.medium();
    const validOptions = options
      .map(o => o.trim())
      .filter(o => o.length > 0)
      .map(label => ({ id: createStableId('opt'), label }));
    onAddLayer({
      ...baseLayer(createStableId('vote'), 10),
      type: 'vote',
      width: 0.5,
      height: 0.2,
      payload: {
        question: question.trim(),
        options: validOptions,
        ...(timerMs ? { timerMs } : {}) } });
    onClose();
  }, [question, options, timerMs, canSave, onAddLayer, onClose, haptic]);

  return (
    <PickerShell title="Add Style Vote" onClose={onClose} compact>
      <View style={styles.textPickerBody}>
        {/* Live preview — mini vote sticker */}
        <View style={styles.votePreviewWrap}>
          <Text style={styles.votePreviewQuestion} numberOfLines={2}>
            {question.trim() || 'Which outfit is better?'}
          </Text>
          <View style={[styles.votePreviewOptions, { flexWrap: 'wrap' }]}>
            {options.filter(o => o.trim().length > 0).length > 0 ? (
              options.map((opt, i) => (
                opt.trim() ? (
                  <View key={i} style={[styles.votePreviewOption, { backgroundColor: withAlpha(colors.brand, 0.13), borderColor: withAlpha(colors.brand, 0.33) }]}>
                    <Text style={styles.votePreviewOptionText} numberOfLines={1}>{opt.trim()}</Text>
                  </View>
                ) : null
              ))
            ) : (
              <>
                <View style={[styles.votePreviewOption, { backgroundColor: withAlpha(colors.brand, 0.13), borderColor: withAlpha(colors.brand, 0.33) }]}>
                  <Text style={styles.votePreviewOptionText} numberOfLines={1}>Option 1</Text>
                </View>
                <View style={[styles.votePreviewOption, { backgroundColor: withAlpha(colors.brand, 0.13), borderColor: withAlpha(colors.brand, 0.33) }]}>
                  <Text style={styles.votePreviewOptionText} numberOfLines={1}>Option 2</Text>
                </View>
              </>
            )}
          </View>
          {timerMs && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6, alignSelf: 'center' }}>
              <Ionicons name="timer-outline" size={IconGrammar.badge} color={colors.textSecondary} aria-hidden={true} />
              <Text style={{ fontFamily: Typography.family.medium, fontSize: TypographyV2.meta.size, color: colors.textSecondary }}>
                {timerMs >= 86400000 ? `${Math.floor(timerMs / 86400000)}d` : timerMs >= 3600000 ? `${Math.floor(timerMs / 3600000)}h` : `${Math.floor(timerMs / 60000)}m`}
              </Text>
            </View>
          )}
        </View>
        <Text style={styles.sectionLabel}>Question</Text>
        <TextInput
          style={styles.textInput}
          placeholder="e.g. Which outfit is better?"
          placeholderTextColor={colors.textMuted}
          value={question}
          onChangeText={setQuestion}
          maxLength={100}
          autoFocus
          accessibilityLabel="Vote question"
          accessibilityHint="Type the poll question"
        />
        {options.map((opt, i) => (
          <View key={i}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={styles.sectionLabel}>Option {i + 1}</Text>
              {options.length > 2 && (
                <Pressable onPress={() => removeOption(i)} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} accessibilityLabel={`Remove option ${i + 1}`}
                accessibilityHint="Removes this option" accessibilityRole="button">
                  <Ionicons name="close-circle" size={IconGrammar.standard} color={colors.danger} aria-hidden={true} />
                </Pressable>
              )}
            </View>
            <TextInput
              style={styles.textInput}
              placeholder={`Option ${i + 1}`}
              placeholderTextColor={colors.textMuted}
              value={opt}
              onChangeText={(v) => updateOption(i, v)}
              maxLength={50}
              accessibilityLabel={`Vote option ${i + 1}`}
              accessibilityHint="Type the option text"
            />
          </View>
        ))}
        {options.length < 4 && (
          <Pressable
            onPress={addOption}
            style={({ pressed }) => [styles.addOptionBtn, pressed && { opacity: 0.7 }]}
            accessibilityLabel="Add option"
            accessibilityHint="Adds another poll option"
            accessibilityRole="button"
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Ionicons name="add-circle-outline" size={IconGrammar.standard} color={colors.brand} aria-hidden={true} />
            <Text style={styles.addOptionBtnText}>Add Option ({options.length}/4)</Text>
          </Pressable>
        )}
        {/* Timer selection */}
        <Text style={styles.sectionLabel}>Timer</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.styleScroll}>
          {TIMER_OPTIONS.map((t) => {
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
                accessibilityHint="Sets the vote timer"
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
        <Pressable onPress={handleAdd} style={[styles.saveBtn, !canSave && styles.saveBtnDisabled]} disabled={!canSave} accessibilityLabel="Add vote"
        accessibilityHint="Adds the poll to the canvas" accessibilityRole="button" accessibilityState={{ disabled: !canSave }} hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}>
          <Text style={styles.saveBtnText}>Add Vote</Text>
        </Pressable>
      </View>
    </PickerShell>
  );
});
