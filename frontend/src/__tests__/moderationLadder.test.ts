import { beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { useStore } from '../store/useStore';
import type { Conversation } from '../domain/conversation';

function resetStore() {
  useStore.setState(useStore.getInitialState(), true);
}

// The moderation ladder derives truth from two sources: the local store set
// AND server fields (conversation.isRestricted / isBlocked / isAuthorMuted).
// A blind toggle corrupts state when the two diverge — e.g. the server says
// restricted but the local set never hydrated the id. Mutation paths must use
// operation-specific add/remove so the committed outcome is what the user
// asked for, not an inversion of whatever the local set happened to hold.
describe('moderation ladder set semantics', () => {
  beforeEach(resetStore);

  it('addRestrictedUser is idempotent', () => {
    const { addRestrictedUser } = useStore.getState();
    addRestrictedUser('u1');
    addRestrictedUser('u1');
    expect(useStore.getState().restrictedUsers).toEqual(['u1']);
  });

  it('removeRestrictedUser on an absent id is a no-op, never an add', () => {
    // Regression: unrestrict committed server-side must leave the id absent.
    // A blind toggle here would ADD the id and show the user as restricted
    // after a successful unrestrict.
    const { removeRestrictedUser } = useStore.getState();
    removeRestrictedUser('u1');
    expect(useStore.getState().restrictedUsers).toEqual([]);
  });

  it('removeRestrictedUser removes a present id', () => {
    useStore.getState().addRestrictedUser('u1');
    useStore.getState().removeRestrictedUser('u1');
    expect(useStore.getState().restrictedUsers).toEqual([]);
  });

  it('addMutedUser / removeMutedUser mirror the same semantics', () => {
    const state = useStore.getState();
    state.addMutedUser('u1');
    state.addMutedUser('u1');
    expect(useStore.getState().mutedUsers).toEqual(['u1']);
    state.removeMutedUser('u1');
    state.removeMutedUser('u1');
    expect(useStore.getState().mutedUsers).toEqual([]);
  });

  it('addBlockedUser / removeBlockedUser share the semantics', () => {
    const state = useStore.getState();
    state.addBlockedUser('u1');
    state.addBlockedUser('u1');
    expect(useStore.getState().blockedUsers).toEqual(['u1']);
    state.removeBlockedUser('u1');
    state.removeBlockedUser('u1');
    expect(useStore.getState().blockedUsers).toEqual([]);
  });

  it('setConversationRestricted mirrors the flag onto the conversation', () => {
    const dm = {
      id: 'c1',
      type: 'dm',
      participantIds: ['me', 'u1'],
      messages: [],
      isRestricted: true,
      isAuthorRestricted: true,
    } as unknown as Conversation;
    useStore.setState({ conversations: [dm] });
    useStore.getState().setConversationRestricted('c1', false);
    const c = useStore.getState().conversations[0];
    expect(c.isRestricted).toBe(false);
    expect(c.isAuthorRestricted).toBe(false);
  });

  it('setUserModerationInConversations sweeps DMs only, leaves groups alone', () => {
    const dm = {
      id: 'c1', type: 'dm', participantIds: ['me', 'u1'], messages: [],
      isBlocked: true,
    } as unknown as Conversation;
    const group = {
      id: 'c2', type: 'group', participantIds: ['me', 'u1', 'u2'], messages: [],
      isBlocked: true,
    } as unknown as Conversation;
    useStore.setState({ conversations: [dm, group] });
    useStore.getState().setUserModerationInConversations('u1', { isBlocked: false });
    const [nextDm, nextGroup] = useStore.getState().conversations;
    expect(nextDm.isBlocked).toBe(false);
    expect(nextGroup.isBlocked).toBe(true);
  });

  it('mutation paths never apply blind toggles after a committed server op', () => {
    const src = readFileSync(
      join(__dirname, '../platform/server/useProfileSocialQueries.ts'),
      'utf8'
    );
    // onSuccess handlers must not call toggle* — the toggle direction is
    // derived from local state, not the committed op. The store no longer
    // exports user-level toggles, so this guards against re-introduction.
    const onSuccessBlocks = src.split('onSuccess').slice(1).join('onSuccess');
    expect(onSuccessBlocks).not.toMatch(/toggleMutedUser|toggleRestrictedUser|toggleBlockedUser/);
  });

  it('ConversationInfoScreen uses operation-specific ops for all three rungs', () => {
    const src = readFileSync(
      join(__dirname, '../screens/ConversationInfoScreen.tsx'),
      'utf8'
    );
    expect(src).not.toContain('toggleRestrictedUser(');
    expect(src).not.toContain('toggleBlockedUser(');
    expect(src).toContain('removeRestrictedUser(counterpartyId)');
    expect(src).toContain('addRestrictedUser(counterpartyId)');
    expect(src).toContain('removeBlockedUser(counterpartyId)');
    expect(src).toContain('addBlockedUser(counterpartyId)');
    // The server flag on the conversation payload must be cleared/set too —
    // the screen ORs it into the derived state, so a stale true latches the UI.
    expect(src).toContain('setConversationRestricted(conversationId, false)');
    expect(src).toContain('setConversationRestricted(conversationId, true)');
    expect(src).toContain('setConversationBlocked(conversationId, false)');
    expect(src).toContain('setConversationBlocked(conversationId, true)');
  });
});
