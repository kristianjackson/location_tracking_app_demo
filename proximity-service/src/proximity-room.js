// ProximityRoom Durable Object and pure helper functions.

import { DurableObject } from "cloudflare:workers";

export const PROXIMITY_RADIUS_M = 5000;
export const BROADCAST_INTERVAL_MS = 3000;
export const STALE_TIMEOUT_MS = 60000;

/**
 * Compute great-circle distance between two coordinates using the Haversine formula.
 * @param {number} lat1
 * @param {number} lon1
 * @param {number} lat2
 * @param {number} lon2
 * @returns {number} Distance in meters
 */
export function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6_371_000; // Earth's mean radius in meters
  const toRad = (deg) => (deg * Math.PI) / 180;

  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const lat1Rad = toRad(lat1);
  const lat2Rad = toRad(lat2);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1Rad) * Math.cos(lat2Rad) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

/**
 * Remove users whose lastSeen timestamp exceeds the stale timeout.
 * @param {Map} users - Map of sessionId → user entry
 * @param {number} now - Current timestamp in ms
 * @param {number} staleTimeoutMs - Timeout threshold in ms
 * @returns {string[]} Array of evicted session IDs
 */
export function evictStaleUsers(users, now, staleTimeoutMs) {
  const evicted = [];
  for (const [sessionId, user] of users) {
    if ((now - user.lastSeen) > staleTimeoutMs) {
      users.delete(sessionId);
      evicted.push(sessionId);
    }
  }
  return evicted;
}

/**
 * Filter users to only those visible and within radius of the requesting client.
 * @param {Map} users - Map of sessionId → user entry
 * @param {string} clientSessionId - Requesting client's session ID
 * @param {number} clientLat - Requesting client's latitude
 * @param {number} clientLng - Requesting client's longitude
 * @param {number} radiusM - Proximity radius in meters
 * @returns {Array<{sessionId: string, displayName: string, lat: number, lng: number}>}
 */
export function filterNearbyUsers(users, clientSessionId, clientLat, clientLng, radiusM) {
  const result = [];
  for (const [sessionId, user] of users) {
    if (sessionId === clientSessionId) continue;
    if (!user.visible) continue;
    if (haversineDistance(clientLat, clientLng, user.lat, user.lng) > radiusM) continue;
    result.push({
      sessionId,
      displayName: user.displayName,
      lat: user.lat,
      lng: user.lng,
    });
  }
  return result;
}

/**
 * ProximityRoom Durable Object class.
 * Manages connected users, WebSocket communication, and periodic presence broadcasts.
 */
export class ProximityRoom extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.users = new Map();
  }

  /**
   * Handle incoming HTTP requests. Expects a WebSocket upgrade request
   * with sessionId provided as a query parameter.
   */
  async fetch(request) {
    const upgradeHeader = request.headers.get('Upgrade');
    if (!upgradeHeader || upgradeHeader.toLowerCase() !== 'websocket') {
      return new Response('Expected WebSocket upgrade', { status: 426 });
    }

    const url = new URL(request.url);
    const sessionId = url.searchParams.get('sessionId');
    if (!sessionId) {
      return new Response('Missing sessionId', { status: 400 });
    }

    // Create the WebSocket pair
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    // Accept the server-side WebSocket using the Hibernation API, tagged with sessionId
    this.ctx.acceptWebSocket(server, [sessionId]);

    // Schedule the alarm for periodic broadcasts if not already set
    const currentAlarm = await this.ctx.storage.getAlarm();
    if (currentAlarm === null) {
      await this.ctx.storage.setAlarm(Date.now() + BROADCAST_INTERVAL_MS);
    }

    return new Response(null, { status: 101, webSocket: client });
  }

  /**
   * Handle incoming WebSocket messages (Hibernation API callback).
   * Parses LocationBroadcast JSON and updates the user entry.
   */
  async webSocketMessage(ws, message) {
    let data;
    try {
      data = JSON.parse(message);
    } catch {
      // Invalid JSON — ignore per error handling spec
      return;
    }

    const tags = this.ctx.getTags(ws);
    const sessionId = tags.length > 0 ? tags[0] : null;
    if (!sessionId) return;

    // Update or create the user entry
    this.users.set(sessionId, {
      sessionId,
      displayName: data.displayName || '',
      lat: data.lat,
      lng: data.lng,
      accuracy: data.accuracy,
      visible: Boolean(data.visible),
      lastSeen: Date.now(),
      ws,
    });
  }

  /**
   * Handle WebSocket close (Hibernation API callback).
   * Removes the user from the in-memory map.
   */
  async webSocketClose(ws, code, reason, wasClean) {
    const tags = this.ctx.getTags(ws);
    const sessionId = tags.length > 0 ? tags[0] : null;
    if (sessionId) {
      this.users.delete(sessionId);
    }
  }

  /**
   * Handle WebSocket error (Hibernation API callback).
   * Removes the user from the in-memory map.
   */
  async webSocketError(ws, error) {
    const tags = this.ctx.getTags(ws);
    const sessionId = tags.length > 0 ? tags[0] : null;
    if (sessionId) {
      this.users.delete(sessionId);
    }
  }

  /**
   * Alarm handler — fires periodically to broadcast presence updates.
   * Evicts stale users, computes per-client nearby sets, sends PresenceUpdate
   * JSON to each connected client, and reschedules the alarm.
   */
  async alarm() {
    // Evict stale users
    evictStaleUsers(this.users, Date.now(), STALE_TIMEOUT_MS);

    // For each connected user, compute their nearby set and send a PresenceUpdate
    for (const [sessionId, user] of this.users) {
      // Skip users without valid coordinates
      if (user.lat == null || user.lng == null) continue;

      const nearbyUsers = filterNearbyUsers(
        this.users,
        sessionId,
        user.lat,
        user.lng,
        PROXIMITY_RADIUS_M
      );

      const presenceUpdate = {
        type: 'presence',
        users: nearbyUsers,
      };

      try {
        user.ws.send(JSON.stringify(presenceUpdate));
      } catch {
        // If sending fails, remove the user
        this.users.delete(sessionId);
      }
    }

    // Reschedule alarm if there are still connected users
    if (this.users.size > 0) {
      await this.ctx.storage.setAlarm(Date.now() + BROADCAST_INTERVAL_MS);
    }
  }
}
