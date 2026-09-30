'use client';

import type { RefObject } from 'react';
import { AppImage } from '@/components/ui/AppImage';
import { Icon } from '@/components/ui/Icon';
import { FIELD_LABEL } from './CreateStreamPrimitives';
import type { CoverPick } from './useCreateStreamWorkflow';

interface CreateStreamCoverPickerProps {
  cover: CoverPick | null;
  coverOptions: CoverPick[];
  onSelectCoverKey: (key: string) => void;
  fileRef: RefObject<HTMLInputElement | null>;
  onUpload: (files: FileList | null) => void;
  error?: string;
}

export function CreateStreamCoverPicker({
  cover,
  coverOptions,
  onSelectCoverKey,
  fileRef,
  onUpload,
  error,
}: CreateStreamCoverPickerProps) {
  return (
    <fieldset>
      <legend className={FIELD_LABEL}>Cover</legend>
      <div className="relative mt-3 aspect-[16/10] w-full overflow-hidden rounded-lg bg-surface-alt">
        {cover ? (
          <AppImage
            src={cover.uri}
            alt="Show cover preview"
            fill
            className="h-full w-full"
            sizes="720px"
          />
        ) : null}
      </div>
      <div className="no-scrollbar mt-3 flex gap-2.5 overflow-x-auto pb-1">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="pressable flex h-[72px] w-[72px] shrink-0 flex-col items-center justify-center gap-1 rounded-md border border-dashed border-border text-text-muted transition-colors hover:border-text-muted hover:text-text-secondary"
          aria-label="Upload a cover photo"
        >
          <Icon name="camera" size={20} />
          <span className="text-micro font-medium">Upload</span>
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            onUpload(e.target.files);
            e.target.value = '';
          }}
        />
        <div role="radiogroup" aria-label="Choose a cover" className="flex gap-2.5">
          {coverOptions.map((option) => {
            const selected = cover?.key === option.key;
            return (
              <button
                key={option.key}
                type="button"
                role="radio"
                aria-checked={selected}
                aria-label={option.key === 'upload' ? 'Uploaded cover' : 'Listing cover'}
                onClick={() => onSelectCoverKey(option.key)}
                className={`pressable relative h-[72px] w-[72px] shrink-0 overflow-hidden rounded-md border ${
                  selected ? 'border-text-primary' : 'border-border'
                }`}
              >
                <AppImage src={option.uri} alt="" fill sizes="72px" className="h-full w-full" />
                {selected ? (
                  <span className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-scrim-text-primary text-black">
                    <Icon name="check" size={11} />
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>
      {error ? (
        <p role="alert" className="mt-1.5 text-caption text-danger-text">{error}</p>
      ) : null}
    </fieldset>
  );
}
