import type { Metadata } from 'next';
import { InviteView } from './InviteView';

export const metadata: Metadata = {
  title: 'Invite & earn',
};

export default function InvitePage() {
  return <InviteView />;
}
