import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fc from 'fast-check';

// Track all marker operations via mock
const createdMarkers = new Map(); // id -> { lat, lng, displayName, removed }
let markerIdCounter = 0;

vi.mock('../map.js', () => ({
  addNearbyUserMarker: vi.fn((map, lat, lng, displayName) => {
    const id = ++markerIdCounter;
    const marker = { id, lat, lng, displayName, removed: false };
    createdMarkers.set(id, marker);
    return marker;
  }),
  updateNearbyUserMarker: vi.fn((marker, lat, lng) => {
    marker.lat = lat;
    marker.lng = lng;
  }),
  removeNearbyUserMarker: vi.fn((marker) => {
    marker.removed = true;
    createdMarkers.delete(marker.id);
  }),
}));

// Import proximity AFTER mocking map.js
const {
  initProximity,
  getNearbyUserCount,
  _getState,
  _resetState,
  PROXIMITY_SERVICE_URL,
} = await import('../proximity.js');

/**
 * Feature: multi-user-proximity, Property 9: Marker set matches presence update
 *
 * **Validates: Requirements 5.1, 5.4, 5.5, 5.6, 6.4**
 *
 * For any PresenceUpdate containing N users (none of which share the current user's
 * session ID), after processing the update, the map SHALL contain exactly N nearby
 * user markers, each positioned at the coordinates specified in the update. If a user
 * from a previous update is absent in the new update, their marker SHALL be removed.
 */
describe('Feature: multi-user-proximity, Property 9: Marker set matches presence update', () => {
  // Our own session ID — must not appear in generated users
  const ownSessionId = '00000000-0000-4000-a000-000000000000';
  const ownDisplayName = 'TestSelf';

  // Capture the WebSocket instance created during initProximity
  let mockWs;
  let originalWebSocket;

  beforeEach(() => {
    _resetState();
    createdMarkers.clear();
    markerIdCounter = 0;
    localStorage.clear();

    // Mock WebSocket so initProximity can connect
    originalWebSocket = globalThis.WebSocket;
    globalThis.WebSocket = class MockWebSocket {
      static OPEN = 1;
      static CLOSED = 3;

      constructor(url) {
        this.url = url;
        this.readyState = MockWebSocket.OPEN;
        this.onopen = null;
        this.onmessage = null;
        this.onclose = null;
        this.onerror = null;
        mockWs = this;

        // Simulate async open
        setTimeout(() => {
          if (this.onopen) this.onopen({});
        }, 0);
      }

      send() {}
      close() {
        this.readyState = MockWebSocket.CLOSED;
      }
    };
    // Also set the static on the global for readyState checks
    globalThis.WebSocket.OPEN = 1;
    globalThis.WebSocket.CLOSED = 3;

    const mockMap = {};
    initProximity(mockMap, ownSessionId, ownDisplayName);
  });

  afterEach(() => {
    _resetState();
    globalThis.WebSocket = originalWebSocket;
    createdMarkers.clear();
    markerIdCounter = 0;
  });

  // --- Arbitraries ---

  // Generate a unique session ID that is NOT our own
  const sessionIdArb = fc.uuid().filter((id) => id !== ownSessionId);

  // Display name: 2-20 chars, alphanumeric + space/hyphen/underscore
  const allowedCharArb = fc.mapToConstant(
    { num: 26, build: (v) => String.fromCharCode(0x41 + v) },
    { num: 26, build: (v) => String.fromCharCode(0x61 + v) },
    { num: 10, build: (v) => String.fromCharCode(0x30 + v) },
    { num: 1, build: () => ' ' },
    { num: 1, build: () => '_' },
    { num: 1, build: () => '-' }
  );
  const displayNameArb = fc
    .array(allowedCharArb, { minLength: 2, maxLength: 20 })
    .map((chars) => chars.join(''));

  // Use noDefaultInfinity to avoid Infinity values; exclude -0 since JSON.stringify(-0) === "0"
  // which causes Object.is(-0, 0) to fail after JSON round-trip
  const latArb = fc.double({ min: -90, max: 90, noNaN: true, noDefaultInfinity: true })
    .map((v) => (Object.is(v, -0) ? 0 : v));
  const lngArb = fc.double({ min: -180, max: 180, noNaN: true, noDefaultInfinity: true })
    .map((v) => (Object.is(v, -0) ? 0 : v));

  // A single nearby user entry
  const userArb = fc.tuple(sessionIdArb, displayNameArb, latArb, lngArb).map(
    ([sessionId, displayName, lat, lng]) => ({ sessionId, displayName, lat, lng })
  );

  // A list of users with unique session IDs (1-15 users)
  const uniqueUsersArb = fc
    .array(userArb, { minLength: 1, maxLength: 15 })
    .map((users) => {
      const seen = new Set();
      return users.filter((u) => {
        if (seen.has(u.sessionId)) return false;
        seen.add(u.sessionId);
        return true;
      });
    })
    .filter((users) => users.length > 0);

  /**
   * Helper: simulate receiving a presence update via the mock WebSocket
   */
  function simulatePresenceUpdate(users) {
    const message = JSON.stringify({ type: 'presence', users });
    if (mockWs && mockWs.onmessage) {
      mockWs.onmessage({ data: message });
    }
  }

  it('exactly N markers exist after processing a presence update with N users', () => {
    fc.assert(
      fc.property(uniqueUsersArb, (users) => {
        // Reset markers from previous iteration
        simulatePresenceUpdate([]);

        // Send the presence update
        simulatePresenceUpdate(users);

        // Verify marker count matches user count
        expect(getNearbyUserCount()).toBe(users.length);
      }),
      { numRuns: 100, verbose: true, endOnFailure: true }
    );
  });

  it('each marker is positioned at the correct coordinates from the update', () => {
    fc.assert(
      fc.property(uniqueUsersArb, (users) => {
        // Clear previous state
        simulatePresenceUpdate([]);

        // Send the presence update
        simulatePresenceUpdate(users);

        // Verify each marker's position via _getState
        const state = _getState();
        for (const user of users) {
          const marker = state.nearbyMarkers.get(user.sessionId);
          expect(marker).toBeDefined();
          expect(marker.lat).toBe(user.lat);
          expect(marker.lng).toBe(user.lng);
        }
      }),
      { numRuns: 100, verbose: true, endOnFailure: true }
    );
  });

  it('markers for users absent in a new update are removed', () => {
    fc.assert(
      fc.property(
        uniqueUsersArb,
        uniqueUsersArb,
        (firstUsers, secondUsers) => {
          // Clear previous state
          simulatePresenceUpdate([]);

          // Send first update
          simulatePresenceUpdate(firstUsers);
          expect(getNearbyUserCount()).toBe(firstUsers.length);

          // Send second update (different set of users)
          simulatePresenceUpdate(secondUsers);

          // Verify count matches second update
          expect(getNearbyUserCount()).toBe(secondUsers.length);

          // Verify that users from first update who are NOT in second update have been removed
          const secondIds = new Set(secondUsers.map((u) => u.sessionId));
          const state = _getState();
          for (const user of firstUsers) {
            if (!secondIds.has(user.sessionId)) {
              expect(state.nearbyMarkers.has(user.sessionId)).toBe(false);
            }
          }

          // Verify all second update users are present
          for (const user of secondUsers) {
            expect(state.nearbyMarkers.has(user.sessionId)).toBe(true);
          }
        }
      ),
      { numRuns: 100, verbose: true, endOnFailure: true }
    );
  });

  it('empty presence update removes all markers', () => {
    fc.assert(
      fc.property(uniqueUsersArb, (users) => {
        // Clear previous state
        simulatePresenceUpdate([]);

        // Add some markers
        simulatePresenceUpdate(users);
        expect(getNearbyUserCount()).toBe(users.length);

        // Send empty update
        simulatePresenceUpdate([]);

        // All markers should be removed
        expect(getNearbyUserCount()).toBe(0);
        const state = _getState();
        expect(state.nearbyMarkers.size).toBe(0);
      }),
      { numRuns: 100, verbose: true, endOnFailure: true }
    );
  });
});
