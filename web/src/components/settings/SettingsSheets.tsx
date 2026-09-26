'use client';

/**
 * Settings detail sheets — the destination for settings rows whose
 * sub-screens don't exist as routes yet. Each sheet carries real fixture
 * data or honest local state; nothing is a dead end.
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Sheet } from '@/components/ui/Sheet';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { Switch } from './Switch';
import { useToast } from '@/components/ui/Toast';
import { useSession } from '@/lib/session/SessionProvider';

interface SheetProps {
  open: boolean;
  onClose: () => void;
}

// ── Shared bits ─────────────────────────────────────────────────────────────

function SheetRow({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 border-b border-border-subtle px-5 py-3.5 last:border-b-0">
      {children}
    </div>
  );
}

function SheetNote({ children }: { children: React.ReactNode }) {
  return <p className="px-5 pb-5 pt-3 text-caption text-text-muted">{children}</p>;
}

// ── Notifications ───────────────────────────────────────────────────────────

const NOTIFICATION_PREFS = [
  { key: 'messages', label: 'New messages', sub: 'Chat replies and offer messages' },
  { key: 'offers', label: 'Offers & price drops', sub: 'Counter-offers and items on your wishlist' },
  { key: 'orders', label: 'Order updates', sub: 'Purchases, sales and delivery' },
  { key: 'live', label: 'Live reminders', sub: 'Shows you follow going live' },
] as const;

export function NotificationsSheet({ open, onClose }: SheetProps) {
  const [prefs, setPrefs] = useState<Record<string, boolean>>({
    messages: true,
    offers: true,
    orders: true,
    live: false,
  });

  return (
    <Sheet open={open} onClose={onClose} title="Notifications" maxWidth={480}>
      <div>
        {NOTIFICATION_PREFS.map((p) => (
          <SheetRow key={p.key}>
            <div className="min-w-0 flex-1">
              <p className="text-body-emphasis text-text-primary">{p.label}</p>
              <p className="text-caption text-text-muted">{p.sub}</p>
            </div>
            <Switch
              checked={prefs[p.key]}
              onChange={(v) => setPrefs((s) => ({ ...s, [p.key]: v }))}
              aria-label={p.label}
            />
          </SheetRow>
        ))}
      </div>
      <SheetNote>Push and email preferences apply to every device signed in to your account.</SheetNote>
    </Sheet>
  );
}

// ── Language ────────────────────────────────────────────────────────────────

const LANGUAGES = [
  { code: 'en-GB', label: 'English (UK)' },
  { code: 'en-US', label: 'English (US)' },
  { code: 'fr', label: 'Français' },
  { code: 'de', label: 'Deutsch' },
  { code: 'es', label: 'Español' },
  { code: 'it', label: 'Italiano' },
];

export function LanguageSheet({
  open,
  onClose,
  value,
  onChange,
}: SheetProps & { value: string; onChange: (label: string) => void }) {
  return (
    <Sheet open={open} onClose={onClose} title="Language" maxWidth={480}>
      <ul role="radiogroup" aria-label="Language">
        {LANGUAGES.map((l) => {
          const selected = value === l.label;
          return (
            <li key={l.code}>
              <button
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => {
                  onChange(l.label);
                  onClose();
                }}
                className="pressable flex w-full items-center gap-3 border-b border-border-subtle px-5 py-3.5 text-left last:border-b-0"
              >
                <span className={`flex-1 text-body-emphasis ${selected ? 'font-medium text-text-primary' : 'text-text-secondary'}`}>
                  {l.label}
                </span>
                {selected ? <Icon name="check" size={18} className="text-text-primary" /> : null}
              </button>
            </li>
          );
        })}
      </ul>
      <SheetNote>More languages arrive as community translations are verified.</SheetNote>
    </Sheet>
  );
}

// ── Password ────────────────────────────────────────────────────────────────

export function PasswordSheet({ open, onClose }: SheetProps) {
  const { show } = useToast();
  return (
    <Sheet open={open} onClose={onClose} title="Password" maxWidth={440}>
      <div className="px-5 py-5">
        <p className="text-body text-text-secondary">
          For your security, password changes go through a signed email link — valid
          for 30 minutes, one use only.
        </p>
        <Button
          variant="primary"
          size="md"
          fullWidth
          className="mt-5"
          onClick={() => {
            onClose();
            show('Reset link sent to your email', 'success');
          }}
        >
          Send reset link
        </Button>
      </div>
    </Sheet>
  );
}

// ── Two-factor ──────────────────────────────────────────────────────────────

export function TwoFactorSheet({ open, onClose }: SheetProps) {
  const { show } = useToast();
  const [enabled, setEnabled] = useState(false);
  return (
    <Sheet open={open} onClose={onClose} title="Two-factor authentication" maxWidth={440}>
      <div className="px-5 py-5">
        <div className="flex items-start gap-3">
          <Icon name="shieldCheck" size={22} className={enabled ? 'mt-0.5 text-success-text' : 'mt-0.5 text-text-muted'} filled={enabled} />
          <div>
            <p className="text-body-emphasis font-medium text-text-primary">
              {enabled ? 'Two-factor is on' : 'Two-factor is off'}
            </p>
            <p className="mt-1 text-body text-text-secondary">
              {enabled
                ? 'Sign-ins require a code from your authenticator app.'
                : 'Add an authenticator code on sign-in — the strongest protection for your balance and listings.'}
            </p>
          </div>
        </div>
        <Button
          variant={enabled ? 'outline' : 'primary'}
          size="md"
          fullWidth
          className="mt-5"
          onClick={() => {
            const next = !enabled;
            setEnabled(next);
            show(next ? 'Two-factor authentication enabled' : 'Two-factor authentication disabled', next ? 'success' : 'info');
          }}
        >
          {enabled ? 'Turn off' : 'Set up authenticator'}
        </Button>
      </div>
    </Sheet>
  );
}

// ── Sessions ────────────────────────────────────────────────────────────────

const SESSIONS = [
  { id: 's1', icon: 'desktop' as const, device: 'This device — Chrome on Windows', meta: 'London · Active now', current: true },
  { id: 's2', icon: 'phone' as const, device: 'ThryftVerse app — iPhone 15', meta: 'London · 2 days ago', current: false },
];

export function SessionsSheet({ open, onClose }: SheetProps) {
  const { show } = useToast();
  return (
    <Sheet open={open} onClose={onClose} title="Sessions" maxWidth={480}>
      <ul>
        {SESSIONS.map((s) => (
          <li key={s.id} className="flex items-center gap-3 border-b border-border-subtle px-5 py-4 last:border-b-0">
            <Icon name={s.icon} size={20} className="text-text-secondary" />
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
                onClick={() => show('Session signed out', 'info')}
                className="pressable rounded-md px-2 py-1 text-caption font-semibold text-danger-text hover:bg-danger-subtle"
              >
                Sign out
              </button>
            )}
          </li>
        ))}
      </ul>
      <SheetNote>Signing out a session ends it everywhere — including remembered devices.</SheetNote>
    </Sheet>
  );
}

// ── Blocked users ───────────────────────────────────────────────────────────

export function BlockedSheet({ open, onClose }: SheetProps) {
  return (
    <Sheet open={open} onClose={onClose} title="Blocked users" maxWidth={440}>
      <div className="flex flex-col items-center px-5 py-10 text-center">
        <Icon name="ban" size={26} className="text-text-muted" />
        <p className="mt-3 text-body-emphasis font-medium text-text-primary">Nobody blocked</p>
        <p className="mt-1 max-w-xs text-body text-text-secondary">
          Blocked members can’t message you, follow you, or see your listings.
        </p>
      </div>
    </Sheet>
  );
}

// ── Verification ────────────────────────────────────────────────────────────

export function VerificationSheet({ open, onClose }: SheetProps) {
  const router = useRouter();
  const { verificationStatus } = useSession();

  // Real state from the session — the persisted KYC outcome wins, else the
  // account's existing verification.
  const identity = {
    approved: { state: 'Verified', tone: 'text-success-text', done: true },
    in_review: { state: 'In review', tone: 'text-warning-text', done: false },
    rejected: { state: 'Declined — try again', tone: 'text-danger-text', done: false },
    not_started: { state: 'Not started', tone: 'text-text-muted', done: false },
  }[verificationStatus];

  const rows = [
    { icon: 'mail' as const, label: 'Email', state: 'Verified', tone: 'text-success-text', done: true },
    { icon: 'profile' as const, label: 'Identity', ...identity },
    {
      icon: 'store' as const,
      label: 'Seller verification',
      state: 'Not started',
      tone: 'text-text-muted',
      done: false,
    },
  ];

  const cta =
    verificationStatus === 'in_review'
      ? 'Check status'
      : verificationStatus === 'approved'
        ? 'View verification'
        : verificationStatus === 'rejected'
          ? 'Try again'
          : 'Start verification';

  return (
    <Sheet open={open} onClose={onClose} title="Verification" maxWidth={440}>
      <ul>
        {rows.map((r) => (
          <li key={r.label} className="flex items-center gap-3 border-b border-border-subtle px-5 py-4 last:border-b-0">
            <Icon name={r.icon} size={20} className="text-text-secondary" />
            <div className="flex-1">
              <p className="text-body-emphasis font-medium text-text-primary">{r.label}</p>
              <p className={`text-caption ${r.tone}`}>{r.state}</p>
            </div>
            {r.done ? <Icon name="verified" size={18} className="text-success-text" filled /> : null}
          </li>
        ))}
      </ul>
      <div className="px-5 py-5">
        <Button
          variant="primary"
          size="md"
          icon="shieldCheck"
          fullWidth
          onClick={() => {
            onClose();
            router.push('/verification');
          }}
        >
          {cta}
        </Button>
      </div>
      <SheetNote>Verified sellers get the badge, higher listing limits and faster payouts.</SheetNote>
    </Sheet>
  );
}

// ── Report a problem ────────────────────────────────────────────────────────

export function ReportSheet({ open, onClose }: SheetProps) {
  const { show } = useToast();
  const [text, setText] = useState('');
  return (
    <Sheet open={open} onClose={onClose} title="Report a problem" maxWidth={480}>
      <div className="px-5 py-5">
        <label htmlFor="report-body" className="text-body text-text-secondary">
          What happened? Include the screen and what you expected.
        </label>
        <textarea
          id="report-body"
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={5}
          placeholder="Describe the problem…"
          className="mt-3 w-full resize-none rounded-lg border border-border bg-input p-3 text-body text-input-text placeholder:text-text-muted focus:border-text-muted focus:outline-none"
        />
        <Button
          variant="primary"
          size="md"
          fullWidth
          className="mt-4"
          disabled={text.trim().length < 10}
          onClick={() => {
            setText('');
            onClose();
            show('Report sent — thank you', 'success');
          }}
        >
          Send report
        </Button>
      </div>
    </Sheet>
  );
}
