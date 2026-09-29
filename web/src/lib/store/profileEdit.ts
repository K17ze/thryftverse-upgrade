'use client';

/**
 * Profile edits — the overlay the /profile/edit form writes and the
 * session merges onto the fixture user. Fixture data stays untouched;
 * every self-facing surface reads the merged session user so the edit
 * lands everywhere at once.
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { DATA_MODE } from '@/lib/api/client';
import { updateMyProfile } from '@/lib/api/services/users';

export interface ProfileOverlay {
  username?: string;
  avatar?: string;
  /** Cover image URI — SessionProvider's overlay merge flows it through
   *  to user.coverPhoto on every self-facing surface. */
  coverPhoto?: string;
  bio?: string;
  location?: string;
  website?: string;
  pronouns?: string;
}

/**
 * Live-mode profile patch — the fields PATCH /users/me accepts for the
 * public profile. `null` clears avatar/coverPhoto; empty strings clear
 * text fields (the backend stores them verbatim).
 */
export type ProfileLivePatch = Partial<{
  username: string;
  bio: string;
  location: string;
  website: string;
  pronouns: string;
  avatar: string | null;
  coverPhoto: string | null;
}>;

/**
 * Live write — PATCH /users/me with the fields the edit form touched.
 * The overlay store is fixture-mode truth only: in live mode the server
 * is the single source (SessionProvider stops merging the overlay), so
 * the save goes straight to the endpoint and the caller follows with
 * `refreshSession()` so every self-facing surface re-renders from
 * /users/me. Throws on failure — the caller toasts; nothing is faked.
 */
export async function saveProfileLive(patch: ProfileLivePatch): Promise<void> {
  if (DATA_MODE !== 'live') return;
  await updateMyProfile(patch);
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
