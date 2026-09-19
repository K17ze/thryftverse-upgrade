import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

import { RealtimeClient } from '../platform/realtime/RealtimeClient';

/**
 * Topic refcounting regression — multiple consumers (inbox list, open
 * thread, pinned-message hook) share the same conversation topic. The
 * server subscription must only drop when the LAST consumer unsubscribes;
 * previously `desiredTopics` was a plain Set, so a chat screen unmounting
 * silently cut the inbox's event stream for that conversation.
 */

class MockWebSocket {
  static OPEN = 1;
  static instances: MockWebSocket[] = [];
  readyState = MockWebSocket.OPEN;
  sent: string[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: ((event: { code: number }) => void) | null = null;
  constructor(public url: string) {
    MockWebSocket.instances.push(this);
  }
  send(data: string) {
    this.sent.push(data);
  }
  close() {
    this.readyState = 3;
    this.onclose?.({ code: 1000 });
  }
}

function controlMessages(socket: MockWebSocket): Array<{ action: string; topics: string[] }> {
  return socket.sent.map((raw) => JSON.parse(raw) as { action: string; topics: string[] });
}

describe('RealtimeClient topic refcounting', () => {
  beforeEach(() => {
    MockWebSocket.instances = [];
    vi.stubGlobal('WebSocket', MockWebSocket);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  async function connectedClient(): Promise<{ client: RealtimeClient; socket: MockWebSocket }> {
    const client = new RealtimeClient({
      apiUrl: 'http://localhost:3000',
      getAccessToken: async () => 'token',
      heartbeatTimeoutMs: 60_000,
      enableGapReplay: false,
    });
    await client.connect();
    const socket = MockWebSocket.instances[0];
    socket.onopen?.();
    expect(client.getState()).toBe('connected');
    return { client, socket };
  }

  it('sends subscribe control only on the 0→1 transition', async () => {
    const { client, socket } = await connectedClient();
    const topic = 'chat.conversation:c1';

    client.subscribe([topic]); // consumer 1 (e.g. inbox)
    client.subscribe([topic]); // consumer 2 (e.g. open thread)

    const subscribes = controlMessages(socket).filter((m) => m.action === 'subscribe');
    expect(subscribes).toHaveLength(1);
    expect(subscribes[0].topics).toEqual([topic]);
  });

  it('keeps the server subscription while any consumer still holds it', async () => {
    const { client, socket } = await connectedClient();
    const topic = 'chat.conversation:c1';

    client.subscribe([topic]); // inbox
    client.subscribe([topic]); // thread screen

    socket.sent = [];
    client.unsubscribe([topic]); // thread screen unmounts

    // No unsubscribe control — the inbox still holds the topic.
    expect(controlMessages(socket).filter((m) => m.action === 'unsubscribe')).toHaveLength(0);
  });

  it('sends unsubscribe control only when the last reference releases', async () => {
    const { client, socket } = await connectedClient();
    const topic = 'chat.conversation:c1';

    client.subscribe([topic]);
    client.subscribe([topic]);
    client.unsubscribe([topic]); // one consumer leaves

    socket.sent = [];
    client.unsubscribe([topic]); // last consumer leaves

    const unsubscribes = controlMessages(socket).filter((m) => m.action === 'unsubscribe');
    expect(unsubscribes).toHaveLength(1);
    expect(unsubscribes[0].topics).toEqual([topic]);
  });

  it('ignores unsubscribe for topics nobody holds', async () => {
    const { client, socket } = await connectedClient();
    client.unsubscribe(['chat.conversation:never-subscribed']);
    expect(controlMessages(socket).filter((m) => m.action === 'unsubscribe')).toHaveLength(0);
  });

  it('re-subscribes all still-held topics after a reconnect', async () => {
    const { client } = await connectedClient();
    client.subscribe(['chat.conversation:c1']);
    client.subscribe(['chat.conversation:c1']);
    client.subscribe(['chat.conversation:c2']);
    client.unsubscribe(['chat.conversation:c1']); // refcount 2→1, still held

    client.disconnect();
    MockWebSocket.instances = [];

    // Reconnect carries desired topics in the socket URL's topics= param —
    // observable proof that held topics survive and released ones don't.
    client.subscribe(['chat.conversation:c3']);
    await client.connect();
    const url = MockWebSocket.instances[0].url;
    const topics = decodeURIComponent(url.split('topics=')[1] ?? '').split(',');
    expect(topics).toContain('chat.conversation:c1');
    expect(topics).toContain('chat.conversation:c2');
    expect(topics).toContain('chat.conversation:c3');
    client.disconnect();
  });
});
