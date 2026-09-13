import { queryClient } from './queryClient';

export function clearUserScopedQueryCache(): void {
  queryClient.cancelQueries({ queryKey: ['user'] }).catch(() => {});
  queryClient.cancelQueries({ queryKey: ['chat'] }).catch(() => {});
  queryClient.cancelQueries({ queryKey: ['discover'] }).catch(() => {});
  queryClient.cancelQueries({ queryKey: ['wishlist'] }).catch(() => {});
  queryClient.removeQueries({ queryKey: ['user'] });
  queryClient.removeQueries({ queryKey: ['chat'] });
  queryClient.removeQueries({ queryKey: ['discover'] });
  // The wishlist is user-scoped and mirrored from the Zustand store —
  // clear it so a previous user's items can't surface after logout.
  queryClient.removeQueries({ queryKey: ['wishlist'] });
  queryClient.setQueryData(['notifications', 'unread-count'], 0);
}
