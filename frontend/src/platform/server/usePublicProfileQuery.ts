import { useQuery } from '@tanstack/react-query';
import { fetchPublicProfile, PublicProfileUser } from '../../services/profileApi';
import { queryKeys } from './queryKeys';

export function usePublicProfileQuery(userId: string | null | undefined) {
  return useQuery<PublicProfileUser>({
    queryKey: userId ? queryKeys.user.profile(userId) : ['user', 'profile', null],
    queryFn: () => fetchPublicProfile(userId!),
    enabled: Boolean(userId),
    staleTime: 1000 * 60 * 5,
  });
}
