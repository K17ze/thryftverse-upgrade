'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import type { User } from '@/lib/contracts/domain';
import { useConversation, useCreateConversation } from '@/lib/hooks/queries';
import { DATA_MODE } from '@/lib/api/client';
import { deleteChatMessage } from '@/lib/api/services/chat';
import { useSession } from '@/lib/session/SessionProvider';
import { useHydrated } from '@/lib/store/useStore';
import { useConversationPrefs } from '../useConversationPrefs';
import { useToast } from '@/components/ui/Toast';
import { CLOSED_CONFIRM, type ConfirmSheetState } from '../ConfirmSheet';
import type { MemberActionsTarget } from '../MemberActionsSheet';
import type { QuickAction } from '../QuickActions';
import { useSharedMedia, type SharedMediaItem } from '../SharedMediaGrid';
import {
  conversationCreatedAt,
  fixtureConversation,
  memberRolesFor,
  useGroupAdminStore,
  viewerRole,
  type EditablePermission,
  type GroupPermissionScope,
} from '../groupAdmin';
import { useConversationAdmin, useGroupCapabilities } from '../useConversationAdmin';
import { useInboxSafety } from '../inboxSafety';
import { isGroupConversation, memberCount } from '../inboxModel';

const LINK_RE = /https?:\/\//i;

export function useConversationInfoWorkflow(conversationId: string) {
  const router = useRouter();
  const qc = useQueryClient();
  const toast = useToast();
  const { user, isGuest } = useSession();
  const hydrated = useHydrated();
  const viewerId = user?.id ?? '';

  const { data: conversation, isLoading, isError, refetch } =
    useConversation(conversationId);
  const isGroup = conversation ? isGroupConversation(conversation) : false;

  // Conversation prefs — hydrated override → live isMuted/isArchived
  const { isMuted, isArchived, setMuted, setArchived } = useConversationPrefs();
  const muted = conversation ? isMuted(conversation) : false;
  const archived = conversation ? isArchived(conversation) : false;

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

  // DM counterparty
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

  const scrollTo = (ref: React.RefObject<HTMLDivElement | null>) =>
    ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  // Shared actions
  const handleToggleMute = () => {
    if (!conversation) return;
    setMuted(conversation, !muted);
    toast.show(muted ? 'Conversation unmuted' : 'Conversation muted', 'info');
  };

  const handleToggleArchive = () => {
    if (!conversation) return;
    setArchived(conversation, !archived);
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

  // Group actions
  const handleLeave = () => {
    if (role === 'owner') {
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

  const confirmTransferOwnership = (m: MemberActionsTarget) => {
    const name = m.displayName ?? m.username;
    setMemberTarget(null);
    setConfirm({
      open: true,
      title: 'Transfer ownership?',
      message: `You'll no longer be the owner — ${name} becomes the group owner with full control.`,
      confirmLabel: 'Transfer',
      variant: 'danger',
      onConfirm: async () => {
        const ok = await admin.transferOwnership(m.id);
        toast.show(
          ok
            ? `Ownership transferred to ${name}.`
            : "Couldn't transfer ownership — try again.",
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

  const removeMediaItems = async (items: SharedMediaItem[]) => {
    if (!conversation || items.length === 0) return;
    const ids = new Set(items.map((it) => it.id));
    if (DATA_MODE === 'live') {
      const results = await Promise.allSettled(
        items.map((it) => deleteChatMessage(conversation.id, it.id, 'me')),
      );
      const failed = results.filter((r) => r.status === 'rejected').length;
      void qc.invalidateQueries({ queryKey: ['conversation', conversation.id] });
      void qc.invalidateQueries({ queryKey: ['conversations'] });
      toast.show(
        failed
          ? `${failed} of ${items.length} couldn't be removed`
          : `${items.length} ${items.length === 1 ? 'item' : 'items'} removed`,
        failed ? 'error' : 'info',
      );
      return;
    }
    const convo = fixtureConversation(conversation.id);
    if (!convo) {
      toast.show("Couldn't remove — conversation not found", 'error');
      return;
    }
    convo.messages = convo.messages.filter((m) => !ids.has(m.id));
    void qc.invalidateQueries({ queryKey: ['conversation', conversation.id] });
    void qc.invalidateQueries({ queryKey: ['conversations'] });
    toast.show(
      `${items.length} ${items.length === 1 ? 'item' : 'items'} removed`,
      'info',
    );
  };

  // DM actions
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

  const createdAt = conversation ? conversationCreatedAt(conversation) : null;
  const members = conversation?.participantProfiles ?? [];
  const memberTotal = conversation ? memberCount(conversation) : 0;
  const existingIds = new Set(conversation?.participantIds ?? members.map((m) => m.id));

  const muteAction: QuickAction = {
    key: 'mute',
    label: muted ? 'Muted' : 'Mute',
    icon: muted ? 'notificationsOff' : 'notifications',
    active: muted,
    onPress: handleToggleMute,
    'aria-label': muted ? 'Unmute conversation' : 'Mute conversation',
  };

  return {
    router,
    isGuest,
    isLoading,
    isError,
    refetch,
    conversation,
    isGroup,
    viewerId,
    counterpartyId,
    counterpartyName,
    counterpartyUsername,
    blocked,
    muted,
    archived,
    mediaItems,
    mediaCount,
    linkCount,
    offerCount,
    role,
    capabilities,
    settings,
    settingsFailed,
    memberRoles,
    members,
    memberTotal,
    existingIds,
    createdAt,
    editOpen,
    setEditOpen,
    addOpen,
    setAddOpen,
    memberTarget,
    setMemberTarget,
    confirm,
    setConfirm,
    userReportOpen,
    setUserReportOpen,
    groupReportOpen,
    setGroupReportOpen,
    pendingPermission,
    mediaAnchor,
    membersAnchor,
    muteAction,
    scrollTo,
    handleToggleMute,
    handleToggleArchive,
    confirmClearChat,
    handleLeave,
    saveGroup,
    addUsers,
    handleMessageMember,
    handleToggleAdmin,
    confirmRemoveMember,
    confirmTransferOwnership,
    handlePermissionChange,
    removeMediaItems,
    handleToggleBlock,
    confirmRemoveFromInbox,
  };
}
