import { Client } from 'pg';
import { config } from '../config.js';
import { logger } from './logger.js';

type ChannelHandler = (payload: string) => void;

const listeners = new Map<string, { client: Client; handler: ChannelHandler }>();

function createListenClient(): Client {
  const client = new Client({
    connectionString: config.databaseUrl,
    application_name: 'thryftverse-listen-notify',
  });

  client.on('error', (error) => {
    logger.error({ err: error }, '[listenNotify] client error');
  });

  return client;
}

/**
 * Subscribe to a PostgreSQL NOTIFY channel. Uses a dedicated `pg` Client
 * (not a pooled connection) because LISTEN blocks the connection until a
 * NOTIFY arrives. The handler is invoked with the notification payload
 * string for every notification received on the channel. Never throws —
 * connection errors are logged and the subscription is retried on the
 * next notification cycle.
 */
export async function startListening(
  channel: string,
  handler: ChannelHandler,
): Promise<void> {
  try {
    if (listeners.has(channel)) {
      await stopListening(channel);
    }

    const client = createListenClient();
    await client.connect();
    await client.query(`LISTEN ${channel}`);

    client.on('notification', (msg) => {
      try {
        if (msg.channel === channel && msg.payload) {
          handler(msg.payload);
        }
      } catch (error) {
        logger.error(
          { err: error, channel },
          '[listenNotify] handler threw',
        );
      }
    });

    listeners.set(channel, { client, handler });
    logger.info({ channel }, '[listenNotify] listening');
  } catch (error) {
    logger.error(
      { err: error, channel },
      '[listenNotify] failed to start listening',
    );
  }
}

/**
 * Send a NOTIFY on the given channel with the supplied payload. Uses the
 * shared pool for the one-shot NOTIFY (NOTIFY does not block). Never
 * throws — errors are logged so the calling request is never blocked.
 */
export async function notify(
  dbPool: { query: (text: string, values?: unknown[]) => Promise<unknown> },
  channel: string,
  payload: string,
): Promise<void> {
  try {
    await dbPool.query(`NOTIFY ${channel}, $1`, [payload]);
  } catch (error) {
    logger.error(
      { err: error, channel },
      '[listenNotify] failed to notify',
    );
  }
}

/**
 * Unsubscribe from a NOTIFY channel and close the dedicated connection.
 * Never throws. Safe to call when not currently listening.
 */
export async function stopListening(channel: string): Promise<void> {
  const entry = listeners.get(channel);
  if (!entry) {
    return;
  }
  listeners.delete(channel);
  try {
    await entry.client.query(`UNLISTEN ${channel}`);
  } catch (error) {
    logger.error(
      { err: error, channel },
      '[listenNotify] failed to unlisten',
    );
  }
  try {
    await entry.client.end();
  } catch (error) {
    logger.error(
      { err: error, channel },
      '[listenNotify] failed to close client',
    );
  }
  logger.info({ channel }, '[listenNotify] stopped listening');
}

/**
 * Close all active LISTEN connections. Called on process shutdown.
 * Never throws.
 */
export async function stopAllListening(): Promise<void> {
  const channels = Array.from(listeners.keys());
  for (const channel of channels) {
    await stopListening(channel);
  }
}

export const LISTEN_CHANNELS = {
  listingChanged: 'listing_changed',
  userChanged: 'user_changed',
  orderChanged: 'order_changed',
  cacheInvalidation: 'cache_invalidation',
} as const;
