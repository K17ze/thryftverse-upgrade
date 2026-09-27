'use client';

/**
 * DocumentStep — KYC step 2: document-type radio rows plus a single-file
 * photo upload with preview. Dropzone mirrors the sell-flow grammar (dashed
 * border, drag-and-drop, browse). Honest fixture note — nothing leaves the
 * browser and only the file name is remembered.
 */

import { useRef, useState } from 'react';
import { AppImage } from '@/components/ui/AppImage';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { VerificationNote } from './VerificationNote';
import {
  DOCUMENT_ACCEPT,
  KYC_DOCUMENT_TYPES,
  MAX_DOCUMENT_MB,
  kycDocumentTypeIcon,
  kycDocumentTypeLabel,
  kycDocumentTypeNoun,
  type KycDocumentType,
} from './verificationModel';

export interface KycDocumentFile {
  name: string;
  /** Object URL — preview only, revoked on replace/remove/unmount. */
  url: string;
}

interface DocumentStepProps {
  documentType: KycDocumentType;
  onSelectType: (type: KycDocumentType) => void;
  file: KycDocumentFile | null;
  error?: string;
  onPick: (files: FileList | null) => void;
  onRemove: () => void;
  onBack: () => void;
  onContinue: () => void;
}

export function DocumentStep({
  documentType,
  onSelectType,
  file,
  error,
  onPick,
  onRemove,
  onBack,
  onContinue,
}: DocumentStepProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const pick = () => inputRef.current?.click();

  const handleInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    onPick(e.target.files);
    e.target.value = '';
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files.length) onPick(e.dataTransfer.files);
  };

  return (
    <div>
      {/* Document type — one bordered list, hairline rows, radio semantics */}
      <p className="text-caption font-medium text-text-secondary">Document type</p>
      <ul
        role="radiogroup"
        aria-label="Document type"
        className="mt-2 overflow-hidden rounded-lg border border-border"
      >
        {KYC_DOCUMENT_TYPES.map((type) => {
          const selected = type === documentType;
          return (
            <li key={type} className="border-b border-border-subtle last:border-b-0">
              <button
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => onSelectType(type)}
                className={`pressable flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors ${
                  selected ? 'bg-brand-subtle' : 'bg-surface hover:bg-surface-alt'
                }`}
              >
                <Icon
                  name={kycDocumentTypeIcon(type)}
                  size={20}
                  className={selected ? 'text-text-primary' : 'text-text-secondary'}
                />
                <span
                  className={`flex-1 text-body-emphasis ${
                    selected ? 'font-medium text-text-primary' : 'text-text-secondary'
                  }`}
                >
                  {kycDocumentTypeLabel(type)}
                </span>
                {selected ? (
                  <Icon name="check" filled size={18} className="text-text-primary" />
                ) : null}
              </button>
            </li>
          );
        })}
      </ul>

      {/* Upload — dropzone becomes a preview once a file is picked */}
      <input
        ref={inputRef}
        type="file"
        accept={DOCUMENT_ACCEPT}
        className="hidden"
        onChange={handleInput}
        aria-label={`Upload a photo of your ${kycDocumentTypeNoun(documentType)}`}
      />

      <div
        className="mt-6"
        onDragOver={(e) => {
          e.preventDefault();
          if (e.dataTransfer.types.includes('Files')) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
      >
        {file ? (
          <div className="overflow-hidden rounded-lg border border-border">
            <AppImage
              src={file.url}
              alt={`Uploaded ${kycDocumentTypeNoun(documentType)} preview`}
              aspectRatio={1.6}
              sizes="(max-width: 720px) 100vw, 720px"
            />
            <div className="flex items-center gap-3 px-4 py-3">
              <Icon name="check" filled size={16} className="shrink-0 text-success-text" />
              <span className="clamp-1 flex-1 text-caption text-text-secondary">{file.name}</span>
              <button
                type="button"
                onClick={pick}
                className="pressable rounded-md px-2 py-1 text-caption font-semibold text-text-primary hover:bg-surface-alt"
              >
                Replace
              </button>
              <button
                type="button"
                onClick={onRemove}
                className="pressable rounded-md px-2 py-1 text-caption font-semibold text-text-secondary hover:bg-surface-alt"
              >
                Remove
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={pick}
            className={`pressable flex h-44 w-full flex-col items-center justify-center gap-2 rounded-lg border border-dashed text-center transition-colors ${
              dragging ? 'border-text-muted bg-surface-alt' : 'border-border hover:border-text-muted'
            }`}
          >
            <Icon name="document" size={28} className="text-text-muted" />
            <span className="px-4 text-body-emphasis font-medium text-text-primary">
              Add a photo of your {kycDocumentTypeNoun(documentType)}
            </span>
            <span className="px-4 text-caption text-text-muted">
              Drag and drop or browse — JPG, PNG or WebP, up to {MAX_DOCUMENT_MB} MB
            </span>
          </button>
        )}
      </div>

      {error ? (
        <p role="alert" className="mt-1.5 text-caption text-danger-text">
          {error}
        </p>
      ) : null}

      <VerificationNote icon="lock">
        Demo check — the photo stays in this browser tab. Nothing is uploaded,
        scanned or stored; only the file name is remembered for the preview.
      </VerificationNote>

      <div className="mt-8 flex items-center gap-3">
        <Button variant="quiet" size="md" onClick={onBack}>
          Back
        </Button>
        <Button variant="primary" size="md" className="flex-1" onClick={onContinue}>
          Continue to review
        </Button>
      </div>
    </div>
  );
}
