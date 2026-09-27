'use client';

/**
 * Moodboard collaboration overlay — comments, member roles, invites and
 * saved versions authored on web. No live moodboard-collaboration contract
 * exists in lib/api/services yet (the mobile endpoints live in
 * frontend/src/services/moodboardApi.ts), so fixture rows in
 * fixtures-content.ts stay read-only source truth and member writes land
 * here keyed by board id — same latest-write-wins overlay posture as
 * moodboards.ts. When a live contract ships, these actions are the seam
 * to swap for API calls.
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type {
  MoodboardCommentRow,
  MoodboardInviteRow,
  MoodboardRole,
  MoodboardVersionRow,
} from '@/lib/data/fixtures-content';

interface BoardCollab {
  /** Comments authored this session (appended to fixture rows). */
  addedComments: MoodboardCommentRow[];
  /** Resolve toggles applied to any comment (fixture or authored). */
  resolved: Record<string, boolean>;
  /** Comment ids removed by their author / the owner. */
  removedCommentIds: string[];
  /** Role overrides applied to members. */
  memberRoles: Record<string, Exclude<MoodboardRole, 'owner'>>;
  /** Member ids removed from the board. */
  removedMemberIds: string[];
  /** Invites created this session (token shown once in the sheet). */
  addedInvites: MoodboardInviteRow[];
  /** Invite ids revoked or deleted. */
  removedInviteIds: string[];
  /** Versions saved this session. */
  addedVersions: MoodboardVersionRow[];
  /** Pin toggles applied to any version. */
  pinnedVersions: Record<string, boolean>;
}

const EMPTY_BOARD: BoardCollab = {
  addedComments: [],
  resolved: {},
  removedCommentIds: [],
  memberRoles: {},
  removedMemberIds: [],
  addedInvites: [],
  removedInviteIds: [],
  addedVersions: [],
  pinnedVersions: {},
};

interface MoodboardCollabState {
  boards: Record<string, BoardCollab>;
  addComment: (
    boardId: string,
    comment: Omit<MoodboardCommentRow, 'boardId'>,
  ) => void;
  setCommentResolved: (
    boardId: string,
    commentId: string,
    resolved: boolean,
  ) => void;
  removeComment: (boardId: string, commentId: string) => void;
  setMemberRole: (
    boardId: string,
    userId: string,
    role: Exclude<MoodboardRole, 'owner'>,
  ) => void;
  removeMember: (boardId: string, userId: string) => void;
  addInvite: (boardId: string, invite: Omit<MoodboardInviteRow, 'boardId'>) => void;
  revokeInvite: (boardId: string, inviteId: string) => void;
  addVersion: (boardId: string, version: Omit<MoodboardVersionRow, 'boardId'>) => void;
  setVersionPinned: (boardId: string, versionId: string, pinned: boolean) => void;
}

export const useMoodboardCollab = create<MoodboardCollabState>()(
  persist(
    (set) => ({
      boards: {},
        addComment: (boardId, comment) =>
          set((s) => {
            const b = s.boards[boardId] ?? EMPTY_BOARD;
            return {
              boards: {
                ...s.boards,
                [boardId]: {
                  ...b,
                  addedComments: [...b.addedComments, { ...comment, boardId }],
                },
              },
            };
          }),
        setCommentResolved: (boardId, commentId, resolved) =>
          set((s) => {
            const b = s.boards[boardId] ?? EMPTY_BOARD;
            return {
              boards: {
                ...s.boards,
                [boardId]: { ...b, resolved: { ...b.resolved, [commentId]: resolved } },
              },
            };
          }),
        removeComment: (boardId, commentId) =>
          set((s) => {
            const b = s.boards[boardId] ?? EMPTY_BOARD;
            return {
              boards: {
                ...s.boards,
                [boardId]: {
                  ...b,
                  removedCommentIds: [...b.removedCommentIds, commentId],
                },
              },
            };
          }),
        setMemberRole: (boardId, userId, role) =>
          set((s) => {
            const b = s.boards[boardId] ?? EMPTY_BOARD;
            return {
              boards: {
                ...s.boards,
                [boardId]: {
                  ...b,
                  memberRoles: { ...b.memberRoles, [userId]: role },
                },
              },
            };
          }),
        removeMember: (boardId, userId) =>
          set((s) => {
            const b = s.boards[boardId] ?? EMPTY_BOARD;
            return {
              boards: {
                ...s.boards,
                [boardId]: {
                  ...b,
                  removedMemberIds: [...b.removedMemberIds, userId],
                },
              },
            };
          }),
        addInvite: (boardId, invite) =>
          set((s) => {
            const b = s.boards[boardId] ?? EMPTY_BOARD;
            return {
              boards: {
                ...s.boards,
                [boardId]: {
                  ...b,
                  addedInvites: [...b.addedInvites, { ...invite, boardId }],
                },
              },
            };
          }),
        revokeInvite: (boardId, inviteId) =>
          set((s) => {
            const b = s.boards[boardId] ?? EMPTY_BOARD;
            return {
              boards: {
                ...s.boards,
                [boardId]: {
                  ...b,
                  removedInviteIds: [...b.removedInviteIds, inviteId],
                },
              },
            };
          }),
        addVersion: (boardId, version) =>
          set((s) => {
            const b = s.boards[boardId] ?? EMPTY_BOARD;
            return {
              boards: {
                ...s.boards,
                [boardId]: {
                  ...b,
                  addedVersions: [...b.addedVersions, { ...version, boardId }],
                },
              },
            };
          }),
        setVersionPinned: (boardId, versionId, pinned) =>
          set((s) => {
            const b = s.boards[boardId] ?? EMPTY_BOARD;
            return {
              boards: {
                ...s.boards,
                [boardId]: {
                  ...b,
                  pinnedVersions: { ...b.pinnedVersions, [versionId]: pinned },
                },
              },
            };
          }),
    }),
    {
      name: 'thryftverse.web.moodboardCollab',
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ boards: s.boards }),
    },
  ),
);
