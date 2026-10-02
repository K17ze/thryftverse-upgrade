'use client';

/**
 * AI feature preferences — the device-local control surface behind
 * /settings/recommendations. Web port of the mobile AIPreferencesScreen
 * store ('@thryftverse/ai_prefs' in AsyncStorage).
 *
 * Truth scope (AGENTS.md §11): the account-preferences wire carries no
 * AI-toggle fields, so every flag here is device-local in every build —
 * the screen's notice says so outright and nothing claims a backend is
 * being reconfigured. Wired consumers read through `aiFeatureOn`
 * (master ∧ feature): the sell composer's auto-fill control, both
 * search-autocomplete fields and the photo editor's Enhance tab. The
 * remaining flags record the member's choice until their surfaces
 * honour it.
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export type AIFeatureKey =
  | 'listingSuggestions'
  | 'photoEnhancement'
  | 'searchAutocomplete'
  | 'chatAgents'
  | 'smartSell'
  | 'confidenceDisplay';

export const AI_FEATURE_KEYS: readonly AIFeatureKey[] = [
  'listingSuggestions',
  'photoEnhancement',
  'searchAutocomplete',
  'chatAgents',
  'smartSell',
  'confidenceDisplay',
];

interface AIPrefsState {
  masterEnabled: boolean;
  listingSuggestions: boolean;
  photoEnhancement: boolean;
  searchAutocomplete: boolean;
  chatAgents: boolean;
  smartSell: boolean;
  confidenceDisplay: boolean;
  /**
   * Master off forces every feature off — the mobile kill-switch
   * contract. Master on re-arms the master only; the feature mix stays
   * exactly as recorded, so a re-enable never silently revives a row
   * the member switched off.
   */
  setMasterEnabled: (enabled: boolean) => void;
  setFeature: (key: AIFeatureKey, enabled: boolean) => void;
}

export const useAIPrefs = create<AIPrefsState>()(
  persist(
    (set) => ({
      masterEnabled: true,
      listingSuggestions: true,
      photoEnhancement: true,
      searchAutocomplete: true,
      chatAgents: true,
      // Preview on mobile too — defaults off until the member opts in.
      smartSell: false,
      confidenceDisplay: true,

      setMasterEnabled: (enabled) =>
        set(
          enabled
            ? { masterEnabled: true }
            : {
                masterEnabled: false,
                listingSuggestions: false,
                photoEnhancement: false,
                searchAutocomplete: false,
                chatAgents: false,
                smartSell: false,
                confidenceDisplay: false,
              },
        ),
      setFeature: (key, enabled) =>
        set({ [key]: enabled } as Pick<AIPrefsState, AIFeatureKey>),
    }),
    {
      name: 'thryftverse.web.ai-prefs',
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({
        masterEnabled: s.masterEnabled,
        listingSuggestions: s.listingSuggestions,
        photoEnhancement: s.photoEnhancement,
        searchAutocomplete: s.searchAutocomplete,
        chatAgents: s.chatAgents,
        smartSell: s.smartSell,
        confidenceDisplay: s.confidenceDisplay,
      }),
    },
  ),
);

/**
 * A feature is live only while the master is on — the single selector
 * every gated surface reads.
 */
export function aiFeatureOn(s: AIPrefsState, key: AIFeatureKey): boolean {
  return s.masterEnabled && s[key];
}
