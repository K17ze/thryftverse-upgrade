'use client';

import { useRouter } from 'next/navigation';
import type { Conversation } from '@/lib/contracts/domain';
import { Avatar } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import { formatPrice } from '@/lib/utils/format';
import { InfoRow, InfoSection } from '../InfoSection';
import { QuickActions, type QuickAction } from '../QuickActions';
import { SharedMediaGrid, type SharedMediaItem } from '../SharedMediaGrid';

interface DmInfoSectionProps {
  conversation: Conversation;
  counterpartyId?: string;
  counterpartyName: string;
  counterpartyUsername: string;
  blocked: boolean;
  muted: boolean;
  archived: boolean;
  mediaAnchor: React.RefObject<HTMLDivElement | null>;
  mediaItems: SharedMediaItem[];
  sharedSection: React.ReactNode;
  muteAction: QuickAction;
  onToggleBlock: () => void;
  onReportUser: () => void;
  onRemoveFromInbox: () => void;
  onToggleMute: () => void;
  onToggleArchive: () => void;
  onRemoveMediaItems: (items: SharedMediaItem[]) => void;
  onScrollToMedia: () => void;
}

export function DmInfoSection({
  conversation,
  counterpartyId,
  counterpartyName,
  counterpartyUsername,
  blocked,
  muted,
  archived,
  mediaAnchor,
  mediaItems,
  sharedSection,
  muteAction,
  onToggleBlock,
  onReportUser,
  onRemoveFromInbox,
  onToggleMute,
  onToggleArchive,
  onRemoveMediaItems,
  onScrollToMedia,
}: DmInfoSectionProps) {
  const router = useRouter();
  const mediaCount = mediaItems.length;

  return (
    <>
      {/* DM hero — avatar, name, presence; handle only when it adds
          information the name doesn't already carry. */}
      <div className="flex flex-col items-center gap-1 px-4 pt-7">
        <div className="relative">
          <Avatar src={conversation.participantAvatar} name={counterpartyName} size={96} />
          {conversation.isOnline ? (
            <span
              className="absolute bottom-1 right-1 h-4 w-4 rounded-full bg-success-text ring-[3px] ring-background"
              aria-label="Online"
            />
          ) : null}
        </div>
        <div className="mt-2 flex max-w-full items-center gap-1.5">
          <h1 className="clamp-1 text-screen-title text-text-primary">
            {counterpartyName}
          </h1>
          {conversation.participantVerified ? (
            <Icon name="verified" filled size={16} className="shrink-0 text-commerce-trust" />
          ) : null}
        </div>
        {counterpartyUsername && counterpartyUsername !== counterpartyName ? (
          <p className="text-body font-medium text-text-secondary">
            @{counterpartyUsername}
          </p>
        ) : null}
        {conversation.isOnline ? (
          <p className="text-meta text-text-muted">Active now</p>
        ) : null}
      </div>

      <QuickActions
        actions={[
          {
            key: 'profile',
            label: 'Profile',
            icon: 'profile',
            onPress: () =>
              counterpartyUsername
                ? router.push(`/u/${counterpartyUsername}`)
                : undefined,
            disabled: !counterpartyUsername,
          },
          {
            key: 'media',
            label: 'Media',
            icon: 'image',
            onPress: onScrollToMedia,
          },
          muteAction,
        ]}
      />

      <div ref={mediaAnchor} className="scroll-mt-4">
        {sharedSection}
        {mediaCount > 0 ? (
          <div className="pt-3">
            <SharedMediaGrid
              items={mediaItems}
              onDeleteItems={onRemoveMediaItems}
            />
          </div>
        ) : null}
      </div>

      {conversation.listing ? (
        <InfoSection title="Marketplace">
          <InfoRow
            icon="bag"
            label={conversation.listing.title}
            subtitle={conversation.listing.isSold ? 'Sold' : undefined}
            detail={formatPrice(conversation.listing.price)}
            href={`/item/${conversation.listing.id}`}
          />
        </InfoSection>
      ) : null}

      <InfoSection title="Conversation">
        <InfoRow
          icon="notifications"
          label="Notifications"
          detail={muted ? 'Muted' : 'All'}
          onPress={onToggleMute}
        />
        <InfoRow
          icon={archived ? 'mail' : 'folder'}
          label={archived ? 'Unarchive conversation' : 'Archive conversation'}
          onPress={onToggleArchive}
        />
      </InfoSection>

      <InfoSection title="Privacy and safety">
        <InfoRow
          icon="ban"
          tone="danger"
          label={blocked ? `Unblock ${counterpartyName}` : `Block ${counterpartyName}`}
          onPress={onToggleBlock}
          showChevron={false}
          disabled={!counterpartyId}
        />
        <InfoRow
          icon="flag"
          tone="danger"
          label={`Report ${counterpartyName}`}
          onPress={onReportUser}
          disabled={!counterpartyId}
        />
        <InfoRow
          icon="trash"
          tone="danger"
          label="Remove from inbox"
          onPress={onRemoveFromInbox}
          showChevron={false}
        />
      </InfoSection>
    </>
  );
}
