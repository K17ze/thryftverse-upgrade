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
import { TypographyV2 } from '../../../theme/typography.v2';
import { useAppTheme } from '../../../theme/ThemeContext';
import { createStableId } from '../../../utils/createStableId';
import { useHaptic } from '../../../hooks/useHaptic';
import type { CreatorLayer } from '../../core/projectStore/composition';
import { PickerShell, baseLayer, createStyles } from './pickerShared';

// ── Emoji Slider Picker ───────────────────────────────────────────
// Instagram 2026 parity: emoji slider for intensity measurement.

type EmojiSliderPayload = Extract<CreatorLayer, { type: 'emojiSlider' }>['payload'];

const SLIDER_EMOJIS = ['😍', '🔥', '💯', '😂', '🤔', '👍', '❤️', '✨', '🎨', '🛍️'];

export const EmojiSliderPicker = React.memo(function EmojiSliderPicker({ onClose, onAddLayer, editingLayer }: { onClose: () => void; onAddLayer: (layer: CreatorLayer) => void; editingLayer?: CreatorLayer | null }) {
  const { colors } = useAppTheme();
  const haptic = useHaptic();
  const { width: screenWidth } = useWindowDimensions();
  const styles = React.useMemo(() => createStyles(colors, screenWidth), [colors, screenWidth]);
  const isEditing = editingLayer?.type === 'emojiSlider';
  const existing = editingLayer?.type === 'emojiSlider' ? editingLayer.payload : null;

  const SLIDER_COLORS = ['#C9A46A', '#9b0202', '#215634', '#06489A', '#6B3245', '#E06666'];

  const [question, setQuestion] = useState(existing?.question ?? '');
  const [emoji, setEmoji] = useState(existing?.emoji ?? '😍');
  const [endLabel, setEndLabel] = useState(existing?.endLabel ?? '');
  const [sliderColor, setSliderColor] = useState(existing?.sliderColor ?? SLIDER_COLORS[0]);

  const handleAdd = useCallback(() => {
    if (!question.trim()) return;
    haptic.medium();
    const payload: EmojiSliderPayload = {
      question: question.trim(),
      emoji,
      endLabel: endLabel.trim(),
      sliderColor };
    if (isEditing && editingLayer) {
      onAddLayer({ ...editingLayer, payload: { ...editingLayer.payload, ...payload } } as CreatorLayer);
    } else {
      onAddLayer({
        ...baseLayer(createStableId('emojiSlider'), 10),
        type: 'emojiSlider',
        width: 0.6,
        height: 0.1,
        payload });
    }
    onClose();
  }, [question, emoji, endLabel, sliderColor, isEditing, editingLayer, onAddLayer, onClose, haptic]);

  return (
    <PickerShell title={isEditing ? 'Edit Slider' : 'Emoji Slider'} onClose={onClose} compact>
      <View style={styles.textPickerBody}>
        <View style={styles.sliderPreviewWrap}>
          <Text style={styles.sliderPreviewQuestion}>
            {question.trim() || 'How much do you love it?'}
          </Text>
          <View style={styles.sliderPreviewRow}>
            <Text style={styles.sliderPreviewEmoji}>{emoji}</Text>
            <View style={styles.sliderPreviewTrack}>
              <View style={[styles.sliderPreviewFill, { width: '60%', backgroundColor: sliderColor }]} />
              <View style={[styles.sliderPreviewHandle, { left: '60%', backgroundColor: sliderColor }]} />
            </View>
          </View>
          {endLabel.trim() ? (
            <Text style={styles.sliderPreviewEndLabel}>{endLabel.trim()}</Text>
          ) : null}
        </View>
        <TextInput
          style={styles.textInput}
          placeholder="Ask something..."
          placeholderTextColor={colors.textMuted}
          value={question}
          onChangeText={setQuestion}
          maxLength={80}
          autoFocus
          accessibilityLabel="Slider question"
          accessibilityHint="Type the slider question"
        />
        <TextInput
          style={styles.textInput}
          placeholder="End label (optional)..."
          placeholderTextColor={colors.textMuted}
          value={endLabel}
          onChangeText={setEndLabel}
          maxLength={20}
          accessibilityLabel="Slider end label"
          accessibilityHint="Type the right-side label"
        />
        <Text style={styles.pickerSectionLabel}>Emoji</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.styleScroll}>
          {SLIDER_EMOJIS.map((e) => (
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
        <Text style={styles.pickerSectionLabel}>Slider Color</Text>
        <View style={styles.colorRow}>
          {SLIDER_COLORS.map((c) => (
            <Pressable
              key={c}
              onPress={() => { haptic.selection(); setSliderColor(c); }}
              style={[styles.colorOption, { backgroundColor: c }, sliderColor === c && styles.colorOptionActive]}
              accessibilityLabel={`Slider color ${c}`}
              accessibilityHint="Sets the slider color"
              accessibilityRole="button"
              accessibilityState={{ selected: sliderColor === c }}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            />
          ))}
        </View>
        <Pressable
          onPress={handleAdd}
          disabled={!question.trim()}
          style={[styles.saveBtn, !question.trim() && styles.saveBtnDisabled]}
          accessibilityLabel={isEditing ? 'Update slider' : 'Add slider'}
          accessibilityHint="Saves the emoji slider"
          accessibilityRole="button"
          accessibilityState={{ disabled: !question.trim() }}
          hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}
        >
          <Text style={styles.saveBtnText}>{isEditing ? 'Update' : 'Add Slider'}</Text>
        </Pressable>
      </View>
    </PickerShell>
  );
});
