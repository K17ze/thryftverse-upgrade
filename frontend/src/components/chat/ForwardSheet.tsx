import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Animated,
  useWindowDimensions,
  FlatList,
  Pressable,
  TextInput,
} from 'react-native';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { Space, Radius, Elevation } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { AnimatedPressable } from '../AnimatedPressable';
import { Caption, BodyEmphasis } from '../ui/Text';
import { CachedImage } from '../CachedImage';
import { Motion } from '../../theme/motionTokens';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { colorForId, initialsFromName } from '../../utils/avatarColor';
import type { Conversation } from '../../domain';

interface ForwardSheetProps {
  visible: boolean;
  conversations: Conversation[];
  currentConversationId?: string;
  onForward: (conversationId: string) => void;
  onClose: () => void;
}

/**
 * ForwardSheet — WhatsApp/Telegram-style conversation picker for forwarding
 * a message. Shows a searchable list of recent conversations, excluding the
 * current one. Tapping a conversation forwards the message and dismisses.
 *
 * Visual language:
 * - Bottom sheet with grab handle, title, and search field
 * - Flat list of conversations with avatar, name, last message preview
 * - Search filters by title and last message
 * - No multi-select — WhatsApp forwards to one conversation at a time
 */
export function ForwardSheet({
  visible,
  conversations,
  currentConversationId,
  onForward,
  onClose,
}: ForwardSheetProps) {
  const { colors } = useAppTheme();
  const reducedMotion = useReducedMotion();
  const { height: screenHeight } = useWindowDimensions();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [query, setQuery] = useState('');

  const slideAnim = React.useRef(new Animated.Value(screenHeight)).current;
  const fadeAnim = React.useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    if (visible) {
      setQuery('');
      if (reducedMotion) {
        fadeAnim.setValue(1);
        slideAnim.setValue(0);
      } else {
        Animated.parallel([
          Animated.timing(fadeAnim, {
            toValue: 1,
            duration: Motion.duration.fast,
            useNativeDriver: true,
          }),
          Animated.spring(slideAnim, {
            toValue: 0,
            useNativeDriver: true,
            damping: Motion.spring.sheet.damping,
            stiffness: Motion.spring.sheet.stiffness,
            mass: Motion.spring.sheet.mass,
          }),
        ]).start();
      }
    } else {
      if (reducedMotion) {
        fadeAnim.setValue(0);
        slideAnim.setValue(screenHeight);
      } else {
        Animated.parallel([
          Animated.timing(fadeAnim, {
            toValue: 0,
            duration: Motion.duration.fast,
            useNativeDriver: true,
          }),
          Animated.timing(slideAnim, {
            toValue: screenHeight,
            duration: Motion.duration.slow,
            useNativeDriver: true,
          }),
        ]).start();
      }
    }
  }, [visible, reducedMotion, screenHeight, fadeAnim, slideAnim]);

  const filteredConversations = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return conversations
      .filter((c) => c.id !== currentConversationId)
      .filter((c) => {
        if (!normalized) return true;
        const title = c.title ?? c.lastMessage ?? '';
        return title.toLowerCase().includes(normalized);
      })
      .sort((a, b) => b.lastMessageTime.localeCompare(a.lastMessageTime))
      .slice(0, 50);
  }, [conversations, currentConversationId, query]);

  const handleSelect = (conversationId: string) => {
    onForward(conversationId);
    onClose();
  };

  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <View style={StyleSheet.absoluteFill}>
        <Animated.View style={[styles.backdrop, { opacity: fadeAnim }]}>
          <AnimatedPressable style={StyleSheet.absoluteFill} onPress={onClose} activeOpacity={1} />
        </Animated.View>

        <Animated.View
          style={[styles.sheet, { transform: [{ translateY: slideAnim }] }]}
        >
          <View style={styles.handle} />

          <View style={styles.header}>
            <BodyEmphasis color={colors.textPrimary} style={styles.title}>
              Forward to…
            </BodyEmphasis>
            <AnimatedPressable
              onPress={onClose}
              activeOpacity={0.7}
              scaleValue={0.9}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              accessibilityRole="button"
              accessibilityLabel="Close forward sheet"
            >
              <Text style={styles.closeText}>Cancel</Text>
            </AnimatedPressable>
          </View>

          <View style={styles.searchWrap}>
            <TextInput
              style={styles.searchInput}
              placeholder="Search conversations"
              placeholderTextColor={colors.textMuted}
              value={query}
              onChangeText={setQuery}
              autoCorrect={false}
              autoCapitalize="none"
            />
          </View>

          <FlatList
            data={filteredConversations}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => {
              const title = item.title ?? 'Conversation';
              const initials = initialsFromName(title);
              const avatarColor = colorForId(item.id);
              return (
                <Pressable
                  onPress={() => handleSelect(item.id)}
                  style={styles.convRow}
                  accessibilityRole="button"
                  accessibilityLabel={`Forward to ${title}`}
                >
                  {item.avatar ? (
                    <CachedImage uri={item.avatar} style={styles.avatar} />
                  ) : (
                    <View style={[styles.avatarFallback, { backgroundColor: avatarColor }]}>
                      <Text style={styles.avatarInitials}>{initials}</Text>
                    </View>
                  )}
                  <View style={styles.convInfo}>
                    <BodyEmphasis color={colors.textPrimary} numberOfLines={1}>
                      {title}
                    </BodyEmphasis>
                    <Caption color={colors.textMuted} numberOfLines={1}>
                      {item.lastMessage ?? ''}
                    </Caption>
                  </View>
                </Pressable>
              );
            }}
            ItemSeparatorComponent={() => <View style={styles.rowSeparator} />}
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <Caption color={colors.textMuted}>No conversations found</Caption>
              </View>
            }
            style={styles.list}
            contentContainerStyle={styles.listContent}
          />
        </Animated.View>
      </View>
    </Modal>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    backdrop: {
      ...StyleSheet.absoluteFill,
      backgroundColor: colors.overlay,
    },
    sheet: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      backgroundColor: colors.surface,
      borderTopLeftRadius: Radius.xl + 8,
      borderTopRightRadius: Radius.xl + 8,
      paddingHorizontal: Space.lg - 4,
      paddingTop: Space.smMd,
      paddingBottom: Space.xl + 14,
      maxHeight: '80%',
      ...Elevation.floating,
    },
    handle: {
      width: 40,
      height: 4,
      backgroundColor: colors.border,
      borderRadius: Radius.sm,
      alignSelf: 'center',
      marginBottom: Space.md,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: Space.sm,
    },
    title: {
      fontSize: TypographyV2.body.size,
      fontFamily: TypographyV2.body.fontFamily,
    },
    closeText: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      color: colors.brand,
    },
    searchWrap: {
      backgroundColor: colors.surfaceAlt,
      borderRadius: Radius.lg,
      paddingHorizontal: Space.md,
      marginBottom: Space.sm,
    },
    searchInput: {
      fontSize: TypographyV2.body.size,
      fontFamily: TypographyV2.body.fontFamily,
      color: colors.textPrimary,
      paddingVertical: Space.sm + 2,
    },
    list: {
      maxHeight: 400,
    },
    listContent: {
      paddingBottom: Space.sm,
    },
    convRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.smMd,
      paddingVertical: Space.sm + 2,
      paddingHorizontal: Space.xs,
    },
    avatar: {
      width: 44,
      height: 44,
      borderRadius: 22,
    },
    avatarFallback: {
      width: 44,
      height: 44,
      borderRadius: 22,
      justifyContent: 'center',
      alignItems: 'center',
    },
    avatarInitials: {
      fontSize: 16,
      fontFamily: TypographyV2.bodyStrong.fontFamily,
      color: colors.textInverse,
    },
    convInfo: {
      flex: 1,
      gap: 2,
    },
    rowSeparator: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: colors.border,
      marginLeft: 44 + Space.smMd,
    },
    emptyState: {
      paddingVertical: Space.xl,
      alignItems: 'center',
    },
  });
