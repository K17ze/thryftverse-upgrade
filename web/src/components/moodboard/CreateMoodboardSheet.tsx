'use client';

/**
 * CreateMoodboardSheet — name + canvas theme, mirroring the mobile
 * createMoodboard(title, theme) flow. The board is created privately in
 * the boardPrefs overlay (POST /moodboards when live) and the chosen
 * theme lands in the moodboards overlay so the canvas opens styled.
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Sheet } from '@/components/ui/Sheet';
import { useToast } from '@/components/ui/Toast';
import { MOODBOARD_THEMES, DEFAULT_MOODBOARD_THEME } from '@/lib/data/fixtures-content';
import { useBoardPrefs } from '@/components/profile/boardPrefs';
import { useMoodboardEdits } from '@/lib/store/moodboards';
import { useSession } from '@/lib/session/SessionProvider';

interface CreateMoodboardSheetProps {
  open: boolean;
  onClose: () => void;
}

export function CreateMoodboardSheet({ open, onClose }: CreateMoodboardSheetProps) {
  const router = useRouter();
  const { show } = useToast();
  const { user } = useSession();
  const addMoodboard = useBoardPrefs((s) => s.addMoodboard);
  const setBoardTheme = useMoodboardEdits((s) => s.setBoardTheme);
  const [name, setName] = useState('');
  const [themeId, setThemeId] = useState(DEFAULT_MOODBOARD_THEME.id);

  const create = () => {
    const title = name.trim();
    if (!title) return;
    const id = `mb-local-${Date.now().toString(36)}`;
    addMoodboard({
      id,
      ownerId: user?.id ?? 'me',
      title,
      kind: 'moodboard',
      itemIds: [],
      isPrivate: true,
      createdAt: new Date().toISOString(),
    });
    setBoardTheme(id, themeId);
    setName('');
    setThemeId(DEFAULT_MOODBOARD_THEME.id);
    onClose();
    show('Moodboard created', 'success');
    router.push(`/moodboard/${id}`);
  };

  return (
    <Sheet open={open} onClose={onClose} title="New moodboard" maxWidth={440}>
      <div className="px-5 pb-5">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') create();
          }}
          placeholder="Name this board"
          aria-label="Moodboard name"
          maxLength={60}
          autoFocus
          className="h-11 w-full rounded-lg bg-input px-3.5 text-body text-input-text outline-none placeholder:text-text-muted focus:ring-1 focus:ring-brand"
        />

        <fieldset className="mt-4">
          <legend className="text-meta font-semibold uppercase tracking-wide text-text-muted">
            Canvas theme
          </legend>
          <div
            role="radiogroup"
            aria-label="Canvas theme"
            className="mt-2 flex flex-wrap gap-2"
          >
            {MOODBOARD_THEMES.map((t) => (
              <button
                key={t.id}
                type="button"
                role="radio"
                aria-checked={themeId === t.id}
                aria-label={t.label}
                title={t.label}
                onClick={() => setThemeId(t.id)}
                className={`pressable h-9 w-9 rounded-full transition-shadow ${
                  themeId === t.id
                    ? 'ring-2 ring-brand ring-offset-2 ring-offset-surface'
                    : 'ring-1 ring-border'
                }`}
                style={{ backgroundColor: t.backgroundColor }}
              />
            ))}
          </div>
          <p className="mt-2 text-meta text-text-muted">
            {MOODBOARD_THEMES.find((t) => t.id === themeId)?.label} — boards
            start private; share when ready.
          </p>
        </fieldset>

        <Button
          variant="primary"
          size="md"
          fullWidth
          disabled={!name.trim()}
          onClick={create}
          className="mt-5"
        >
          Create moodboard
        </Button>
      </div>
    </Sheet>
  );
}
