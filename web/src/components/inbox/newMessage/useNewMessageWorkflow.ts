'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { User } from '@/lib/contracts/domain';
import {
  useConversations,
  useCreateConversation,
  useMemberDirectory,
} from '@/lib/hooks/queries';
import { useSession } from '@/lib/session/SessionProvider';
import { useToast } from '@/components/ui/Toast';
import { isGroupConversation } from '../inboxModel';

export type Stage = 'contacts' | 'members' | 'details';

export const MIN_GROUP_MEMBERS = 2;
export const MAX_GROUP_MEMBERS = 48;
export const MAX_DESCRIPTION = 280;

export interface RecentContact {
  userId: string;
  name: string;
  avatar: string;
  verified?: boolean;
}

export function useNewMessageWorkflow(open: boolean, onClose: () => void) {
  const router = useRouter();
  const toast = useToast();
  const { data: conversations } = useConversations();
  const { user } = useSession();
  const createConversation = useCreateConversation();

  const [stage, setStage] = useState<Stage>('contacts');
  const [q, setQ] = useState('');
  const [selected, setSelected] = useState<User[]>([]);
  const [groupTitle, setGroupTitle] = useState('');
  const [description, setDescription] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);

  const {
    data: directory,
    isLoading: directoryLoading,
    isError: directoryError,
    refetch: refetchDirectory,
  } = useMemberDirectory(q);

  // Fresh draft each time the sheet opens.
  useEffect(() => {
    if (open) {
      setStage('contacts');
      setQ('');
      setSelected([]);
      setGroupTitle('');
      setDescription('');
    }
  }, [open]);

  // Existing 1:1 threads, in inbox order — the "Recent" contacts section.
  const recentContacts = useMemo(() => {
    const seen = new Set<string>();
    const out: RecentContact[] = [];
    for (const c of conversations ?? []) {
      if (isGroupConversation(c) || !c.participantId || seen.has(c.participantId)) continue;
      seen.add(c.participantId);
      out.push({
        userId: c.participantId,
        name: c.participantName,
        avatar: c.participantAvatar,
        verified: c.participantVerified,
      });
    }
    return out;
  }, [conversations]);

  const existingDmIds = useMemo(
    () => new Set(recentContacts.map((c) => c.userId)),
    [recentContacts],
  );

  const query = q.trim();
  const directoryUsers = directory ?? [];
  const selectedIds = useMemo(() => new Set(selected.map((u) => u.id)), [selected]);
  const isCreating = createConversation.isPending;

  const toggleMember = (targetUser: User) => {
    setSelected((prev) => {
      if (prev.some((u) => u.id === targetUser.id)) {
        return prev.filter((u) => u.id !== targetUser.id);
      }
      if (prev.length >= MAX_GROUP_MEMBERS) return prev;
      return [...prev, targetUser];
    });
  };

  const openDm = (userId: string) => {
    createConversation.mutate(
      { memberIds: [userId] },
      {
        onSuccess: (c) => {
          onClose();
          router.push(`/inbox/${c.id}`);
        },
        onError: () => toast.show('Could not start conversation. Try again.', 'error'),
      },
    );
  };

  const createGroup = () => {
    createConversation.mutate(
      {
        memberIds: selected.map((u) => u.id),
        title: groupTitle.trim(),
        description: description.trim() || undefined,
      },
      {
        onSuccess: (c) => {
          onClose();
          toast.show('Group chat created', 'success');
          router.push(`/inbox/${c.id}`);
        },
        onError: () => toast.show('Could not create the group. Try again.', 'error'),
      },
    );
  };

  const sheetTitle =
    stage === 'contacts' ? 'New message' : stage === 'members' ? 'New group' : 'Group details';

  return {
    stage,
    setStage,
    q,
    setQ,
    query,
    selected,
    setSelected,
    selectedIds,
    toggleMember,
    groupTitle,
    setGroupTitle,
    description,
    setDescription,
    searchRef,
    recentContacts,
    existingDmIds,
    directoryUsers,
    directoryLoading,
    directoryError,
    refetchDirectory,
    openDm,
    createGroup,
    isCreating,
    user,
    sheetTitle,
  };
}
