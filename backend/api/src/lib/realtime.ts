import { randomUUID } from 'node:crypto';
import type { FastifyReply } from 'fastify';
import type { Redis } from 'ioredis';

export interface RealtimeEnvelope {
  id: string;
  topic: string;
  type: string;
  payload: Record<string, unknown>;
  timestamp: string;
}

type RealtimeTransport = 'ws' | 'sse';

interface RealtimeClient {
  id: string;
  userId?: string;
  transport: RealtimeTransport;
  topics: Set<string>;
  send: (event: RealtimeEnvelope) => void;
  close: () => void;
}

interface WsLike {
  readyState: number;
  send: (data: string) => void;
  close: () => void;
  on: (event: 'close' | 'message', listener: (payload: unknown) => void) => void;
}

interface RealtimeBusMessage {
  sourceInstanceId: string;
  event: RealtimeEnvelope;
  userId?: string;
}

const REALTIME_CHANNEL = 'thryftverse:realtime:v1';
const instanceId = randomUUID();
const clients = new Map<string, RealtimeClient>();
let heartbeatTimer: NodeJS.Timeout | null = null;
let realtimePublisher: Redis | null = null;
let realtimeSubscriber: Redis | null = null;

function runtimeId(prefix: string): string {
  return `${prefix}_${randomUUID()}`;
}

function normalizeTopic(topic: string): string {
  return topic.trim().toLowerCase();
}

export function parseRealtimeTopics(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw
      .map((entry) => (typeof entry === 'string' ? normalizeTopic(entry) : ''))
      .filter((entry) => entry.length > 0);
  }

  if (typeof raw !== 'string') {
    return [];
  }

  return raw
    .split(',')
    .map((entry) => normalizeTopic(entry))
    .filter((entry) => entry.length > 0);
}

function clientCanReceive(client: RealtimeClient, topic: string, userId?: string): boolean {
  if (client.topics.has('*') || client.topics.has(topic)) {
    return userId ? client.userId === userId : true;
  }

  return false;
}

function deliverLocalEvent(event: RealtimeEnvelope, userId?: string): number {
  let delivered = 0;
  for (const client of clients.values()) {
    if (!clientCanReceive(client, event.topic, userId)) {
      continue;
    }

    try {
      client.send(event);
      delivered += 1;
    } catch {
      client.close();
    }
  }

  return delivered;
}

function decodeBusMessage(raw: string): RealtimeBusMessage | null {
  try {
    const decoded = JSON.parse(raw) as Partial<RealtimeBusMessage>;
    if (
      !decoded
      || typeof decoded.sourceInstanceId !== 'string'
      || !decoded.event
      || typeof decoded.event.id !== 'string'
      || typeof decoded.event.topic !== 'string'
      || typeof decoded.event.type !== 'string'
      || !decoded.event.payload
      || typeof decoded.event.payload !== 'object'
      || Array.isArray(decoded.event.payload)
      || typeof decoded.event.timestamp !== 'string'
      || (decoded.userId !== undefined && typeof decoded.userId !== 'string')
    ) {
      return null;
    }

    return decoded as RealtimeBusMessage;
  } catch {
    return null;
  }
}

export async function startRealtimeBridge(publisher: Redis): Promise<void> {
  if (realtimeSubscriber) {
    return;
  }

  realtimePublisher = publisher;
  const subscriber = publisher.duplicate();

  subscriber.on('message', (channel, raw) => {
    if (channel !== REALTIME_CHANNEL) {
      return;
    }

    const message = decodeBusMessage(raw);
    if (!message || message.sourceInstanceId === instanceId) {
      return;
    }

    deliverLocalEvent(message.event, message.userId);
  });

  subscriber.on('error', (error) => {
    console.error('[realtime] Redis subscriber error', error);
  });

  await subscriber.subscribe(REALTIME_CHANNEL);
  realtimeSubscriber = subscriber;
}

function removeClient(clientId: string): void {
  clients.delete(clientId);

  if (clients.size === 0 && heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
}

function ensureHeartbeat(): void {
  if (heartbeatTimer) {
    return;
  }

  heartbeatTimer = setInterval(() => {
    const heartbeat: RealtimeEnvelope = {
      id: runtimeId('rt_heartbeat'),
      topic: 'system',
      type: 'heartbeat',
      payload: {},
      timestamp: new Date().toISOString(),
    };

    for (const client of clients.values()) {
      try {
        client.send(heartbeat);
      } catch {
        client.close();
      }
    }
  }, 25_000);
}

function formatSseEvent(event: RealtimeEnvelope): string {
  return `id: ${event.id}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
}

function createEnvelope(topic: string, type: string, payload: Record<string, unknown>): RealtimeEnvelope {
  return {
    id: runtimeId('rt_event'),
    topic,
    type,
    payload,
    timestamp: new Date().toISOString(),
  };
}

export function registerWsClient(input: {
  socket: WsLike;
  topics: string[];
  userId?: string;
  authorizeTopic?: (topic: string, userId?: string) => boolean | Promise<boolean>;
}): string {
  const clientId = runtimeId('rt_ws');
  const topicSet = new Set(input.topics.length > 0 ? input.topics.map(normalizeTopic) : ['*']);

  const client: RealtimeClient = {
    id: clientId,
    userId: input.userId,
    transport: 'ws',
    topics: topicSet,
    send: (event) => {
      if (input.socket.readyState !== 1) {
        throw new Error('socket_not_open');
      }

      input.socket.send(JSON.stringify(event));
    },
    close: () => {
      try {
        input.socket.close();
      } catch {
        // Ignore close races.
      }
      removeClient(clientId);
    },
  };

  input.socket.on('close', () => {
    removeClient(clientId);
  });

  input.socket.on('message', async (raw: unknown) => {
    try {
      const messageBody =
        typeof raw === 'string'
          ? raw
          : raw instanceof Buffer
            ? raw.toString('utf8')
            : String(raw ?? '');

      const decoded = JSON.parse(messageBody) as {
        action?: unknown;
        topic?: unknown;
        topics?: unknown;
      };

      const action = typeof decoded.action === 'string' ? decoded.action : '';
      const topicInput = decoded.topics ?? decoded.topic;
      const nextTopics = parseRealtimeTopics(topicInput);
      const acceptedTopics: string[] = [];
      const rejectedTopics: string[] = [];

      if (action === 'subscribe') {
        for (const topic of nextTopics) {
          const authorized = input.authorizeTopic
            ? await input.authorizeTopic(topic, input.userId)
            : false;
          if (authorized) {
            client.topics.add(topic);
            acceptedTopics.push(topic);
          } else {
            rejectedTopics.push(topic);
          }
        }
      }

      if (action === 'unsubscribe') {
        for (const topic of nextTopics) {
          client.topics.delete(topic);
          acceptedTopics.push(topic);
        }
      }

      if (action === 'subscribe' || action === 'unsubscribe') {
        client.send(
          createEnvelope('system', 'subscription_ack', {
            action,
            topics: Array.from(client.topics.values()),
            acceptedTopics,
            rejectedTopics,
          })
        );
      }
    } catch {
      client.send(
        createEnvelope('system', 'warning', {
          message: 'Malformed realtime control message',
        })
      );
    }
  });

  clients.set(clientId, client);
  ensureHeartbeat();

  client.send(
    createEnvelope('system', 'connected', {
      transport: 'ws',
      topics: Array.from(topicSet.values()),
    })
  );

  return clientId;
}

export function registerSseClient(input: {
  reply: FastifyReply;
  topics: string[];
  userId?: string;
}): string {
  const clientId = runtimeId('rt_sse');
  const topicSet = new Set(input.topics.length > 0 ? input.topics.map(normalizeTopic) : ['*']);

  input.reply.raw.setHeader('Content-Type', 'text/event-stream');
  input.reply.raw.setHeader('Cache-Control', 'no-cache, no-transform');
  input.reply.raw.setHeader('Connection', 'keep-alive');
  input.reply.raw.setHeader('X-Accel-Buffering', 'no');
  input.reply.hijack();

  const client: RealtimeClient = {
    id: clientId,
    userId: input.userId,
    transport: 'sse',
    topics: topicSet,
    send: (event) => {
      input.reply.raw.write(formatSseEvent(event));
    },
    close: () => {
      removeClient(clientId);
      if (!input.reply.raw.writableEnded) {
        input.reply.raw.end();
      }
    },
  };

  input.reply.raw.on('close', () => {
    removeClient(clientId);
  });

  clients.set(clientId, client);
  ensureHeartbeat();

  client.send(
    createEnvelope('system', 'connected', {
      transport: 'sse',
      topics: Array.from(topicSet.values()),
    })
  );

  return clientId;
}

export function publishRealtimeEvent(input: {
  topic: string;
  type: string;
  payload: Record<string, unknown>;
  userId?: string;
}): number {
  const topic = normalizeTopic(input.topic);
  const event = createEnvelope(topic, input.type, input.payload);
  const delivered = deliverLocalEvent(event, input.userId);

  if (realtimePublisher) {
    const message: RealtimeBusMessage = {
      sourceInstanceId: instanceId,
      event,
      userId: input.userId,
    };

    void realtimePublisher.publish(REALTIME_CHANNEL, JSON.stringify(message)).catch((error) => {
      console.error('[realtime] Redis publish failed', error);
    });
  }

  return delivered;
}

export async function closeRealtimeConnections(): Promise<void> {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }

  for (const client of clients.values()) {
    try {
      client.close();
    } catch {
      // Ignore close races.
    }
  }

  clients.clear();

  const subscriber = realtimeSubscriber;
  realtimeSubscriber = null;
  realtimePublisher = null;

  if (subscriber) {
    try {
      await subscriber.unsubscribe(REALTIME_CHANNEL);
    } finally {
      await subscriber.quit();
    }
  }
}
