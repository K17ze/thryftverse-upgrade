'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { AuthField } from '@/components/auth/AuthField';
import { PasswordStrength } from '@/components/auth/PasswordStrength';
import { MIN_PASSWORD_LENGTH } from '@/components/auth/passwordPolicy';
import { useToast } from '@/components/ui/Toast';
import { useHydrated } from '@/lib/store/useStore';
import { useSettingsPrefs } from '@/lib/store/settingsPrefs';
import { useSession } from '@/lib/session/SessionProvider';
import { DATA_MODE } from '@/lib/api/client';
import { parseApiError } from '@/lib/api/http';
import { changePassword } from '@/lib/api/services/auth';

const isLive = DATA_MODE === 'live';

export function ChangePasswordForm() {
  const { show } = useToast();
  const { refreshSession } = useSession();
  const hydrated = useHydrated();
  const passwordUpdatedAt = useSettingsPrefs((s) => s.passwordUpdatedAt);
  const markPasswordUpdated = useSettingsPrefs((s) => s.markPasswordUpdated);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const mismatch = confirm.length > 0 && next !== confirm;
  const sameAsCurrent = next.length > 0 && current.length > 0 && next === current;
  const valid =
    current.length >= MIN_PASSWORD_LENGTH &&
    next.length >= MIN_PASSWORD_LENGTH &&
    next === confirm &&
    !mismatch &&
    !sameAsCurrent;

  const submit = async () => {
    setSubmitting(true);
    try {
      if (isLive) {
        // POST /auth/password/change — server re-verifies the current
        // password and rotates the credential; a wrong current password
        // comes back as an error the toast reports verbatim.
        await changePassword(current, next);
      }
      markPasswordUpdated();
      setCurrent('');
      setNext('');
      setConfirm('');
      show('Password updated', 'success');
      void refreshSession();
    } catch (error) {
      show(parseApiError(error).message || 'Could not update password', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="px-4 py-4 sm:px-5">
      <div className="space-y-4">
        <AuthField
          label="Current password"
          type="password"
          autoComplete="current-password"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
        />
        <div>
          <AuthField
            label="New password"
            type="password"
            autoComplete="new-password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            error={sameAsCurrent ? 'New password must differ from the current one' : undefined}
          />
          <PasswordStrength password={next} />
        </div>
        <AuthField
          label="Confirm new password"
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          error={mismatch ? 'Passwords don’t match' : undefined}
        />
      </div>
      <Button
        variant="primary"
        size="md"
        fullWidth
        className="mt-5"
        disabled={!valid || submitting}
        onClick={() => void submit()}
      >
        {submitting ? 'Updating…' : 'Update password'}
      </Button>
      {hydrated && passwordUpdatedAt ? (
        <p className="mt-3 text-caption text-text-muted">
          Last changed{' '}
          {new Date(passwordUpdatedAt).toLocaleDateString('en-GB', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
          })}{' '}
          on this device.
        </p>
      ) : null}
    </div>
  );
}
