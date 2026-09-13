/**
 * useGroupMembersAddFlow — the inline add-members flow: username search
 * (350ms debounce, min 2 chars, self/existing-member filtered), multi-select,
 * and the optimistic add-members mutation with rollback. Extracted verbatim
 * from GroupMembersScreen.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useStore } from '../../store/useStore';
import type { Conversation } from '../../domain';
import { addConversationMembersOnApi } from '../../services/chatApi';
import { searchUsers, type UserSearchResult } from '../../services/profileApi';
import { parseApiError } from '../../lib/apiClient';
import { useHaptic } from '../useHaptic';
import { useToast } from '../../context/ToastContext';

export interface GroupMembersAddFlowResult {
  showAddMembers: boolean;
  openAddMembers: () => void;
  cancelAddMembers: () => void;
  addQuery: string;
  setAddQuery: (query: string) => void;
  searchResults: UserSearchResult[];
  isSearching: boolean;
  hasSearched: boolean;
  searchError: string;
  selectedToAdd: Set<string>;
  toggleSelectToAdd: (userId: string) => void;
  isAdding: boolean;
  handleAddMembers: () => Promise<void>;
}

export function useGroupMembersAddFlow(
  conversationId: string,
  conversation: Conversation | undefined,
  currentUserId: string | undefined,
): GroupMembersAddFlowResult {
  const haptic = useHaptic();
  const { show } = useToast();
  const upsertConversation = useStore((state) => state.upsertConversation);

  const [showAddMembers, setShowAddMembers] = useState(false);
  const [addQuery, setAddQuery] = useState('');
  const [searchResults, setSearchResults] = useState<UserSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [selectedToAdd, setSelectedToAdd] = useState<Set<string>>(new Set());
  const [isAdding, setIsAdding] = useState(false);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const performSearch = useCallback(async (query: string) => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setSearchResults([]);
      setHasSearched(false);
      setSearchError('');
      return;
    }
    setIsSearching(true);
    setHasSearched(false);
    setSearchError('');
    try {
      const results = await searchUsers(trimmed, 20);
      const existingIds = new Set(conversation?.participantIds ?? []);
      const filtered = results.filter((r) => r.id !== currentUserId && !existingIds.has(r.id));
      setSearchResults(filtered);
      setHasSearched(true);
    } catch (err) {
      setSearchResults([]);
      setHasSearched(true);
      setSearchError(parseApiError(err, 'Search failed. Check your connection.').message);
    } finally {
      setIsSearching(false);
    }
  }, [conversation?.participantIds, currentUserId]);

  useEffect(() => {
    if (!showAddMembers) return;
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    if (!addQuery.trim()) {
      setSearchResults([]);
      setHasSearched(false);
      setIsSearching(false);
      setSearchError('');
      return;
    }
    searchTimerRef.current = setTimeout(() => {
      void performSearch(addQuery);
    }, 350);
    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, [addQuery, performSearch, showAddMembers]);

  const toggleSelectToAdd = (userId: string) => {
    haptic.light();
    setSelectedToAdd((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  };

  const openAddMembers = () => setShowAddMembers(true);

  const cancelAddMembers = () => {
    setShowAddMembers(false);
    setAddQuery('');
    setSearchResults([]);
    setSelectedToAdd(new Set());
    setHasSearched(false);
  };

  const handleAddMembers = async () => {
    if (selectedToAdd.size === 0) return;
    haptic.medium();
    setIsAdding(true);
    const prevParticipantIds = conversation?.participantIds;
    const prevParticipantProfiles = conversation?.participantProfiles;
    const prevMemberRoles = conversation?.memberRoles;
    const prevOwnerId = conversation?.ownerId;
    const existingIds = new Set(conversation?.participantIds ?? []);
    const addedIds = Array.from(selectedToAdd).filter((id) => !existingIds.has(id));
    const addedProfiles = searchResults
      .filter((u) => selectedToAdd.has(u.id))
      .map((u) => ({
        id: u.id,
        username: u.username,
        displayName: u.displayName,
        avatar: u.avatar,
      }));
    const existingProfileIds = new Set((conversation?.participantProfiles ?? []).map((p) => p.id));
    const mergedProfiles = [
      ...(conversation?.participantProfiles ?? []),
      ...addedProfiles.filter((p) => !existingProfileIds.has(p.id)),
    ];
    upsertConversation({
      ...conversation!,
      participantIds: [...(conversation?.participantIds ?? []), ...addedIds],
      participantProfiles: mergedProfiles });
    try {
      const result = await addConversationMembersOnApi(conversationId, Array.from(selectedToAdd));
      upsertConversation({
        ...conversation!,
        participantIds: result.participantIds,
        participantProfiles: mergedProfiles });
      show(`${selectedToAdd.size} member${selectedToAdd.size === 1 ? '' : 's'} added`, 'success');
      setSelectedToAdd(new Set());
      setAddQuery('');
      setSearchResults([]);
      setHasSearched(false);
      setShowAddMembers(false);
    } catch (err) {
      upsertConversation({
        ...conversation!,
        participantIds: prevParticipantIds,
        participantProfiles: prevParticipantProfiles,
        memberRoles: prevMemberRoles,
        ownerId: prevOwnerId });
      show(parseApiError(err, 'Could not add members. Try again.').message, 'error');
    } finally {
      setIsAdding(false);
    }
  };

  return {
    showAddMembers,
    openAddMembers,
    cancelAddMembers,
    addQuery,
    setAddQuery,
    searchResults,
    isSearching,
    hasSearched,
    searchError,
    selectedToAdd,
    toggleSelectToAdd,
    isAdding,
    handleAddMembers,
  };
}
