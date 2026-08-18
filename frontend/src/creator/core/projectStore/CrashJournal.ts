/**
 * Crash journal for project edits.
 *
 * The journal lives at `{baseDir}/crash_journal.json` as a single JSON file
 * (not append-only NDJSON — the new API's synchronous write makes a full
 * rewrite simpler and equally durable when combined with the ProjectStore's
 * atomic checkpointing).
 *
 * Protocol:
 * - Before a risky operation (e.g. saveProject), call `begin()` to record
 *   the intent.
 * - After successful completion, call `commit()` to clear the journal.
 * - On startup, call `hasPending()` to detect whether the previous session
 *   crashed mid-operation. If so, `read()` returns the incomplete entry so
 *   the caller can attempt recovery (e.g. restore from `.bak`).
 */

import { Directory, File } from 'expo-file-system';

import type { JournalEntry } from './projectTypes';

export class CrashJournal {
  private journalPath: string;

  constructor(baseDir: string) {
    // Ensure a trailing slash so the journal file resolves as a sibling.
    const dir = baseDir.endsWith('/') ? baseDir : `${baseDir}/`;
    this.journalPath = `${dir}crash_journal.json`;
  }

  /**
   * Record the beginning of a risky operation. This should be called BEFORE
   * the operation starts. If the app crashes before `commit()` is called,
   * this entry will be visible on next startup via `hasPending()`.
   */
  async begin(entry: JournalEntry): Promise<void> {
    this.ensureBaseDir();
    const file = new File(this.journalPath);
    if (!file.exists) {
      file.create({ overwrite: true });
    }
    file.write(JSON.stringify(entry));
  }

  /**
   * Alias for `begin()` — records a journal entry before a risky operation.
   * Kept for backward compatibility with callers that use `append()`.
   */
  async append(entry: JournalEntry): Promise<void> {
    await this.begin(entry);
  }

  /**
   * Read the current journal entry (if any). Returns the entry from the
   * last `begin()` that was not followed by `commit()`.
   */
  async read(): Promise<JournalEntry | null> {
    const file = new File(this.journalPath);
    if (!file.exists) return null;
    try {
      const raw = await file.text();
      const trimmed = raw.trim();
      if (trimmed.length === 0) return null;
      return JSON.parse(trimmed) as JournalEntry;
    } catch {
      // Malformed journal — treat as no pending entry.
      return null;
    }
  }

  /**
   * Clear the journal after a successful operation. This is the
   * "checkpoint" — once called, the previous `begin()` is considered
   * complete and will not trigger recovery on next startup.
   */
  async commit(): Promise<void> {
    const file = new File(this.journalPath);
    if (!file.exists) return;
    file.write('');
  }

  /**
   * Alias for `commit()` — kept for backward compatibility.
   */
  async checkpoint(): Promise<void> {
    await this.commit();
  }

  /**
   * Check if there is a pending (incomplete) operation from a previous
   * session. Call this on startup to detect crashes.
   */
  async hasPending(): Promise<boolean> {
    const entry = await this.read();
    return entry !== null;
  }

  /**
   * Attempt recovery for a pending journal entry. This reads the entry,
   * invokes the provided recovery function, and clears the journal on
   * success.
   *
   * @returns The recovered entry if recovery was needed, or `null` if
   *          there was no pending entry.
   */
  async attemptRecovery(
    recover: (entry: JournalEntry) => Promise<boolean>,
  ): Promise<JournalEntry | null> {
    const entry = await this.read();
    if (!entry) return null;
    try {
      const success = await recover(entry);
      if (success) {
        await this.commit();
      }
    } catch (err) {
      console.warn('[CrashJournal] Recovery attempt failed:', err);
    }
    return entry;
  }

  /** Ensure the base directory for the journal exists. */
  private ensureBaseDir(): void {
    const dir = new Directory(
      this.journalPath.slice(0, this.journalPath.lastIndexOf('/') + 1),
    );
    if (!dir.exists) {
      dir.create({ intermediates: true, idempotent: true });
    }
  }
}
