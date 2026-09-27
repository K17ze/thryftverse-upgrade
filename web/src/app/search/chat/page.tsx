import { Suspense } from 'react';
import { ConvSearchClient } from '@/components/convsearch/ConvSearchClient';

export const metadata = {
  title: 'Conversational search',
};

export default function ConversationalSearchPage() {
  return (
    <Suspense>
      <ConvSearchClient />
    </Suspense>
  );
}
