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

const { height: SCREEN_H } = Dimensions.get('window');
const DRAWER_HEIGHT = SCREEN_H * 0.7;

export interface StickerItem {
  id: string;
  type: 'mention' | 'hashtag' | 'poll' | 'question' | 'emoji' | 'shape';
  content: string;
  color?: string;
  x?: number;
  y?: number;
}

interface StickerPickerProps {
  visible: boolean;
  onClose: () => void;
  onStickerSelect: (sticker: StickerItem) => void;
}

const EMOJIS = ['🔥', '❤️', '😂', '😍', '👀', '✨', '🎉', '💯', '🙌', '🔥', '⚡', '🌟', '💥', '🏷️', '📌'];

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

export default function StickerPicker({ visible, onClose, onStickerSelect }: StickerPickerProps) {
  const [tab, setTab] = React.useState<'popular' | 'mentions' | 'polls' | 'questions'>('popular');
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
          {(['popular', 'mentions', 'polls', 'questions'] as const).map((t) => (
            <Pressable key={t} style={[styles.tab, tab === t && styles.tabActive]} onPress={() => setTab(t)}>
              <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* Content */}
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
          {tab === 'popular' && (
            <>
              <Text style={styles.sectionLabel}>Emoji</Text>
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

              <Text style={styles.sectionLabel}>Shapes</Text>
              <View style={styles.shapeRow}>
                {SHAPES.map((shape) => (
                  <Pressable
                    key={shape.icon}
                    style={[styles.shapeBtn, { backgroundColor: shape.color }]}
                    onPress={() => {
                      onStickerSelect({ id: `shape_${Date.now()}`, type: 'shape', content: shape.icon, color: shape.color });
                      onClose();
                    }}
                  >
                    <Ionicons name={shape.icon as any} size={22} color="#fff" />
                  </Pressable>
                ))}
              </View>
            </>
          )}

          {tab === 'mentions' && (
            <View style={styles.inputSection}>
              <Text style={styles.sectionLabel}>Mention User</Text>
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
                  <Ionicons name="add-circle" size={28} color="#fff" />
                </Pressable>
              </View>

              <Text style={[styles.sectionLabel, { marginTop: 20 }]}>Hashtag</Text>
              <View style={styles.inputRow}>
                <Text style={styles.inputPrefix}>#</Text>
                <TextInput
                  style={styles.input}
                  value={hashtagInput}
                  onChangeText={setHashtagInput}
                  placeholder="hashtag"
                  placeholderTextColor="rgba(255,255,255,0.35)"
                  autoCapitalize="none"
                  autoCorrect={false}
                  onSubmitEditing={handleHashtagSubmit}
                  returnKeyType="done"
                />
                <Pressable style={styles.inputAction} onPress={handleHashtagSubmit}>
                  <Ionicons name="add-circle" size={28} color="#fff" />
                </Pressable>
              </View>
            </View>
          )}

          {tab === 'polls' && (
            <View style={styles.presetSection}>
              {PRESET_POLLS.map((poll) => (
                <Pressable
                  key={poll.q}
                  style={styles.pollCard}
                  onPress={() => {
                    onStickerSelect({
                      id: `poll_${Date.now()}`,
                      type: 'poll',
                      content: `${poll.q}\n${poll.o1}  |  ${poll.o2}`,
                    });
                    onClose();
                  }}
                >
                  <Text style={styles.pollQ}>{poll.q}</Text>
                  <View style={styles.pollOptions}>
                    <View style={styles.pollOption}>
                      <Text style={styles.pollOptionText}>{poll.o1}</Text>
                    </View>
                    <View style={styles.pollOption}>
                      <Text style={styles.pollOptionText}>{poll.o2}</Text>
                    </View>
                  </View>
                </Pressable>
              ))}
            </View>
          )}

          {tab === 'questions' && (
            <View style={styles.presetSection}>
              {PRESET_QUESTIONS.map((q) => (
                <Pressable
                  key={q}
                  style={styles.questionCard}
                  onPress={() => {
                    onStickerSelect({ id: `question_${Date.now()}`, type: 'question', content: q });
                    onClose();
                  }}
                >
                  <Ionicons name="help-circle" size={20} color="#ff9500" />
                  <Text style={styles.questionText}>{q}</Text>
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
    backgroundColor: 'rgba(0,0,0,0.4)',
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
    paddingHorizontal: 12,
    gap: 8,
    marginBottom: 8,
  },
  tab: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  tabActive: {
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  tabText: {
    fontSize: 13,
    fontFamily: 'Inter_600SemiBold',
    color: 'rgba(255,255,255,0.6)',
  },
  tabTextActive: {
    color: '#fff',
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 32,
    gap: 16,
  },
  sectionLabel: {
    fontSize: 12,
    fontFamily: 'Inter_700Bold',
    color: 'rgba(255,255,255,0.5)',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginTop: 8,
  },
  emojiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 8,
  },
  emojiBtn: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emojiText: {
    fontSize: 24,
  },
  shapeRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 8,
  },
  shapeBtn: {
    width: 52,
    height: 52,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inputSection: {
    gap: 8,
    marginTop: 8,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: 6,
  },
  inputPrefix: {
    fontSize: 16,
    fontFamily: 'Inter_700Bold',
    color: '#fff',
  },
  input: {
    flex: 1,
    fontSize: 15,
    fontFamily: 'Inter_500Medium',
    color: '#fff',
    padding: 0,
  },
  inputAction: {
    padding: 2,
  },
  presetSection: {
    gap: 10,
    marginTop: 8,
  },
  pollCard: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 16,
    padding: 14,
    gap: 10,
  },
  pollQ: {
    fontSize: 15,
    fontFamily: 'Inter_700Bold',
    color: '#fff',
  },
  pollOptions: {
    flexDirection: 'row',
    gap: 10,
  },
  pollOption: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  pollOptionText: {
    fontSize: 13,
    fontFamily: 'Inter_600SemiBold',
    color: '#fff',
  },
  questionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  questionText: {
    fontSize: 14,
    fontFamily: 'Inter_600SemiBold',
    color: '#fff',
  },
});
