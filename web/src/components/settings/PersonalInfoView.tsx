'use client';

/**
 * PersonalInfoView — /settings/personal. The Airbnb "Personal info"
 * pillar: the private account rows (email, phone, date of birth) rendered
 * from real session data — never fabricated.
 *
 * - Email is display-only with its verification status (mobile parity:
 *   EditProfileScreen renders email read-only — changes go through
 *   re-verification, which has no flow here).
 * - Phone is the one honest edit affordance: masked on the row, edited in
 *   a sheet that PATCHes /users/me live or writes the on-device overlay
 *   in the fixture preview.
 * - Date of birth has no standalone field in the contract — it's captured
 *   during identity verification, so the row says so and routes there.
 */

import { useState } from 'react';
import { SettingsSection } from './SettingsSection';
import { SettingsRow } from './SettingsRow';
import { useAccountContact } from './useAccountContact';
import { useSession } from '@/lib/session/SessionProvider';
import { Sheet } from '@/components/ui/Sheet';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { useToast } from '@/components/ui/Toast';
import { DATA_MODE } from '@/lib/api/client';
import { useRouter } from 'next/navigation';

/** Phone renders masked on the row — last two digits only. */
function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length <= 2) return '••••';
  return `••• •• ${digits.slice(-2)}`;
}

/** Lenient international-pattern check — the server is the authority,
 *  this just refuses obvious non-numbers. */
const PHONE_RE = /^\+?[0-9][0-9 ().-]{5,19}$/;

export function PersonalInfoView() {
  const router = useRouter();
  const { isGuest, verificationTier } = useSession();
  const { contact, loading, savePhone } = useAccountContact();
  const { show } = useToast();
  const [phoneSheet, setPhoneSheet] = useState(false);
  const [phoneDraft, setPhoneDraft] = useState('');
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  if (loading) {
    return (
      <div aria-busy aria-label="Loading personal info" className="mt-2 space-y-px">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-[52px] w-full rounded-none" />
        ))}
      </div>
    );
  }

  if (isGuest || !contact) {
    return (
      <div className="mt-4">
        <EmptyState
          icon="profile"
          title="Sign in to see your details"
          subtitle="Your email, phone and verification details live on your account."
          actionLabel="Sign in"
          onAction={() => router.push('/auth')}
          compact
        />
      </div>
    );
  }

  const openPhoneSheet = () => {
    setPhoneDraft(contact.phone ?? '');
    setPhoneError(null);
    setPhoneSheet(true);
  };

  const submitPhone = async () => {
    const next = phoneDraft.trim();
    if (next && !PHONE_RE.test(next)) {
      setPhoneError('Enter a valid phone number, e.g. +44 7700 900123');
      return;
    }
    setSaving(true);
    try {
      await savePhone(next || null);
      setPhoneSheet(false);
      show(next ? 'Phone number updated' : 'Phone number removed', 'success');
    } catch {
      setPhoneError('Could not save — check your connection and try again.');
    } finally {
      setSaving(false);
    }
  };

  const dobConfirmed = verificationTier !== 'none';

  return (
    <>
      <SettingsSection title="Contact">
        <SettingsRow
          icon="mail"
          label="Email"
          subtitle={
            contact.email
              ? contact.emailVerified
                ? 'Verified'
                : 'Not verified'
              : 'Ask support to add one to your account'
          }
          value={contact.email ?? 'Not added'}
          // Email changes require re-verification — display-only by design
          // (same as mobile Edit Profile's private details).
          trailing={<span />}
        />
        <SettingsRow
          icon="phone"
          label="Phone"
          subtitle="Used for delivery issues — masked here"
          value={contact.phone ? maskPhone(contact.phone) : 'Not added'}
          onClick={openPhoneSheet}
        />
      </SettingsSection>

      <SettingsSection title="Identity">
        <SettingsRow
          icon="fingerprint"
          label="Date of birth"
          subtitle={
            dobConfirmed
              ? 'Confirmed during identity verification'
              : 'Confirmed when you verify your identity'
          }
          value={dobConfirmed ? 'Confirmed' : undefined}
          href="/verification"
        />
      </SettingsSection>

      <p className="px-4 pt-5 text-caption text-text-muted sm:px-5">
        {DATA_MODE === 'live'
          ? 'Email changes require re-verification — contact support to update it. Your number is never shown to other members.'
          : 'This preview stores contact edits on this device. In the live app your number syncs to your account and is never shown to other members.'}
      </p>

      <Sheet
        open={phoneSheet}
        onClose={() => setPhoneSheet(false)}
        title="Phone number"
        maxWidth={440}
      >
        <div className="px-5 pb-6 pt-1">
          <label
            htmlFor="personal-phone"
            className="mb-1.5 block text-caption font-medium text-text-secondary"
          >
            Phone number
          </label>
          <input
            id="personal-phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="+44 7700 900123"
            value={phoneDraft}
            aria-invalid={!!phoneError}
            aria-describedby={phoneError ? 'personal-phone-error' : undefined}
            onChange={(e) => {
              setPhoneDraft(e.target.value);
              setPhoneError(null);
            }}
            className={`h-11 w-full rounded-md border bg-input px-3.5 text-body text-input-text placeholder:text-text-muted focus:border-text-muted focus:outline-none ${
              phoneError ? 'border-danger-border' : 'border-border'
            }`}
          />
          {phoneError ? (
            <p id="personal-phone-error" role="alert" className="mt-1.5 text-caption text-danger-text">
              {phoneError}
            </p>
          ) : null}
          <p className="mt-2 text-caption text-text-muted">
            Leave empty to remove the number from your account.
          </p>
          <Button
            variant="primary"
            size="md"
            fullWidth
            className="mt-5"
            disabled={saving}
            onClick={() => void submitPhone()}
          >
            {saving ? 'Saving' : 'Save'}
          </Button>
        </div>
      </Sheet>
    </>
  );
}
