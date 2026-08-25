/**
 * Seller Package Connector — universal seller-upload acquisition.
 *
 * This is the safest launch wedge: no OAuth, no scraping. The seller exports
 * their catalogue (CSV now, ZIP with images later) and uploads it to S3. We
 * extract listing rows and media references from the archive, applying strict
 * security inspection to every entry.
 *
 * Security checks (per blueprint §8 and OWASP guidance):
 * - Reject path traversal (../, absolute paths, drive letters).
 * - Reject symlinks, executables, scripts.
 * - Reject nested archives (zip bombs / polyglot attacks).
 * - Reject encrypted entries.
 * - Enforce max archive size, max decompressed size, and max expansion ratio.
 * - Enforce max item count per package.
 */

import crypto from 'node:crypto';
import { logger } from '../../lib/logger.js';
import { getObject } from '../../lib/s3.js';
import type {
  CatalogSource,
} from '../../domain/catalogImports/catalogImportTypes.js';
import type {
  DiscoveredSourceItem,
  HydratedSourceMedia,
  SellerPackageConnector,
  SellerPackageExtractionResult,
  SellerPackageManifest,
  SourceCapability,
} from './connector.js';

// ---------------------------------------------------------------------------
// Limits
// ---------------------------------------------------------------------------

const MAX_ITEMS_PER_PACKAGE = 500;
const MAX_ARCHIVE_SIZE_BYTES = 100 * 1024 * 1024; // 100 MB
const MAX_DECOMPRESSED_SIZE_BYTES = 500 * 1024 * 1024; // 500 MB
const MAX_EXPANSION_RATIO = 100;

/** File extensions that must never be extracted. */
const BLOCKED_EXTENSIONS = new Set([
  '.exe', '.bat', '.sh', '.cmd', '.com', '.scr', '.msi',
  '.ps1', '.vbs', '.js', '.jar', '.app',
]);

/** Extensions that indicate a nested archive (zip-bomb / polyglot risk). */
const NESTED_ARCHIVE_EXTENSIONS = new Set([
  '.zip', '.tar', '.gz', '.bz2', '.7z', '.rar', '.xz', '.tgz',
]);

// ---------------------------------------------------------------------------
// Minimal RFC 4180 CSV parser
// ---------------------------------------------------------------------------

/**
 * Parse RFC 4180 CSV text into rows of string fields. Handles quoted fields,
 * embedded quotes (doubled), and embedded newlines inside quotes.
 */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentField = '';
  let inQuotes = false;
  let i = 0;

  while (i < text.length) {
    const char = text[i];

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          // Doubled quote inside a quoted field -> literal quote.
          currentField += '"';
          i += 2;
          continue;
        }
        // Closing quote.
        inQuotes = false;
        i += 1;
        continue;
      }
      currentField += char;
      i += 1;
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }

    if (char === ',') {
      currentRow.push(currentField);
      currentField = '';
      i += 1;
      continue;
    }

    if (char === '\r') {
      // Handle CRLF and lone CR.
      currentRow.push(currentField);
      rows.push(currentRow);
      currentRow = [];
      currentField = '';
      if (text[i + 1] === '\n') {
        i += 2;
      } else {
        i += 1;
      }
      continue;
    }

    if (char === '\n') {
      currentRow.push(currentField);
      rows.push(currentRow);
      currentRow = [];
      currentField = '';
      i += 1;
      continue;
    }

    currentField += char;
    i += 1;
  }

  // Flush the last field/row if the file did not end with a newline.
  if (currentField.length > 0 || currentRow.length > 0) {
    currentRow.push(currentField);
    rows.push(currentRow);
  }

  // Drop trailing empty rows (common when files end with a newline).
  while (rows.length > 0) {
    const last = rows[rows.length - 1];
    if (last.length === 1 && last[0] === '') {
      rows.pop();
    } else {
      break;
    }
  }

  return rows;
}

// ---------------------------------------------------------------------------
// Security helpers
// ---------------------------------------------------------------------------

interface RejectedFile {
  fileName: string;
  reason: string;
}

/**
 * Validate a file entry name against path traversal and dangerous extensions.
 * Returns a rejection reason string, or null if the entry is safe.
 */
function inspectEntryName(fileName: string): string | null {
  // Reject path traversal.
  if (fileName.includes('..')) {
    return 'Path traversal sequence (../) detected';
  }
  if (fileName.startsWith('/') || fileName.startsWith('\\')) {
    return 'Absolute path detected';
  }
  // Reject Windows drive letters (e.g. C:\).
  if (/^[a-zA-Z]:[\\/]/.test(fileName)) {
    return 'Windows drive-letter path detected';
  }

  const lower = fileName.toLowerCase();
  for (const ext of BLOCKED_EXTENSIONS) {
    if (lower.endsWith(ext)) {
      return `Blocked executable extension: ${ext}`;
    }
  }
  for (const ext of NESTED_ARCHIVE_EXTENSIONS) {
    if (lower.endsWith(ext)) {
      return `Nested archive detected: ${ext}`;
    }
  }

  // Reject symlink-like names (not meaningful for CSV, but documented for ZIP).
  if (lower.includes('.lnk') || lower.endsWith('.symlink')) {
    return 'Symlink or shortcut file detected';
  }

  return null;
}

/**
 * Compute a SHA-256 checksum of a row's canonical content.
 */
function rowChecksum(row: Record<string, string>): string {
  const stable = Object.keys(row)
    .sort()
    .map((key) => `${key}=${row[key]}`)
    .join('|');
  return crypto.createHash('sha256').update(stable).digest('hex');
}

// ---------------------------------------------------------------------------
// Connector implementation
// ---------------------------------------------------------------------------

export class SellerPackageConnectorImpl implements SellerPackageConnector {
  readonly source: CatalogSource = 'seller_package';
  readonly capability: SourceCapability;

  constructor(capability: SourceCapability) {
    this.capability = capability;
  }

  async extractPackage(
    manifest: SellerPackageManifest,
    objectKey: string,
  ): Promise<SellerPackageExtractionResult> {
    logger.info(
      {
        packageId: manifest.packageId,
        fileName: manifest.fileName,
        contentType: manifest.contentType,
        sizeBytes: manifest.sizeBytes,
      },
      'seller_package.extractPackage.start',
    );

    if (manifest.sizeBytes > MAX_ARCHIVE_SIZE_BYTES) {
      throw new Error(
        `PACKAGE_TOO_LARGE: archive is ${manifest.sizeBytes} bytes, max is ${MAX_ARCHIVE_SIZE_BYTES}`,
      );
    }

    const archiveBuffer = await getObject(objectKey);
    if (archiveBuffer.byteLength > MAX_ARCHIVE_SIZE_BYTES) {
      throw new Error(
        `PACKAGE_TOO_LARGE: downloaded archive is ${archiveBuffer.byteLength} bytes, max is ${MAX_ARCHIVE_SIZE_BYTES}`,
      );
    }

    const contentType = manifest.contentType.toLowerCase();
    const isZip = contentType.includes('zip') || manifest.fileName.toLowerCase().endsWith('.zip');
    const isCsv = contentType.includes('csv') || manifest.fileName.toLowerCase().endsWith('.csv');

    if (isZip) {
      // ZIP support is a TODO for the next phase. The security checks above
      // (path traversal, blocked extensions, nested archives, expansion ratio,
      // encrypted entries) are documented and ready to apply once a ZIP
      // library is added to the dependency set. For now we reject ZIP uploads
      // with a clear error so the caller can fall back to CSV.
      throw new Error(
        'ZIP_ARCHIVE_NOT_SUPPORTED: CSV packages are supported in this phase. ZIP extraction is pending a zip-library dependency.',
      );
    }

    if (!isCsv) {
      throw new Error(
        `UNSUPPORTED_PACKAGE_FORMAT: contentType=${manifest.contentType}. Supported: text/csv.`,
      );
    }

    return this.extractCsv(archiveBuffer);
  }

  private extractCsv(buffer: Buffer): SellerPackageExtractionResult {
    const text = buffer.toString('utf-8');
    const rows = parseCsv(text);
    if (rows.length === 0) {
      return { items: [], mediaByItemRef: new Map(), rejectedFiles: [] };
    }

    const headerRow = rows[0];
    if (!headerRow) {
      return { items: [], mediaByItemRef: new Map(), rejectedFiles: [] };
    }

    const headers = headerRow.map((h) => h.trim().toLowerCase());
    const columnIndex = new Map<string, number>();
    for (let i = 0; i < headers.length; i++) {
      const header = headers[i];
      if (header !== undefined && !columnIndex.has(header)) {
        columnIndex.set(header, i);
      }
    }

    const dataRows = rows.slice(1);
    if (dataRows.length > MAX_ITEMS_PER_PACKAGE) {
      throw new Error(
        `PACKAGE_ITEM_LIMIT_EXCEEDED: ${dataRows.length} rows found, max is ${MAX_ITEMS_PER_PACKAGE}`,
      );
    }

    const items: DiscoveredSourceItem[] = [];
    const mediaByItemRef = new Map<string, HydratedSourceMedia[]>();
    const rejectedFiles: RejectedFile[] = [];

    for (let rowIdx = 0; rowIdx < dataRows.length; rowIdx++) {
      const rawRow = dataRows[rowIdx];
      if (!rawRow) {
        continue;
      }

      // Build a field map from the row using the header positions.
      const rowRecord: Record<string, string> = {};
      for (const [header, idx] of columnIndex) {
        const value = rawRow[idx];
        rowRecord[header] = value !== undefined ? value : '';
      }

      // Skip fully empty rows.
      if (Object.values(rowRecord).every((v) => v.trim() === '')) {
        continue;
      }

      const sku = rowRecord['sku']?.trim() ?? '';
      const externalItemId = sku.length > 0 ? sku : `row-${rowIdx + 1}`;

      // Inspect any file-like references in the row (image_url / image_urls).
      // These are URLs, not archive entries, but we still reject obviously
      // dangerous local-file schemes.
      const imageUrl = rowRecord['image_url']?.trim() ?? '';
      const imageUrlsRaw = rowRecord['image_urls']?.trim() ?? '';

      const mediaEntries: HydratedSourceMedia[] = [];
      let position = 0;

      if (imageUrl.length > 0) {
        const rejection = inspectUrl(imageUrl);
        if (rejection) {
          rejectedFiles.push({ fileName: `row-${rowIdx + 1}.image_url`, reason: rejection });
        } else {
          mediaEntries.push({
            url: imageUrl,
            position,
            declaredMimeType: undefined,
          });
          position += 1;
        }
      }

      if (imageUrlsRaw.length > 0) {
        const urls = imageUrlsRaw.split(';').map((u) => u.trim()).filter((u) => u.length > 0);
        for (const url of urls) {
          const rejection = inspectUrl(url);
          if (rejection) {
            rejectedFiles.push({ fileName: `row-${rowIdx + 1}.image_urls`, reason: rejection });
            continue;
          }
          mediaEntries.push({
            url,
            position,
            declaredMimeType: undefined,
          });
          position += 1;
        }
      }

      const minimal: Record<string, unknown> = {
        title: rowRecord['title'] ?? '',
        description: rowRecord['description'] ?? '',
        price: rowRecord['price'] ?? '',
        currency: rowRecord['currency'] ?? '',
        category: rowRecord['category'] ?? '',
        brand: rowRecord['brand'] ?? '',
        size: rowRecord['size'] ?? '',
        condition: rowRecord['condition'] ?? '',
        quantity: rowRecord['quantity'] ?? '',
        sku: rowRecord['sku'] ?? '',
        image_url: rowRecord['image_url'] ?? '',
        image_urls: rowRecord['image_urls'] ?? '',
      };

      items.push({
        externalItemId,
        sourceState: 'active',
        sourceChecksum: rowChecksum(rowRecord),
        minimal,
      });

      if (mediaEntries.length > 0) {
        mediaByItemRef.set(externalItemId, mediaEntries);
      }
    }

    logger.info(
      {
        itemCount: items.length,
        mediaRefCount: mediaByItemRef.size,
        rejectedCount: rejectedFiles.length,
      },
      'seller_package.extractPackage.complete',
    );

    return { items, mediaByItemRef, rejectedFiles };
  }
}

/**
 * Reject URLs that reference local filesystem or non-http(s) schemes. The
 * remote media importer (remoteImport.ts) performs full SSRF validation; this
 * is a first-pass filter at the extraction layer.
 */
function inspectUrl(url: string): string | null {
  const lower = url.toLowerCase();
  if (lower.startsWith('file://')) {
    return 'file:// scheme is not allowed';
  }
  if (lower.startsWith('data:')) {
    return 'data: URI is not allowed';
  }
  if (lower.startsWith('ftp://')) {
    return 'ftp:// scheme is not allowed';
  }
  if (!lower.startsWith('http://') && !lower.startsWith('https://')) {
    return `Unsupported URL scheme: ${lower.split(':')[0] ?? 'unknown'}`;
  }
  return null;
}
