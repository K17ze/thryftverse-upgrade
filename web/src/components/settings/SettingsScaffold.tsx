'use client';

/**
 * SettingsScaffold — the shell for settings subroutes: transparent back
 * target returning to /settings, screen title, same 2xl column as the
 * settings index so the tree reads as one surface. At lg the layout's
 * nav rail owns wayfinding, so the back target steps back and the title
 * aligns with the section labels below it.
 */

import { useRouter } from 'next/navigation';
import { IconButton } from '@/components/ui/IconButton';

interface SettingsScaffoldProps {
  title: string;
  children: React.ReactNode;
}

export function SettingsScaffold({ title, children }: SettingsScaffoldProps) {
  const router = useRouter();
  return (
    <div className="mx-auto w-full max-w-2xl pb-16 pt-2 md:pt-6 lg:mx-0">
      <div className="flex items-center px-2 sm:px-4 lg:px-0">
        <IconButton
          name="back"
          aria-label="Back to settings"
          onClick={() => router.push('/settings')}
          className="-ml-1 lg:hidden"
        />
        <h1 className="ml-1 text-screen-title text-text-primary lg:ml-0 lg:px-5">
          {title}
        </h1>
      </div>
      <div className="mt-4">{children}</div>
    </div>
  );
}
