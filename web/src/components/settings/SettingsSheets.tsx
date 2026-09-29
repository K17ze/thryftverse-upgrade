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
import { useToast } from '@/components/ui/Toast';
import { useSession } from '@/lib/session/SessionProvider';
import { useSupportActions } from '@/components/support/useSupportTickets';
import { useLocale } from '@/lib/i18n/useLocale';
import { DATA_MODE } from '@/lib/api/client';
import {
  createSupportConversation,
  sendSupportConversationMessage,
} from '@/lib/api/services/support';

interface SheetProps {
  open: boolean;
  onClose: () => void;
}

// ── Shared bits ─────────────────────────────────────────────────────────────

function SheetNote({ children }: { children: React.ReactNode }) {
  return <p className="px-5 pb-5 pt-3 text-caption text-text-muted">{children}</p>;
}

// ── Language ────────────────────────────────────────────────────────────────

/** The i18n pipeline ships all 13 locales — navigation, common actions
 *  and state copy are translated; untranslated keys fall back to English
 *  (never blank). Screen-by-screen copy adoption is progressive — the
 *  note states that honestly. */
export function LanguageSheet({ open, onClose }: SheetProps) {
  const { locale, setLocale, locales } = useLocale();
  return (
    <Sheet open={open} onClose={onClose} title="Language" maxWidth={480}>
      <ul role="radiogroup" aria-label="Language">
        {locales.map((l) => {
          const selected = locale === l.code;
          return (
            <li key={l.code}>
              <button
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => {
                  setLocale(l.code);
                  onClose();
                }}
                className="pressable flex w-full items-center gap-3 border-b border-border-subtle px-5 py-3.5 text-left last:border-b-0"
              >
                <span className={`flex-1 text-body-emphasis ${selected ? 'font-medium text-text-primary' : 'text-text-secondary'}`}>
                  {l.label}
                </span>
                {l.dir === 'rtl' ? (
                  <span className="text-meta text-text-muted">RTL</span>
                ) : null}
                {selected ? (
                  <Icon name="check" size={18} className="text-text-primary" />
                ) : null}
              </button>
            </li>
          );
        })}
      </ul>
      <SheetNote>
        Navigation, common actions and state messages are translated — some
        screen copy is still being localised and shows English meanwhile.
      </SheetNote>
    </Sheet>
  );
}

// ── Verification ────────────────────────────────────────────────────────────

export function VerificationSheet({ open, onClose }: SheetProps) {
  const router = useRouter();
  const { user, isGuest, verificationStatus, verificationTier } = useSession();

  // Guests hold no account state — every row would be fabricated, so the
  // sheet degrades to the sign-in ask instead.
  if (isGuest || !user) {
    return (
      <Sheet open={open} onClose={onClose} title="Verification" maxWidth={440}>
        <div className="flex flex-col items-center px-5 py-8 text-center">
          <Icon name="shieldCheck" size={26} className="text-text-muted" />
          <p className="mt-3 text-body-emphasis font-medium text-text-primary">
            Sign in to verify
          </p>
          <p className="mt-1 max-w-xs text-body text-text-secondary">
            Verification is tied to your account — sign in to see your status.
          </p>
          <Button
            variant="primary"
            size="md"
            className="mt-5"
            onClick={() => {
              onClose();
              router.push('/auth');
            }}
          >
            Sign in
          </Button>
        </div>
      </Sheet>
    );
  }

  // Real state from the session — the persisted KYC outcome wins, else the
  // account's existing verification. Email derives from the account's
  // trust tier (every tier above 'none' implies a verified email); seller
  // verification comes from the same source.
  const identity = {
    approved: { state: 'Verified', tone: 'text-success-text', done: true },
    in_review: { state: 'In review', tone: 'text-warning-text', done: false },
    rejected: { state: 'Declined — try again', tone: 'text-danger-text', done: false },
    not_started: { state: 'Not started', tone: 'text-text-muted', done: false },
  }[verificationStatus];

  const email =
    verificationTier !== 'none'
      ? { state: 'Verified', tone: 'text-success-text', done: true }
      : { state: 'Not verified', tone: 'text-text-muted', done: false };
  const seller =
    verificationTier === 'seller'
      ? { state: 'Verified', tone: 'text-success-text', done: true }
      : { state: 'Not started', tone: 'text-text-muted', done: false };

  const rows = [
    { icon: 'mail' as const, label: 'Email', ...email },
    { icon: 'profile' as const, label: 'Identity', ...identity },
    { icon: 'store' as const, label: 'Seller verification', ...seller },
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
// A support case, not a moderation report: live mode rides the unbound
// support-conversation channel (POST /support/conversations + the notice as
// first message) — /support/tickets only accepts order-bound creates, so an
// unbound write would 4xx. Fixture mode keeps the session-ticket path.

export function ReportSheet({ open, onClose }: SheetProps) {
  const { show } = useToast();
  const router = useRouter();
  const { createTicket } = useSupportActions();
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
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
          disabled={text.trim().length < 10 || sending}
          onClick={() => {
            const message = text.trim();
            if (message.length < 10 || sending) return;
            setSending(true);
            void (async () => {
              if (DATA_MODE === 'live') {
                const conversation = await createSupportConversation({
                  contextKind: 'general',
                });
                await sendSupportConversationMessage(conversation.id, message);
                setText('');
                onClose();
                show('Report sent — thank you', 'success');
                return;
              }
              const ticket = await createTicket({
                topicId: 'other',
                orderRef: null,
                message,
              });
              setText('');
              onClose();
              show('Report sent — thank you', 'success');
              router.push(`/support/${ticket.id}`);
            })().catch(() => {
              setSending(false);
              show('Could not send the report — try again.', 'error');
            });
          }}
        >
          {sending ? 'Sending…' : 'Send report'}
        </Button>
      </div>
    </Sheet>
  );
}
