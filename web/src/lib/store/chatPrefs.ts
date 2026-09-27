'use client';

/**
 * Chat preferences — the persisted messaging slice, ported from the mobile
 * store's chat settings (ChatSettingsScreen): who may open a DM, read
 * receipts, and the two in-chat marketplace cards.
 *
 * These gate real local behaviour where the web surface can prove it:
 * `readReceipts = false` caps every own-message receipt at "delivered" —
 * the viewer's ticks and the inbox row glyph stop claiming a read the
 * setting says not to broadcast (mirrors the mobile flag, which syncs to
 * accountApi.updateChatPrivacy on a signed-in account). The message-scope
 * and in-chat card flags persist for the surfaces that consume them;
 * there is no web edge for who-can-message yet, so it persists locally —
 * the settings page says so.
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { Message } from '@/lib/contracts/domain';
import { useHydrated } from './useStore';

/** Who can start a DM with the viewer — the mobile allowMessagesFrom
 *  vocabulary ('everyone' | 'following' | 'nobody'), keyed 'none' here. */
export type WhoCanMessage = 'everyone' | 'following' | 'none';

interface ChatPrefsState {
  whoCanMessage: WhoCanMessage;
  /** Read receipts — when off, own messages never display a read state. */
  readReceipts: boolean;
  /** Offer cards inside transaction conversations. */
  offersInChat: boolean;
  /** Shipping/delivery status cards inside conversations. */
  orderUpdatesInChat: boolean;
  setWhoCanMessage: (value: WhoCanMessage) => void;
  setReadReceipts: (enabled: boolean) => void;
  setOffersInChat: (enabled: boolean) => void;
  setOrderUpdatesInChat: (enabled: boolean) => void;
}

export const useChatPrefs = create<ChatPrefsState>()(
  persist(
    (set) => ({
      whoCanMessage: 'everyone',
      readReceipts: true,
      offersInChat: true,
      orderUpdatesInChat: true,
      setWhoCanMessage: (value) => set({ whoCanMessage: value }),
      setReadReceipts: (enabled) => set({ readReceipts: enabled }),
      setOffersInChat: (enabled) => set({ offersInChat: enabled }),
      setOrderUpdatesInChat: (enabled) => set({ orderUpdatesInChat: enabled }),
    }),
    {
      name: 'thryftverse.web.chat-prefs',
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({
        whoCanMessage: s.whoCanMessage,
        readReceipts: s.readReceipts,
        offersInChat: s.offersInChat,
        orderUpdatesInChat: s.orderUpdatesInChat,
      }),
    },
  ),
);

/**
 * Hydration-safe read of the receipts flag — persisted `false` differs
 * between SSR and first client render, so until mounted the flag reads as
 * the default (receipts on) rather than risking a mismatched tick glyph.
 */
export function useReadReceiptsEnabled(): boolean {
  const hydrated = useHydrated();
  const enabled = useChatPrefs((s) => s.readReceipts);
  return hydrated ? enabled : true;
}

/**
 * Receipt display truth under the privacy flag — with read receipts off a
 * 'read' state must never render for the viewer's own messages; the tick
 * stops at 'delivered'. 'sending'/'sent' pass through untouched.
 */
export function capReceiptForPrivacy(
  status: Message['readStatus'],
  receiptsEnabled: boolean,
): Message['readStatus'] {
  if (receiptsEnabled || status !== 'read') return status;
  return 'delivered';
}
