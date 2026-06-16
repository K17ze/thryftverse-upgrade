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
import { Colors } from '../../constants/colors';
import { Typography } from '../../theme/designTokens';

const { height: SCREEN_H } = Dimensions.get('window');
const DRAWER_HEIGHT = SCREEN_H * 0.6;

export interface StickerItem {
  id: string;
  type: 'mention' | 'hashtag' | 'poll' | 'question' | 'emoji' | 'shape' | 'countdown';
  content: string;
  color?: string;
  x?: number;
  y?: number;
  targetDate?: string;
  listingId?: string;
  options?: string[];
  votes?: number[];
}

interface StickerPickerProps {
  visible: boolean;
  onClose: () => void;
  onStickerSelect: (sticker: StickerItem) => void;
}

const EMOJIS = ['🔥', '❤️', '😂', '😍', '👀', '✨', '🎉', '💯', '🙌', '⚡', '🌟', '💥', '🏷️', '📌', '🚀', '💎'];

const SHAPES = [
  { icon: 'heart', label: 'Heart', color: '#ff2d55' },
  { icon: 'star', label: 'Star', color: '#ffcc00' },
  { icon: 'flash', label: 'Bolt', color: '#ff9500' },
  { icon: 'sunny', label: 'Sun', color: '#ffcc00' },
  { icon: 'moon', label: 'Moon', color: '#5856d6' },
  { icon: 'location', label: 'Pin', color: '#ff3b30' },
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
  const [tab, setTab] = React.useState<'emoji' | 'text' | 'shapes'>('emoji');
  const [mentionInput, setMentionInput] = React.useState('');
  const [hashtagInput, setHashtagInput] = React.useState('');
  const translateY = React.useRef(new Animated.Value(DRAWER_HEIGHT)).current;
  const backdropOpacity = React.useRef(new Animated.Value(0)).current;

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
      onStickerSelect({ id: `hashtag_${Date.now()}`, type: 'hashtag', content: `#${text}`, color: '#5ac8fa' });
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
      color: '#ff3b30',
      targetDate: target,
    });
    onClose();
  };

  return (
    <View style={StyleSheet.absoluteFillObject} pointerEvents={visible ? 'auto' : 'none'}>
      <Animated.View style={[styles.backdrop, { opacity: backdropOpacity }]} pointerEvents={visible ? 'auto' : 'none'}>
        <Pressable style={StyleSheet.absoluteFillObject} onPress={onClose} />
      </Animated.View>

      <Animated.View style={[styles.drawer, { transform: [{ translateY }] }]}>
        <View style={styles.handleRow}>
          <View style={styles.handle} />
        </View>

        {/* Tabs */}
        <View style={styles.tabRow}>
          {(['emoji', 'text', 'shapes'] as const).map((t) => (
            <Pressable key={t} style={[styles.tab, tab === t && styles.tabActive]} onPress={() => setTab(t)}>
              <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>
                {t === 'text' ? 'Text' : t === 'emoji' ? 'Emoji' : 'Shapes'}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* Content */}
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
          {tab === 'emoji' && (
            <View style={styles.emojiGrid}>
              {EMOJIS.map((emoji) => (
                <Pressable
                  key={emoji}
                  style={styles.emojiBtn}
                  onPress={() => {
                    onStickerSelect({ id: `emoji_${Date.now()}`, type: 'emoji', content: emoji });
                    onClose();
                  }}
                >
                  <Text style={styles.emojiText}>{emoji}</Text>
                </Pressable>
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
                <Pressable style={styles.inputAction} onPress={handleMentionSubmit}>
                  <Ionicons name="arrow-forward" size={18} color="#fff" />
                </Pressable>
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
                <Pressable style={styles.inputAction} onPress={handleHashtagSubmit}>
                  <Ionicons name="arrow-forward" size={18} color="#fff" />
                </Pressable>
              </View>

              {/* Polls */}
              <Text style={[styles.sectionLabel, { marginTop: 20 }]}>Polls</Text>
              {PRESET_POLLS.map((p) => (
                <Pressable
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
                >
                  <Text style={styles.presetText}>{p.q}</Text>
                  <View style={styles.pillRow}>
                    <View style={styles.pill}><Text style={styles.pillText}>{p.o1}</Text></View>
                    <View style={styles.pill}><Text style={styles.pillText}>{p.o2}</Text></View>
                  </View>
                </Pressable>
              ))}

              {/* Questions */}
              <Text style={[styles.sectionLabel, { marginTop: 20 }]}>Questions</Text>
              <View style={styles.pillRowWrap}>
                {PRESET_QUESTIONS.map((q) => (
                  <Pressable
                    key={q}
                    style={styles.pillBtn}
                    onPress={() => {
                      onStickerSelect({ id: `question_${Date.now()}`, type: 'question', content: q });
                      onClose();
                    }}
                  >
                    <Text style={styles.pillBtnText}>{q}</Text>
                  </Pressable>
                ))}
              </View>

              {/* Countdown */}
              <Text style={[styles.sectionLabel, { marginTop: 20 }]}>Countdown</Text>
              <View style={styles.pillRowWrap}>
                {COUNTDOWN_PRESETS.map((c) => (
                  <Pressable
                    key={c.label}
                    style={styles.pillBtn}
                    onPress={() => handleCountdownSelect(c.hours)}
                  >
                    <Text style={styles.pillBtnText}>{c.label}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          )}

          {tab === 'shapes' && (
            <View style={styles.shapeGrid}>
              {SHAPES.map((shape) => (
                <Pressable
                  key={shape.icon}
                  style={[styles.shapeBtn, { backgroundColor: shape.color }]}
                  onPress={() => {
                    onStickerSelect({ id: `shape_${Date.now()}`, type: 'shape', content: shape.icon, color: shape.color });
                    onClose();
                  }}
                >
                  <Ionicons name={shape.icon as any} size={28} color="#fff" />
                  <Text style={styles.shapeLabel}>{shape.label}</Text>
                </Pressable>
              ))}
            </View>
          )}
        </ScrollView>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  drawer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: DRAWER_HEIGHT,
    backgroundColor: 'rgba(18,18,22,0.98)',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: 'hidden',
    paddingBottom: 24,
  },
  handleRow: {
    alignItems: 'center',
    paddingTop: 10,
    paddingBottom: 6,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  tabRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  tab: {
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  tabActive: {
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  tabText: {
    fontSize: 13,
    fontFamily: Typography.family.semibold,
    color: 'rgba(255,255,255,0.6)',
  },
  tabTextActive: {
    color: '#fff',
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  emojiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingTop: 8,
  },
  emojiBtn: {
    width: 52,
    height: 52,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emojiText: {
    fontSize: 24,
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
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 44,
  },
  inputPrefix: {
    fontSize: 16,
    fontFamily: Typography.family.bold,
    color: 'rgba(255,255,255,0.5)',
    marginRight: 6,
  },
  input: {
    flex: 1,
    color: '#fff',
    fontSize: 15,
    fontFamily: Typography.family.regular,
    padding: 0,
  },
  inputAction: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  presetCard: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
  },
  presetText: {
    color: '#fff',
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
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  pillText: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 12,
    fontFamily: Typography.family.medium,
  },
  pillBtn: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  pillBtnText: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 12,
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
    width: 90,
    height: 90,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  shapeLabel: {
    color: '#fff',
    fontSize: 12,
    fontFamily: Typography.family.semibold,
    textShadowColor: 'rgba(0,0,0,0.4)',
    textShadowRadius: 4,
  },
});