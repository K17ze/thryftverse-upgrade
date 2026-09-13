/**
 * LiveSellerLivePhase — the on-air surface for the seller: header with
 * end-stream control, local camera preview chrome (LiveKit-connected
 * honest caption), the lot command slot, and the read-only viewer chat.
 */

import React, { useCallback, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  ActivityIndicator,
  useWindowDimensions } from 'react-native';
import { useAppTheme } from '../../theme/ThemeContext';
import { AnimatedPressable } from '../AnimatedPressable';
import { AppIcon } from '../common/AppIcon';
import { IconSize } from '../../theme/iconTokens';
import { FlagshipScreen, FlagshipHeader } from '../flagship';
import { BroadcastPreview } from '../live/BroadcastPreview';
import { LiveBadge } from '../live/LiveBadge';
import type { BroadcastSession } from '../live/liveBroadcastApi';
import type { LiveKitConnectionState } from '../../platform/streaming/useLiveKitRoom';
import type { LiveStreamChatMessage } from '../../services/liveShoppingApi';
import { formatClock } from './liveSellerUtils';
import { useSellerStyles } from './liveSellerStyles';

interface LiveSellerLivePhaseProps {
  session: BroadcastSession | null;
  endingStream: boolean;
  endError: string | null;
  onEndStream: () => void;
  liveKitState: LiveKitConnectionState;
  viewerCount: number;
  liveSeconds: number;
  messages: LiveStreamChatMessage[];
  /** Lot command surface — rendered between the preview and the chat. */
  lotPanel: React.ReactNode;
}

export function LiveSellerLivePhase({
  session,
  endingStream,
  endError,
  onEndStream,
  liveKitState,
  viewerCount,
  liveSeconds,
  messages,
  lotPanel }: LiveSellerLivePhaseProps) {
  const { colors } = useAppTheme();
  const { height: SCREEN_HEIGHT } = useWindowDimensions();
  const styles = useSellerStyles();
  const chatListRef = useRef<FlatList<LiveStreamChatMessage>>(null);

  const renderChatMessage = useCallback(({ item }: { item: LiveStreamChatMessage }) => {
    const isSystem = item.type === 'system' || item.type === 'bid' || item.type === 'purchase';
    return (
      <View style={[styles.chatRow, { borderBottomColor: colors.border }]}>
        {isSystem ? (
          <Text style={[styles.chatSystemText, { color: colors.textMuted }]} numberOfLines={2}>
            {item.message}
          </Text>
        ) : (
          <Text style={styles.chatLine} numberOfLines={2}>
            <Text style={[styles.chatSender, { color: colors.textMuted }]}>
              {item.userName}{'  '}
            </Text>
            <Text style={[styles.chatText, { color: colors.textPrimary }]}>{item.message}</Text>
          </Text>
        )}
      </View>
    );
  }, [colors, styles]);

  return (
    <FlagshipScreen
      testID="live-seller-live"
      header={
        <FlagshipHeader
          title={session?.title || 'Live'}
          subtitle={session?.status === 'live' ? undefined : 'Starting…'}
          rightAction={
            <AnimatedPressable
              onPress={onEndStream}
              disabled={endingStream}
              style={styles.endHit}
              hapticFeedback="medium"
              accessibilityRole="button"
              accessibilityLabel="End stream"
              accessibilityState={{ busy: endingStream }}
            >
              {endingStream ? (
                <ActivityIndicator size="small" color={colors.danger} />
              ) : (
                <Text style={[styles.endText, { color: colors.danger }]}>End</Text>
              )}
            </AnimatedPressable>
          }
        />
      }
      scrollEnabled={false}
      contentStyle={styles.flushContent}
    >
      <View style={styles.liveWrap}>
        {/* Camera — dominant object. Local preview only; publishing is a
            shared-layer gap, so the label stays honest. */}
        <View style={styles.previewWrap}>
          <BroadcastPreview
            active
            facing="back"
            height={Math.round(SCREEN_HEIGHT * 0.3)}
            accessibilityLabel="Local camera preview"
          />
          <View style={styles.liveChromeRow}>
            <LiveBadge compact label="Live" />
            <View style={styles.liveMetaCluster}>
              <View style={styles.liveMetaItem}>
                <AppIcon name="eye" size={IconSize.xs} color="textSecondary" accessible={false} />
                <Text style={[styles.liveMetaText, { color: colors.textSecondary }]}>
                  {viewerCount}
                </Text>
              </View>
              <View style={styles.liveMetaItem}>
                <AppIcon name="clock" size={IconSize.xs} color="textSecondary" accessible={false} />
                <Text style={[styles.liveMetaText, { color: colors.textSecondary }]}>
                  {formatClock(liveSeconds)}
                </Text>
              </View>
            </View>
          </View>
          <Text style={[styles.previewCaption, { color: colors.textMuted }]}>
            {liveKitState === 'connected'
              ? 'Local preview — camera publishing is not wired in this build'
              : 'Local camera preview'}
          </Text>
          {endError ? (
            <Text style={[styles.footerError, { color: colors.danger, paddingHorizontal: 0 }]}>
              {endError}
            </Text>
          ) : null}
        </View>

        {/* Lot command — flat panel, status + real actions */}
        {lotPanel}

        {/* Chat — flat list with hairlines, read-only for the host */}
        <FlatList
          ref={chatListRef}
          data={messages}
          keyExtractor={(item) => item.id}
          renderItem={renderChatMessage}
          style={styles.chatList}
          contentContainerStyle={styles.chatListContent}
          onContentSizeChange={() => chatListRef.current?.scrollToEnd({ animated: false })}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <Text style={[styles.chatEmptyText, { color: colors.textMuted }]}>
              Viewer chat appears here
            </Text>
          }
        />
      </View>
    </FlagshipScreen>
  );
}
