'use client';

/**
 * Account contact resolution for the "Personal info" surface.
 *
 * Live mode reads the contact fields SessionProvider pulls from
 * /users/me (email, verified state, phone) and writes through
 * `PATCH /users/me`. Fixture mode shows the demo member's record and
 * persists edits on-device — the same contract the saved-address and
 * payment stores follow: real local behaviour, honestly preview-scoped.
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { DATA_MODE } from '@/lib/api/client';
import * as usersService from '@/lib/api/services/users';
import type { AccountIdentity } from '@/lib/api/services/auth';
import { useSession } from '@/lib/session/SessionProvider';
import { useHydrated } from '@/lib/store/useStore';

/** The demo member's contact record — fixture mode signs in as 'you',
 *  so the surface shows fixture details like every other demo row. */
const FIXTURE_CONTACT: AccountIdentity = {
  email: 'member@thryftverse.app',
  emailVerified: true,
  phone: null,
};

interface ContactOverlayState {
  /** Fixture-mode phone edit — persists on this device only. */
  phone: string | null;
  setPhone: (phone: string | null) => void;
}

const useContactOverlay = create<ContactOverlayState>()(
  persist(
    (set) => ({
      phone: null,
      setPhone: (phone) => set({ phone }),
    }),
    {
      name: 'thryftverse.web.account-contact',
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ phone: s.phone }),
    },
  ),
);

export interface AccountContactResult {
  /** null while the live session is still resolving (or for a guest). */
  contact: AccountIdentity | null;
  loading: boolean;
  /** Save or clear (null) the contact phone. Throws on live API failure. */
  savePhone: (phone: string | null) => Promise<void>;
}

export function useAccountContact(): AccountContactResult {
  const { accountIdentity, isGuest, sessionLoading, refreshSession } = useSession();
  const hydrated = useHydrated();
  const overlayPhone = useContactOverlay((s) => s.phone);
  const setOverlayPhone = useContactOverlay((s) => s.setPhone);

  if (DATA_MODE === 'live') {
    return {
      contact: isGuest ? null : accountIdentity,
      loading: sessionLoading,
      savePhone: async (phone) => {
        await usersService.updateMyProfile({ phone: phone ?? '' });
        await refreshSession();
      },
    };
  }

  const contact: AccountIdentity | null = isGuest
    ? null
    : { ...FIXTURE_CONTACT, phone: hydrated ? overlayPhone : null };

  return {
    contact,
    loading: !hydrated,
    savePhone: async (phone) => {
      setOverlayPhone(phone);
    },
  };
}
