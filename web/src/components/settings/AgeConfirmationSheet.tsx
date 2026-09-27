'use client';

/**
 * AgeConfirmationSheet — web port of AgeVerificationScreen's 18+
 * self-declaration. Mobile stores the flag in SecureStore and gates app
 * entry; the honest web equivalent persists `ageConfirmedAt` in
 * settingsPrefs and is reachable from the settings index. The copy says
 * plainly what it is: a self-declaration stored on this device, not
 * identity verification.
 */

import { useState } from 'react';
import { Sheet } from '@/components/ui/Sheet';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { useHydrated } from '@/lib/store/useStore';
import { useSettingsPrefs } from '@/lib/store/settingsPrefs';
import { formatDate } from '@/lib/utils/format';

interface AgeConfirmationSheetProps {
  open: boolean;
  onClose: () => void;
}

export function AgeConfirmationSheet({ open, onClose }: AgeConfirmationSheetProps) {
  const hydrated = useHydrated();
  const ageConfirmedAt = useSettingsPrefs((s) => s.ageConfirmedAt);
  const confirmAge = useSettingsPrefs((s) => s.confirmAge);
  const resetAgeConfirmation = useSettingsPrefs((s) => s.resetAgeConfirmation);
  const [declined, setDeclined] = useState(false);

  const close = () => {
    setDeclined(false);
    onClose();
  };

  return (
    <Sheet open={open} onClose={close} title="Age confirmation" maxWidth={440}>
      {declined ? (
        /* Under-18 path — mirrors mobile's denied state: statement only,
           no chrome, and a quiet way back rather than a fake "close app". */
        <div className="px-5 py-8">
          <p className="text-section-title font-semibold text-text-primary">
            ThryftVerse is 18+
          </p>
          <p className="mt-2 max-w-xs text-body text-text-secondary">
            This marketplace is only available to members 18 and older.
          </p>
          <button
            type="button"
            onClick={() => setDeclined(false)}
            className="pressable mt-6 text-body font-medium text-text-secondary hover:text-text-primary"
          >
            Go back
          </button>
        </div>
      ) : hydrated && ageConfirmedAt ? (
        /* Confirmed — the declaration is recorded; reset is a quiet text
           action, not an equal-weight button (mobile's exit grammar). */
        <div className="px-5 py-6">
          <div className="flex items-start gap-3">
            <Icon name="verified" size={22} className="mt-0.5 shrink-0 text-success-text" filled />
            <div>
              <p className="text-body-emphasis font-medium text-text-primary">
                Confirmed 18 or older
              </p>
              <p className="mt-0.5 text-caption text-text-muted">
                Declared {formatDate(ageConfirmedAt)}
              </p>
            </div>
          </div>
          <p className="mt-4 text-body text-text-secondary">
            A self-declaration stored on this device. Some features may still
            ask for identity verification.
          </p>
          <button
            type="button"
            onClick={resetAgeConfirmation}
            className="pressable mt-5 text-body font-medium text-text-secondary hover:text-text-primary"
          >
            Reset declaration
          </button>
        </div>
      ) : (
        /* Declaration — the statement is the surface, like mobile. */
        <div className="px-5 py-6">
          <p className="text-section-title font-semibold leading-snug text-text-primary">
            You must be 18 or older to use ThryftVerse.
          </p>
          <p className="mt-2 max-w-xs text-caption leading-relaxed text-text-muted">
            A self-declaration stored on this device. Some features may require
            age verification later.
          </p>
          <Button
            variant="primary"
            size="lg"
            fullWidth
            className="mt-6"
            onClick={confirmAge}
          >
            I’m 18 or older
          </Button>
          <button
            type="button"
            onClick={() => setDeclined(true)}
            className="pressable mt-2 flex h-11 w-full items-center justify-center text-body text-text-muted hover:text-text-secondary"
          >
            I’m under 18
          </button>
        </div>
      )}
    </Sheet>
  );
}
