/**
 * Catalog import domain — the documented CSV grammar, the parser, per-row
 * validation and the draft-listing factory the wizard steps share.
 *
 * Seller-facing grammar:
 *   title,brand,size,condition,price[,description]
 * One listing per line. A header row naming the columns is optional.
 */

import type { Listing, ListingCondition, User } from '@/lib/contracts/domain';

export type ImportSource = 'csv' | 'paste';

export interface ImportBatch {
  source: ImportSource;
  fileName: string | null;
  /** Records beyond MAX_IMPORT_ROWS — reported as skipped, never dropped silently. */
  truncated: number;
}

export interface ImportRow {
  id: string;
  /** 1-based line number in the source text — used in skip reasons. */
  line: number;
  title: string;
  brand: string;
  size: string;
  condition: ListingCondition;
  /** The source named a condition we don't recognise — defaulted to Good. */
  conditionGuessed: boolean;
  priceText: string;
  description: string;
  excluded: boolean;
}

export interface RowErrors {
  title?: string;
  price?: string;
}

export interface SkippedRow {
  label: string;
  reason: string;
}

export interface ImportOutcome {
  source: ImportSource;
  fileName: string | null;
  importedCount: number;
  skipped: SkippedRow[];
}

// ============================================================================
// FORMAT — documented for sellers on the start step
// ============================================================================

export const MAX_IMPORT_ROWS = 200;
export const MAX_IMPORT_FILE_BYTES = 1_000_000;

export const CSV_FORMAT_NOTE =
  'One listing per line: title, brand, size, condition, price. A sixth description column is optional.';

export const SAMPLE_CSV = [
  'title,brand,size,condition,price,description',
  "Vintage Levi's 501 Jeans,Levi's,W32,Good,45,Classic straight leg",
  '"Silk Slip Dress, bias cut",Reformation,S,Very good,60,Worn once',
  'Sheffield Steel Band Tee,,L,Satisfactory,12,Print cracking at collar',
].join('\n');

export const SAMPLE_CSV_URI = `data:text/csv;charset=utf-8,${encodeURIComponent(SAMPLE_CSV)}`;

// ============================================================================
// CONDITION — accepts the marketplace vocabulary plus common export aliases
// ============================================================================

const CONDITION_ALIASES: Record<string, ListingCondition> = {
  'new with tags': 'New with tags',
  nwt: 'New with tags',
  new: 'New with tags',
  'brand new': 'New with tags',
  'new without tags': 'New without tags',
  nwot: 'New without tags',
  'like new': 'New without tags',
  'very good': 'Very good',
  'very good condition': 'Very good',
  vg: 'Very good',
  good: 'Good',
  'good condition': 'Good',
  satisfactory: 'Satisfactory',
  fair: 'Satisfactory',
  used: 'Satisfactory',
};

export function normaliseCondition(raw: string): {
  value: ListingCondition;
  guessed: boolean;
} {
  const key = raw.trim().toLowerCase();
  if (!key) return { value: 'Good', guessed: false };
  const hit = CONDITION_ALIASES[key];
  return hit ? { value: hit, guessed: false } : { value: 'Good', guessed: true };
}

// ============================================================================
// PARSER — lenient RFC-4180-style record splitter. Quoted fields, ""
// escapes, newlines inside quotes. An unclosed quote swallows the rest of
// the file rather than failing the whole import.
// ============================================================================

export function parseCsvRecords(text: string): string[][] {
  const records: string[][] = [];
  let field = '';
  let record: string[] = [];
  let inQuotes = false;

  const pushField = () => {
    record.push(field);
    field = '';
  };
  const pushRecord = () => {
    pushField();
    records.push(record);
    record = [];
  };

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"' && field === '') {
      inQuotes = true;
    } else if (ch === ',') {
      pushField();
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i += 1;
      pushRecord();
    } else {
      field += ch;
    }
  }
  // Tail record — the file may not end with a newline.
  if (field !== '' || record.length > 0) pushRecord();
  return records;
}

function isHeaderRecord(cells: string[]): boolean {
  const first = (cells[0] ?? '').trim().toLowerCase();
  return first === 'title' || first === 'item' || first === 'name';
}

export interface ParsedImport {
  rows: ImportRow[];
  truncated: number;
}

/** Parse CSV text (a file body or a pasted list) into editable rows. */
export function parseCatalogCsv(text: string): ParsedImport {
  const records = parseCsvRecords(text).filter((cells) =>
    cells.some((c) => c.trim() !== ''),
  );
  const offset = records.length > 0 && isHeaderRecord(records[0]) ? 1 : 0;
  const body = records.slice(offset);
  const truncated = Math.max(0, body.length - MAX_IMPORT_ROWS);
  const rows = body.slice(0, MAX_IMPORT_ROWS).map((cells, i) => {
    const condition = normaliseCondition(cells[3] ?? '');
    return {
      id: `row-${i}`,
      line: offset + i + 1,
      title: (cells[0] ?? '').trim(),
      brand: (cells[1] ?? '').trim(),
      size: (cells[2] ?? '').trim(),
      condition: condition.value,
      conditionGuessed: condition.guessed,
      priceText: (cells[4] ?? '').trim(),
      description: (cells[5] ?? '').trim(),
      excluded: false,
    } satisfies ImportRow;
  });
  return { rows, truncated };
}

// ============================================================================
// VALIDATION — per-row, surfaced inline in the review table
// ============================================================================

/** Accepts '45', '£45', '45.00' — rejects empty, non-numeric and zero. */
export function parseImportPrice(raw: string): number | null {
  const cleaned = raw.trim().replace(/[£$€\s]/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const n = Number.parseFloat(cleaned);
  return n > 0 ? n : null;
}

export function rowErrors(row: ImportRow): RowErrors {
  const errors: RowErrors = {};
  if (!row.title.trim()) errors.title = 'Missing title';
  if (parseImportPrice(row.priceText) == null) errors.price = 'Missing or invalid price';
  return errors;
}

export function hasErrors(row: ImportRow): boolean {
  const e = rowErrors(row);
  return Boolean(e.title || e.price);
}

export function rowLabel(row: ImportRow): string {
  return row.title.trim() || `Row ${row.line}`;
}

/** Why a row didn't become a draft — the error when there is one. */
export function skipReasonFor(row: ImportRow): string {
  const e = rowErrors(row);
  if (e.title && e.price) return 'Missing title and price';
  if (e.title) return e.title ?? 'Missing title';
  if (e.price) return e.price ?? 'Missing or invalid price';
  return 'Excluded';
}

// ============================================================================
// DRAFT FACTORY — imported rows become session-scoped draft listings
// ============================================================================

export function draftFromRow(row: ImportRow, seller: User, index: number): Listing {
  return {
    id: `imp-${Date.now().toString(36)}-${index}`,
    title: row.title.trim(),
    brand: row.brand.trim() || null,
    size: row.size.trim() || null,
    condition: row.condition,
    price: parseImportPrice(row.priceText) ?? 0,
    // Imports carry no photos — drafts show an honest empty cover.
    images: [],
    likes: 0,
    views: 0,
    sellerId: seller.id,
    seller: {
      id: seller.id,
      username: seller.username,
      avatar: seller.avatar,
      rating: seller.rating,
      reviewCount: seller.reviewCount,
      verified: seller.isVerified,
    },
    category: 'uncategorised',
    subcategory: null,
    description: row.description.trim(),
    createdAt: new Date().toISOString(),
    status: 'draft',
  };
}
