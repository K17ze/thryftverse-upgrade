import { useQuery } from '@tanstack/react-query';
import {
  fetchPublicProfile,
  fetchPublicProfileAggregate,
  PublicProfileUser,
  PublicProfileAggregate,
} from '../../services/profileApi';
import { queryKeys } from './queryKeys';

export function usePublicProfileQuery(userId: string | null | undefined) {
  const query = useQuery<PublicProfileAggregate>({
    queryKey: userId ? queryKeys.user.profile(userId) : ['user', 'profile', null],
    queryFn: () => fetchPublicProfileAggregate(userId!),
    enabled: Boolean(userId),
    staleTime: 1000 * 60 * 5,
  });

  return {
    ...query,
    // Backward-compatible accessor: existing consumers expect .data to be PublicProfileUser
    data: query.data?.user as PublicProfileUser | undefined,
    aggregate: query.data,
  };
}
