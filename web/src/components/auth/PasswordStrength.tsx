'use client';

/**
 * PasswordStrength — live feedback under a new-password field. Same
 * pattern as settings/security: four requirement checks score into
 * weak/fair/good/strong over a segmented bar. Renders nothing until
 * the field has input.
 */

import { Icon } from '@/components/ui/Icon';

type Strength = 'weak' | 'fair' | 'good' | 'strong';

const REQUIREMENTS: { label: string; test: (pw: string) => boolean }[] = [
  { label: 'At least 8 characters', test: (pw) => pw.length >= 8 },
  { label: 'Uppercase letter', test: (pw) => /[A-Z]/.test(pw) },
  { label: 'Number', test: (pw) => /[0-9]/.test(pw) },
  { label: 'Special character', test: (pw) => /[^A-Za-z0-9]/.test(pw) },
];

export function computeStrength(pw: string): Strength {
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

const SEGMENTS: Strength[] = ['weak', 'fair', 'good', 'strong'];

export function PasswordStrength({ password }: { password: string }) {
  if (!password) return null;
  const strength = computeStrength(password);
  const activeIndex = SEGMENTS.indexOf(strength);
  return (
    <div className="mt-2">
      <div className="flex items-center gap-3">
        <div className="flex flex-1 gap-1.5" aria-hidden>
          {SEGMENTS.map((seg, i) => (
            <span
              key={seg}
              className={`h-1 flex-1 rounded-full transition-colors ${
                i <= activeIndex ? STRENGTH_TONE[strength] : 'bg-surface-raised'
              }`}
            />
          ))}
        </div>
        <span className="w-12 text-right text-micro font-semibold text-text-muted">
          {STRENGTH_LABEL[strength]}
        </span>
      </div>
      <ul className="mt-2.5 space-y-1.5" aria-live="polite">
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
