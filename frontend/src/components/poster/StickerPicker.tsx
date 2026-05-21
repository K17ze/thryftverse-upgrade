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
import { Typography } from '../../constants/typography';

const { height: SCREEN_H } = Dimensions.get('window');
const DRAWER_HEIGHT = SCREEN_H * 0.7;

export interface StickerItem {
  id: string;
  type: 'mention' | 'hashtag' | 'poll' | 'question' | 'emoji' | 'shape' | 'countdown' | 'productTag' | 'quiz' | 'slider';
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
  listings?: { id: string; title: string; price: number }[];
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

const COUNTDOWN_PRESETS = [
  { label: '1 Hour', hours: 1 },
  { label: '6 Hours', hours: 6 },
  { label: '12 Hours', hours: 12 },
  { label: '24 Hours', hours: 24 },
  { label: '3 Days', hours: 72 },
  { label: '1 Week', hours: 168 },
];

const QUIZ_PRESETS = [
  { q: 'Real or fake?', o1: 'Real', o2: 'Fake' },
  { q: 'Keep or resell?', o1: 'Keep', o2: 'Resell' },
  { q: 'Dress up or down?', o1: 'Up', o2: 'Down' },
];

const SLIDER_PRESETS = [
  'Rate this fit',
  'How rare is this?',
  'Cop or drop?',
];

export default function StickerPicker({ visible, onClose, onStickerSelect, listings }: StickerPickerProps) {
  const [tab, setTab] = React.useState<'popular' | 'mentions' | 'polls' | 'questions' | 'interactive'>('popular');
  const [mentionInput, setMentionInput] = React.useState('');
  const [hashtagInput, setHashtagInput] = React.useState('');
  const [selectedListingId, setSelectedListingId] = React.useState('');
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

  const handleProductTagSelect = (listingId: string, title: string) => {
    onStickerSelect({
      id: `product_${Date.now()}`,
      type: 'productTag',
      content: title,
      color: '#4cd964',
      listingId,
    });
    onClose();
  };

  const handleQuizSelect = (q: string, o1: string, o2: string) => {
    onStickerSelect({
      id: `quiz_${Date.now()}`,
      type: 'quiz',
      content: q,
      options: [o1, o2],
      votes: [0, 0],
    });
    onClose();
  };

  const handleSliderSelect = (q: string) => {
    onStickerSelect({
      id: `slider_${Date.now()}`,
      type: 'slider',
      content: q,
      votes: [0],
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
          {(['popular', 'mentions', 'polls', 'questions', 'interactive'] as const).map((t) => (
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
                    <View style={styles.pollOption}><Text style={styles.pollOptionText}>{poll.o1}</Text></View>
                    <View style={styles.pollOption}><Text style={styles.pollOptionText}>{poll.o2}</Text></View>
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

          {tab === 'interactive' && (
            <View style={styles.presetSection}>
              {/* Countdown */}
              <Text style={styles.sectionLabel}>Countdown</Text>
              <View style={styles.countdownRow}>
                {COUNTDOWN_PRESETS.map((c) => (
                  <Pressable
                    key={c.label}
                    style={styles.countdownBtn}
                    onPress={() => handleCountdownSelect(c.hours)}
                  >
                    <Ionicons name="timer-outline" size={16} color="#ff3b30" />
                    <Text style={styles.countdownText}>{c.label}</Text>
                  </Pressable>
                ))}
              </View>

              {/* Product Tags */}
              <Text style={[styles.sectionLabel, { marginTop: 16 }]}>Product Tag</Text>
              {listings && listings.length > 0 ? (
                <View style={styles.productList}>
                  {listings.slice(0, 6).map((l) => (
                    <Pressable
                      key={l.id}
                      style={[styles.productRow, selectedListingId === l.id && styles.productRowActive]}
                      onPress={() => {
                        setSelectedListingId(l.id);
                        handleProductTagSelect(l.id, l.title);
                      }}
                    >
                      <Ionicons name="pricetag-outline" size={16} color="#4cd964" />
                      <Text style={styles.productText} numberOfLines={1}>{l.title}</Text>
                      <Text style={styles.productPrice}>£{l.price}</Text>
                    </Pressable>
                  ))}
                </View>
              ) : (
                <Text style={styles.emptyText}>No listings available to tag</Text>
              )}

              {/* Quiz */}
              <Text style={[styles.sectionLabel, { marginTop: 16 }]}>Quiz</Text>
              {QUIZ_PRESETS.map((q) => (
                <Pressable
                  key={q.q}
                  style={styles.quizCard}
                  onPress={() => handleQuizSelect(q.q, q.o1, q.o2)}
                >
                  <Text style={styles.quizQ}>{q.q}</Text>
                  <View style={styles.quizOptions}>
                    <View style={styles.quizOption}><Text style={styles.quizOptionText}>{q.o1}</Text></View>
                    <View style={styles.quizOption}><Text style={styles.quizOptionText}>{q.o2}</Text></View>
                  </View>
                </Pressable>
              ))}

              {/* Slider */}
              <Text style={[styles.sectionLabel, { marginTop: 16 }]}>Slider</Text>
              {SLIDER_PRESETS.map((q) => (
                <Pressable
                  key={q}
                  style={styles.sliderCard}
                  onPress={() => handleSliderSelect(q)}
                >
                  <Ionicons name="swap-horizontal-outline" size={18} color="#5ac8fa" />
                  <Text style={styles.sliderText}>{q}</Text>
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
    fontFamily: Typography.family.semibold,
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
    fontFamily: Typography.family.bold,
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
    fontFamily: Typography.family.bold,
    color: '#fff',
  },
  input: {
    flex: 1,
    fontSize: 15,
    fontFamily: Typography.family.medium,
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
    fontFamily: Typography.family.bold,
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
    fontFamily: Typography.family.semibold,
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
    fontFamily: Typography.family.semibold,
    color: '#fff',
  },
  countdownRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 6,
  },
  countdownBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,59,48,0.15)',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  countdownText: {
    fontSize: 13,
    fontFamily: Typography.family.semibold,
    color: '#ff3b30',
  },
  productList: {
    gap: 6,
    marginTop: 6,
  },
  productRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  productRowActive: {
    backgroundColor: 'rgba(77,201,100,0.2)',
    borderWidth: 1,
    borderColor: 'rgba(77,201,100,0.4)',
  },
  productText: {
    flex: 1,
    fontSize: 14,
    fontFamily: Typography.family.semibold,
    color: '#fff',
  },
  productPrice: {
    fontSize: 13,
    fontFamily: Typography.family.bold,
    color: '#4cd964',
  },
  emptyText: {
    fontSize: 13,
    fontFamily: Typography.family.medium,
    color: 'rgba(255,255,255,0.4)',
    marginTop: 8,
  },
  quizCard: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 16,
    padding: 14,
    gap: 10,
  },
  quizQ: {
    fontSize: 15,
    fontFamily: Typography.family.bold,
    color: '#fff',
  },
  quizOptions: {
    flexDirection: 'row',
    gap: 10,
  },
  quizOption: {
    flex: 1,
    backgroundColor: 'rgba(90,200,250,0.15)',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  quizOptionText: {
    fontSize: 13,
    fontFamily: Typography.family.semibold,
    color: '#5ac8fa',
  },
  sliderCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  sliderText: {
    fontSize: 14,
    fontFamily: Typography.family.semibold,
    color: '#fff',
  },
});
