export const MAX_MEMBERS = 50;
export const MIN_MEMBERS = 1;
export const SEARCH_DEBOUNCE_MS = 350;

export interface SelectableUser {
  id: string;
  username: string;
  displayName: string | null;
  avatar: string | null;
}

export type Stage = 'select' | 'details';

export function canContinueToDetails(selectedCount: number): boolean {
  return selectedCount >= MIN_MEMBERS;
}

export function canCreateGroup(title: string, selectedCount: number): boolean {
  return title.trim().length > 0 && selectedCount >= MIN_MEMBERS;
}

export function filterBlockedUsers(
  results: SelectableUser[],
  isBlocked: (userId: string) => boolean
): SelectableUser[] {
  return results.filter((user) => !isBlocked(user.id));
}

export function filterSelfFromResults(
  results: SelectableUser[],
  currentUserId: string | null
): SelectableUser[] {
  if (!currentUserId) return results;
  return results.filter((r) => r.id !== currentUserId);
}

export function toggleMemberId(
  currentIds: string[],
  userId: string
): { ids: string[]; added: boolean } {
  if (currentIds.includes(userId)) {
    return { ids: currentIds.filter((id) => id !== userId), added: false };
  }
  if (currentIds.length >= MAX_MEMBERS) {
    return { ids: currentIds, added: false };
  }
  return { ids: [...currentIds, userId], added: true };
}

export function validateGroupTitle(title: string): string | null {
  const trimmed = title.trim();
  if (!trimmed) return 'Add a group name to continue.';
  if (trimmed.length < 2) return 'Group name must be at least 2 characters.';
  if (trimmed.length > 80) return 'Group name must be at most 80 characters.';
  return null;
}

export function isSearchQueryValid(query: string): boolean {
  return query.trim().length >= 2;
}
