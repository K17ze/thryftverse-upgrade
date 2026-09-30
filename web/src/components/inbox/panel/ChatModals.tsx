'use client';

/**
 * ChatModals — lazy-loaded modal and sheet surfaces for ChatPanel:
 * ConfirmSheet, ForwardSheet, MediaLightbox, and OfferSheets (Counter & Shared Item Offer).
 */

import dynamic from 'next/dynamic';
import type { ConfirmSheetState } from '../ConfirmSheet';
import type { SharedMediaItem } from '../SharedMediaGrid';
import type { OfferWithOrder } from '@/lib/commerce/offerAcceptance';
import type { Conversation, Listing } from '@/lib/contracts/domain';

const ConfirmSheet = dynamic(
  () => import('../ConfirmSheet').then((m) => m.ConfirmSheet),
  { ssr: false },
);
const ForwardSheet = dynamic(
  () => import('../ForwardSheet').then((m) => m.ForwardSheet),
  { ssr: false },
);
const MediaLightbox = dynamic(
  () => import('../SharedMediaGrid').then((m) => m.MediaLightbox),
  { ssr: false },
);
const OfferSheet = dynamic(
  () => import('@/components/pdp/OfferSheet').then((m) => m.OfferSheet),
  { ssr: false },
);

interface ChatModalsProps {
  confirmState: ConfirmSheetState;
  onCloseConfirm: () => void;
  forwardOpen: boolean;
  onCloseForward: () => void;
  forwardTargets: Conversation[];
  onForwardPick: (targetConversationId: string) => void;
  mediaItems: SharedMediaItem[];
  mediaIndex: number | null;
  onMediaIndexChange: (idx: number) => void;
  onCloseMedia: () => void;
  counterTarget: OfferWithOrder | null;
  counterListing: Listing | undefined;
  onCloseCounter: () => void;
  onSendCounter: (amount: number, expiryHours: number) => void;
  shareOfferListing: Listing | undefined;
  onCloseShareOffer: () => void;
  onSendShareOffer: (amount: number, expiryHours: number) => void;
}

export function ChatModals({
  confirmState,
  onCloseConfirm,
  forwardOpen,
  onCloseForward,
  forwardTargets,
  onForwardPick,
  mediaItems,
  mediaIndex,
  onMediaIndexChange,
  onCloseMedia,
  counterTarget,
  counterListing,
  onCloseCounter,
  onSendCounter,
  shareOfferListing,
  onCloseShareOffer,
  onSendShareOffer,
}: ChatModalsProps) {
  return (
    <>
      {confirmState.open ? (
        <ConfirmSheet state={confirmState} onClose={onCloseConfirm} />
      ) : null}

      {forwardOpen ? (
        <ForwardSheet
          open
          onClose={onCloseForward}
          targets={forwardTargets}
          onSelect={onForwardPick}
        />
      ) : null}

      {mediaIndex !== null ? (
        <MediaLightbox
          items={mediaItems}
          index={mediaIndex}
          onIndexChange={onMediaIndexChange}
          onClose={onCloseMedia}
        />
      ) : null}

      {counterTarget && counterListing ? (
        <OfferSheet
          open
          onClose={onCloseCounter}
          listing={counterListing}
          counterTo={{
            amount: counterTarget.amount,
            label:
              counterTarget.counterRound > 0 ? 'Their counter' : 'Their offer',
          }}
          onSend={onSendCounter}
        />
      ) : null}

      {shareOfferListing ? (
        <OfferSheet
          open
          onClose={onCloseShareOffer}
          listing={shareOfferListing}
          onSend={onSendShareOffer}
        />
      ) : null}
    </>
  );
}
