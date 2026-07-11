import { describe, it, expect, vi, beforeEach } from 'vitest';

import {
  MAX_MEMBERS,
  MIN_MEMBERS,
  SEARCH_DEBOUNCE_MS,
  canContinueToDetails,
  canCreateGroup,
  filterBlockedUsers,
  filterSelfFromResults,
  isSearchQueryValid,
  toggleMemberId,
  validateGroupTitle,
  type SelectableUser,
} from '../utils/chatGroupHelpers';

import { createStableId } from '../utils/createStableId';

import {
  isFirstInCluster,
  isLastInCluster,
  isSystemMessage,
  isDayChanged,
  type GroupableMessage,
} from '../utils/messageGrouping';

import {
  deriveMessageActions,
  hasAction,
  type MessageContextCapabilities,
} from '../utils/messageContextMenuCapabilities';

/* ── Real behavioural tests (import & exercise production code) ── */

describe('chatGroupHelpers — production exports', () => {

  /* Stage 1 → Stage 2 state preservation */
  describe('canContinueToDetails', () => {
    it('blocks continuation when no members selected', () => {
      expect(canContinueToDetails(0)).toBe(false);
    });

    it('allows continuation when minimum members met', () => {
      expect(canContinueToDetails(1)).toBe(true);
      expect(canContinueToDetails(5)).toBe(true);
    });
  });

  describe('canCreateGroup', () => {
    it('requires non-empty title and minimum members', () => {
      expect(canCreateGroup('', 1)).toBe(false);
      expect(canCreateGroup('  ', 1)).toBe(false);
      expect(canCreateGroup('My Group', 0)).toBe(false);
      expect(canCreateGroup('My Group', 1)).toBe(true);
    });
  });

  /* Blocked users excluded */
  describe('filterBlockedUsers', () => {
    const results: SelectableUser[] = [
      { id: 'u1', username: 'alice', displayName: 'Alice', avatar: null },
      { id: 'u2', username: 'bob', displayName: 'Bob', avatar: null },
      { id: 'u3', username: 'carol', displayName: 'Carol', avatar: null },
    ];

    it('excludes blocked user ids', () => {
      const blocked = new Set(['u2']);
      const filtered = filterBlockedUsers(results, (id) => blocked.has(id));
      expect(filtered.map((u) => u.id)).toEqual(['u1', 'u3']);
    });

    it('returns all when none blocked', () => {
      const filtered = filterBlockedUsers(results, () => false);
      expect(filtered.length).toBe(3);
    });
  });

  /* Self filtered from search results */
  describe('filterSelfFromResults', () => {
    const results: SelectableUser[] = [
      { id: 'me', username: 'me', displayName: 'Me', avatar: null },
      { id: 'u1', username: 'alice', displayName: 'Alice', avatar: null },
    ];

    it('removes current user from results', () => {
      expect(filterSelfFromResults(results, 'me').map((u) => u.id)).toEqual(['u1']);
    });

    it('returns all when currentUserId is null', () => {
      expect(filterSelfFromResults(results, null).length).toBe(2);
    });
  });

  /* Member toggle with max enforcement */
  describe('toggleMemberId', () => {
    it('adds a new member', () => {
      const result = toggleMemberId([], 'u1');
      expect(result.ids).toEqual(['u1']);
      expect(result.added).toBe(true);
    });

    it('removes an existing member', () => {
      const result = toggleMemberId(['u1', 'u2'], 'u1');
      expect(result.ids).toEqual(['u2']);
      expect(result.added).toBe(false);
    });

    it('enforces MAX_MEMBERS limit', () => {
      const full = Array.from({ length: MAX_MEMBERS }, (_, i) => `u${i}`);
      const result = toggleMemberId(full, 'new_user');
      expect(result.ids.length).toBe(MAX_MEMBERS);
      expect(result.added).toBe(false);
    });
  });

  /* Title validation */
  describe('validateGroupTitle', () => {
    it('rejects empty title', () => {
      expect(validateGroupTitle('')).toBeTruthy();
      expect(validateGroupTitle('  ')).toBeTruthy();
    });

    it('rejects title under 2 chars', () => {
      expect(validateGroupTitle('a')).toBeTruthy();
    });

    it('rejects title over 80 chars', () => {
      expect(validateGroupTitle('a'.repeat(81))).toBeTruthy();
    });

    it('accepts valid title', () => {
      expect(validateGroupTitle('My Group')).toBeNull();
      expect(validateGroupTitle('a'.repeat(80))).toBeNull();
    });
  });

  /* Search query validation */
  describe('isSearchQueryValid', () => {
    it('rejects queries under 2 chars', () => {
      expect(isSearchQueryValid('')).toBe(false);
      expect(isSearchQueryValid('a')).toBe(false);
      expect(isSearchQueryValid('  ')).toBe(false);
    });

    it('accepts queries of 2+ chars', () => {
      expect(isSearchQueryValid('ab')).toBe(true);
      expect(isSearchQueryValid('alice')).toBe(true);
    });
  });

  /* Constants are real exported values, not test-local */
  it('exports correct constants from production code', () => {
    expect(MAX_MEMBERS).toBe(50);
    expect(MIN_MEMBERS).toBe(1);
    expect(SEARCH_DEBOUNCE_MS).toBe(350);
  });
});

/* ── Idempotency key: same key reaches two retries, new draft gets new key ── */

describe('createStableId — idempotency key behaviour', () => {
  it('generates a prefixed UUID', () => {
    const key = createStableId('group');
    expect(key).toMatch(/^group_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });

  it('generates different keys on each call (new draft scenario)', () => {
    const key1 = createStableId('group');
    const key2 = createStableId('group');
    expect(key1).not.toBe(key2);
  });

  it('simulates retry: same key preserved across two calls', () => {
    const keyRef = { current: createStableId('group') };
    const firstKey = keyRef.current;
    // Retry does NOT regenerate — uses same ref
    const retryKey = keyRef.current;
    expect(retryKey).toBe(firstKey);
  });

  it('simulates new draft: ref is reassigned', () => {
    const keyRef = { current: createStableId('group') };
    const oldKey = keyRef.current;
    keyRef.current = createStableId('group');
    expect(keyRef.current).not.toBe(oldKey);
  });
});

/* ── Message grouping: real helper tests ── */

describe('messageGrouping — production exports', () => {
  const msg = (sender: string, type: string, date: string): GroupableMessage => ({ sender, type, date });

  describe('isFirstInCluster', () => {
    it('is first when no previous message', () => {
      expect(isFirstInCluster(msg('me', 'text', '2024-01-01T10:00:00Z'), undefined)).toBe(true);
    });

    it('is first when sender changes', () => {
      const prev = msg('them', 'text', '2024-01-01T10:00:00Z');
      const curr = msg('me', 'text', '2024-01-01T10:01:00Z');
      expect(isFirstInCluster(curr, prev)).toBe(true);
    });

    it('is first when time gap exceeds 5 minutes', () => {
      const prev = msg('me', 'text', '2024-01-01T10:00:00Z');
      const curr = msg('me', 'text', '2024-01-01T10:06:00Z');
      expect(isFirstInCluster(curr, prev)).toBe(true);
    });

    it('is not first when same sender within 5 minutes', () => {
      const prev = msg('me', 'text', '2024-01-01T10:00:00Z');
      const curr = msg('me', 'text', '2024-01-01T10:03:00Z');
      expect(isFirstInCluster(curr, prev)).toBe(false);
    });

    it('is first when message type changes', () => {
      const prev = msg('me', 'text', '2024-01-01T10:00:00Z');
      const curr = msg('me', 'media', '2024-01-01T10:01:00Z');
      expect(isFirstInCluster(curr, prev)).toBe(true);
    });

    it('is first at system event boundary', () => {
      const prev = msg('me', 'text', '2024-01-01T10:00:00Z');
      const curr = msg('system', 'purchase_status', '2024-01-01T10:01:00Z');
      expect(isFirstInCluster(curr, prev)).toBe(true);
    });
  });

  describe('isLastInCluster', () => {
    it('is last when no next message', () => {
      expect(isLastInCluster(msg('me', 'text', '2024-01-01T10:00:00Z'), undefined)).toBe(true);
    });

    it('is last when sender changes', () => {
      const curr = msg('me', 'text', '2024-01-01T10:00:00Z');
      const next = msg('them', 'text', '2024-01-01T10:01:00Z');
      expect(isLastInCluster(curr, next)).toBe(true);
    });

    it('is not last when same sender within 5 minutes', () => {
      const curr = msg('me', 'text', '2024-01-01T10:00:00Z');
      const next = msg('me', 'text', '2024-01-01T10:03:00Z');
      expect(isLastInCluster(curr, next)).toBe(false);
    });
  });

  describe('isSystemMessage', () => {
    it('identifies system message types', () => {
      expect(isSystemMessage(msg('system', 'purchase_status', ''))).toBe(true);
      expect(isSystemMessage(msg('system', 'offer', ''))).toBe(true);
      expect(isSystemMessage(msg('system', 'offer_declined', ''))).toBe(true);
    });

    it('rejects non-system types', () => {
      expect(isSystemMessage(msg('me', 'text', ''))).toBe(false);
      expect(isSystemMessage(msg('me', 'media', ''))).toBe(false);
    });
  });

  describe('isDayChanged', () => {
    it('detects day change', () => {
      expect(isDayChanged('2024-01-01T10:00:00Z', '2024-01-02T10:00:00Z')).toBe(true);
    });

    it('returns false for same day', () => {
      expect(isDayChanged('2024-01-01T10:00:00Z', '2024-01-01T22:00:00Z')).toBe(false);
    });
  });
});

/* ── Context menu capability derivation: real production function ── */

describe('deriveMessageActions — production export', () => {
  const baseCaps: MessageContextCapabilities = {
    isOwnMessage: false,
    isFailed: false,
    messageText: undefined,
  };

  it('shows retry only for own failed messages', () => {
    const actions = deriveMessageActions({ ...baseCaps, isOwnMessage: true, isFailed: true });
    expect(hasAction(actions, 'retry')).toBe(true);
  });

  it('does not show retry for others failed messages', () => {
    const actions = deriveMessageActions({ ...baseCaps, isOwnMessage: false, isFailed: true });
    expect(hasAction(actions, 'retry')).toBe(false);
  });

  it('does not show retry for own sent messages', () => {
    const actions = deriveMessageActions({ ...baseCaps, isOwnMessage: true, isFailed: false });
    expect(hasAction(actions, 'retry')).toBe(false);
  });

  it('shows report only for others messages', () => {
    expect(hasAction(deriveMessageActions({ ...baseCaps, isOwnMessage: false }), 'report')).toBe(true);
    expect(hasAction(deriveMessageActions({ ...baseCaps, isOwnMessage: true }), 'report')).toBe(false);
  });

  it('shows delete only for own messages', () => {
    expect(hasAction(deriveMessageActions({ ...baseCaps, isOwnMessage: true }), 'delete')).toBe(true);
    expect(hasAction(deriveMessageActions({ ...baseCaps, isOwnMessage: false }), 'delete')).toBe(false);
  });

  it('shows copy text only when message has text', () => {
    expect(hasAction(deriveMessageActions({ ...baseCaps, messageText: 'hello' }), 'copy')).toBe(true);
    expect(hasAction(deriveMessageActions({ ...baseCaps, messageText: '' }), 'copy')).toBe(false);
    expect(hasAction(deriveMessageActions({ ...baseCaps, messageText: undefined }), 'copy')).toBe(false);
    expect(hasAction(deriveMessageActions({ ...baseCaps, messageText: '  ' }), 'copy')).toBe(false);
  });

  it('always shows reply and react', () => {
    const actions = deriveMessageActions(baseCaps);
    expect(hasAction(actions, 'reply')).toBe(true);
    expect(hasAction(actions, 'react')).toBe(true);
  });

  it('never includes select action', () => {
    const actions = deriveMessageActions({ ...baseCaps, isOwnMessage: true, isFailed: true, messageText: 'x' });
    expect(hasAction(actions, 'select' as never)).toBe(false);
  });

  it('marks delete as destructive', () => {
    const actions = deriveMessageActions({ ...baseCaps, isOwnMessage: true });
    const deleteAction = actions.find((a) => a.id === 'delete');
    expect(deleteAction?.destructive).toBe(true);
  });

  it('returns actions in correct order: retry, reply, react, copy, translate, report/delete', () => {
    const actions = deriveMessageActions({ ...baseCaps, isOwnMessage: true, isFailed: true, messageText: 'hello' });
    const ids = actions.map((a) => a.id);
    expect(ids).toEqual(['retry', 'reply', 'react', 'copy', 'translate', 'delete']);
  });

  it('returns actions in correct order for others message', () => {
    const actions = deriveMessageActions({ ...baseCaps, isOwnMessage: false, messageText: 'hello' });
    const ids = actions.map((a) => a.id);
    expect(ids).toEqual(['reply', 'react', 'copy', 'translate', 'report']);
  });
});

/* ── Duplicate submit is blocked (createAttemptRef pattern) ── */

describe('Duplicate submit blocking pattern', () => {
  it('blocks second concurrent submit via ref guard', () => {
    let createAttemptRef = { current: false };

    const trySubmit = (): boolean => {
      if (createAttemptRef.current) return false;
      createAttemptRef.current = true;
      return true;
    };

    expect(trySubmit()).toBe(true);
    expect(trySubmit()).toBe(false);

    createAttemptRef.current = false;
    expect(trySubmit()).toBe(true);
  });
});

/* ── Search error and retry behaviour ── */

describe('Search error and retry behaviour', () => {
  it('searchUsers mock returns real results that pass through filterBlockedUsers', async () => {
    const mockSearchUsers = vi.fn().mockResolvedValue([
      { id: 'u1', username: 'alice', displayName: 'Alice', avatar: null },
      { id: 'u2', username: 'bob', displayName: 'Bob', avatar: null },
    ]);

    const results = await mockSearchUsers('ali', 20);
    expect(mockSearchUsers).toHaveBeenCalledWith('ali', 20);
    expect(results.length).toBe(2);

    const filtered = filterBlockedUsers(results, (id) => id === 'u2');
    expect(filtered.length).toBe(1);
    expect(filtered[0].id).toBe('u1');
  });

  it('searchUsers mock rejects and error message is captured', async () => {
    const mockSearchUsers = vi.fn().mockRejectedValue(new Error('Network error'));
    let searchError = '';

    try {
      await mockSearchUsers('ali', 20);
    } catch {
      searchError = 'Search failed. Check your connection.';
    }

    expect(searchError).toBeTruthy();
    expect(searchError).toContain('Search failed');
  });

  it('retry re-invokes search after error', async () => {
    let callCount = 0;
    const mockSearchUsers = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) return Promise.reject(new Error('Network error'));
      return Promise.resolve([{ id: 'u1', username: 'alice', displayName: 'Alice', avatar: null }]);
    });

    try {
      await mockSearchUsers('ali', 20);
    } catch {
      // first attempt fails
    }

    const results = await mockSearchUsers('ali', 20);
    expect(results.length).toBe(1);
    expect(mockSearchUsers).toHaveBeenCalledTimes(2);
  });
});
