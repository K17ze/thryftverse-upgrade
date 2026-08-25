import { logger } from './logger.js';

export interface VendorDeletionProvider {
  vendorName: string;
  deleteUser(userId: string): Promise<void>;
}

export const moderationProvider: VendorDeletionProvider = {
  vendorName: 'moderation',
  async deleteUser(_userId: string): Promise<void> {
    logger.info(
      { vendor: 'moderation', userId: _userId },
      'vendorDeletion.moderation.called',
    );
  },
};

export const aiProvider: VendorDeletionProvider = {
  vendorName: 'ai',
  async deleteUser(_userId: string): Promise<void> {
    logger.info(
      { vendor: 'ai', userId: _userId },
      'vendorDeletion.ai.called',
    );
  },
};

export const pushProvider: VendorDeletionProvider = {
  vendorName: 'push',
  async deleteUser(_userId: string): Promise<void> {
    logger.info(
      { vendor: 'push', userId: _userId },
      'vendorDeletion.push.called',
    );
  },
};

export const analyticsProvider: VendorDeletionProvider = {
  vendorName: 'analytics',
  async deleteUser(_userId: string): Promise<void> {
    logger.info(
      { vendor: 'analytics', userId: _userId },
      'vendorDeletion.analytics.called',
    );
  },
};

export async function propagateUserDeletion(
  userId: string,
  vendors: VendorDeletionProvider[],
): Promise<void> {
  const results = await Promise.allSettled(
    vendors.map((vendor) => vendor.deleteUser(userId)),
  );

  for (let i = 0; i < vendors.length; i++) {
    const vendor = vendors[i];
    const result = results[i];

    if (result.status === 'fulfilled') {
      logger.info(
        { vendor: vendor.vendorName, userId },
        'vendorDeletion.success',
      );
    } else {
      const message =
        result.reason instanceof Error ? result.reason.message : String(result.reason);
      logger.error(
        { vendor: vendor.vendorName, userId, err: message },
        'vendorDeletion.failed',
      );
    }
  }
}
