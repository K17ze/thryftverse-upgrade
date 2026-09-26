'use client';

/**
 * SecurityView — the /settings/security surface.
 *
 * Web deepening of the mobile ChangePasswordScreen, ActiveSessionsScreen
 * and the 2FA row on AccountSecurityScreen:
 * - Change-password form with the mobile PasswordStrengthBar scoring
 *   (4 requirements → weak/fair/good/strong).
 * - Active sessions: current device plus remembered sessions, revocable.
 * - Two-factor switch: enabling opens an honest demo-flow sheet — in this
 *   preview there is no authenticator handshake, so the sheet says so and
 *   enables the flag explicitly as a demo.
 */

import { useState } from 'react';
import { SettingsSection } from './SettingsSection';
import { Switch } from './Switch';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { Sheet } from '@/components/ui/Sheet';
import { AuthField } from '@/components/auth/AuthField';
import { useToast } from '@/components/ui/Toast';
import { useSettingsPrefs } from '@/lib/store/settingsPrefs';

// ── Password strength (ported from mobile PasswordStrengthBar) ──────────────

type Strength = 'weak' | 'fair' | 'good' | 'strong';

const REQUIREMENTS: { label: string; test: (pw: string) => boolean }[] = [
  { label: 'At least 8 characters', test: (pw) => pw.length >= 8 },
  { label: 'Uppercase letter', test: (pw) => /[A-Z]/.test(pw) },
  { label: 'Number', test: (pw) => /[0-9]/.test(pw) },
  { label: 'Special character', test: (pw) => /[^A-Za-z0-9]/.test(pw) },
];

function computeStrength(pw: string): Strength {
  if (!pw || pw.length < 6) return 'weak';
  const score = REQUIREMENTS.filter((r) => r.test(pw)).length;
  if (score <= 1) return 'weak';
  if (score === 2) return 'fair';
  if (score === 3) return 'good';
  return 'strong';
}

const STRENGTH_LABEL: Record<Strength, string> = {
  weak: 'Weak',
  fair: 'Fair',
  good: 'Good',
  strong: 'Strong',
};

const STRENGTH_TONE: Record<Strength, string> = {
  weak: 'bg-danger-text',
  fair: 'bg-warning-text',
  good: 'bg-success-text',
  strong: 'bg-success-text',
};

function PasswordStrength({ password }: { password: string }) {
  if (!password) return null;
  const strength = computeStrength(password);
  const segments: Strength[] = ['weak', 'fair', 'good', 'strong'];
  const activeIndex = segments.indexOf(strength);
  return (
    <div className="mt-2">
      <div className="flex items-center gap-3">
        <div className="flex flex-1 gap-1.5">
          {segments.map((seg, i) => (
            <span
              key={seg}
              className={`h-1 flex-1 rounded-full ${i <= activeIndex ? STRENGTH_TONE[strength] : 'bg-border'}`}
            />
          ))}
        </div>
        <span className="w-12 text-right text-meta text-text-muted">
          {STRENGTH_LABEL[strength]}
        </span>
      </div>
      <ul className="mt-2.5 space-y-1.5">
        {REQUIREMENTS.map((req) => {
          const met = req.test(password);
          return (
            <li key={req.label} className="flex items-center gap-2">
              <Icon
                name="check"
                size={14}
                className={met ? 'text-success-text' : 'text-text-muted'}
              />
              <span className={`text-caption ${met ? 'text-text-primary' : 'text-text-muted'}`}>
                {req.label}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ── Change password ─────────────────────────────────────────────────────────

function ChangePasswordForm() {
  const { show } = useToast();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [done, setDone] = useState(false);

  const mismatch = confirm.length > 0 && next !== confirm;
  const valid =
    current.length > 0 && next.length >= 8 && next === confirm && !mismatch;

  const submit = () => {
    setDone(true);
    setCurrent('');
    setNext('');
    setConfirm('');
    show('Password updated — in this preview nothing is sent to a server', 'success');
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
        disabled={!valid}
        onClick={submit}
      >
        Update password
      </Button>
      {done ? (
        <p className="mt-3 text-caption text-text-muted">
          Password changed for this session. A production build re-verifies the
          current password and rotates the credential server-side.
        </p>
      ) : null}
    </div>
  );
}

// ── Sessions ────────────────────────────────────────────────────────────────

interface SessionEntry {
  id: string;
  icon: 'desktop' | 'phone';
  device: string;
  meta: string;
  current: boolean;
}

const INITIAL_SESSIONS: SessionEntry[] = [
  {
    id: 's1',
    icon: 'desktop',
    device: 'This device — Chrome on Windows',
    meta: 'London · Active now',
    current: true,
  },
  {
    id: 's2',
    icon: 'phone',
    device: 'ThryftVerse app — iPhone 15',
    meta: 'London · 2 days ago',
    current: false,
  },
  {
    id: 's3',
    icon: 'desktop',
    device: 'Safari — MacBook Air',
    meta: 'Manchester · Last week',
    current: false,
  },
];

function Sessions() {
  const { show } = useToast();
  const [sessions, setSessions] = useState<SessionEntry[]>(INITIAL_SESSIONS);
  const others = sessions.filter((s) => !s.current);

  const revoke = (id: string) => {
    setSessions((s) => s.filter((x) => x.id !== id));
    show('Session signed out', 'info');
  };

  return (
    <>
      <ul className="divide-y divide-border-subtle">
        {sessions.map((s) => (
          <li key={s.id} className="flex items-center gap-3 px-4 py-3.5 sm:px-5">
            <Icon name={s.icon} size={20} className="shrink-0 text-text-secondary" />
            <div className="min-w-0 flex-1">
              <p className="clamp-1 text-body-emphasis font-medium text-text-primary">{s.device}</p>
              <p className="text-caption text-text-muted">{s.meta}</p>
            </div>
            {s.current ? (
              <span className="rounded-full bg-success-subtle px-2 py-0.5 text-meta font-semibold text-success-text">
                Current
              </span>
            ) : (
              <button
                type="button"
                onClick={() => revoke(s.id)}
                className="pressable rounded-md px-2 py-1 text-caption font-semibold text-danger-text hover:bg-danger-subtle"
              >
                Sign out
              </button>
            )}
          </li>
        ))}
      </ul>
      {others.length > 0 ? (
        <div className="px-4 py-3 sm:px-5">
          <button
            type="button"
            onClick={() => {
              setSessions((s) => s.filter((x) => x.current));
              show('All other sessions signed out', 'info');
            }}
            className="pressable text-caption font-semibold text-danger-text"
          >
            Sign out all other sessions
          </button>
        </div>
      ) : null}
    </>
  );
}

// ── Two-factor ──────────────────────────────────────────────────────────────

function TwoFactorRow() {
  const { show } = useToast();
  const enabled = useSettingsPrefs((s) => s.twoFactorEnabled);
  const setEnabled = useSettingsPrefs((s) => s.setTwoFactorEnabled);
  const [sheetOpen, setSheetOpen] = useState(false);

  return (
    <>
      <div className="flex min-h-[52px] items-center gap-3 px-4 py-2.5 sm:px-5">
        <Icon
          name="shieldCheck"
          size={20}
          filled={enabled}
          className={enabled ? 'shrink-0 text-success-text' : 'shrink-0 text-text-secondary'}
        />
        <div className="min-w-0 flex-1">
          <p className="text-body-emphasis text-text-primary">Two-factor authentication</p>
          <p className="text-caption text-text-muted">
            {enabled ? 'On — sign-ins ask for an authenticator code' : 'Add a code step to sign-in'}
          </p>
        </div>
        <Switch
          checked={enabled}
          onChange={(v) => {
            if (v) {
              setSheetOpen(true);
            } else {
              setEnabled(false);
              show('Two-factor authentication disabled', 'info');
            }
          }}
          aria-label="Two-factor authentication"
        />
      </div>

      <Sheet open={sheetOpen} onClose={() => setSheetOpen(false)} title="Set up two-factor" maxWidth={440}>
        <div className="px-5 py-5">
          <div className="flex items-start gap-3">
            <Icon name="shieldCheck" size={22} className="mt-0.5 text-text-secondary" />
            <p className="text-body text-text-secondary">
              In a production build this step shows a QR code for your
              authenticator app and verifies a 6-digit code. This preview has no
              authenticator handshake — enabling here only sets the preference
              on this device.
            </p>
          </div>
          <Button
            variant="primary"
            size="md"
            fullWidth
            className="mt-5"
            onClick={() => {
              setEnabled(true);
              setSheetOpen(false);
              show('Two-factor enabled (demo)', 'success');
            }}
          >
            Enable two-factor (demo)
          </Button>
          <Button
            variant="quiet"
            size="md"
            fullWidth
            className="mt-2"
            onClick={() => setSheetOpen(false)}
          >
            Not now
          </Button>
        </div>
      </Sheet>
    </>
  );
}

// ── View ────────────────────────────────────────────────────────────────────

export function SecurityView() {
  return (
    <>
      <SettingsSection title="Password">
        <ChangePasswordForm />
      </SettingsSection>

      <SettingsSection title="Sign-in protection">
        <TwoFactorRow />
      </SettingsSection>

      <SettingsSection title="Sessions">
        <Sessions />
      </SettingsSection>

      <p className="px-4 pt-5 text-caption text-text-muted sm:px-5">
        Session devices come from this preview’s fixture data. The platform
        revokes refresh tokens server-side — a signed-out session loses access
        on its next request.
      </p>
    </>
  );
}
