import React from 'react';
import {
  View,
  StyleSheet,
  Pressable,
  Text,
  ScrollView,
  TextInput,
  Animated,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Typography, Radius, Space, Type, Control, Stroke } from '../../theme/designTokens';
import { useAppTheme } from '../../theme/ThemeContext';
import { AnimatedPressable } from '../AnimatedPressable';

const { height: SCREEN_H } = Dimensions.get('window');
const DRAWER_HEIGHT = SCREEN_H * 0.5;

export interface StickerItem {
  id: string;
  type: 'mention' | 'hashtag' | 'poll' | 'quiz' | 'question' | 'emoji' | 'shape' | 'countdown' | 'location' | 'time' | 'weather' | 'temperature';
  content: string;
  color?: string;
  x?: number;
  y?: number;
  targetDate?: string;
  listingId?: string;
  options?: string[];
  votes?: number[];
  correctOptionIndex?: number;
  endLabel?: string;
  icon?: string;
}

interface StickerPickerProps {
  visible: boolean;
  onClose: () => void;
  onStickerSelect: (sticker: StickerItem) => void;
}

const EMOJIS = ['🔥', '❤️', '😂', '😍', '👀', '✨', '🎉', '💯', '🙌', '⚡', '🌟', '💥', '🏷️', '📌', '🚀', '💎'];
const EMOJI_SIZE = 32;

const SHAPES: Array<{ icon: React.ComponentProps<typeof Ionicons>['name']; label: string; color: string }> = [
  { icon: 'heart', label: 'Heart', color: '#7B0E1E' },
  { icon: 'star', label: 'Star', color: '#C9A46A' },
  { icon: 'flash', label: 'Bolt', color: '#8A6A3F' },
  { icon: 'sunny', label: 'Sun', color: '#C9A46A' },
  { icon: 'moon', label: 'Moon', color: '#6B3245' },
  { icon: 'location', label: 'Pin', color: '#9b0202' },
];

const PRESET_POLLS = [
  { q: 'Cop or drop?', o1: 'Cop', o2: 'Drop' },
  { q: 'Worth it?', o1: 'Yes', o2: 'No' },
  { q: 'Size check?', o1: 'TTS', o2: 'Size up' },
];

const PRESET_QUESTIONS = [
  'Ask me anything',
  'Rate this fit',
  'Guess the price',
  'Where from?',
];

const COUNTDOWN_PRESETS = [
  { label: '1 Hour', hours: 1 },
  { label: '6 Hours', hours: 6 },
  { label: '12 Hours', hours: 12 },
  { label: '24 Hours', hours: 24 },
  { label: '3 Days', hours: 72 },
  { label: '1 Week', hours: 168 },
];

export default function StickerPicker({ visible, onClose, onStickerSelect }: StickerPickerProps) {
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const [tab, setTab] = React.useState<'emoji' | 'text' | 'shapes' | 'poll' | 'quiz' | 'question' | 'countdown'>('emoji');
  const [mentionInput, setMentionInput] = React.useState('');
  const [hashtagInput, setHashtagInput] = React.useState('');
  const translateY = React.useRef(new Animated.Value(DRAWER_HEIGHT)).current;
  const backdropOpacity = React.useRef(new Animated.Value(0)).current;

  // Poll creation state
  const [pollQuestion, setPollQuestion] = React.useState('');
  const [pollOption1, setPollOption1] = React.useState('');
  const [pollOption2, setPollOption2] = React.useState('');

  // Quiz creation state
  const [quizQuestion, setQuizQuestion] = React.useState('');
  const [quizOptions, setQuizOptions] = React.useState<string[]>(['', '']);
  const [quizCorrectIndex, setQuizCorrectIndex] = React.useState(0);

  // Question creation state
  const [questionText, setQuestionText] = React.useState('');

  // Countdown creation state
  const [countdownLabel, setCountdownLabel] = React.useState('');
  const [countdownDate, setCountdownDate] = React.useState('');
  const [countdownTime, setCountdownTime] = React.useState('');
  const [countdownEndLabel, setCountdownEndLabel] = React.useState('');

  React.useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(translateY, { toValue: 0, useNativeDriver: true, friction: 8 }),
        Animated.timing(backdropOpacity, { toValue: 1, duration: 200, useNativeDriver: true }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.spring(translateY, { toValue: DRAWER_HEIGHT, useNativeDriver: true, friction: 8 }),
        Animated.timing(backdropOpacity, { toValue: 0, duration: 150, useNativeDriver: true }),
      ]).start();
    }
  }, [visible]);

  const handleMentionSubmit = () => {
    const text = mentionInput.trim().replace(/^@/, '');
    if (text) {
      onStickerSelect({ id: `mention_${Date.now()}`, type: 'mention', content: `@${text}`, color: '#fff' });
      setMentionInput('');
      onClose();
    }
  };

  const handleHashtagSubmit = () => {
    const text = hashtagInput.trim().replace(/^#/, '');
    if (text) {
      onStickerSelect({ id: `hashtag_${Date.now()}`, type: 'hashtag', content: `#${text}`, color: '#06489A' });
      setHashtagInput('');
      onClose();
    }
  };

  const handleCountdownSelect = (hours: number) => {
    const target = new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
    onStickerSelect({
      id: `countdown_${Date.now()}`,
      type: 'countdown',
      content: `${hours}h left`,
      color: '#9b0202',
      targetDate: target,
    });
    onClose();
  };

  const handlePollSubmit = () => {
    const q = pollQuestion.trim();
    const o1 = pollOption1.trim();
    const o2 = pollOption2.trim();
    if (!q || !o1 || !o2) return;
    onStickerSelect({
      id: `poll_${Date.now()}`,
      type: 'poll',
      content: q,
      options: [o1, o2],
      votes: [0, 0],
    });
    setPollQuestion('');
    setPollOption1('');
    setPollOption2('');
    onClose();
  };

  const handleQuizSubmit = () => {
    const q = quizQuestion.trim();
    const opts = quizOptions.map((o) => o.trim()).filter((o) => o.length > 0);
    if (!q || opts.length < 2) return;
    onStickerSelect({
      id: `quiz_${Date.now()}`,
      type: 'quiz',
      content: q,
      options: opts,
      correctOptionIndex: quizCorrectIndex,
      votes: opts.map(() => 0),
    });
    setQuizQuestion('');
    setQuizOptions(['', '']);
    setQuizCorrectIndex(0);
    onClose();
  };

  const handleQuizAddOption = () => {
    if (quizOptions.length < 4) {
      setQuizOptions([...quizOptions, '']);
    }
  };

  const handleQuizRemoveOption = (index: number) => {
    if (quizOptions.length > 2) {
      const next = quizOptions.filter((_, i) => i !== index);
      setQuizOptions(next);
      if (quizCorrectIndex >= next.length) {
        setQuizCorrectIndex(next.length - 1);
      }
    }
  };

  const handleQuizOptionChange = (index: number, value: string) => {
    const next = [...quizOptions];
    next[index] = value;
    setQuizOptions(next);
  };

  const handleQuestionSubmit = () => {
    const q = questionText.trim();
    if (!q) return;
    onStickerSelect({
      id: `question_${Date.now()}`,
      type: 'question',
      content: q,
    });
    setQuestionText('');
    onClose();
  };

  const handleCountdownSubmit = () => {
    const label = countdownLabel.trim();
    if (!label || !countdownDate) return;
    const time = countdownTime.trim() || '00:00';
    const target = new Date(`${countdownDate}T${time}:00`).toISOString();
    onStickerSelect({
      id: `countdown_${Date.now()}`,
      type: 'countdown',
      content: label,
      color: '#9b0202',
      targetDate: target,
      endLabel: countdownEndLabel.trim() || undefined,
    });
    setCountdownLabel('');
    setCountdownDate('');
    setCountdownTime('');
    setCountdownEndLabel('');
    onClose();
  };

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents={visible ? 'auto' : 'none'}>
      <Animated.View style={[styles.backdrop, { opacity: backdropOpacity }]} pointerEvents={visible ? 'auto' : 'none'}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      </Animated.View>

      <Animated.View style={[styles.drawer, { transform: [{ translateY }] }]}>
        <View style={styles.handleRow}>
          <View style={styles.handle} />
        </View>

        {/* Tabs */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.tabScroll}
          contentContainerStyle={styles.tabRow}
        >
          {(['emoji', 'text', 'shapes', 'poll', 'quiz', 'question', 'countdown'] as const).map((t) => {
            const tabLabel = t === 'text' ? 'Text' : t === 'emoji' ? 'Emoji' : t === 'shapes' ? 'Shapes' : t === 'poll' ? 'Poll' : t === 'quiz' ? 'Quiz' : t === 'question' ? 'Question' : 'Countdown';
            return (
              <AnimatedPressable
                key={t}
                style={[styles.tab, tab === t && styles.tabActive]}
                onPress={() => setTab(t)}
                scaleValue={0.97}
                activeOpacity={0.85}
                hapticFeedback="light"
                accessibilityLabel={`${t} sticker tab`}
                accessibilityRole="tab"
                accessibilityHint={`Switches to ${tabLabel} stickers`}
              >
                <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>
                  {tabLabel}
                </Text>
              </AnimatedPressable>
            );
          })}
        </ScrollView>

        {/* Content */}
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
          {tab === 'emoji' && (
            <View style={styles.emojiGrid}>
              {EMOJIS.map((emoji) => (
                <AnimatedPressable
                  key={emoji}
                  style={styles.emojiBtn}
                  onPress={() => {
                    onStickerSelect({ id: `emoji_${Date.now()}`, type: 'emoji', content: emoji });
                    onClose();
                  }}
                  scaleValue={0.97}
                  activeOpacity={0.85}
                  hapticFeedback="light"
                  accessibilityLabel={`Emoji ${emoji}`}
                  accessibilityHint="Adds this emoji sticker to the frame"
                >
                  <Text style={styles.emojiText}>{emoji}</Text>
                </AnimatedPressable>
              ))}
            </View>
          )}

          {tab === 'text' && (
            <View style={styles.inputSection}>
              {/* Mention */}
              <Text style={styles.sectionLabel}>Mention</Text>
              <View style={styles.inputRow}>
                <Text style={styles.inputPrefix}>@</Text>
                <TextInput
                  style={styles.input}
                  value={mentionInput}
                  onChangeText={setMentionInput}
                  placeholder="username"
                  placeholderTextColor="rgba(255,255,255,0.35)"
                  autoCapitalize="none"
                  autoCorrect={false}
                  onSubmitEditing={handleMentionSubmit}
                  returnKeyType="done"
                />
                <AnimatedPressable style={styles.inputAction} onPress={handleMentionSubmit} scaleValue={0.97} activeOpacity={0.85} hapticFeedback="light" accessibilityLabel="Add mention sticker" accessibilityHint="Adds the mention as a sticker to the frame">
                  <Ionicons name="arrow-forward" size={18} color="#fff" />
                </AnimatedPressable>
              </View>

              {/* Hashtag */}
              <Text style={[styles.sectionLabel, { marginTop: 20 }]}>Hashtag</Text>
              <View style={styles.inputRow}>
                <Text style={styles.inputPrefix}>#</Text>
                <TextInput
                  style={styles.input}
                  value={hashtagInput}
                  onChangeText={setHashtagInput}
                  placeholder="thriftfind"
                  placeholderTextColor="rgba(255,255,255,0.35)"
                  autoCapitalize="none"
                  autoCorrect={false}
                  onSubmitEditing={handleHashtagSubmit}
                  returnKeyType="done"
                />
                <AnimatedPressable style={styles.inputAction} onPress={handleHashtagSubmit} scaleValue={0.97} activeOpacity={0.85} hapticFeedback="light" accessibilityLabel="Add hashtag sticker" accessibilityHint="Adds the hashtag as a sticker to the frame">
                  <Ionicons name="arrow-forward" size={18} color="#fff" />
                </AnimatedPressable>
              </View>

              {/* Polls */}
              <Text style={[styles.sectionLabel, { marginTop: 20 }]}>Polls</Text>
              {PRESET_POLLS.map((p) => (
                <AnimatedPressable
                  key={p.q}
                  style={styles.presetCard}
                  onPress={() => {
                    onStickerSelect({
                      id: `poll_${Date.now()}`,
                      type: 'poll',
                      content: p.q,
                      options: [p.o1, p.o2],
                      votes: [0, 0],
                    });
                    onClose();
                  }}
                  scaleValue={0.97}
                  activeOpacity={0.85}
                  hapticFeedback="light"
                  accessibilityLabel={`Preset poll ${p.q}`}
                  accessibilityHint="Adds this poll sticker to the frame"
                >
                  <Text style={styles.presetText}>{p.q}</Text>
                  <View style={styles.pillRow}>
                    <View style={styles.pill}><Text style={styles.pillText}>{p.o1}</Text></View>
                    <View style={styles.pill}><Text style={styles.pillText}>{p.o2}</Text></View>
                  </View>
                </AnimatedPressable>
              ))}

              {/* Questions */}
              <Text style={[styles.sectionLabel, { marginTop: 20 }]}>Questions</Text>
              <View style={styles.pillRowWrap}>
                {PRESET_QUESTIONS.map((q) => (
                  <AnimatedPressable
                    key={q}
                    style={styles.pillBtn}
                    onPress={() => {
                      onStickerSelect({ id: `question_${Date.now()}`, type: 'question', content: q });
                      onClose();
                    }}
                    scaleValue={0.97}
                    activeOpacity={0.85}
                    hapticFeedback="light"
                    accessibilityLabel={`Preset question ${q}`}
                    accessibilityHint="Adds this question sticker to the frame"
                  >
                    <Text style={styles.pillBtnText}>{q}</Text>
                  </AnimatedPressable>
                ))}
              </View>

              {/* Countdown */}
              <Text style={[styles.sectionLabel, { marginTop: 20 }]}>Countdown</Text>
              <View style={styles.pillRowWrap}>
                {COUNTDOWN_PRESETS.map((c) => (
                  <AnimatedPressable
                    key={c.label}
                    style={styles.pillBtn}
                    onPress={() => handleCountdownSelect(c.hours)}
                    scaleValue={0.97}
                    activeOpacity={0.85}
                    hapticFeedback="light"
                    accessibilityLabel={`Set countdown to ${c.label}`}
                    accessibilityHint="Adds this countdown sticker to the frame"
                  >
                    <Text style={styles.pillBtnText}>{c.label}</Text>
                  </AnimatedPressable>
                ))}
              </View>

              {/* Location sticker — Instagram/Snapchat geotag */}
              <Text style={[styles.sectionLabel, { marginTop: 20 }]}>Location</Text>
              <AnimatedPressable
                style={styles.locationCard}
                onPress={() => {
                  onStickerSelect({
                    id: `location_${Date.now()}`,
                    type: 'location',
                    content: 'Current Location',
                    icon: 'location',
                    color: '#06489A',
                  });
                  onClose();
                }}
                scaleValue={0.97}
                activeOpacity={0.85}
                hapticFeedback="light"
                accessibilityLabel="Add location sticker"
                accessibilityHint="Adds a location sticker to the frame"
              >
                <Ionicons name="location" size={18} color="#fff" />
                <Text style={styles.locationText}>Add location</Text>
                <Ionicons name="chevron-forward" size={16} color="rgba(255,255,255,0.4)" />
              </AnimatedPressable>

              {/* Time sticker — current time/date */}
              <Text style={[styles.sectionLabel, { marginTop: 20 }]}>Time</Text>
              <View style={styles.pillRowWrap}>
                <AnimatedPressable
                  style={styles.pillBtn}
                  onPress={() => {
                    const now = new Date();
                    const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                    onStickerSelect({
                      id: `time_${Date.now()}`,
                      type: 'time',
                      content: timeStr,
                      icon: 'time',
                    });
                    onClose();
                  }}
                  scaleValue={0.97}
                  activeOpacity={0.85}
                  hapticFeedback="light"
                  accessibilityLabel="Add current time sticker"
                  accessibilityHint="Adds the current time as a sticker to the frame"
                >
                  <Text style={styles.pillBtnText}>Current time</Text>
                </AnimatedPressable>
                <AnimatedPressable
                  style={styles.pillBtn}
                  onPress={() => {
                    const now = new Date();
                    const dateStr = now.toLocaleDateString([], { month: 'short', day: 'numeric' });
                    onStickerSelect({
                      id: `time_${Date.now()}`,
                      type: 'time',
                      content: dateStr,
                      icon: 'calendar',
                    });
                    onClose();
                  }}
                  scaleValue={0.97}
                  activeOpacity={0.85}
                  hapticFeedback="light"
                  accessibilityLabel="Add today's date sticker"
                  accessibilityHint="Adds today's date as a sticker to the frame"
                >
                  <Text style={styles.pillBtnText}>Today's date</Text>
                </AnimatedPressable>
              </View>

              {/* Weather sticker */}
              <Text style={[styles.sectionLabel, { marginTop: 20 }]}>Weather</Text>
              <View style={styles.pillRowWrap}>
                {[
                  { icon: 'sunny', label: 'Sunny', content: '☀️ 22°C' },
                  { icon: 'cloudy', label: 'Cloudy', content: '☁️ 18°C' },
                  { icon: 'rainy', label: 'Rainy', content: '🌧️ 15°C' },
                  { icon: 'partly-sunny', label: 'Partly', content: '⛅ 20°C' },
                ].map((w) => (
                  <AnimatedPressable
                    key={w.label}
                    style={styles.pillBtn}
                    onPress={() => {
                      onStickerSelect({
                        id: `weather_${Date.now()}`,
                        type: 'weather',
                        content: w.content,
                        icon: w.icon,
                      });
                      onClose();
                    }}
                    scaleValue={0.97}
                    activeOpacity={0.85}
                    hapticFeedback="light"
                    accessibilityLabel={`Add ${w.label} weather sticker`}
                    accessibilityHint="Adds this weather sticker to the frame"
                  >
                    <Text style={styles.pillBtnText}>{w.label}</Text>
                  </AnimatedPressable>
                ))}
              </View>
            </View>
          )}

          {tab === 'shapes' && (
            <View style={styles.shapeGrid}>
              {SHAPES.map((shape) => (
                <AnimatedPressable
                  key={shape.icon}
                  style={[styles.shapeBtn, { backgroundColor: shape.color }]}
                  onPress={() => {
                    onStickerSelect({ id: `shape_${Date.now()}`, type: 'shape', content: shape.icon, color: shape.color });
                    onClose();
                  }}
                  scaleValue={0.97}
                  activeOpacity={0.85}
                  hapticFeedback="light"
                  accessibilityLabel={`Shape ${shape.label}`}
                  accessibilityHint="Adds this shape sticker to the frame"
                >
                  <Ionicons name={shape.icon} size={Control.icon} color="#fff" />
                  <Text style={styles.shapeLabel}>{shape.label}</Text>
                </AnimatedPressable>
              ))}
            </View>
          )}

          {tab === 'poll' && (
            <View style={styles.inputSection}>
              <Text style={styles.sectionLabel}>Poll Question</Text>
              <TextInput
                style={styles.fullInput}
                value={pollQuestion}
                onChangeText={setPollQuestion}
                placeholder="Ask a question..."
                placeholderTextColor="rgba(255,255,255,0.35)"
                maxLength={200}
                accessibilityLabel="Poll question input"
              />
              <Text style={styles.charCount}>{pollQuestion.length}/200</Text>

              <Text style={[styles.sectionLabel, { marginTop: 12 }]}>Option 1</Text>
              <TextInput
                style={styles.fullInput}
                value={pollOption1}
                onChangeText={setPollOption1}
                placeholder="First option"
                placeholderTextColor="rgba(255,255,255,0.35)"
                maxLength={80}
                accessibilityLabel="Poll option 1"
              />

              <Text style={[styles.sectionLabel, { marginTop: 12 }]}>Option 2</Text>
              <TextInput
                style={styles.fullInput}
                value={pollOption2}
                onChangeText={setPollOption2}
                placeholder="Second option"
                placeholderTextColor="rgba(255,255,255,0.35)"
                maxLength={80}
                accessibilityLabel="Poll option 2"
              />

              {/* Preview */}
              {pollQuestion.trim().length > 0 && pollOption1.trim().length > 0 && pollOption2.trim().length > 0 && (
                <View style={styles.previewCard}>
                  <Text style={styles.previewTitle}>{pollQuestion}</Text>
                  <View style={styles.previewOptionRow}>
                    <View style={styles.previewOption}><Text style={styles.previewOptionText}>{pollOption1}</Text></View>
                    <View style={styles.previewOption}><Text style={styles.previewOptionText}>{pollOption2}</Text></View>
                  </View>
                </View>
              )}

              <AnimatedPressable
                style={[styles.addToFrameBtn, (!pollQuestion.trim() || !pollOption1.trim() || !pollOption2.trim()) && styles.addToFrameBtnDisabled]}
                onPress={handlePollSubmit}
                disabled={!pollQuestion.trim() || !pollOption1.trim() || !pollOption2.trim()}
                scaleValue={0.97}
                activeOpacity={0.85}
                hapticFeedback="light"
                accessibilityLabel="Add poll to frame"
                accessibilityRole="button"
                accessibilityHint="Adds the poll as a sticker to the frame"
              >
                <Text style={styles.addToFrameBtnText}>Add to frame</Text>
              </AnimatedPressable>
            </View>
          )}

          {tab === 'quiz' && (
            <View style={styles.inputSection}>
              <Text style={styles.sectionLabel}>Quiz Question</Text>
              <TextInput
                style={styles.fullInput}
                value={quizQuestion}
                onChangeText={setQuizQuestion}
                placeholder="Ask a quiz question..."
                placeholderTextColor="rgba(255,255,255,0.35)"
                maxLength={200}
                accessibilityLabel="Quiz question input"
              />
              <Text style={styles.charCount}>{quizQuestion.length}/200</Text>

              <Text style={[styles.sectionLabel, { marginTop: 12 }]}>Options (tap circle to mark correct)</Text>
              {quizOptions.map((opt, i) => (
                <View key={i} style={styles.quizOptionRow}>
                  <AnimatedPressable
                    onPress={() => setQuizCorrectIndex(i)}
                    style={[styles.correctCircle, quizCorrectIndex === i && styles.correctCircleActive]}
                    scaleValue={0.97}
                    activeOpacity={0.85}
                    hapticFeedback="light"
                    accessibilityLabel={`Mark option ${i + 1} as correct`}
                    accessibilityRole="button"
                    accessibilityHint="Sets this quiz option as the correct answer"
                  >
                    {quizCorrectIndex === i && <Ionicons name="checkmark" size={14} color="#fff" />}
                  </AnimatedPressable>
                  <TextInput
                    style={styles.quizOptionInput}
                    value={opt}
                    onChangeText={(v) => handleQuizOptionChange(i, v)}
                    placeholder={`Option ${i + 1}`}
                    placeholderTextColor="rgba(255,255,255,0.35)"
                    maxLength={80}
                    accessibilityLabel={`Quiz option ${i + 1}`}
                  />
                  {quizOptions.length > 2 && (
                    <AnimatedPressable
                      onPress={() => handleQuizRemoveOption(i)}
                      style={styles.removeOptionBtn}
                      scaleValue={0.97}
                      activeOpacity={0.85}
                      hapticFeedback="light"
                      accessibilityLabel={`Remove option ${i + 1}`}
                      accessibilityRole="button"
                      accessibilityHint="Removes this quiz option"
                    >
                      <Ionicons name="close-circle" size={20} color="rgba(255,255,255,0.4)" />
                    </AnimatedPressable>
                  )}
                </View>
              ))}

              {quizOptions.length < 4 && (
                <AnimatedPressable
                  style={styles.addOptionBtn}
                  onPress={handleQuizAddOption}
                  scaleValue={0.97}
                  activeOpacity={0.85}
                  hapticFeedback="light"
                  accessibilityLabel="Add quiz option"
                  accessibilityRole="button"
                  accessibilityHint="Adds another option to the quiz"
                >
                  <Ionicons name="add-circle-outline" size={18} color="rgba(255,255,255,0.6)" />
                  <Text style={styles.addOptionText}>Add option</Text>
                </AnimatedPressable>
              )}

              {/* Preview */}
              {quizQuestion.trim().length > 0 && quizOptions.filter((o) => o.trim().length > 0).length >= 2 && (
                <View style={styles.previewCard}>
                  <Text style={styles.previewTitle}>{quizQuestion}</Text>
                  {quizOptions.filter((o) => o.trim()).map((opt, i) => (
                    <View key={i} style={styles.previewOptionRow}>
                      <View style={[styles.previewOption, i === quizCorrectIndex && styles.previewOptionCorrect]}>
                        <Text style={styles.previewOptionText}>{opt}</Text>
                        {i === quizCorrectIndex && <Ionicons name="checkmark-circle" size={14} color="#215634" />}
                      </View>
                    </View>
                  ))}
                </View>
              )}

              <AnimatedPressable
                style={[styles.addToFrameBtn, (!quizQuestion.trim() || quizOptions.filter((o) => o.trim()).length < 2) && styles.addToFrameBtnDisabled]}
                onPress={handleQuizSubmit}
                disabled={!quizQuestion.trim() || quizOptions.filter((o) => o.trim()).length < 2}
                scaleValue={0.97}
                activeOpacity={0.85}
                hapticFeedback="light"
                accessibilityLabel="Add quiz to frame"
                accessibilityRole="button"
                accessibilityHint="Adds the quiz as a sticker to the frame"
              >
                <Text style={styles.addToFrameBtnText}>Add to frame</Text>
              </AnimatedPressable>
            </View>
          )}

          {tab === 'question' && (
            <View style={styles.inputSection}>
              <Text style={styles.sectionLabel}>Question (AMA style)</Text>
              <TextInput
                style={[styles.fullInput, { minHeight: 80 }]}
                value={questionText}
                onChangeText={setQuestionText}
                placeholder="Ask me anything..."
                placeholderTextColor="rgba(255,255,255,0.35)"
                maxLength={200}
                multiline
                accessibilityLabel="Question input"
              />
              <Text style={styles.charCount}>{questionText.length}/200</Text>

              {/* Preview */}
              {questionText.trim().length > 0 && (
                <View style={styles.previewCard}>
                  <Ionicons name="help-circle-outline" size={20} color="rgba(255,255,255,0.5)" />
                  <Text style={styles.previewTitle}>{questionText}</Text>
                </View>
              )}

              <AnimatedPressable
                style={[styles.addToFrameBtn, !questionText.trim() && styles.addToFrameBtnDisabled]}
                onPress={handleQuestionSubmit}
                disabled={!questionText.trim()}
                scaleValue={0.97}
                activeOpacity={0.85}
                hapticFeedback="light"
                accessibilityLabel="Add question to frame"
                accessibilityRole="button"
                accessibilityHint="Adds the question as a sticker to the frame"
              >
                <Text style={styles.addToFrameBtnText}>Add to frame</Text>
              </AnimatedPressable>
            </View>
          )}

          {tab === 'countdown' && (
            <View style={styles.inputSection}>
              <Text style={styles.sectionLabel}>Countdown Label</Text>
              <TextInput
                style={styles.fullInput}
                value={countdownLabel}
                onChangeText={setCountdownLabel}
                placeholder="e.g. Sale ends in..."
                placeholderTextColor="rgba(255,255,255,0.35)"
                maxLength={60}
                accessibilityLabel="Countdown label input"
              />
              <Text style={styles.charCount}>{countdownLabel.length}/60</Text>

              <Text style={[styles.sectionLabel, { marginTop: 12 }]}>Target Date (YYYY-MM-DD)</Text>
              <TextInput
                style={styles.fullInput}
                value={countdownDate}
                onChangeText={setCountdownDate}
                placeholder="2025-12-31"
                placeholderTextColor="rgba(255,255,255,0.35)"
                autoCapitalize="none"
                accessibilityLabel="Countdown target date"
              />

              <Text style={[styles.sectionLabel, { marginTop: 12 }]}>Time (HH:MM, optional)</Text>
              <TextInput
                style={styles.fullInput}
                value={countdownTime}
                onChangeText={setCountdownTime}
                placeholder="23:59"
                placeholderTextColor="rgba(255,255,255,0.35)"
                autoCapitalize="none"
                accessibilityLabel="Countdown target time"
              />

              <Text style={[styles.sectionLabel, { marginTop: 12 }]}>End Label (optional)</Text>
              <TextInput
                style={styles.fullInput}
                value={countdownEndLabel}
                onChangeText={setCountdownEndLabel}
                placeholder="Ended!"
                placeholderTextColor="rgba(255,255,255,0.35)"
                maxLength={60}
                accessibilityLabel="Countdown end label"
              />

              {/* Quick presets */}
              <Text style={[styles.sectionLabel, { marginTop: 16 }]}>Quick Presets</Text>
              <View style={styles.pillRowWrap}>
                {COUNTDOWN_PRESETS.map((c) => (
                  <AnimatedPressable
                    key={c.label}
                    style={styles.pillBtn}
                    onPress={() => handleCountdownSelect(c.hours)}
                    scaleValue={0.97}
                    activeOpacity={0.85}
                    hapticFeedback="light"
                    accessibilityLabel={`Set countdown to ${c.label}`}
                    accessibilityRole="button"
                    accessibilityHint="Adds this countdown sticker to the frame"
                  >
                    <Text style={styles.pillBtnText}>{c.label}</Text>
                  </AnimatedPressable>
                ))}
              </View>

              {/* Preview */}
              {countdownLabel.trim().length > 0 && countdownDate.length > 0 && (
                <View style={styles.previewCard}>
                  <Ionicons name="time-outline" size={20} color="#9b0202" />
                  <Text style={styles.previewTitle}>{countdownLabel}</Text>
                  <Text style={styles.previewSubtitle}>{countdownDate}{countdownTime ? ` ${countdownTime}` : ''}</Text>
                </View>
              )}

              <AnimatedPressable
                style={[styles.addToFrameBtn, (!countdownLabel.trim() || !countdownDate) && styles.addToFrameBtnDisabled]}
                onPress={handleCountdownSubmit}
                disabled={!countdownLabel.trim() || !countdownDate}
                scaleValue={0.97}
                activeOpacity={0.85}
                hapticFeedback="light"
                accessibilityLabel="Add countdown to frame"
                accessibilityRole="button"
                accessibilityHint="Adds the countdown as a sticker to the frame"
              >
                <Text style={styles.addToFrameBtnText}>Add to frame</Text>
              </AnimatedPressable>
            </View>
          )}
        </ScrollView>
      </Animated.View>
    </View>
  );
}

function createStyles(colors: any) {
  return StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  drawer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: DRAWER_HEIGHT,
    backgroundColor: colors.surfaceElevated,
    borderTopLeftRadius: Radius.xxl,
    borderTopRightRadius: Radius.xxl,
    overflow: 'hidden',
    paddingBottom: Space.lg,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.22,
    shadowRadius: 20,
    elevation: 24,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.06)',
  },
  handleRow: {
    alignItems: 'center',
    paddingTop: 10,
    paddingBottom: 6,
  },
  handle: {
    width: 40,
    height: 5,
    borderRadius: Radius.sm,
    backgroundColor: colors.textMuted + '80',
  },
  tabScroll: {
    paddingBottom: 10,
  },
  tabRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
  },
  tab: {
    paddingHorizontal: Space.md + Space.xs,
    paddingVertical: Space.sm,
    borderRadius: Radius.full,
    backgroundColor: colors.surfaceAlt,
  },
  tabActive: {
    backgroundColor: colors.brand,
  },
  tabText: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.semibold,
    color: colors.textSecondary,
  },
  tabTextActive: {
    color: colors.textInverse,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  emojiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Space.sm,
    paddingTop: 8,
  },
  emojiBtn: {
    width: 52,
    height: 52,
    borderRadius: Radius.xl,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emojiText: {
    fontSize: EMOJI_SIZE,
  },
  inputSection: {
    paddingTop: 8,
  },
  sectionLabel: {
    fontSize: 12,
    fontFamily: Typography.family.semibold,
    color: 'rgba(255,255,255,0.5)',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 10,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceAlt,
    borderRadius: Radius.lg,
    borderWidth: Stroke.standard,
    borderColor: colors.border,
    paddingHorizontal: Space.md,
    height: Control.hit,
  },
  inputPrefix: {
    fontSize: 16,
    fontFamily: Typography.family.bold,
    color: colors.textMuted,
    marginRight: 6,
  },
  input: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: Type.bodyEmphasis.size,
    fontFamily: Typography.family.regular,
    padding: 0,
  },
  inputAction: {
    width: 32,
    height: 32,
    borderRadius: Radius.full,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  presetCard: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: Radius.xl,
    padding: 14,
    marginBottom: 10,
  },
  presetText: {
    color: colors.textPrimary,
    fontSize: 14,
    fontFamily: Typography.family.semibold,
    marginBottom: 10,
  },
  pillRow: {
    flexDirection: 'row',
    gap: 8,
  },
  pillRowWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  pill: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: Radius.lg,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  pillText: {
    color: colors.textSecondary,
    fontSize: 12,
    fontFamily: Typography.family.medium,
  },
  pillBtn: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: Radius.lg,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  pillBtnText: {
    color: colors.textPrimary,
    fontSize: 12,
    fontFamily: Typography.family.medium,
  },
  locationCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: Radius.lg,
    backgroundColor: colors.surfaceAlt,
    marginTop: 8,
  },
  locationText: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: 14,
    fontFamily: Typography.family.medium,
  },
  shapeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    paddingTop: 8,
    justifyContent: 'center',
  },
  shapeBtn: {
    width: 64,
    height: 64,
    borderRadius: Radius.lg,
    backgroundColor: colors.surfaceAlt,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  shapeLabel: {
    color: colors.textPrimary,
    fontSize: 12,
    fontFamily: Typography.family.semibold,
    textShadowColor: 'rgba(0,0,0,0.4)',
    textShadowRadius: 4,
  },
  fullInput: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: Radius.lg,
    borderWidth: Stroke.standard,
    borderColor: colors.border,
    paddingHorizontal: Space.md + Space.xs,
    paddingVertical: Space.sm + Space.xs,
    color: colors.textPrimary,
    fontSize: Type.bodyEmphasis.size,
    fontFamily: Typography.family.regular,
    minHeight: Control.hit,
  },
  charCount: {
    fontSize: 11,
    fontFamily: Typography.family.regular,
    color: colors.textMuted,
    textAlign: 'right',
    marginTop: 4,
    marginBottom: 4,
  },
  previewCard: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: Radius.xl,
    padding: 16,
    marginTop: 16,
    marginBottom: 12,
    gap: 8,
  },
  previewTitle: {
    color: colors.textPrimary,
    fontSize: 15,
    fontFamily: Typography.family.semibold,
    flex: 1,
  },
  previewSubtitle: {
    color: colors.textSecondary,
    fontSize: 13,
    fontFamily: Typography.family.regular,
  },
  previewOptionRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 6,
  },
  previewOption: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surfaceAlt,
    borderRadius: Radius.lg,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  previewOptionCorrect: {
    backgroundColor: 'rgba(33,86,52,0.4)',
    borderWidth: 1,
    borderColor: '#215634',
  },
  previewOptionText: {
    color: colors.textPrimary,
    fontSize: 13,
    fontFamily: Typography.family.medium,
    flex: 1,
  },
  addToFrameBtn: {
    backgroundColor: colors.brand,
    borderRadius: Radius.lg,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
    height: Control.hit,
    justifyContent: 'center',
  },
  addToFrameBtnDisabled: {
    opacity: 0.4,
  },
  addToFrameBtnText: {
    color: colors.textInverse,
    fontSize: Type.bodyEmphasis.size,
    fontFamily: Typography.family.semibold,
  },
  quizOptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
  },
  correctCircle: {
    width: 24,
    height: 24,
    borderRadius: Radius.full,
    borderWidth: Stroke.emphasis,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  correctCircleActive: {
    backgroundColor: '#215634',
    borderColor: '#215634',
  },
  quizOptionInput: {
    flex: 1,
    backgroundColor: colors.surfaceAlt,
    borderRadius: Radius.lg,
    borderWidth: Stroke.standard,
    borderColor: colors.border,
    paddingHorizontal: Space.md + Space.xs,
    paddingVertical: Space.sm + 2,
    color: colors.textPrimary,
    fontSize: Type.bodyEmphasis.size,
    fontFamily: Typography.family.regular,
    minHeight: Control.hit,
  },
  removeOptionBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addOptionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    marginBottom: 8,
  },
  addOptionText: {
    color: colors.textSecondary,
    fontSize: 14,
    fontFamily: Typography.family.medium,
  },
});
}