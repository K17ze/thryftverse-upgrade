'use client';

import { SettingsView } from '@/components/settings/SettingsView';

export default function SettingsPage() {
  return (
    <div className="mx-auto w-full max-w-2xl pb-16 pt-4 md:pt-8">
      <h1 className="px-4 pb-2 text-screen-title font-semibold text-text-primary sm:px-5">
        Settings
      </h1>
      <SettingsView />
    </div>
  );
}
