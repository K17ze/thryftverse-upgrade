/**
 * LiveStreamViewerScreen — immersive live shopping viewer.
 *
 * Composition: the live video stage is the dominant object and fills the
 * viewport; overlays are restrained chrome on the dark media canvas
 * (EditorCanvas + scrim tokens, identical in both app themes). Chat is a
 * flat list with hairlines, not a card stack. The commerce dock is a single
 * contained panel: current lot, price, and bid/buy actions.
 *
 * Truthful UI (AGENTS §11): viewer counts, chat, bids and lot state come
 * from the realtime contract only. Capabilities the backend does not
 * expose (likes, buy-now price, winner badge on real lots) are omitted —
 * never fabricated. Video playback needs the LiveKit room: when the session
 * carries no token, or the native module is unavailable, the stage states
 * it plainly instead of pretending to play.
 *
 * This file is the orchestrator: session/subscription state lives in
 * hooks/livestream, and each surface region is a domain component under
 * components/livestream.
 */

import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  StatusBar,
  Platform,
  KeyboardAvoidingView } from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import type { RootStackParamList, NativeStackNavigationProp } from '../navigation/types';
import { useAppTheme } from '../theme/ThemeContext';
import { useConnectivity } from '../hooks/useConnectivity';
import { EditorCanvas } from '../theme/designTokens';
import { TypographyV2 } from '../theme/typography.v2';
import { useLiveKitRoom } from '../platform/streaming';
import { useAppTranslation } from '../i18n/useAppTranslation';
import {
  useLiveStreamSession,
  useLiveBidActions,
  useLiveChatComposer,
  useLiveSellerActions } from '../hooks/livestream';
import { LiveStreamTopChrome } from '../components/livestream/LiveStreamTopChrome';
import { LiveChatList } from '../components/livestream/LiveChatList';
import { LiveLotDock } from '../components/livestream/LiveLotDock';
import { LiveChatComposer } from '../components/livestream/LiveChatComposer';
import { LiveBidOutcomeBanner } from '../components/livestream/LiveBidOutcomeBanner';
import { LiveItemSheet } from '../components/livestream/LiveItemSheet';
import { LiveBidSheet } from '../components/livestream/LiveBidSheet';
import {
  LiveStreamConnectingScreen,
  LiveStreamErrorScreen,
  LiveStreamEndedScreen } from '../components/livestream/LiveStreamStateScreens';
import { resolveStageCaption } from '../components/livestream/livestreamUtils';

type LiveStreamViewerRoute = RouteProp<RootStackParamList, 'LiveStreamViewer'>;

export function LiveStreamViewerScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<LiveStreamViewerRoute>();
  const { colors } = useAppTheme();
  const { isOffline } = useConnectivity();
  const { t } = useAppTranslation('liveStreamViewer');

  const sessionId = route.params?.sessionId;

  // Sheet visibility — bid sheet is also closed by the bid flow once an
  // attempt settles, so the closer is handed to the bid hook.
  const [bidSheetVisible, setBidSheetVisible] = useState(false);
  const [itemSheetVisible, setItemSheetVisible] = useState(false);
  const closeBidSheet = useCallback(() => setBidSheetVisible(false), []);

  // ── Real-time session: connection, subscriptions, lot, chat, identity ──
  const {
    connectionState,
    stream,
    messages,
    viewerCount,
    sellerIdentity,
    streamEndSummary,
    currentLot,
    setCurrentLot,
    retry } = useLiveStreamSession(sessionId);

  // Real video plane — LiveKit room joined with the viewer token the backend
  // issued. When the session carries no credentials the hook stays
  // disconnected and the stage degrades honestly (no fake video surface).
  const liveKit = useLiveKitRoom(stream?.wsUrl ?? null, stream?.token ?? null);

  const {
    bidPending,
    buyNowPending,
    bidOutcome,
    bidCheckPending,
    settlePending,
    handleBid,
    handleCheckBidStatus,
    handleBuyNow,
    handleCompleteCheckout,
    dismissUnknownBid } = useLiveBidActions({ sessionId, currentLot, setCurrentLot, closeBidSheet });

  const {
    isFollowing,
    followPending,
    handleShare,
    handleFollowToggle } = useLiveSellerActions({ sellerId: stream?.sellerId, sellerName: sellerIdentity?.name });

  const { chatInput, setChatInput, handleSendChat } = useLiveChatComposer(sessionId);

  const goBack = useCallback(() => navigation.goBack(), [navigation]);

  // Video stage caption — honest about what the LiveKit room is doing.
  const hasVideoCredentials = Boolean(stream?.wsUrl && stream?.token);
  const hasRemoteVideo = liveKit.remoteParticipants.some((p) =>
    p.tracks.some((trackInfo) => trackInfo.kind === 'video'));
  const stageCaption = resolveStageCaption({
    hasVideoCredentials,
    roomState: liveKit.state,
    hasRemoteVideo,
    t });

  // ── Connecting state — skeleton matching the live layout ──
  if (connectionState === 'connecting') {
    return (
      <LiveStreamConnectingScreen isOffline={isOffline} onBack={goBack} onRetry={retry} />
    );
  }

  // ── Error state ──
  if (connectionState === 'error') {
    return (
      <LiveStreamErrorScreen isOffline={isOffline} onBack={goBack} onRetry={retry} />
    );
  }

  // ── Stream ended state ──
  if (connectionState === 'ended') {
    return (
      <LiveStreamEndedScreen summary={streamEndSummary} onBack={goBack} />
    );
  }

  // ── Live state — video-dominant stage with restrained chrome ──
  return (
    <View style={styles.stage}>
      <StatusBar barStyle="light-content" />

      {/* Video plane — the dominant object. LiveKit connects in the
          background; when no video can play the stage states it plainly. */}
      {stageCaption ? (
        <View style={styles.stageCenter} pointerEvents="none">
          <Text style={[styles.stageCaption, { color: colors.scrimTextSecondary }]}>
            {stageCaption}
          </Text>
        </View>
      ) : null}

      {/* ── Top chrome: leave + seller identity (left), live badge + viewer
          count + share (right) ── */}
      <LiveStreamTopChrome
        sellerIdentity={sellerIdentity}
        canFollow={Boolean(stream?.sellerId)}
        isFollowing={isFollowing}
        followPending={followPending}
        viewerCount={viewerCount}
        onLeave={goBack}
        onFollowToggle={handleFollowToggle}
        onShare={handleShare}
      />

      {/* ── Bottom chrome: chat list, lot dock, composer ── */}
      <KeyboardAvoidingView
        style={styles.bottomOverlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
      >
        {/* Chat — flat rows with hairlines over the stage */}
        <LiveChatList messages={messages} />

        {/* Lot status + winner checkout, then the single contained panel */}
        {currentLot ? (
          <LiveLotDock
            lot={currentLot}
            bidPending={bidPending}
            buyNowPending={buyNowPending}
            settlePending={settlePending}
            onOpenDetails={() => setItemSheetVisible(true)}
            onOpenBidSheet={() => setBidSheetVisible(true)}
            onBuyNow={handleBuyNow}
            onCompleteCheckout={handleCompleteCheckout}
          />
        ) : null}

        {/* Composer */}
        <LiveChatComposer
          value={chatInput}
          onChangeText={setChatInput}
          onSend={handleSendChat}
        />
      </KeyboardAvoidingView>

      {/* ── Unknown bid outcome — the bid may have committed; offer a real
          idempotent re-check, never fabricate confirmation ── */}
      {bidOutcome === 'unknown' ? (
        <LiveBidOutcomeBanner
          checkPending={bidCheckPending}
          onCheck={handleCheckBidStatus}
          onDismiss={dismissUnknownBid}
        />
      ) : null}

      {/* ── Item detail sheet ── */}
      {itemSheetVisible && currentLot ? (
        <LiveItemSheet
          lot={currentLot}
          buyNowPending={buyNowPending}
          onClose={() => setItemSheetVisible(false)}
          onPlaceBid={() => { setItemSheetVisible(false); setBidSheetVisible(true); }}
          onBuyNow={() => { setItemSheetVisible(false); handleBuyNow(); }}
        />
      ) : null}

      {/* ── Bid sheet ── */}
      {bidSheetVisible && currentLot ? (
        <LiveBidSheet
          lot={currentLot}
          bidPending={bidPending}
          onBid={handleBid}
          onClose={closeBidSheet}
        />
      ) : null}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles — stage chrome only; region styles live with their components
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  // ── Video stage — theme-independent dark media canvas ──
  stage: {
    flex: 1,
    backgroundColor: EditorCanvas },
  stageCenter: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center' },
  stageCaption: {
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily },
  // ── Bottom overlay ──
  bottomOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 10 } });
