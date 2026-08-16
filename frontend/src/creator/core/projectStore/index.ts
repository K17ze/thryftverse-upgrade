/**
 * Barrel export for the canonical project store + asset registry.
 *
 * The filesystem project package is the single source of truth.
 * AsyncStorage holds only a lightweight index for fast listing.
 */

// Store + registry + journal
export { ProjectStore } from './ProjectStore';
export { AssetRegistry } from './AssetRegistry';
export { CrashJournal } from './CrashJournal';

// Schema validation
export {
  ProjectPackageSchema,
  ProjectAssetIndexSchema,
  ProjectAssetEntrySchema,
  validateProject,
  extractVersion,
} from './ProjectSchema';

// Migrations
export {
  MIGRATIONS,
  migrateProject,
  isMigrationOk,
} from './ProjectMigrations';
export type { Migration } from './ProjectMigrations';

// Types
export type {
  AssetMediaType,
  AssetSource,
  ProjectAssetEntry,
  ProjectAssetIndex,
  ProjectPackage,
  ProjectVersion,
  ProjectType,
  ProjectIndexEntry,
  MigrationResult,
  JournalEntry,
  // Legacy compatibility aliases (deprecated)
  AssetRef,
  LegacyProjectIndexEntry,
} from './projectTypes';

// Constants
export { PROJECT_SCHEMA_VERSION } from './projectTypes';

// Asset registry options type
export type { ImportAssetOptions } from './AssetRegistry';
