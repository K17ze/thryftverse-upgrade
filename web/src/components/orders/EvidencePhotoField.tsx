'use client';

/**
 * EvidencePhotoField — the evidence attach control shared by the order
 * issue and return sheets. Reason-specific guidance owns whether this
 * renders at all; when it does, tiles preview the real picked images
 * (object URLs — blob previews can't flow through next/image, same rule
 * as ReportEvidenceGrid) with a per-tile remove action. Live mode uploads
 * via the uploads service on pick; fixture mode keeps the object URL —
 * the same session-local honesty boundary as the rest of fixture mode.
 */

import { useRef, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { useToast } from '@/components/ui/Toast';
import { DATA_MODE } from '@/lib/api/client';
import { uploadImageFile } from '@/lib/api/services/uploads';

export const MAX_EVIDENCE_PHOTOS = 3;

export interface EvidencePhoto {
  id: string;
  /** Remote URL (live upload result) or session object URL (fixture). */
  uri: string;
  state: 'uploading' | 'attached' | 'failed';
}

interface EvidencePhotoFieldProps {
  /** "Evidence" when photos are expected, "Evidence (optional)" otherwise. */
  label: string;
  /** Reason-specific guidance line — e.g. "photos of the damage and the
   *  original packaging". */
  hint: string;
  items: EvidencePhoto[];
  onChange: (items: EvidencePhoto[]) => void;
}

export function EvidencePhotoField({ label, hint, items, onChange }: EvidencePhotoFieldProps) {
  const { show } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const remaining = MAX_EVIDENCE_PHOTOS - items.length;

  const remove = (id: string) => {
    const item = items.find((i) => i.id === id);
    if (item?.uri.startsWith('blob:')) URL.revokeObjectURL(item.uri);
    onChange(items.filter((i) => i.id !== id));
  };

  const addFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const picked = Array.from(files).slice(0, remaining);
    // Preview immediately — the tile must show the real image before the
    // upload resolves so a slow network doesn't render phantom evidence.
    const staged: EvidencePhoto[] = picked.map((file, i) => ({
      id: `ev-${Date.now().toString(36)}-${i}`,
      uri: URL.createObjectURL(file),
      state: DATA_MODE === 'live' ? 'uploading' : 'attached',
    }));
    onChange([...items, ...staged]);

    if (DATA_MODE !== 'live') return;
    setBusy(true);
    // Upload sequentially — small count (≤3), keeps ordering stable.
    let current = [...items, ...staged];
    for (let i = 0; i < picked.length; i++) {
      const pending = staged[i];
      try {
        const url = (await uploadImageFile(picked[i], 'evidence')).publicUrl;
        URL.revokeObjectURL(pending.uri);
        current = current.map((it) =>
          it.id === pending.id ? { ...it, uri: url, state: 'attached' as const } : it,
        );
        onChange(current);
      } catch {
        current = current.map((it) =>
          it.id === pending.id ? { ...it, state: 'failed' as const } : it,
        );
        onChange(current);
        show('A photo could not be uploaded — remove it and try again.', 'error');
      }
    }
    setBusy(false);
  };

  return (
    <div className="mt-4">
      <p className="text-label text-text-muted">{label}</p>
      {hint ? <p className="mt-1 text-caption text-text-secondary">{hint}</p> : null}

      {items.length > 0 ? (
        <ul className="mt-2.5 flex flex-wrap gap-2">
          {items.map((item, i) => (
            <li key={item.id} className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element -- object-URL previews cannot go through next/image */}
              <img
                src={item.uri}
                alt={`Evidence photo ${i + 1}`}
                className="h-[72px] w-[72px] rounded-md object-cover"
              />
              {item.state === 'uploading' ? (
                <span className="absolute inset-0 flex items-center justify-center rounded-md bg-media-overlay-scrim">
                  <Icon name="clock" size={16} className="text-scrim-text-primary" />
                </span>
              ) : item.state === 'failed' ? (
                <span className="absolute inset-0 flex items-center justify-center rounded-md bg-media-overlay-scrim">
                  <Icon name="alert" size={16} className="text-scrim-text-primary" />
                </span>
              ) : (
                <span className="absolute bottom-1 left-1 flex h-5 w-5 items-center justify-center rounded-full bg-success">
                  <Icon name="check" size={12} className="text-scrim-text-primary" />
                </span>
              )}
              <button
                type="button"
                onClick={() => remove(item.id)}
                aria-label={`Remove evidence photo ${i + 1}`}
                className="pressable absolute -right-1.5 -top-1.5 text-danger-text"
              >
                <Icon name="close" filled size={22} />
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {items.length < MAX_EVIDENCE_PHOTOS ? (
        <>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            aria-hidden
            tabIndex={-1}
            onChange={(e) => {
              void addFiles(e.target.files);
              // Reset so picking the same file twice still fires change.
              e.target.value = '';
            }}
          />
          <button
            type="button"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
            className="pressable mt-2.5 flex min-h-11 w-full items-center justify-center gap-2 rounded-md border border-dashed border-border text-body text-text-secondary disabled:opacity-50"
          >
            <Icon name="camera" size={18} />
            {busy ? 'Uploading…' : `Add photo (${items.length}/${MAX_EVIDENCE_PHOTOS})`}
          </button>
        </>
      ) : null}
    </div>
  );
}
