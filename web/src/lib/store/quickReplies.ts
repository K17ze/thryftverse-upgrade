'use client';

/**
 * Quick replies — canned responses sellers drop into buyer chats.
 * Persisted list, same contract as mobile QuickReply {title, message}.
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export interface QuickReply {
  id: string;
  title: string;
  message: string;
}

interface QuickRepliesState {
  replies: QuickReply[];
  add: (r: Omit<QuickReply, 'id'>) => void;
  update: (id: string, r: Omit<QuickReply, 'id'>) => void;
  remove: (id: string) => void;
}

const SEED: QuickReply[] = [
  {
    id: 'qr-ship',
    title: 'Dispatch time',
    message: 'Thanks for your order! I dispatch within 1–2 working days and will send the tracking link as soon as it\u2019s on its way.',
  },
  {
    id: 'qr-price',
    title: 'Price is firm',
    message: 'Thanks for the offer — the price is already my best. It includes tracked postage and buyer protection.',
  },
];

let counter = 0;
function nextId(): string {
  counter += 1;
  return `qr-${Date.now().toString(36)}-${counter}`;
}

export const useQuickReplies = create<QuickRepliesState>()(
  persist(
    (set) => ({
      replies: SEED,
      add: (r) => set((s) => ({ replies: [...s.replies, { ...r, id: nextId() }] })),
      update: (id, r) =>
        set((s) => ({ replies: s.replies.map((x) => (x.id === id ? { ...x, ...r } : x)) })),
      remove: (id) => set((s) => ({ replies: s.replies.filter((x) => x.id !== id) })),
    }),
    {
      name: 'thryftverse.web.quick-replies',
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ replies: s.replies }),
    },
  ),
);
