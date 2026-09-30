'use client';

import { useParams } from 'next/navigation';
import { ConnectionsSkeleton, ConnectionsView } from '@/components/profile/ConnectionsView';
import { EmptyState } from '@/components/ui/EmptyState';
import { useUserByUsername } from '@/lib/hooks/queries';
import { useSession } from '@/lib/session/SessionProvider';

export default function FollowingPage() {
  const params = useParams();
  const username = String(params.username ?? '');
  const { data, isLoading, isFetched, isError, refetch } = useUserByUsername(username);
  const { user: me } = useSession();
  // A renamed session username misses the fixture table — the session's
  // merged user is the truth there.
  const user = data ?? (me?.username === username ? me : undefined);

  if (isLoading) return <ConnectionsSkeleton />;
  if (isError) {
    return (
      <div className="pt-16">
        <EmptyState
          icon="warning"
          title="Couldn't load this profile"
          subtitle="Check your connection and try again."
          actionLabel="Retry"
          onAction={() => refetch()}
        />
      </div>
    );
  }
  if (isFetched && !user) {
    return (
      <div className="pt-16">
        <EmptyState icon="search" title="Profile not found" subtitle="This account may have been removed." />
      </div>
    );
  }
  if (!user) return <ConnectionsSkeleton />;
  return <ConnectionsView user={user} kind="following" />;
}
