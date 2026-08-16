/**
 * Append-only crash journal for project edits.
 *
 * The journal lives at `{baseDir}/.journal` as newline-delimited JSON. Each
 * edit appends one line; a successful save calls `checkpoint()` to truncate
 * the file. On app start, `hasPending()` reveals whether the previous session
 * crashed mid-edit, so the UI can offer to restore the last known state.
 */

import { Directory, File } from 'expo-file-system';

import type { JournalEntry } from './projectTypes';

export class CrashJournal {
  private journalPath: string;

  constructor(baseDir: string) {
    // Ensure a trailing slash so the .journal file resolves as a sibling.
    const dir = baseDir.endsWith('/') ? baseDir : `${baseDir}/`;
    this.journalPath = `${dir}.journal`;
  }

  /** Append a journal entry (newline-delimited JSON). */
  async append(entry: JournalEntry): Promise<void> {
    this.ensureBaseDir();
    const file = new File(this.journalPath);
    if (!file.exists) {
      file.create({ overwrite: true });
    }
    const line = `${JSON.stringify(entry)}\n`;
    // Append mode: write with append:true re-writes from scratch in the new
    // API, so we read existing content, concatenate, and rewrite atomically.
    const existing = await file.text();
    file.write(existing + line);
  }

  /** Read all journal entries since the last checkpoint. */
  async read(): Promise<JournalEntry[]> {
    const file = new File(this.journalPath);
    if (!file.exists) return [];
    try {
      const raw = await file.text();
      const lines = raw.split('\n').filter((l) => l.trim().length > 0);
      const entries: JournalEntry[] = [];
      for (const line of lines) {
        try {
          entries.push(JSON.parse(line) as JournalEntry);
        } catch {
          // Skip malformed lines (e.g. a partially flushed last line).
        }
      }
      return entries;
    } catch {
      return [];
    }
  }

  /** Clear the journal (after a successful save). */
  async checkpoint(): Promise<void> {
    const file = new File(this.journalPath);
    if (!file.exists) return;
    file.write('');
  }

  /** Check if there are pending entries (app crashed mid-edit). */
  async hasPending(): Promise<boolean> {
    const entries = await this.read();
    return entries.length > 0;
  }

  /** Ensure the base directory for the journal exists. */
  private ensureBaseDir(): void {
    const dir = new Directory(this.journalPath.slice(0, this.journalPath.lastIndexOf('/') + 1));
    if (!dir.exists) {
      dir.create({ intermediates: true, idempotent: true });
    }
  }
}
