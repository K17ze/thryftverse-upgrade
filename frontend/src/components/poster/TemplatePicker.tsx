import React from 'react';
import {
  View,
  StyleSheet,
  Pressable,
  Text,
  ScrollView,
  Animated,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { POSTER_TEMPLATES, PosterTemplate } from '../../data/posters';
import { Typography } from '../../theme/designTokens';

const { height: SCREEN_H } = Dimensions.get('window');
const DRAWER_HEIGHT = SCREEN_H * 0.45;

export type TemplateCategory = 'all' | 'drop' | 'auction' | 'coown' | 'sale' | 'general';

interface TemplatePickerProps {
  visible: boolean;
  onClose: () => void;
  onSelect: (template: PosterTemplate) => void;
  currentTemplateId?: string;
}

const CATEGORIES: { key: TemplateCategory; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'drop', label: 'Drops' },
  { key: 'auction', label: 'Auctions' },
  { key: 'coown', label: 'Co-Own' },
  { key: 'sale', label: 'Sales' },
  { key: 'general', label: 'General' },
];

export default function TemplatePicker({ visible, onClose, onSelect, currentTemplateId }: TemplatePickerProps) {
  const [category, setCategory] = React.useState<TemplateCategory>('all');
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

  const filtered = React.useMemo(() => {
    if (category === 'all') return POSTER_TEMPLATES;
    return POSTER_TEMPLATES.filter((t) => t.category === category);
  }, [category]);

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents={visible ? 'auto' : 'none'}>
      <Animated.View style={[styles.backdrop, { opacity: backdropOpacity }]} pointerEvents={visible ? 'auto' : 'none'}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      </Animated.View>

      <Animated.View style={[styles.drawer, { transform: [{ translateY }] }]}>
        <View style={styles.handleRow}>
          <View style={styles.handle} />
        </View>

        <Text style={styles.title}>Templates</Text>

        {/* Category tabs */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabRow}>
          {CATEGORIES.map((c) => (
            <Pressable
              key={c.key}
              style={[styles.tab, category === c.key && styles.tabActive]}
              onPress={() => setCategory(c.key)}
            >
              <Text style={[styles.tabText, category === c.key && styles.tabTextActive]}>{c.label}</Text>
            </Pressable>
          ))}
        </ScrollView>

        {/* Template grid */}
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.grid}>
          {filtered.map((template) => {
            const isActive = currentTemplateId === template.id;
            return (
              <Pressable
                key={template.id}
                style={[styles.card, isActive && styles.cardActive]}
                onPress={() => {
                  onSelect(template);
                  onClose();
                }}
              >
                <View style={[styles.thumb, { backgroundColor: template.thumbnailColor }]}>
                  <Ionicons name={template.icon as any} size={28} color="#fff" />
                  {isActive && (
                    <View style={styles.checkBadge}>
                      <Ionicons name="checkmark" size={12} color="#fff" />
                    </View>
                  )}
                </View>
                <Text style={styles.cardLabel} numberOfLines={1}>{template.name}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFill,
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
    paddingBottom: 20,
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
  title: {
    fontSize: 18,
    fontFamily: Typography.family.bold,
    color: '#fff',
    textAlign: 'center',
    marginBottom: 12,
  },
  tabRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  tab: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  tabActive: {
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  tabText: {
    fontSize: 12,
    fontFamily: Typography.family.semibold,
    color: 'rgba(255,255,255,0.6)',
  },
  tabTextActive: {
    color: '#fff',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    paddingHorizontal: 16,
    paddingBottom: 24,
    justifyContent: 'flex-start',
  },
  card: {
    width: 85,
    alignItems: 'center',
    gap: 6,
  },
  cardActive: {
    // visual handled by check badge
  },
  thumb: {
    width: 72,
    height: 72,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.15)',
    overflow: 'hidden',
  },
  checkBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#4cd964',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardLabel: {
    fontSize: 11,
    fontFamily: Typography.family.semibold,
    color: 'rgba(255,255,255,0.7)',
    textAlign: 'center',
  },
});