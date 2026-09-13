/**
 * LiveChatList — the live chat overlay: a flat list with hairline row
 * separators over the dark media canvas, auto-pinned to the latest message
 * (animated unless reduced motion is on).
 */

import React, { useCallback, useMemo, useRef } from 'react';
import { View, Text, StyleSheet, FlatList, useWindowDimensions } from 'react-native';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { Space } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { useAppTranslation } from '../../i18n/useAppTranslation';
import type { LiveStreamChatMessage } from '../../services/liveShoppingApi';

interface LiveChatListProps {
  messages: LiveStreamChatMessage[];
}

export function LiveChatList({ messages }: LiveChatListProps) {
  const { colors } = useAppTheme();
  const { height: screenHeight } = useWindowDimensions();
  const reducedMotion = useReducedMotion();
  const styles = useMemo(() => createStyles(colors, screenHeight), [colors, screenHeight]);
  const { t } = useAppTranslation('liveStreamViewer');
  const chatListRef = useRef<FlatList<LiveStreamChatMessage>>(null);

  const renderChatMessage = useCallback(({ item }: { item: LiveStreamChatMessage }) => {
    if (item.type === 'system' || item.type === 'bid' || item.type === 'purchase') {
      return (
        <View style={styles.chatRow}>
          <Text style={[styles.systemMessageText, { color: colors.scrimTextSecondary }]}>
            {item.message}
          </Text>
        </View>
      );
    }
    return (
      <View style={styles.chatRow}>
        <Text style={styles.chatLine} numberOfLines={2}>
          {item.isSeller ? (
            <Text style={[styles.chatSellerMark, { color: colors.warning }]}>{t('chat.seller')} · </Text>
          ) : null}
          <Text style={[styles.chatSender, { color: colors.scrimTextSecondary }]}>
            {item.userName}
            {'  '}
          </Text>
          <Text style={[styles.chatText, { color: colors.scrimTextPrimary }]}>
            {item.message}
          </Text>
        </Text>
      </View>
    );
  }, [colors, styles, t]);

  return (
    <FlatList
      ref={chatListRef}
      data={messages}
      keyExtractor={(item) => item.id}
      renderItem={renderChatMessage}
      style={styles.chatList}
      contentContainerStyle={styles.chatListContent}
      onContentSizeChange={() => chatListRef.current?.scrollToEnd({ animated: !reducedMotion })}
      showsVerticalScrollIndicator={false}
    />
  );
}

const createStyles = (colors: ThemeColors, screenHeight: number) => StyleSheet.create({
  // ── Chat — flat rows separated by hairlines ──
  chatList: {
    maxHeight: screenHeight * 0.28 },
  chatListContent: {
    paddingHorizontal: Space.md },
  chatRow: {
    paddingVertical: Space.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.14)' },
  chatLine: {
    flexShrink: 1 },
  chatSender: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily },
  chatText: {
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily,
    lineHeight: TypographyV2.body.lineHeight },
  chatSellerMark: {
    fontSize: TypographyV2.label.size,
    fontFamily: TypographyV2.label.fontFamily,
    letterSpacing: TypographyV2.label.letterSpacing },
  systemMessageText: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    fontStyle: 'italic' } });
