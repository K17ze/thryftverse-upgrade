/**
 * /collection/[id] — server shell. Collections are session/identity-owned
 * records (col-* boards, closet-<userId> rails) with no public server
 * read — the client view owns resolution and throws its definitive miss
 * to the not-found boundary.
 */

import type { Metadata } from 'next';
import { CollectionClient } from './CollectionClient';

export const metadata: Metadata = { title: 'Collection' };

export default function CollectionPage() {
  return <CollectionClient />;
}
