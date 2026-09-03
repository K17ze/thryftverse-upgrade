/**
 * Live streaming provider abstraction for live shopping.
 *
 * Based on 2026 research, LiveKit is the recommended platform for
 * ThryftVerse live shopping because:
 *
 * - Sub-second WebRTC latency (150-400ms glass-to-glass) — critical for
 *   real-time bidding and chat during live shopping events
 * - First-class React Native SDK (@livekit/react-native)
 * - Open-source (Apache 2.0) with self-host option — zero vendor lock-in
 * - LiveKit Cloud managed service available ($0.0004/track-min)
 * - Recording support for VOD replay after live events
 * - Simulcast for adaptive quality across viewer devices
 *
 * Alternatives considered:
 * - AWS IVS: 2-5s HLS latency, too high for interactive shopping
 * - Mux: Per-minute encode + delivery ($0.0075-$0.048/min), good for VOD
 *   but not optimized for sub-second live interaction
 * - Cloudflare Stream: $1/1K min delivered, great for VOD but not WebRTC
 *
 * This module provides:
 * - LiveStreamProvider interface for stream lifecycle management
 * - LiveKitProvider implementation using LiveKit Server API
 * - Token generation for hosts and viewers
 * - Stream metadata persistence (start, end, recording)
 */

export interface StreamRoom {
  /** Unique room identifier (LiveKit room name) */
  roomId: string;
  /** Display name for the stream */
  title: string;
  /** Host user ID */
  hostUserId: string;
  /** Stream status */
  status: 'created' | 'live' | 'ended' | 'failed';
  /** LiveKit room URL for WebRTC connection */
  roomUrl: string;
  /** Recording URL (available after stream ends, if recording enabled) */
  recordingUrl?: string;
  /** Viewer count (real-time) */
  viewerCount: number;
  /** Created at ISO timestamp */
  createdAt: string;
  /** Went live at ISO timestamp (if started) */
  startedAt?: string;
  /** Ended at ISO timestamp (if ended) */
  endedAt?: string;
}

export interface StreamTokenRequest {
  roomId: string;
  userId: string;
  /** 'host' grants publish permissions; 'viewer' is subscribe-only */
  role: 'host' | 'viewer';
  /** Display name shown in the stream */
  displayName: string;
  /** Optional metadata for the participant */
  metadata?: Record<string, string>;
}

export interface StreamTokenResult {
  /** JWT token for LiveKit room connection (empty when generation failed) */
  token: string;
  /** LiveKit WebSocket URL for the room */
  wsUrl: string;
  /** Room identifier */
  roomId: string;
  /** Participant identity */
  identity: string;
  /** Present when token generation failed — callers should check before using `token` */
  error?: string;
}

export interface CreateStreamRequest {
  title: string;
  hostUserId: string;
  /** Enable recording for VOD replay */
  recordingEnabled?: boolean;
  /** Max viewers (0 = unlimited) */
  maxViewers?: number;
  /** Stream metadata */
  metadata?: Record<string, unknown>;
}

export interface LiveStreamProvider {
  readonly name: string;
  /** Create a new stream room */
  createStream(request: CreateStreamRequest): Promise<StreamRoom>;
  /** Start a stream (go live) */
  startStream(roomId: string): Promise<StreamRoom>;
  /** End a stream */
  endStream(roomId: string): Promise<StreamRoom>;
  /** Generate a connection token for a participant */
  generateToken(request: StreamTokenRequest): Promise<StreamTokenResult>;
  /** Get stream metadata */
  getStream(roomId: string): Promise<StreamRoom | null>;
  /** List active streams */
  listActiveStreams(limit?: number): Promise<StreamRoom[]>;
}

// ── LiveKit provider ──────────────────────────────────────────────────

/**
 * LiveKit implementation of the LiveStreamProvider interface.
 *
 * Uses the LiveKit Server API (REST) for room management and
 * AccessToken library for JWT token generation.
 *
 * Environment variables:
 * - LIVEKIT_URL: LiveKit WebSocket URL (e.g. wss://thryftverse.livekit.cloud)
 * - LIVEKIT_API_KEY: LiveKit API key
 * - LIVEKIT_API_SECRET: LiveKit API secret
 */
export class LiveKitStreamProvider implements LiveStreamProvider {
  readonly name = 'livekit';
  private readonly apiUrl: string;
  private readonly apiKey: string;
  private readonly apiSecret: string;
  private roomServiceClient: import('livekit-server-sdk').RoomServiceClient | null = null;

  constructor(config: { apiUrl: string; apiKey: string; apiSecret: string }) {
    this.apiUrl = config.apiUrl.replace(/^ws/, 'http').replace(/^wss/, 'https');
    this.apiKey = config.apiKey;
    this.apiSecret = config.apiSecret;
  }

  /**
   * Lazily create a RoomServiceClient. The SDK signs each request with a
   * proper JWT (HS256) using the API secret, which is the only auth mechanism
   * LiveKit's RoomService accepts. The previous base64 placeholder was not a
   * valid token and every RoomService call silently failed.
   */
  private async getRoomServiceClient(): Promise<import('livekit-server-sdk').RoomServiceClient> {
    if (this.roomServiceClient) return this.roomServiceClient;
    const { RoomServiceClient } = await import('livekit-server-sdk');
    this.roomServiceClient = new RoomServiceClient(this.apiUrl, this.apiKey, this.apiSecret);
    return this.roomServiceClient;
  }

  async createStream(request: CreateStreamRequest): Promise<StreamRoom> {
    const roomId = `stream_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    const svc = await this.getRoomServiceClient();

    const createdAt = new Date().toISOString();
    const metadata = JSON.stringify({
      title: request.title,
      hostUserId: request.hostUserId,
      recordingEnabled: request.recordingEnabled ?? true,
      status: 'created',
      createdAt,
      ...request.metadata,
    });

    await svc.createRoom({
      name: roomId,
      emptyTimeout: 300, // 5 minutes
      maxParticipants: request.maxViewers ?? 0,
      metadata,
    });

    return {
      roomId,
      title: request.title,
      hostUserId: request.hostUserId,
      status: 'created',
      roomUrl: this.apiUrl.replace(/^http/, 'ws').replace(/^https/, 'wss'),
      viewerCount: 0,
      createdAt,
    };
  }

  async startStream(roomId: string): Promise<StreamRoom> {
    const svc = await this.getRoomServiceClient();

    // UpdateRoomMetadata replaces the entire metadata field, so fetch the
    // current room first and merge to avoid clobbering title/hostUserId/
    // recordingEnabled that were written at createStream time.
    const rooms = await svc.listRooms([roomId]);
    const existing = rooms.find((r) => r.name === roomId);
    if (!existing) throw new Error(`Stream ${roomId} not found`);

    let existingMeta: Record<string, unknown> = {};
    try {
      existingMeta = existing.metadata ? JSON.parse(existing.metadata) : {};
    } catch {
      // Malformed metadata — start from a clean slate
    }

    const startedAt = new Date().toISOString();
    const mergedMetadata = JSON.stringify({
      ...existingMeta,
      status: 'live',
      startedAt,
    });

    await svc.updateRoomMetadata(roomId, mergedMetadata);

    return {
      roomId: existing.name,
      title: (existingMeta.title as string) ?? '',
      hostUserId: (existingMeta.hostUserId as string) ?? '',
      status: 'live',
      roomUrl: this.apiUrl.replace(/^http/, 'ws').replace(/^https/, 'wss'),
      viewerCount: Math.max(0, existing.numParticipants - 1), // Exclude host
      createdAt: (existingMeta.createdAt as string) ?? new Date().toISOString(),
      startedAt,
    };
  }

  async endStream(roomId: string): Promise<StreamRoom> {
    const svc = await this.getRoomServiceClient();

    // Capture room metadata before deletion — DeleteRoom is irreversible and
    // the room is gone immediately after, so querying it would always return
    // null. Build the ended state from the metadata we just read.
    const rooms = await svc.listRooms([roomId]);
    const existing = rooms.find((r) => r.name === roomId);

    let meta: Record<string, unknown> = {};
    if (existing) {
      try {
        meta = existing.metadata ? JSON.parse(existing.metadata) : {};
      } catch {
        // Malformed metadata — fall back to empty
      }
    }

    await svc.deleteRoom(roomId);

    const endedAt = new Date().toISOString();
    return {
      roomId,
      title: (meta.title as string) ?? '',
      hostUserId: (meta.hostUserId as string) ?? '',
      status: 'ended',
      roomUrl: this.apiUrl.replace(/^http/, 'ws').replace(/^https/, 'wss'),
      viewerCount: 0,
      createdAt: (meta.createdAt as string) ?? new Date().toISOString(),
      startedAt: meta.startedAt as string | undefined,
      endedAt,
    };
  }

  async generateToken(request: StreamTokenRequest): Promise<StreamTokenResult> {
    const wsUrl = this.apiUrl.replace(/^http/, 'ws').replace(/^https/, 'wss');
    const failed: StreamTokenResult = {
      token: '',
      wsUrl,
      roomId: request.roomId,
      identity: request.userId,
    };

    try {
      const { AccessToken } = await import('livekit-server-sdk');
      const token = new AccessToken(this.apiKey, this.apiSecret, {
        identity: request.userId,
        name: request.displayName,
        metadata: request.metadata ? JSON.stringify(request.metadata) : undefined,
        ttl: 2 * 60 * 60,
      });
      token.addGrant({
        room: request.roomId,
        roomJoin: true,
        canPublish: request.role === 'host',
        canSubscribe: true,
      });
      const jwt = await token.toJwt();

      return {
        token: jwt,
        wsUrl,
        roomId: request.roomId,
        identity: request.userId,
      };
    } catch (error) {
      return {
        ...failed,
        error: `LiveKit token generation failed: ${error instanceof Error ? error.message : 'unknown error'}`,
      };
    }
  }

  async getStream(roomId: string): Promise<StreamRoom | null> {
    const svc = await this.getRoomServiceClient();

    try {
      const rooms = await svc.listRooms([roomId]);
      const room = rooms.find((r) => r.name === roomId);
      if (!room) return null;

      let metadata: Record<string, unknown> = {};
      try {
        metadata = room.metadata ? JSON.parse(room.metadata) : {};
      } catch {
        // Malformed metadata — ignore
      }

      return {
        roomId: room.name,
        title: (metadata.title as string) ?? '',
        hostUserId: (metadata.hostUserId as string) ?? '',
        status: (metadata.status as StreamRoom['status']) ?? 'created',
        roomUrl: this.apiUrl.replace(/^http/, 'ws').replace(/^https/, 'wss'),
        viewerCount: Math.max(0, room.numParticipants - 1), // Exclude host
        createdAt: (metadata.createdAt as string) ?? new Date().toISOString(),
        startedAt: metadata.startedAt as string | undefined,
        endedAt: metadata.endedAt as string | undefined,
      };
    } catch {
      return null;
    }
  }

  async listActiveStreams(limit = 50): Promise<StreamRoom[]> {
    const svc = await this.getRoomServiceClient();

    let rooms: Awaited<ReturnType<typeof svc.listRooms>>;
    try {
      rooms = await svc.listRooms();
    } catch {
      return [];
    }

    const streams: StreamRoom[] = [];

    for (const room of rooms) {
      if (!room.name.startsWith('stream_')) continue;

      let metadata: Record<string, unknown> = {};
      try {
        metadata = room.metadata ? JSON.parse(room.metadata) : {};
      } catch {
        // Malformed metadata — skip
      }

      streams.push({
        roomId: room.name,
        title: (metadata.title as string) ?? '',
        hostUserId: (metadata.hostUserId as string) ?? '',
        status: (metadata.status as StreamRoom['status']) ?? 'live',
        roomUrl: this.apiUrl.replace(/^http/, 'ws').replace(/^https/, 'wss'),
        viewerCount: Math.max(0, room.numParticipants - 1),
        createdAt: (metadata.createdAt as string) ?? new Date().toISOString(),
        startedAt: metadata.startedAt as string | undefined,
      });

      if (streams.length >= limit) break;
    }

    return streams;
  }
}

// ── Mock provider (development) ───────────────────────────────────────

export class MockStreamProvider implements LiveStreamProvider {
  readonly name = 'mock';
  private streams = new Map<string, StreamRoom>();

  async createStream(request: CreateStreamRequest): Promise<StreamRoom> {
    const roomId = `stream_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    const stream: StreamRoom = {
      roomId,
      title: request.title,
      hostUserId: request.hostUserId,
      status: 'created',
      roomUrl: 'ws://localhost:7880',
      viewerCount: 0,
      createdAt: new Date().toISOString(),
    };
    this.streams.set(roomId, stream);
    return stream;
  }

  async startStream(roomId: string): Promise<StreamRoom> {
    const stream = this.streams.get(roomId);
    if (!stream) throw new Error(`Stream ${roomId} not found`);
    const updated = { ...stream, status: 'live' as const, startedAt: new Date().toISOString() };
    this.streams.set(roomId, updated);
    return updated;
  }

  async endStream(roomId: string): Promise<StreamRoom> {
    const stream = this.streams.get(roomId);
    if (!stream) throw new Error(`Stream ${roomId} not found`);
    const updated = { ...stream, status: 'ended' as const, endedAt: new Date().toISOString() };
    this.streams.set(roomId, updated);
    return updated;
  }

  async generateToken(request: StreamTokenRequest): Promise<StreamTokenResult> {
    return {
      token: `mock_token_${request.roomId}_${request.userId}_${request.role}`,
      wsUrl: 'ws://localhost:7880',
      roomId: request.roomId,
      identity: request.userId,
    };
  }

  async getStream(roomId: string): Promise<StreamRoom | null> {
    return this.streams.get(roomId) ?? null;
  }

  async listActiveStreams(limit = 50): Promise<StreamRoom[]> {
    return Array.from(this.streams.values())
      .filter((s) => s.status === 'live')
      .slice(0, limit);
  }
}

// ── Factory ───────────────────────────────────────────────────────────

let cachedProvider: LiveStreamProvider | null = null;

/**
 * Create or return the cached live stream provider.
 *
 * Environment variables:
 * - LIVE_STREAM_PROVIDER: 'livekit' | 'mock' (default: 'mock')
 * - LIVEKIT_URL: LiveKit server URL
 * - LIVEKIT_API_KEY: LiveKit API key
 * - LIVEKIT_API_SECRET: LiveKit API secret
 */
export function getStreamProvider(): LiveStreamProvider {
  if (cachedProvider) return cachedProvider;

  const providerType = process.env.LIVE_STREAM_PROVIDER ?? 'mock';

  if (providerType === 'livekit') {
    const apiUrl = process.env.LIVEKIT_URL;
    const apiKey = process.env.LIVEKIT_API_KEY;
    const apiSecret = process.env.LIVEKIT_API_SECRET;

    if (!apiUrl || !apiKey || !apiSecret) {
      console.warn(
        '[streaming] LiveKit provider selected but LIVEKIT_URL, LIVEKIT_API_KEY, or LIVEKIT_API_SECRET not set — falling back to mock provider'
      );
      cachedProvider = new MockStreamProvider();
      return cachedProvider;
    }

    cachedProvider = new LiveKitStreamProvider({ apiUrl, apiKey, apiSecret });
  } else {
    cachedProvider = new MockStreamProvider();
  }

  return cachedProvider;
}
