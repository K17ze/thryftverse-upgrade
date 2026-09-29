'use client';

/**
 * Algorithm preferences — the device-local signals behind /agents/algorithm
 * in FIXTURE mode only. Persisted zustand slice (localStorage), same store
 * grammar as lib/store/savedSearches.ts. The view labels it "Saved on this
 * device" honestly — there is no live backend write in this mode.
 *
 * Live mode uses the real intent wire instead:
 * GET/POST /recommendations/intent/:userId/profile|mutate (see
 * services/agents.ts + the live branch of AlgorithmView). No seed topic is
 * ever presented as derived-from-activity — the seeds below are explicit,
 * removable, user-facing demo preferences.
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export type TopicWeight = 'low' | 'medium' | 'high';

export interface AlgoTopic {
  id: string;
  label: string;
  weight: TopicWeight;
}

interface AlgorithmPrefsState {
  /** Interest topics — what the feed favours. */
  topics: AlgoTopic[];
  /** Brand signals — same weight grammar as topics. */
  brands: AlgoTopic[];
  /** Price comfort ceiling in GBP (10–300, 300 = no real cap). */
  priceComfort: number;
  /** 0 = fresh drops only, 50 = balanced, 100 = trending only. */
  discoveryDial: number;
  setTopicWeight: (kind: 'topics' | 'brands', id: string, weight: TopicWeight) => void;
  addTopic: (kind: 'topics' | 'brands', label: string) => void;
  removeTopic: (kind: 'topics' | 'brands', id: string) => void;
  setPriceComfort: (value: number) => void;
  setDiscoveryDial: (value: number) => void;
}

let counter = 0;
const nextId = (prefix: string) =>
  `${prefix}-${Date.now().toString(36)}-${(counter++).toString(36)}`;

// Authored demo preferences — removable, device-local, never claimed as
// derived from real browsing history.
const SEED_TOPICS: AlgoTopic[] = [
  { id: 't-vintage-denim', label: 'Vintage denim', weight: 'high' },
  { id: 't-sneakers', label: 'Sneakers', weight: 'medium' },
  { id: 't-workwear', label: 'Workwear', weight: 'medium' },
  { id: 't-outerwear', label: 'Tailored outerwear', weight: 'high' },
  { id: 't-knitwear', label: 'Knitwear', weight: 'medium' },
  { id: 't-leather', label: 'Leather goods', weight: 'low' },
];

const SEED_BRANDS: AlgoTopic[] = [
  { id: 'b-carhartt', label: 'Carhartt WIP', weight: 'high' },
  { id: 'b-barbour', label: 'Barbour', weight: 'medium' },
  { id: 'b-levis', label: 'Levi\u2019s', weight: 'high' },
];

export const useAlgorithmPrefs = create<AlgorithmPrefsState>()(
  persist(
    (set) => ({
      topics: SEED_TOPICS,
      brands: SEED_BRANDS,
      priceComfort: 120,
      discoveryDial: 45,
      setTopicWeight: (kind, id, weight) =>
        set((s) =>
          kind === 'topics'
            ? { topics: s.topics.map((t) => (t.id === id ? { ...t, weight } : t)) }
            : { brands: s.brands.map((t) => (t.id === id ? { ...t, weight } : t)) },
        ),
      addTopic: (kind, label) =>
        set((s) => {
          const trimmed = label.trim();
          const list = kind === 'topics' ? s.topics : s.brands;
          if (!trimmed) return s;
          if (list.some((t) => t.label.toLowerCase() === trimmed.toLowerCase())) {
            return s;
          }
          const topic: AlgoTopic = {
            id: nextId(kind === 'topics' ? 't' : 'b'),
            label: trimmed,
            weight: 'medium',
          };
          return kind === 'topics'
            ? { topics: [topic, ...s.topics] }
            : { brands: [topic, ...s.brands] };
        }),
      removeTopic: (kind, id) =>
        set((s) =>
          kind === 'topics'
            ? { topics: s.topics.filter((t) => t.id !== id) }
            : { brands: s.brands.filter((t) => t.id !== id) },
        ),
      setPriceComfort: (value) =>
        set({ priceComfort: Math.min(300, Math.max(10, Math.round(value))) }),
      setDiscoveryDial: (value) =>
        set({ discoveryDial: Math.min(100, Math.max(0, Math.round(value))) }),
    }),
    {
      name: 'thryftverse.web.algorithm',
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({
        topics: s.topics,
        brands: s.brands,
        priceComfort: s.priceComfort,
        discoveryDial: s.discoveryDial,
      }),
      // Persisted slices from before the locked-rows removal may still carry
      // the field — strip it so stale "from your activity" claims die.
      merge: (persisted, current) => {
        const p = persisted as Partial<AlgorithmPrefsState> | undefined;
        const strip = (list?: AlgoTopic[]) =>
          (list ?? []).map(({ id, label, weight }) => ({ id, label, weight }));
        return {
          ...current,
          topics: p?.topics ? strip(p.topics) : current.topics,
          brands: p?.brands ? strip(p.brands) : current.brands,
          priceComfort: p?.priceComfort ?? current.priceComfort,
          discoveryDial: p?.discoveryDial ?? current.discoveryDial,
        };
      },
    },
  ),
);

/** Price ceiling label for the slider row. */
export function priceComfortLabel(value: number): string {
  return value >= 300 ? 'Any price' : `Under £${value}`;
}

/** Discovery dial label — 0 fresh, 100 trending. */
export function discoveryLabel(value: number): string {
  if (value <= 33) return 'Fresh drops';
  if (value >= 67) return 'Trending';
  return 'Balanced';
}
