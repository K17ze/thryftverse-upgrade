'use client';

/**
 * OrderSupportSection — the "Need help?" block, ported from the mobile
 * surface and extended to eBay's purchase-summary grammar: message the
 * counterparty (real /inbox route), report a problem (real support-ticket
 * flow), and the open ticket for this order when one exists. Flat rows on
 * the canvas — the screen owns the separators.
 */

import { Icon } from '@/components/ui/Icon';

interface OpenTicket {
  id: string;
  topicLabel: string;
}

interface Props {
  openTicket: OpenTicket | null | undefined;
  onPressOpenTicket: (ticketId: string) => void;
  /** Contact the counterparty — wired to /inbox upstream. */
  onContact: () => void;
  /** "Contact seller" / "Contact buyer" per role. */
  contactLabel: string;
  /** Opens the issue-report flow (creates a real support ticket). */
  onPressGetSupport: () => void;
}

function HelpRow({
  icon,
  label,
  detail,
  onPress,
}: {
  icon: Parameters<typeof Icon>[0]['name'];
  label: string;
  detail?: string;
  onPress: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onPress}
      className="pressable flex min-h-11 w-full items-center gap-3 py-2 text-left"
    >
      <Icon name={icon} size={20} className="shrink-0 text-text-secondary" />
      <span className="min-w-0 flex-1">
        <span className="block text-body-emphasis font-medium text-text-primary">{label}</span>
        {detail ? (
          <span className="mt-0.5 block text-caption text-text-muted">{detail}</span>
        ) : null}
      </span>
      <Icon name="forward" size={16} className="shrink-0 text-text-muted" />
    </button>
  );
}

export function OrderSupportSection({
  openTicket,
  onPressOpenTicket,
  onContact,
  contactLabel,
  onPressGetSupport,
}: Props) {
  return (
    <div>
      <h2 className="mb-1 text-body-emphasis font-semibold text-text-primary">Need help?</h2>
      {openTicket ? (
        <HelpRow
          icon="help"
          label="Support request open"
          detail={openTicket.topicLabel}
          onPress={() => onPressOpenTicket(openTicket.id)}
        />
      ) : null}
      <HelpRow icon="chat" label={contactLabel} detail="Ask about this order in your messages" onPress={onContact} />
      <HelpRow
        icon="flag"
        label="Report a problem"
        detail="Opens a support request with our team"
        onPress={onPressGetSupport}
      />
    </div>
  );
}
