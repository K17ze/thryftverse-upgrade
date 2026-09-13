/**
 * LiveStreamSellerScreen — broadcaster experience (thin orchestrator).
 *
 * Three phases: setup → live → summary. All state lives in
 * hooks/livestream (useSellerListings, useSellerBroadcast,
 * useSellerLotControls); each phase renders as a domain component under
 * components/livestream.
 *
 * Truthful UI (AGENTS §11):
 * - Lots are the seller's real active listings, scheduled onto the session
 *   through the backend lot engine — no demo lots, no simulated go-live.
 * - The camera surface is a local framing preview (BroadcastPreview). Video
 *   publishing to the LiveKit room is not wired in the shared streaming
 *   layer yet, so the surface is labelled as a preview, not a broadcast.
 * - Session lifecycle goes through the real backend routes
 *   (components/live/liveBroadcastApi). When session creation fails, the
 *   screen reports the error — it never pretends to be live.
 * - Viewer count, chat and bid events come from realtime subscriptions.
 *   Metrics that are not reported (likes, earnings mid-stream) are omitted.
 */

import React, { useCallback, useState } from 'react';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import { useStore } from '../store/useStore';
import {
  useSellerListings,
  useSellerBroadcast,
  useSellerLotControls } from '../hooks/livestream';
import { LiveSellerSetupPhase } from '../components/livestream/LiveSellerSetupPhase';
import { LiveSellerLivePhase } from '../components/livestream/LiveSellerLivePhase';
import { LiveSellerLotPanel } from '../components/livestream/LiveSellerLotPanel';
import { LiveSellerSummaryPhase } from '../components/livestream/LiveSellerSummaryPhase';

type LiveStreamSellerRoute = RouteProp<RootStackParamList, 'LiveStreamSeller'>;
type NavT = NativeStackNavigationProp<RootStackParamList>;

export function LiveStreamSellerScreen() {
  const navigation = useNavigation<NavT>();
  const route = useRoute<LiveStreamSellerRoute>();
  const currentUser = useStore((s) => s.currentUser);

  const resumeSessionId = route.params?.sessionId;

  // Stream title is setup-phase form state; it feeds handleGoLive inside
  // useSellerBroadcast and edits clear the setup error (preserved pairing).
  const [title, setTitle] = useState('');

  const listings = useSellerListings(currentUser?.id);
  const broadcast = useSellerBroadcast({
    resumeSessionId,
    selectedListings: listings.selectedListings,
    title });
  const lotControls = useSellerLotControls({
    sessionId: broadcast.sessionId,
    lots: broadcast.lots,
    currentLotIndex: broadcast.currentLotIndex,
    setLots: broadcast.setLots,
    setCurrentLotIndex: broadcast.setCurrentLotIndex,
    setSettlementStatus: broadcast.setSettlementStatus,
    recordSale: broadcast.recordSale });

  const handleTitleChange = useCallback((text: string) => {
    setTitle(text);
    broadcast.setSetupError(null);
  }, [broadcast.setSetupError]);

  const handleBack = useCallback(() => navigation.goBack(), [navigation]);
  const handleCreateListing = useCallback(() => navigation.navigate('Sell'), [navigation]);

  // ── Setup phase ──
  if (broadcast.phase === 'setup') {
    return (
      <LiveSellerSetupPhase
        title={title}
        onTitleChange={handleTitleChange}
        listings={listings.listings}
        listingsLoading={listings.listingsLoading}
        listingsError={listings.listingsError}
        selectedIds={listings.selectedIds}
        onToggleListing={listings.toggleListing}
        onRetryListings={listings.loadListings}
        onCreateListing={handleCreateListing}
        onGoLive={broadcast.handleGoLive}
        goingLive={broadcast.goingLive}
        setupError={broadcast.setupError}
        onBack={handleBack}
      />
    );
  }

  // ── Summary phase ──
  if (broadcast.phase === 'summary') {
    return (
      <LiveSellerSummaryPhase
        viewerCount={broadcast.viewerCount}
        lotsSold={broadcast.lotsSold}
        totalSalesMinor={broadcast.totalSalesMinor}
        onDone={handleBack}
        onBack={handleBack}
      />
    );
  }

  // ── Live phase ──
  return (
    <LiveSellerLivePhase
      session={broadcast.session}
      endingStream={broadcast.endingStream}
      endError={broadcast.endError}
      onEndStream={broadcast.handleEndStream}
      liveKitState={broadcast.liveKit.state}
      viewerCount={broadcast.viewerCount}
      liveSeconds={broadcast.liveSeconds}
      messages={broadcast.messages}
      lotPanel={
        lotControls.currentLot ? (
          <LiveSellerLotPanel
            currentLot={lotControls.currentLot}
            nextLot={lotControls.nextLot}
            currentLotIndex={broadcast.currentLotIndex}
            lotsCount={broadcast.lots.length}
            remainingLots={lotControls.remainingLots}
            settlementStatus={broadcast.settlementStatus}
            lotActionPending={lotControls.lotActionPending}
            settlePending={lotControls.settlePending}
            endingStream={broadcast.endingStream}
            onOpenLot={lotControls.handleOpenLot}
            onCloseLot={lotControls.handleCloseLot}
            onCancelLot={lotControls.handleCancelLot}
            onNextLot={lotControls.handleNextLot}
            onSettleLot={lotControls.handleSettleLot}
            onEndStream={broadcast.handleEndStream}
          />
        ) : null
      }
    />
  );
}
