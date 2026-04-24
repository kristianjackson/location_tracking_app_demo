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
  // TODO: Implement in task 2.2
}

/**
 * Remove users whose lastSeen timestamp exceeds the stale timeout.
 * @param {Map} users - Map of sessionId → user entry
 * @param {number} now - Current timestamp in ms
 * @param {number} staleTimeoutMs - Timeout threshold in ms
 * @returns {string[]} Array of evicted session IDs
 */
export function evictStaleUsers(users, now, staleTimeoutMs) {
  // TODO: Implement in task 2.4
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
  // TODO: Implement in task 2.6
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
