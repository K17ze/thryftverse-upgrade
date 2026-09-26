'use client';

/**
 * OrderAuthenticationSection — port of the mobile section. Flat row on the
 * canvas (the screen owns separators), one icon + label + single honest
 * detail line. No fabricated review timeline — the backend exposes no SLA.
 */

import type { OrderAuthentication } from '@/lib/contracts/domain';
import { Icon } from '@/components/ui/Icon';
import { orderAuthenticationPresentation, type AuthenticationTone } from './orderAuthenticationPresentation';

const TONE_CLASS: Record<AuthenticationTone, string> = {
  muted: 'text-text-muted',
  info: 'text-commerce-trust',
  success: 'text-success-text',
  danger: 'text-danger-text',
};

interface Props {
  /** Live pipeline state. Null when unresolved — the durable flag still
   *  renders the honest "requested" state. */
  authentication: OrderAuthentication | null;
  /** orders.verification_requested — the durable signal. */
  verificationRequested: boolean;
}

export function OrderAuthenticationSection({ authentication, verificationRequested }: Props) {
  const presentation = orderAuthenticationPresentation(authentication, verificationRequested);
  if (!presentation) return null;

  return (
    <div className="flex items-center gap-3 py-1">
      <Icon name={presentation.icon} size={22} className={TONE_CLASS[presentation.tone]} />
      <div className="min-w-0 flex-1">
        <p className="text-body-emphasis font-medium text-text-primary">{presentation.label}</p>
        <p className="mt-0.5 text-caption text-text-muted">{presentation.detail}</p>
      </div>
    </div>
  );
}
