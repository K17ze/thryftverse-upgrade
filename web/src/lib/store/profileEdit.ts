'use client';

/**
 * Profile edits — the overlay the /profile/edit form writes and the
 * session merges onto the fixture user. Fixture data stays untouched;
 * every self-facing surface reads the merged session user so the edit
 * lands everywhere at once.
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export interface ProfileOverlay {
  username?: string;
  avatar?: string;
  bio?: string;
  location?: string;
  website?: string;
  pronouns?: string;
}

interface ProfileEditState {
  overlay: ProfileOverlay;
  saveOverlay: (next: ProfileOverlay) => void;
  clearOverlay: () => void;
}

export const useProfileEdit = create<ProfileEditState>()(
  persist(
    (set) => ({
      overlay: {},
      saveOverlay: (next) =>
        set((s) => {
          const overlay = { ...s.overlay };
          // undefined fields are deletions — write explicit empties away.
          for (const [k, v] of Object.entries(next)) {
            const key = k as keyof ProfileOverlay;
            if (v == null || v === '') delete overlay[key];
            else overlay[key] = v;
          }
          return { overlay };
        }),
      clearOverlay: () => set({ overlay: {} }),
    }),
    {
      name: 'thryftverse.web.profile-overlay',
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ overlay: s.overlay }),
    },
  ),
);
