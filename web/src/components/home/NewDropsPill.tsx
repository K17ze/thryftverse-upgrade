import React from 'react';

/**
 * "N new drops" pill — appears when a refresh lands new units while
 * the user is down-feed; tapping scrolls home and clears it.
 */
export function NewDropsPill({
  newDrops,
  onDismiss,
}: {
  newDrops: number;
  onDismiss: () => void;
}) {
  if (newDrops <= 0) return null;

  return (
    <button
      type="button"
      onClick={() => {
        onDismiss();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }}
      className="pressable sticky top-[104px] z-elevated mx-auto mt-2 flex w-fit min-h-9 items-center gap-1.5 rounded-full bg-surface-elevated px-4 text-caption font-semibold text-text-primary shadow-modal border border-border"
    >
      {newDrops} new {newDrops === 1 ? 'drop' : 'drops'}
    </button>
  );
}
