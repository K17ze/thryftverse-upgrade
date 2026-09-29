'use client';

/**
 * useConfirmAge — the 18+ self-declaration write, shared by the
 * onboarding gate and the settings sheet.
 *
 * Mirrors the mobile contract: AgeVerificationScreen persists the
 * declaration to SecureStore and that device-local flag IS the gate —
 * it posts nothing to the API. On web, `ageConfirmedAt` in
 * settingsPrefs is the equivalent truth (reset on account-identity
 * change, like every other account-bound slice). When a live
 * authenticated session exists, the declaration is additionally mirrored
 * onto the account's compliance profile via
 * PATCH /compliance/profile/:userId — best-effort, never blocking: a
 * failed mirror must not trap the member at a gate native doesn't even
 * wire up.
 */

import { useCallback } from 'react';
import { DATA_MODE } from '@/lib/api/client';
import { recordAgeAttestation } from '@/lib/api/services/verification';
import { useSession } from '@/lib/session/SessionProvider';
import { useSettingsPrefs } from '@/lib/store/settingsPrefs';

export function useConfirmAge(): () => void {
  const confirmAge = useSettingsPrefs((s) => s.confirmAge);
  const { user, isGuest } = useSession();

  return useCallback(() => {
    confirmAge();
    if (DATA_MODE === 'live' && user && !isGuest) {
      void recordAgeAttestation(user.id).catch(() => {
        // Device-local flag already recorded — the mirror is bookkeeping,
        // not the gate. A failure stays silent rather than lying that the
        // declaration didn't happen.
      });
    }
  }, [confirmAge, user, isGuest]);
}
