import type { Metadata } from 'next';
import { CatalogImportFlow } from '@/components/catalogimport/CatalogImportFlow';

export const metadata: Metadata = {
  title: 'Import catalog — ThryftVerse',
};

export default function CatalogImportPage() {
  return <CatalogImportFlow />;
}
