'use client';

/**
 * StartStep — pick a source. The CSV dropzone is the dominant object;
 * paste-listings recedes below a hairline divider. The file is parsed
 * here so format problems surface before consent — empty file, unreadable
 * text and zero-listing parses are all honest first-class states.
 */

import { useCallback, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import {
  CSV_FORMAT_NOTE,
  MAX_IMPORT_FILE_BYTES,
  SAMPLE_CSV_URI,
  parseCatalogCsv,
  type ImportBatch,
  type ImportRow,
} from './core';

interface StartStepProps {
  draftsCount: number;
  onSourceReady: (batch: ImportBatch, rows: ImportRow[]) => void;
  onViewDrafts: () => void;
}

const PASTE_PLACEHOLDER = `Oversized Denim Shirt,Weekday,M,Very good,28
Pleated Trousers,Cos,W30,Good,35`;

export function StartStep({ draftsCount, onSourceReady, onViewDrafts }: StartStepProps) {
  const [fileError, setFileError] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [pasteError, setPasteError] = useState<string | null>(null);

  const handleFile = useCallback(
    async (file: File | undefined | null) => {
      setFileError(null);
      if (!file) return;
      if (file.size > MAX_IMPORT_FILE_BYTES) {
        setFileError('Keep files under 1 MB.');
        return;
      }
      setReading(true);
      try {
        const text = await file.text();
        if (!text.trim()) {
          setFileError('That file is empty.');
          return;
        }
        const { rows, truncated } = parseCatalogCsv(text);
        if (rows.length === 0) {
          setFileError('No listings found — check the format below.');
          return;
        }
        onSourceReady({ source: 'csv', fileName: file.name, truncated }, rows);
      } catch {
        setFileError("Couldn't read that file. Try again.");
      } finally {
        setReading(false);
      }
    },
    [onSourceReady],
  );

  const handlePaste = useCallback(() => {
    setPasteError(null);
    const text = pasteText;
    if (!text.trim()) return;
    const { rows, truncated } = parseCatalogCsv(text);
    if (rows.length === 0) {
      setPasteError('No listings found — check the format above.');
      return;
    }
    onSourceReady({ source: 'paste', fileName: null, truncated }, rows);
  }, [pasteText, onSourceReady]);

  return (
    <div>
      <h1 className="text-screen-title font-bold text-text-primary">
        Bring your shop to ThryftVerse
      </h1>
      <p className="mt-2 max-w-md text-body text-text-secondary">
        We turn your catalogue into private drafts. You decide what goes live.
      </p>

      {/* ── CSV upload — the dominant object ── */}
      <label
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          void handleFile(e.dataTransfer.files?.[0]);
        }}
        className={`mt-8 flex cursor-pointer flex-col items-center justify-center rounded-md border border-dashed px-6 py-10 text-center transition-colors ${
          fileError ? 'border-danger-border' : 'border-border hover:border-text-muted'
        }`}
      >
        <Icon name="download" size={22} className="text-text-muted" />
        <span className="mt-3 text-body-emphasis font-medium text-text-primary">
          {reading ? 'Reading file…' : 'Drop a CSV file, or browse'}
        </span>
        <span className="mt-1.5 max-w-sm text-meta text-text-muted">{CSV_FORMAT_NOTE}</span>
        <input
          type="file"
          accept=".csv,text/csv,text/plain"
          className="sr-only"
          onChange={(e) => {
            void handleFile(e.target.files?.[0]);
            // Allow re-picking the same file after an error.
            e.target.value = '';
          }}
        />
      </label>
      {fileError ? (
        <p role="alert" className="mt-2 text-caption text-danger-text">
          {fileError}
        </p>
      ) : null}
      <a
        href={SAMPLE_CSV_URI}
        download="thryftverse-catalogue-sample.csv"
        className="pressable mt-3 inline-flex items-center gap-1.5 text-caption font-medium text-text-secondary underline-offset-4 hover:text-text-primary hover:underline"
      >
        <Icon name="document" size={14} />
        Download a sample CSV
      </a>

      {/* ── Paste listings — recedes, never equal weight ── */}
      <div className="mt-8 flex items-center gap-3" aria-hidden>
        <span className="h-px flex-1 bg-border-subtle" />
        <span className="text-meta text-text-muted">or paste listings</span>
        <span className="h-px flex-1 bg-border-subtle" />
      </div>
      <textarea
        value={pasteText}
        onChange={(e) => {
          setPasteText(e.target.value);
          if (pasteError) setPasteError(null);
        }}
        rows={5}
        placeholder={PASTE_PLACEHOLDER}
        aria-label="Paste listings — one per line"
        aria-invalid={!!pasteError}
        spellCheck={false}
        className={`mt-4 w-full resize-y rounded-md border bg-input px-3.5 py-3 text-body text-input-text placeholder:text-text-muted focus:outline-none ${
          pasteError ? 'border-danger-border' : 'border-border focus:border-text-muted'
        }`}
      />
      {pasteError ? (
        <p role="alert" className="mt-2 text-caption text-danger-text">
          {pasteError}
        </p>
      ) : null}
      <div className="mt-3 flex justify-end">
        <Button size="md" disabled={!pasteText.trim()} onClick={handlePaste}>
          Continue
        </Button>
      </div>

      {/* ── Earlier drafts — quiet session breadcrumb ── */}
      {draftsCount > 0 ? (
        <button
          type="button"
          onClick={onViewDrafts}
          className="pressable mt-8 flex w-full items-center gap-3 border-t border-border-subtle py-4 text-left"
        >
          <span className="min-w-0 flex-1">
            <span className="block text-body-emphasis font-medium text-text-primary">
              {draftsCount} imported draft{draftsCount === 1 ? '' : 's'}
            </span>
            <span className="mt-0.5 block text-meta text-text-muted">
              From earlier this session — private until you publish
            </span>
          </span>
          <Icon name="forward" size={16} className="shrink-0 text-text-muted" />
        </button>
      ) : null}
    </div>
  );
}
