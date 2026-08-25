export interface BackupExpiryPolicy {
  retentionDays: number;
  provider: string;
  notes: string;
}

export const BACKUP_EXPIRY_POLICY: BackupExpiryPolicy = {
  retentionDays: 35,
  provider: 'managed-postgres',
  notes:
    'PITR (point-in-time-recovery) retains 35 days. Erased user data persists in backups until rotation. Per EDPB guidance, this is documented and disclosed to users, not silently fixed. After 35 days, erased data is gone from all backups.',
};

export function getBackupExpiryDisclosure(): string {
  return (
    `We retain encrypted database backups for ${BACKUP_EXPIRY_POLICY.retentionDays} days ` +
    `for disaster recovery purposes. If you request deletion of your personal data, ` +
    `your data is removed from our live systems immediately, but may persist in ` +
    `encrypted backups until the backup retention period expires ` +
    `(${BACKUP_EXPIRY_POLICY.retentionDays} days). After this period, your data is ` +
    `permanently removed from all backup systems as well.`
  );
}
