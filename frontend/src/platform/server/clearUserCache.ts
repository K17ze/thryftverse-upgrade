import { queryClient } from './queryClient';

export function clearUserScopedQueryCache(): void {
  queryClient.cancelQueries({ queryKey: ['user'] }).catch(() => {});
  queryClient.cancelQueries({ queryKey: ['chat'] }).catch(() => {});
  queryClient.cancelQueries({ queryKey: ['discover'] }).catch(() => {});
  queryClient.removeQueries({ queryKey: ['user'] });
  queryClient.removeQueries({ queryKey: ['chat'] });
  queryClient.removeQueries({ queryKey: ['discover'] });
  queryClient.setQueryData(['notifications', 'unread-count'], 0);
}
