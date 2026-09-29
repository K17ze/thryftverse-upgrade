import type { Metadata } from 'next';
import { CreateCoOwnView } from '@/components/coown/create/CreateCoOwnView';

export const metadata: Metadata = {
  title: 'Issue a Co-Own',
  description:
    'Split one of your listings into tradable Co-Own units — verified issuers only, settled in 1ZE.',
};

export default function CreateCoOwnPage() {
  return <CreateCoOwnView />;
}
