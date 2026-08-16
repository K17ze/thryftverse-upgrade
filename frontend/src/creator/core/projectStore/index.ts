/**
 * Barrel export for the durable project store + asset registry.
 */

export { ProjectStore, migrateProject, CURRENT_RENDER_VERSION } from './ProjectStore';
export { AssetRegistry } from './AssetRegistry';
export { CrashJournal } from './CrashJournal';
export type {
  AssetMediaType,
  AssetUploadState,
  AssetRef,
  ProjectPackage,
  ProjectIndexEntry,
  ProjectMigration,
  ProjectType,
  JournalEntry,
} from './projectTypes';
