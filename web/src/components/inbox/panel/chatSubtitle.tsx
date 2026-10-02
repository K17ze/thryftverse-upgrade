'use client';

import type { ReactNode } from 'react';
import type { Conversation } from '@/lib/contracts/domain';
import { DATA_MODE } from '@/lib/api/client';
import { ClientTime } from '@/components/ui/ClientTime';
import { timeAgo } from '@/lib/utils/format';

interface ComputeChatSubtitleOptions {
  isGroup: boolean;
  members: number;
  peerTyping: boolean;
  presence: { isOnline?: boolean; lastSeenAt?: string | null } | null;
  conversation?: Conversation | null;
  participant?: { lastSeen?: string | null } | null;
}

/**
 * Computes the truthful status subtitle for thread headers:
 * - Group member counts
 * - Counterparty typing status
 * - Live presence or relative last-seen timestamps without fabricated dots
 */
export function computeChatSubtitle({
  isGroup,
  members,
  peerTyping,
  presence,
  conversation,
  participant,
}: ComputeChatSubtitleOptions): ReactNode {
  if (isGroup) return `${members} ${members === 1 ? 'member' : 'members'}`;
  if (peerTyping) return 'typing…';
  if (DATA_MODE === 'live') {
    if (presence?.isOnline) return 'Active now';
    if (presence?.lastSeenAt) {
      return (
        <ClientTime
          iso={presence.lastSeenAt}
          format={(iso) => `Last active ${timeAgo(iso)}`}
        />
      );
    }
    return null;
  }
  if (conversation?.isOnline) return 'Active now';
  if (participant?.lastSeen) {
    return /^(now|just now)$/i.test(participant.lastSeen)
      ? 'Active now'
      : `Last seen ${participant.lastSeen}`;
  }
  return null;
}
