'use client';

/**
 * SecurityView — the /settings/security surface.
 *
 * Web deepening of the mobile ChangePasswordScreen, AccountSecurityScreen
 * and the passkey section of passkeyApi. Live mode hits the same endpoints
 * mobile does — password rotation, session inventory + revocation, TOTP
 * enrolment and WebAuthn passkeys are all server-verified writes.
 */

import { useRouter } from 'next/navigation';
import { SettingsSection } from './SettingsSection';
import { SettingsRow } from './SettingsRow';
import { EmptyState } from '@/components/ui/EmptyState';
import { useHydrated } from '@/lib/store/useStore';
import { useSettingsPrefs } from '@/lib/store/settingsPrefs';
import { useSession } from '@/lib/session/SessionProvider';
import { DATA_MODE } from '@/lib/api/client';
import { ChangePasswordForm } from './security/ChangePasswordForm';
import { SessionsSection } from './security/SessionsSection';
import { TwoFactorSection } from './security/TwoFactorSection';
import { PasskeysSection } from './security/PasskeysSection';

const isLive = DATA_MODE === 'live';

export function SecurityView() {
  const hydrated = useHydrated();
  const router = useRouter();
  const { isGuest, sessionLoading } = useSession();
  const twoFactorEnabled = useSettingsPrefs((s) => s.twoFactorEnabled);
  const backupCodes = useSettingsPrefs((s) => s.backupCodes);

  // Every mutable section requires auth — a live guest gets one honest
  // gate rather than five surfaces that 401 under the hood.
  if (isLive && (isGuest || sessionLoading)) {
    return (
      <EmptyState
        icon="lock"
        title="Sign in to manage security"
        subtitle="Passwords, sessions, two-factor and passkeys belong to your account — sign in to see and change them."
        actionLabel="Sign in"
        onAction={() => router.push('/auth/login')}
      />
    );
  }

  return (
    <>
      <SettingsSection title="Password">
        <ChangePasswordForm />
      </SettingsSection>

      <SettingsSection title="Sign-in protection">
        <TwoFactorSection />
        {!isLive && hydrated && twoFactorEnabled ? (
          <SettingsRow
            icon="lockOpen"
            label="Recovery codes"
            subtitle="One-time codes for when you can’t reach your authenticator"
            value={backupCodes ? `${backupCodes.length} left` : undefined}
            href="/settings/security/recovery"
          />
        ) : null}
      </SettingsSection>

      <SettingsSection title="Passkeys">
        <PasskeysSection />
      </SettingsSection>

      <SettingsSection title="Sessions">
        <SessionsSection />
      </SettingsSection>

      <SettingsSection title="Account">
        <SettingsRow
          icon="link"
          label="Connected accounts"
          subtitle="Google, Apple and Facebook sign-in"
          href="/settings/security/connected"
        />
        <SettingsRow
          icon="settings"
          label="Account control"
          subtitle="Data export, deactivation and deletion"
          href="/settings/security/control"
        />
      </SettingsSection>

      {!isLive ? (
        <p className="px-4 pt-5 text-caption text-text-muted sm:px-5">
          Sessions and linked accounts come from this build’s account data;
          changes persist on this device. The platform revokes refresh tokens
          server-side — a signed-out session loses access on its next request.
        </p>
      ) : null}
    </>
  );
}
