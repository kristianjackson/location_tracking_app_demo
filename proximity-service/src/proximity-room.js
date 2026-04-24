// ProximityRoom Durable Object and pure helper functions.
// Pure functions are implemented in tasks 2.2, 2.4, 2.6.
// Durable Object class is implemented in task 2.8.

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
export class ProximityRoom {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
    this.users = new Map();
  }

  async fetch(request) {
    // TODO: Implement WebSocket upgrade and Hibernation API handling in task 2.8
    return new Response('Not implemented', { status: 501 });
  }
}
