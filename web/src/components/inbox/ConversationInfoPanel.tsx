'use client';

/**
 * ConversationInfoPanel — the /inbox/[id]/info surface. Port of the mobile
 * ConversationInfoScreen / GroupChatInfoScreen: an identity hero, quick
 * actions, the shared-media grid, the member directory with role badges,
 * the permissions rows, and the separated destructive zone — flat canvas,
 * inset hairlines, no cards.
 *
 * Authority is honest throughout: role badges render only where the data
 * carries roles (live memberRoles, session overrides, or the fixture
 * creator provenance), management affordances sit behind the derived
 * capabilities, and mutation failures surface as error toasts rather than
 * optimistic claims. DMs get the member hero, marketplace context, and the
 * report/block rung the safety store supports.
 */

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { User } from '@/lib/contracts/domain';
import { useConversation, useCreateConversation } from '@/lib/hooks/queries';
import { useSession } from '@/lib/session/SessionProvider';
import { useHydrated } from '@/lib/store/useStore';
import { useInboxPrefs } from '@/lib/store/inboxPrefs';
import { formatDate, formatPrice } from '@/lib/utils/format';
import { Avatar } from '@/components/ui/Avatar';
import { EmptyState } from '@/components/ui/EmptyState';
import { Icon } from '@/components/ui/Icon';
import { IconButton } from '@/components/ui/IconButton';
import { Skeleton } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';
import { ReportSheet } from '@/components/report';
import { AddMembersSheet } from './AddMembersSheet';
import { CLOSED_CONFIRM, ConfirmSheet, type ConfirmSheetState } from './ConfirmSheet';
import { EditGroupSheet } from './EditGroupSheet';
import { GroupInfoHero } from './GroupInfoHero';
import { InfoRow, InfoSection } from './InfoSection';
import { MemberActionsSheet, type MemberActionsTarget } from './MemberActionsSheet';
import { MemberDirectory } from './MemberDirectory';
import { PermissionsSection } from './PermissionsSection';
import { QuickActions, type QuickAction } from './QuickActions';
import { ReportGroupSheet } from './ReportGroupSheet';
import { SharedMediaGrid, useSharedMedia } from './SharedMediaGrid';
import {
  conversationCreatedAt,
  memberRolesFor,
  useGroupAdminStore,
  viewerRole,
  type EditablePermission,
  type GroupPermissionScope,
} from './groupAdmin';
import { useConversationAdmin, useGroupCapabilities } from './useConversationAdmin';
import { useInboxSafety } from './inboxSafety';
import { conversationTitle, isGroupConversation, memberCount } from './inboxModel';

const LINK_RE = /https?:\/\//i;

export function ConversationInfoPanel({ conversationId }: { conversationId: string }) {
  const router = useRouter();
  const toast = useToast();
  const { user, isGuest } = useSession();
  const hydrated = useHydrated();
  const viewerId = user?.id ?? 'me';

  const { data: conversation, isLoading } = useConversation(conversationId);
  const isGroup = conversation ? isGroupConversation(conversation) : false;

  // Persisted local prefs — gate reads behind hydration (SSR-safe rule).
  const mutedIds = useInboxPrefs((s) => s.mutedIds);
  const archivedIds = useInboxPrefs((s) => s.archivedIds);
  const toggleMute = useInboxPrefs((s) => s.toggleMute);
  const toggleArchive = useInboxPrefs((s) => s.toggleArchive);
  const muted = hydrated && mutedIds.includes(conversationId);
  const archived = hydrated && archivedIds.includes(conversationId);

  const blockedUserIds = useInboxSafety((s) => s.blockedUserIds);
  const toggleBlocked = useInboxSafety((s) => s.toggleBlocked);

  const admin = useConversationAdmin(conversation);
  const { settings, capabilities, setPermission, settingsFailed } =
    useGroupCapabilities(conversation, viewerId);
  const roleOverrides = useGroupAdminStore((s) =>
    conversation ? s.roleOverrides[conversation.id] : undefined,
  );
  const role = conversation ? viewerRole(conversation, viewerId, roleOverrides) : undefined;
  const memberRoles = conversation ? memberRolesFor(conversation, viewerId, roleOverrides) : undefined;

  // DM counterparty — participantProfiles wins, legacy participant* fields
  // are the fixture fallback (fixture DMs carry no profiles array).
  const counterpartyProfile =
    conversation && !isGroup
      ? (conversation.participantProfiles ?? []).find((p) => p.id !== viewerId)
      : undefined;
  const counterpartyId =
    counterpartyProfile?.id ?? (!isGroup ? conversation?.participantId : undefined);
  const counterpartyName =
    counterpartyProfile?.displayName ??
    counterpartyProfile?.username ??
    conversation?.participantName ??
    'Member';
  const counterpartyUsername =
    counterpartyProfile?.username ?? conversation?.participantName ?? '';
  const blocked = hydrated && !!counterpartyId && blockedUserIds.includes(counterpartyId);

  const mediaItems = useSharedMedia(conversation);
  const messages = conversation?.messages ?? [];
  const mediaCount = mediaItems.length;
  const linkCount = messages.filter((m) => m.text && LINK_RE.test(m.text)).length;
  const offerCount = messages.filter((m) => m.type === 'offer' || m.offerPrice != null).length;

  const [editOpen, setEditOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [memberTarget, setMemberTarget] = useState<MemberActionsTarget | null>(null);
  const [confirm, setConfirm] = useState<ConfirmSheetState>(CLOSED_CONFIRM);
  const [userReportOpen, setUserReportOpen] = useState(false);
  const [groupReportOpen, setGroupReportOpen] = useState(false);
  const [pendingPermission, setPendingPermission] = useState<EditablePermission | null>(null);
  const mediaAnchor = useRef<HTMLDivElement>(null);
  const membersAnchor = useRef<HTMLDivElement>(null);
  const createConversation = useCreateConversation();

  // Account-bound surface — guests route to auth like /profile does.
  useEffect(() => {
    if (isGuest) router.replace('/auth');
  }, [isGuest, router]);

  if (isGuest) return null;
  if (isLoading) return <InfoSkeleton conversationId={conversationId} />;
  if (!conversation) {
    return (
      <div className="flex h-full flex-col bg-background">
        <header className="flex shrink-0 items-center gap-1 border-b border-border-subtle px-1 py-1">
          <IconButton
            name="back"
            aria-label="Back to conversation"
            onClick={() => router.push(`/inbox/${conversationId}`)}
          />
        </header>
        <div className="flex flex-1 items-center justify-center">
          <EmptyState
            icon="chat"
            title="Conversation not found"
            subtitle="It may have been archived or deleted."
            actionLabel="Back to inbox"
            onAction={() => router.push('/inbox')}
          />
        </div>
      </div>
    );
  }

  const scrollTo = (ref: React.RefObject<HTMLDivElement | null>) =>
    ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  // ── Shared actions ────────────────────────────────────────────────────

  const handleToggleMute = () => {
    toggleMute(conversation.id);
    toast.show(muted ? 'Conversation unmuted' : 'Conversation muted', 'info');
  };

  const handleToggleArchive = () => {
    toggleArchive(conversation.id);
    toast.show(archived ? 'Conversation unarchived' : 'Conversation archived', 'info');
  };

  const confirmClearChat = () =>
    setConfirm({
      open: true,
      title: 'Clear chat?',
      message: 'Messages are removed for you — everyone else keeps their copy.',
      confirmLabel: 'Clear',
      variant: 'danger',
      onConfirm: async () => {
        const ok = await admin.clearChat();
        toast.show(ok ? 'Chat cleared' : "Couldn't clear this chat.", ok ? 'success' : 'error');
      },
    });

  // ── Group actions ─────────────────────────────────────────────────────

  const handleLeave = () => {
    if (role === 'owner') {
      // No transfer-ownership surface on web yet — the honest guard is to
      // point at the directory, matching the mobile copy.
      toast.show('Transfer ownership before leaving this group.', 'info');
      scrollTo(membersAnchor);
      return;
    }
    setConfirm({
      open: true,
      title: 'Leave group?',
      message: "You'll stop receiving messages from this group.",
      confirmLabel: 'Leave',
      variant: 'danger',
      onConfirm: async () => {
        const ok = await admin.removeConversation('leave');
        if (ok) {
          toast.show('You left the group', 'success');
          router.push('/inbox');
        } else {
          toast.show("Couldn't leave the group — try again.", 'error');
        }
      },
    });
  };

  const saveGroup = async (patch: {
    title: string;
    description: string;
    avatar?: string | null;
    coverPhoto?: string | null;
  }) => {
    const ok = await admin.updateGroupInfo(patch);
    if (!ok) toast.show("Couldn't save changes — try again.", 'error');
    return ok;
  };

  const addUsers = async (users: User[]) => {
    const ok = await admin.addMembers(users);
    toast.show(
      ok
        ? users.length === 1
          ? `${users[0].username} added`
          : `${users.length} members added`
        : "Couldn't add members — try again.",
      ok ? 'success' : 'error',
    );
    return ok;
  };

  const handleMessageMember = (m: MemberActionsTarget) => {
    setMemberTarget(null);
    createConversation.mutate(
      { memberIds: [m.id] },
      {
        onSuccess: (c) => router.push(`/inbox/${c.id}`),
        onError: () => toast.show("Couldn't start that conversation.", 'error'),
      },
    );
  };

  const handleToggleAdmin = async (m: MemberActionsTarget) => {
    const name = m.displayName ?? m.username;
    const next = m.role === 'admin' ? 'member' : 'admin';
    const ok = await admin.setMemberRole(m.id, next);
    setMemberTarget(null);
    toast.show(
      ok
        ? next === 'admin'
          ? `${name} is now an admin`
          : `${name} is no longer an admin`
        : "Couldn't update this member's role.",
      ok ? 'success' : 'error',
    );
  };

  const confirmRemoveMember = (m: MemberActionsTarget) => {
    const name = m.displayName ?? m.username;
    setMemberTarget(null);
    setConfirm({
      open: true,
      title: `Remove ${name}?`,
      message: `${name} won't be able to see or send messages in this group.`,
      confirmLabel: 'Remove',
      variant: 'danger',
      onConfirm: async () => {
        const ok = await admin.removeMember(m.id);
        toast.show(
          ok ? `${name} removed` : "Couldn't remove this member.",
          ok ? 'success' : 'error',
        );
      },
    });
  };

  const handlePermissionChange = async (
    key: EditablePermission,
    scope: GroupPermissionScope,
  ) => {
    if (pendingPermission) return;
    setPendingPermission(key);
    const ok = await setPermission(key, scope);
    setPendingPermission(null);
    if (!ok) toast.show("Couldn't update permissions — try again.", 'error');
  };

  // ── DM actions ────────────────────────────────────────────────────────

  const handleToggleBlock = () => {
    if (!counterpartyId) return;
    toggleBlocked(counterpartyId);
    toast.show(
      blocked
        ? `${counterpartyName} unblocked`
        : `${counterpartyName} blocked — they can't message you`,
      'info',
    );
  };

  const confirmRemoveFromInbox = () =>
    setConfirm({
      open: true,
      title: 'Remove from inbox?',
      message: 'This removes the conversation for you — the other person keeps their copy.',
      confirmLabel: 'Remove',
      variant: 'danger',
      onConfirm: async () => {
        const ok = await admin.removeConversation('me');
        if (ok) {
          toast.show('Conversation removed', 'success');
          router.push('/inbox');
        } else {
          toast.show("Couldn't remove this conversation.", 'error');
        }
      },
    });

  // ── Derived view state ────────────────────────────────────────────────

  const createdAt = conversationCreatedAt(conversation);
  const members = conversation.participantProfiles ?? [];
  const memberTotal = memberCount(conversation);
  const existingIds = new Set(conversation.participantIds ?? members.map((m) => m.id));

  // InfoSection injects isLast via Children.toArray — the rows must be
  // direct children, never a shared fragment (fragments collapse to one
  // child and reject the injected prop).
  const sharedSection = (
    <InfoSection title="Shared in this chat">
      <InfoRow
        icon="images"
        label="Photos and videos"
        detail={mediaCount > 0 ? String(mediaCount) : 'None'}
        showChevron={false}
      />
      <InfoRow
        icon="link"
        label="Links"
        detail={linkCount > 0 ? String(linkCount) : 'None'}
        showChevron={false}
      />
      <InfoRow
        icon="offer"
        label="Offers"
        detail={offerCount > 0 ? String(offerCount) : 'None'}
        showChevron={false}
      />
    </InfoSection>
  );

  const muteAction: QuickAction = {
    key: 'mute',
    label: muted ? 'Muted' : 'Mute',
    icon: muted ? 'notificationsOff' : 'notifications',
    active: muted,
    onPress: handleToggleMute,
    'aria-label': muted ? 'Unmute conversation' : 'Mute conversation',
  };

  return (
    <div className="flex h-full min-w-0 flex-col bg-background">
      <header className="flex shrink-0 items-center gap-1 border-b border-border-subtle px-1 py-1">
        <IconButton
          name="back"
          aria-label="Back to conversation"
          onClick={() => router.push(`/inbox/${conversationId}`)}
        />
        <p className="clamp-1 min-w-0 flex-1 text-body-emphasis font-semibold text-text-primary">
          {isGroup ? 'Group details' : 'Chat details'}
        </p>
        {isGroup && capabilities?.canEditGroupInfo ? (
          <IconButton
            name="edit"
            aria-label="Edit group"
            onClick={() => setEditOpen(true)}
          />
        ) : null}
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto pb-10">
        {isGroup ? (
          <>
            <GroupInfoHero
              conversation={conversation}
              canEdit={capabilities?.canEditGroupInfo ?? false}
              onEditCover={() => setEditOpen(true)}
              onEditAvatar={() => setEditOpen(true)}
              onEditDescription={() => setEditOpen(true)}
              onEditInfo={() => setEditOpen(true)}
            />
            <QuickActions
              actions={[
                {
                  key: 'media',
                  label: 'Media',
                  icon: 'image',
                  onPress: () => scrollTo(mediaAnchor),
                },
                capabilities?.canAddMembers
                  ? {
                      key: 'add',
                      label: 'Add members',
                      icon: 'personAdd',
                      onPress: () => setAddOpen(true),
                    }
                  : {
                      key: 'members',
                      label: 'Members',
                      icon: 'people',
                      onPress: () => scrollTo(membersAnchor),
                    },
                muteAction,
              ]}
            />

            <div ref={mediaAnchor} className="scroll-mt-4">
              {sharedSection}
              {mediaCount > 0 ? (
                <div className="pt-3">
                  <SharedMediaGrid items={mediaItems} />
                </div>
              ) : null}
            </div>

            <div ref={membersAnchor} className="scroll-mt-4">
              <MemberDirectory
                memberCount={memberTotal}
                members={members}
                memberRoles={memberRoles}
                viewerId={viewerId}
                canAddMembers={capabilities?.canAddMembers ?? false}
                onAddMembers={() => setAddOpen(true)}
                onMemberPress={setMemberTarget}
              />
            </div>

            {settings && capabilities ? (
              <PermissionsSection
                settings={settings}
                capabilities={capabilities}
                pendingKey={pendingPermission}
                onChange={handlePermissionChange}
              />
            ) : null}

            <InfoSection title="Conversation">
              <InfoRow
                icon="notifications"
                label="Notifications"
                detail={muted ? 'Muted' : 'All'}
                onPress={handleToggleMute}
              />
              <InfoRow
                icon={archived ? 'mail' : 'folder'}
                label={archived ? 'Unarchive conversation' : 'Archive conversation'}
                onPress={handleToggleArchive}
              />
            </InfoSection>

            <InfoSection>
              <InfoRow
                icon="trash"
                tone="danger"
                label="Clear chat"
                onPress={confirmClearChat}
                showChevron={false}
              />
              <InfoRow
                icon="exit"
                tone="danger"
                label="Leave group"
                onPress={handleLeave}
                showChevron={false}
              />
              <InfoRow
                icon="flag"
                tone="danger"
                label="Report group"
                onPress={() => setGroupReportOpen(true)}
              />
            </InfoSection>
          </>
        ) : (
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
                <h1 className="clamp-1 text-screen-title font-bold text-text-primary">
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
                  onPress: () => scrollTo(mediaAnchor),
                },
                muteAction,
              ]}
            />

            <div ref={mediaAnchor} className="scroll-mt-4">
              {sharedSection}
              {mediaCount > 0 ? (
                <div className="pt-3">
                  <SharedMediaGrid items={mediaItems} />
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
                onPress={handleToggleMute}
              />
              <InfoRow
                icon={archived ? 'mail' : 'folder'}
                label={archived ? 'Unarchive conversation' : 'Archive conversation'}
                onPress={handleToggleArchive}
              />
            </InfoSection>

            <InfoSection title="Privacy and safety">
              <InfoRow
                icon="ban"
                tone="danger"
                label={blocked ? `Unblock ${counterpartyName}` : `Block ${counterpartyName}`}
                onPress={handleToggleBlock}
                showChevron={false}
                disabled={!counterpartyId}
              />
              <InfoRow
                icon="flag"
                tone="danger"
                label={`Report ${counterpartyName}`}
                onPress={() => setUserReportOpen(true)}
                disabled={!counterpartyId}
              />
              <InfoRow
                icon="trash"
                tone="danger"
                label="Remove from inbox"
                onPress={confirmRemoveFromInbox}
                showChevron={false}
              />
            </InfoSection>
          </>
        )}

        {createdAt ? (
          <p className="px-4 pt-6 text-center text-meta text-text-muted">
            Created {formatDate(createdAt)}
          </p>
        ) : null}
      </div>

      {/* Sheets — mounted once, driven by state. */}
      <EditGroupSheet
        open={editOpen}
        onClose={() => setEditOpen(false)}
        conversation={conversation}
        onSave={saveGroup}
        onDiscardDirty={() =>
          setConfirm({
            open: true,
            title: 'Discard changes?',
            message: 'Your edits will be lost.',
            confirmLabel: 'Discard',
            variant: 'danger',
            onConfirm: () => setEditOpen(false),
          })
        }
      />
      <AddMembersSheet
        open={addOpen}
        onClose={() => setAddOpen(false)}
        existingIds={existingIds}
        onAdd={addUsers}
      />
      <MemberActionsSheet
        member={memberTarget}
        onDismiss={() => setMemberTarget(null)}
        canManageMembers={capabilities?.canManage ?? false}
        isSelf={memberTarget?.id === viewerId}
        onViewProfile={(m) => {
          setMemberTarget(null);
          router.push(`/u/${m.username}`);
        }}
        onMessage={handleMessageMember}
        onToggleAdmin={handleToggleAdmin}
        onRemove={confirmRemoveMember}
      />
      <ConfirmSheet state={confirm} onClose={() => setConfirm(CLOSED_CONFIRM)} />
      <ReportSheet
        open={userReportOpen}
        onClose={() => setUserReportOpen(false)}
        target={{
          type: 'user',
          id: counterpartyId ?? '',
          label: counterpartyUsername ? `@${counterpartyUsername}` : counterpartyName,
        }}
      />
      <ReportGroupSheet
        open={groupReportOpen}
        onClose={() => setGroupReportOpen(false)}
        groupLabel={conversationTitle(conversation)}
      />
      {settingsFailed && isGroup ? (
        <p className="sr-only" role="status">
          Group permissions are unavailable — showing role defaults.
        </p>
      ) : null}
    </div>
  );
}

/** Loading grammar — hero silhouette + quick-action row + section rows. */
function InfoSkeleton({ conversationId }: { conversationId: string }) {
  const router = useRouter();
  return (
    <div className="flex h-full flex-col bg-background" aria-busy aria-label="Loading details">
      <header className="flex shrink-0 items-center gap-1 border-b border-border-subtle px-1 py-1">
        <IconButton
          name="back"
          aria-label="Back to conversation"
          onClick={() => router.push(`/inbox/${conversationId}`)}
        />
      </header>
      <div className="flex flex-col items-center gap-2 px-4 pt-7">
        <Skeleton className="h-24 w-24 rounded-full" />
        <Skeleton className="mt-1 h-5 w-40" />
        <Skeleton className="h-3.5 w-24" />
      </div>
      <div className="mt-4 flex justify-between border-y border-border-subtle px-8 py-3">
        <Skeleton className="h-9 w-12" />
        <Skeleton className="h-9 w-12" />
        <Skeleton className="h-9 w-12" />
      </div>
      <div className="px-4 pt-6">
        <Skeleton className="h-3 w-28" />
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 border-b border-border-subtle py-3.5">
            <Skeleton className="h-5 w-8" />
            <Skeleton className="h-3.5 flex-1" />
          </div>
        ))}
      </div>
    </div>
  );
}
