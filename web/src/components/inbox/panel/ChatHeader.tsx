'use client';

/**
 * ChatHeader — presence / group identity header bar.
 * Renders avatar mosaic for groups, online dot for DMs, verified badges,
 * presence / participant subtitles, search toggle, and deep link to info.
 */

import Link from 'next/link';
import { Avatar } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import { IconButton } from '@/components/ui/IconButton';
import { GroupAvatarMosaic } from '../GroupAvatarMosaic';
import { mosaicMembers } from '../inboxModel';
import type { Conversation } from '@/lib/contracts/domain';

interface ChatHeaderProps {
  conversationId: string;
  title: string;
  subtitle: string | null;
  isGroup: boolean;
  conversation: Conversation;
  viewerId: string;
  isPeerOnline: boolean;
  searchOpen: boolean;
  onToggleSearch: () => void;
  onBack: () => void;
  onInfo: () => void;
}

export function ChatHeader({
  conversationId,
  title,
  subtitle,
  isGroup,
  conversation,
  viewerId,
  isPeerOnline,
  searchOpen,
  onToggleSearch,
  onBack,
  onInfo,
}: ChatHeaderProps) {
  return (
    <header className="flex shrink-0 items-center gap-2 border-b border-border-subtle px-2 py-2 md:px-3">
      <IconButton
        name="back"
        aria-label="Back to inbox"
        className="md:hidden"
        onClick={onBack}
      />

      {/* Header identity — tapping opens the info surface, matching the
          mobile header → conversation-info navigation. */}
      <Link
        href={`/inbox/${conversationId}/info`}
        aria-label={`${isGroup ? 'Group' : 'Chat'} details — ${title}`}
        className="pressable -my-1 flex min-w-0 flex-1 items-center gap-2 py-1"
      >
        <span className="relative shrink-0">
          {isGroup ? (
            <GroupAvatarMosaic
              members={mosaicMembers(conversation, viewerId)}
              size={40}
              groupPhoto={conversation.avatar}
              fallbackName={title}
              groupId={conversation.id}
            />
          ) : (
            <>
              <Avatar
                src={conversation.participantAvatar}
                name={title}
                size={40}
              />
              {isPeerOnline ? (
                <span
                  className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-success-text ring-2 ring-background"
                  aria-label="Online"
                />
              ) : null}
            </>
          )}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1">
            <h1 className="clamp-1 text-body-emphasis font-semibold text-text-primary">
              {title}
            </h1>
            {!isGroup && conversation.participantVerified ? (
              <Icon
                name="verified"
                filled
                size={14}
                className="shrink-0 text-commerce-trust"
              />
            ) : null}
          </div>
          {subtitle ? (
            <p className="text-meta text-text-muted">{subtitle}</p>
          ) : null}
        </div>
      </Link>

      <IconButton
        name="search"
        aria-label={searchOpen ? 'Close search' : 'Search in conversation'}
        aria-pressed={searchOpen}
        onClick={onToggleSearch}
      />
      <IconButton
        name="more"
        aria-label={isGroup ? 'Group info' : 'Conversation info'}
        onClick={onInfo}
      />
    </header>
  );
}
