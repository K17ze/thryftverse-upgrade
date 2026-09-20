import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Static contract: every `kind` written into wallet_ledger must be admitted
// by the table's CHECK constraint — and vice versa, the constraint must not
// silently drop a kind that live code depends on.
//
// This is the regression guard for the class of defect fixed by migration
// 324: production code wrote 'ONEZE_REFUND', 'CONVERT_TO_FIAT',
// 'CREATOR_EARNING_PAYOUT' and 'CO_OWN_DRIP' while the CHECK (introduced by
// 015) admitted none of them — every such insert raised 23514 on a real
// database. Runs without a DB: it parses the effective CHECK from the
// migration chain and scans all write sites.

const SRC_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MIGRATIONS_DIR = path.join(SRC_DIR, 'db', 'migrations');

// The effective CHECK for wallet_ledger.kind is the LAST migration that
// re-defines it (015 created it; later migrations may widen it — 324 does).
function effectiveLedgerKinds(): Set<string> {
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql') && !f.endsWith('_down.sql'))
    .sort();

  let kinds: Set<string> | null = null;
  for (const file of files) {
    const sql = readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
    // Find a wallet_ledger kind CHECK definition: either the inline column
    // CHECK in CREATE TABLE or an ADD CONSTRAINT ... CHECK block.
    const isLedgerCheck =
      /wallet_ledger/.test(sql)
      && /kind\s+IN\s*\(/i.test(sql);
    if (!isLedgerCheck) continue;

    const match = sql.match(/kind\s+IN\s*\(([^)]*)\)/i);
    if (!match) continue;
    kinds = new Set(
      [...match[1].matchAll(/'([A-Z_]+)'/g)].map((m) => m[1]),
    );
  }
  assert.ok(kinds, 'no wallet_ledger kind CHECK found in migrations');
  return kinds;
}

// Collect every literal kind written to wallet_ledger: via
// applyWalletLedgerDelta({ kind: 'X' }) calls and raw INSERT INTO
// wallet_ledger ... 'X' literals.
function writtenLedgerKinds(): Map<string, string[]> {
  const found = new Map<string, string[]>();
  const record = (kind: string, where: string) => {
    if (!found.has(kind)) found.set(kind, []);
    found.get(kind)!.push(where);
  };

  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === '__tests__' || entry.name === 'integration') continue;
        walk(full);
        continue;
      }
      if (!entry.name.endsWith('.ts')) continue;
      const rel = path.relative(SRC_DIR, full);
      const src = readFileSync(full, 'utf8');

      // applyWalletLedgerDelta({ kind: 'X' ... })
      for (const m of src.matchAll(/kind:\s*'([A-Z_]+)'/g)) {
        record(m[1], `${rel} (applyWalletLedgerDelta/insertWalletLedger input)`);
      }
      // Raw SQL: INSERT INTO wallet_ledger ... '<KIND>' literal in VALUES.
      const insertRe = /INSERT\s+INTO\s+wallet_ledger[\s\S]*?VALUES\s*\(([^;]+?)\)/gi;
      for (const m of src.matchAll(insertRe)) {
        for (const lit of m[1].matchAll(/'([A-Z_]{3,})'/g)) {
          // Heuristic: VALUES literals that look like kinds (uppercase) and
          // are not the asset column ('1ZE', 'FIAT') or ref_type snake_case.
          if (lit[1] !== '1ZE' && lit[1] !== 'FIAT') {
            record(lit[1], `${rel} (raw wallet_ledger INSERT)`);
          }
        }
      }
    }
  };
  walk(SRC_DIR);
  return found;
}

describe('wallet_ledger kind contract', () => {
  it('admits every kind literal that production code writes', () => {
    const admitted = effectiveLedgerKinds();
    const written = writtenLedgerKinds();
    const missing = [...written.keys()].filter((k) => !admitted.has(k));
    assert.deepEqual(
      missing,
      [],
      `wallet_ledger.kind CHECK does not admit kinds written by code: ${
        missing.map((k) => `${k} (${written.get(k)!.join(', ')})`).join('; ')
      }`,
    );
  });

  it('migration 324 kinds are present in the effective CHECK', () => {
    const admitted = effectiveLedgerKinds();
    for (const kind of [
      'ONEZE_REFUND',
      'CONVERT_TO_FIAT',
      'CREATOR_EARNING_PAYOUT',
      'CO_OWN_DRIP',
    ]) {
      assert.ok(admitted.has(kind), `effective wallet_ledger CHECK must admit ${kind}`);
    }
  });
});
