/**
 * Explicit migration chain for the project package schema.
 *
 * Each migration transforms a project from `fromVersion` to `toVersion`.
 * Migrations are applied in order until the project reaches
 * {@link PROJECT_SCHEMA_VERSION}.
 *
 * Safety rules (per spec §11_PROJECT_STORAGE):
 * - Never stamp the current version when no migration path exists.
 * - If a migration is unavailable, return `unsupported` with the exact
 *   version gap.
 * - If validation fails after migration, return `recovery-needed` with the
 *   raw payload for recovery logic.
 * - The original version field is never mutated unless a migration succeeds.
 */

import { PROJECT_SCHEMA_VERSION } from './projectTypes';
import type { MigrationResult, ProjectPackage } from './projectTypes';
import { extractVersion, validateProject } from './ProjectSchema';

// ── Migration type ──────────────────────────────────────────────────

/**
 * A single migration step that transforms a raw project payload from
 * `fromVersion` to `toVersion`.
 */
export type Migration = {
  fromVersion: number;
  toVersion: number;
  migrate: (raw: Record<string, unknown>) => Record<string, unknown>;
};

// ── Registered migrations ───────────────────────────────────────────

/**
 * The ordered list of registered migrations. Each entry upgrades from
 * `fromVersion` to `toVersion`. The chain is walked sequentially.
 */
export const MIGRATIONS: Migration[] = [
  {
    fromVersion: 1,
    toVersion: 2,
    migrate: (v1) => {
      // v1 → v2: add assets index, folderId, coverFrameAssetId.
      // v1 projects may have an `assets` map of AssetRef objects; we
      // preserve whatever exists and default to an empty index.
      // folderId and coverFrameAssetId are new optional fields.
      return {
        ...v1,
        version: 2,
        assets: (v1['assets'] as Record<string, unknown> | undefined) ?? {},
        folderId: v1['folderId'] ?? null,
        coverFrameAssetId: v1['coverFrameAssetId'] ?? null,
      };
    },
  },
];

// ── Migration runner ────────────────────────────────────────────────

/**
 * Attempt to bring a raw, loaded project payload up to the current schema
 * version.
 *
 * Steps:
 * 1. Extract the `version` field from the raw payload.
 * 2. If the version is already current, validate and return `ok`.
 * 3. If the version is older, apply migrations in order until current.
 * 4. If no migration path exists for a version gap, return `unsupported`
 *    — the version is NOT stamped current.
 * 5. If validation fails after migration, return `recovery-needed`.
 */
export function migrateProject(raw: unknown): MigrationResult {
  // Step 1: Extract version.
  const version = extractVersion(raw);
  if (version === null) {
    return {
      status: 'recovery-needed',
      reason: 'Missing or non-numeric version field',
      raw,
    };
  }

  // Step 2: If already current, validate and return.
  if (version === PROJECT_SCHEMA_VERSION) {
    const project = validateProject(raw);
    if (project) {
      return { status: 'ok', project };
    }
    return {
      status: 'recovery-needed',
      reason: `Version ${version} project failed schema validation`,
      raw,
    };
  }

  // Step 3: Apply migrations in order.
  let current: Record<string, unknown> = raw as Record<string, unknown>;
  let currentVersion = version;
  let guard = 0;

  while (currentVersion < PROJECT_SCHEMA_VERSION && guard < 32) {
    const migration = MIGRATIONS.find((m) => m.fromVersion === currentVersion);
    if (!migration) {
      // Step 4: No migration path — return unsupported, do NOT stamp.
      return {
        status: 'unsupported',
        fromVersion: currentVersion,
        toVersion: PROJECT_SCHEMA_VERSION,
      };
    }
    try {
      current = migration.migrate(current);
      currentVersion = migration.toVersion;
    } catch (err) {
      return {
        status: 'recovery-needed',
        reason: `Migration ${migration.fromVersion}→${migration.toVersion} threw: ${err instanceof Error ? err.message : String(err)}`,
        raw,
      };
    }
    guard += 1;
  }

  if (currentVersion > PROJECT_SCHEMA_VERSION) {
    // A migration overshot — this is a bug, not a data issue.
    return {
      status: 'unsupported',
      fromVersion: version,
      toVersion: currentVersion,
    };
  }

  // Step 5: Validate the migrated payload.
  const project = validateProject(current);
  if (project) {
    return { status: 'ok', project };
  }
  return {
    status: 'recovery-needed',
    reason: `Migrated project (v${version}→v${PROJECT_SCHEMA_VERSION}) failed schema validation`,
    raw: current,
  };
}

/**
 * Type guard: check whether a MigrationResult is `ok`.
 */
export function isMigrationOk(
  result: MigrationResult,
): result is { status: 'ok'; project: ProjectPackage } {
  return result.status === 'ok';
}
