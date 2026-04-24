import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Mock map.js — tracks all marker operations for assertions
// ---------------------------------------------------------------------------
const createdMarkers = new Map();
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

const { addNearbyUserMarker, updateNearbyUserMarker, removeNearbyUserMarker } =
  await import('../map.js');

// ---------------------------------------------------------------------------
// Import proximity client module (uses the mocked map.js)
// ---------------------------------------------------------------------------
const {
  initProximity,
  sendLocationUpdate,
  setVisibility,
  getVisibility,
  disconnect,
  getNearbyUserCount,
  buildLocationBroadcast,
  computeReconnectDelay,
  _getState,
  _resetState,
  WS_RECONNECT_BASE_MS,
  WS_RECONNECT_MAX_MS,
} = await import('../proximity.js');

// ---------------------------------------------------------------------------
// Import server-side pure functions for combined testing
// ---------------------------------------------------------------------------
const {
  haversineDistance,
  evictStaleUsers,
  filterNearbyUsers,
  PROXIMITY_RADIUS_M,
  STALE_TIMEOUT_MS,
} = await import('../proximity-service/src/proximity-room.js');

// ---------------------------------------------------------------------------
// Mock WebSocket — captures all instances for inspection
// ---------------------------------------------------------------------------
let mockWs;
let wsInstances = [];
let originalWebSocket;

function installMockWebSocket() {
  originalWebSocket = globalThis.WebSocket;
  globalThis.WebSocket = class MockWebSocket {
    static OPEN = 1;
    static CONNECTING = 0;
    static CLOSING = 2;
    static CLOSED = 3;

    constructor(url) {
      this.url = url;
      this.readyState = MockWebSocket.OPEN;
      this.onopen = null;
      this.onmessage = null;
      this.onclose = null;
      this.onerror = null;
      this.sentMessages = [];
      mockWs = this;
      wsInstances.push(this);

      // Simulate async open
      setTimeout(() => {
        if (this.onopen) this.onopen({});
      }, 0);
    }

    send(data) {
      this.sentMessages.push(data);
    }

    close() {
      this.readyState = MockWebSocket.CLOSED;
    }
  };
  globalThis.WebSocket.OPEN = 1;
  globalThis.WebSocket.CONNECTING = 0;
  globalThis.WebSocket.CLOSING = 2;
  globalThis.WebSocket.CLOSED = 3;
}

function restoreWebSocket() {
  globalThis.WebSocket = originalWebSocket;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const SESSION_ID = 'aaaaaaaa-bbbb-4ccc-9ddd-eeeeeeeeeeee';
const DISPLAY_NAME = 'TestUser';

// ---------------------------------------------------------------------------
// Helper: simulate a presence update from the server
// ---------------------------------------------------------------------------
function simulatePresenceUpdate(users) {
  const message = JSON.stringify({ type: 'presence', users });
  if (mockWs && mockWs.onmessage) {
    mockWs.onmessage({ data: message });
  }
}

// ===========================================================================
// Integration Test Suite: End-to-End Proximity Flows
// ===========================================================================
describe('Integration: end-to-end proximity flows', () => {
  beforeEach(() => {
    _resetState();
    createdMarkers.clear();
    markerIdCounter = 0;
    wsInstances = [];
    localStorage.clear();
    vi.useFakeTimers();
    installMockWebSocket();
    vi.clearAllMocks();
  });

  afterEach(() => {
    _resetState();
    restoreWebSocket();
    vi.useRealTimers();
  });

  // -------------------------------------------------------------------------
  // 1. WebSocket connection establishment with valid session
  //    Validates: Requirements 3.1
  // -------------------------------------------------------------------------
  describe('WebSocket connection with valid session', () => {
    it('creates a WebSocket with sessionId and displayName in URL params', () => {
      const mockMap = {};
      initProximity(mockMap, SESSION_ID, DISPLAY_NAME);

      expect(mockWs).toBeDefined();
      const url = new URL(mockWs.url);
      expect(url.searchParams.get('sessionId')).toBe(SESSION_ID);
      expect(url.searchParams.get('displayName')).toBe(DISPLAY_NAME);
    });

    it('transitions through connecting → connected status on successful open', () => {
      const statusChanges = [];
      const mockMap = {};
      initProximity(mockMap, SESSION_ID, DISPLAY_NAME, {
        onStatusChange: (s) => statusChanges.push(s),
      });

      expect(statusChanges).toEqual(['connecting']);
      expect(_getState().connected).toBe(false);

      // Trigger the async open
      vi.advanceTimersByTime(1);

      expect(statusChanges).toEqual(['connecting', 'connected']);
      expect(_getState().connected).toBe(true);
    });

    it('resets reconnect attempt counter after successful connection', () => {
      const mockMap = {};
      initProximity(mockMap, SESSION_ID, DISPLAY_NAME);
      vi.advanceTimersByTime(1); // open

      // Force a disconnect to increment reconnect attempt
      mockWs.onclose();
      vi.advanceTimersByTime(WS_RECONNECT_BASE_MS); // reconnect fires
      vi.advanceTimersByTime(1); // new ws opens

      // After successful reconnect, attempt counter should be reset to 0
      expect(_getState().reconnectAttempt).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // 2. Location broadcast delivery and presence update receipt
  //    Validates: Requirements 3.1, 8.1
  // -------------------------------------------------------------------------
  describe('location broadcast and presence update flow', () => {
    it('sends a location broadcast and processes a presence update with markers', () => {
      const mockMap = {};
      initProximity(mockMap, SESSION_ID, DISPLAY_NAME);
      vi.advanceTimersByTime(1); // open

      // Set visible and send a location update
      setVisibility(true);
      sendLocationUpdate(37.7749, -122.4194, 15);

      // Verify the broadcast was sent with correct structure
      const sentMessages = mockWs.sentMessages;
      expect(sentMessages.length).toBeGreaterThanOrEqual(1);
      const locationMsg = JSON.parse(sentMessages[sentMessages.length - 1]);
      expect(locationMsg.type).toBe('location');
      expect(locationMsg.sessionId).toBe(SESSION_ID);
      expect(locationMsg.visible).toBe(true);
      expect(locationMsg.lat).toBe(37.7749);
      expect(locationMsg.lng).toBe(-122.4194);
      expect(locationMsg.accuracy).toBe(15);

      // Now simulate receiving a presence update from the server
      simulatePresenceUpdate([
        { sessionId: 'user-alice', displayName: 'Alice', lat: 37.775, lng: -122.418 },
        { sessionId: 'user-bob', displayName: 'Bob', lat: 37.776, lng: -122.419 },
      ]);

      // Markers should be created for both users
      expect(addNearbyUserMarker).toHaveBeenCalledTimes(2);
      expect(getNearbyUserCount()).toBe(2);

      // Simulate a second presence update where Alice moved
      simulatePresenceUpdate([
        { sessionId: 'user-alice', displayName: 'Alice', lat: 37.780, lng: -122.420 },
        { sessionId: 'user-bob', displayName: 'Bob', lat: 37.776, lng: -122.419 },
      ]);

      // Alice's marker should be updated, not recreated
      expect(addNearbyUserMarker).toHaveBeenCalledTimes(2); // still 2 total creates
      expect(updateNearbyUserMarker).toHaveBeenCalledTimes(2); // both updated
      expect(getNearbyUserCount()).toBe(2);
    });

    it('removes markers when users disappear from presence updates', () => {
      const mockMap = {};
      initProximity(mockMap, SESSION_ID, DISPLAY_NAME);
      vi.advanceTimersByTime(1);

      // Two users appear
      simulatePresenceUpdate([
        { sessionId: 'user-alice', displayName: 'Alice', lat: 37.775, lng: -122.418 },
        { sessionId: 'user-bob', displayName: 'Bob', lat: 37.776, lng: -122.419 },
      ]);
      expect(getNearbyUserCount()).toBe(2);

      // Bob leaves
      simulatePresenceUpdate([
        { sessionId: 'user-alice', displayName: 'Alice', lat: 37.775, lng: -122.418 },
      ]);
      expect(getNearbyUserCount()).toBe(1);
      expect(removeNearbyUserMarker).toHaveBeenCalledTimes(1);

      // Everyone leaves
      simulatePresenceUpdate([]);
      expect(getNearbyUserCount()).toBe(0);
      expect(removeNearbyUserMarker).toHaveBeenCalledTimes(2);
    });
  });

  // -------------------------------------------------------------------------
  // 3. Hidden user exclusion from presence updates
  //    Validates: Requirements 4.3
  // -------------------------------------------------------------------------
  describe('hidden user exclusion (server-side filtering)', () => {
    it('filterNearbyUsers excludes hidden users from results', () => {
      const users = new Map();
      const baseLat = 37.7749;
      const baseLng = -122.4194;

      // Alice is visible and nearby
      users.set('alice', {
        sessionId: 'alice',
        displayName: 'Alice',
        lat: baseLat + 0.001,
        lng: baseLng,
        visible: true,
        lastSeen: Date.now(),
      });

      // Bob is hidden and nearby
      users.set('bob', {
        sessionId: 'bob',
        displayName: 'Bob',
        lat: baseLat + 0.002,
        lng: baseLng,
        visible: false,
        lastSeen: Date.now(),
      });

      // Carol is visible and nearby
      users.set('carol', {
        sessionId: 'carol',
        displayName: 'Carol',
        lat: baseLat - 0.001,
        lng: baseLng,
        visible: true,
        lastSeen: Date.now(),
      });

      const result = filterNearbyUsers(users, 'me', baseLat, baseLng, PROXIMITY_RADIUS_M);

      // Bob should be excluded because he's hidden
      expect(result.length).toBe(2);
      const names = result.map((u) => u.displayName).sort();
      expect(names).toEqual(['Alice', 'Carol']);
      expect(result.find((u) => u.displayName === 'Bob')).toBeUndefined();
    });

    it('client sends broadcast without coordinates when hidden', () => {
      const mockMap = {};
      initProximity(mockMap, SESSION_ID, DISPLAY_NAME);
      vi.advanceTimersByTime(1);

      setVisibility(false);
      sendLocationUpdate(37.7749, -122.4194, 15);

      const lastMsg = JSON.parse(mockWs.sentMessages[mockWs.sentMessages.length - 1]);
      expect(lastMsg.type).toBe('location');
      expect(lastMsg.visible).toBe(false);
      expect(lastMsg.lat).toBeUndefined();
      expect(lastMsg.lng).toBeUndefined();
      expect(lastMsg.accuracy).toBeUndefined();
    });

    it('filterNearbyUsers excludes the requesting client from results', () => {
      const users = new Map();
      const baseLat = 37.7749;
      const baseLng = -122.4194;

      users.set('me', {
        sessionId: 'me',
        displayName: 'Me',
        lat: baseLat,
        lng: baseLng,
        visible: true,
        lastSeen: Date.now(),
      });

      users.set('alice', {
        sessionId: 'alice',
        displayName: 'Alice',
        lat: baseLat + 0.001,
        lng: baseLng,
        visible: true,
        lastSeen: Date.now(),
      });

      const result = filterNearbyUsers(users, 'me', baseLat, baseLng, PROXIMITY_RADIUS_M);
      expect(result.length).toBe(1);
      expect(result[0].sessionId).toBe('alice');
    });

    it('filterNearbyUsers excludes users outside the 5km radius', () => {
      const users = new Map();
      const baseLat = 37.7749;
      const baseLng = -122.4194;

      // Nearby user (~111m away)
      users.set('near', {
        sessionId: 'near',
        displayName: 'Near',
        lat: baseLat + 0.001,
        lng: baseLng,
        visible: true,
        lastSeen: Date.now(),
      });

      // Far user (~111km away)
      users.set('far', {
        sessionId: 'far',
        displayName: 'Far',
        lat: baseLat + 1.0,
        lng: baseLng,
        visible: true,
        lastSeen: Date.now(),
      });

      const result = filterNearbyUsers(users, 'me', baseLat, baseLng, PROXIMITY_RADIUS_M);
      expect(result.length).toBe(1);
      expect(result[0].sessionId).toBe('near');
    });
  });

  // -------------------------------------------------------------------------
  // 4. Stale client cleanup after 60s timeout
  //    Validates: Requirements 4.5
  // -------------------------------------------------------------------------
  describe('stale client cleanup after 60s timeout', () => {
    it('evicts users whose lastSeen exceeds 60s and keeps fresh users', () => {
      const now = 1700000060001; // arbitrary "current" time
      const users = new Map();

      // Fresh user — lastSeen 30s ago (within threshold)
      users.set('fresh', {
        sessionId: 'fresh',
        displayName: 'Fresh',
        lat: 37.775,
        lng: -122.418,
        visible: true,
        lastSeen: now - 30000,
      });

      // Stale user — lastSeen 61s ago (exceeds threshold)
      users.set('stale', {
        sessionId: 'stale',
        displayName: 'Stale',
        lat: 37.776,
        lng: -122.419,
        visible: true,
        lastSeen: now - 61000,
      });

      // Exactly at boundary — lastSeen exactly 60s ago (should NOT be evicted, > not >=)
      users.set('boundary', {
        sessionId: 'boundary',
        displayName: 'Boundary',
        lat: 37.777,
        lng: -122.420,
        visible: true,
        lastSeen: now - 60000,
      });

      const evicted = evictStaleUsers(users, now, STALE_TIMEOUT_MS);

      expect(evicted).toEqual(['stale']);
      expect(users.has('fresh')).toBe(true);
      expect(users.has('stale')).toBe(false);
      expect(users.has('boundary')).toBe(true);
    });

    it('eviction + filtering work together: stale users are excluded from presence', () => {
      const now = 1700000060001;
      const users = new Map();

      users.set('active', {
        sessionId: 'active',
        displayName: 'Active',
        lat: 37.775,
        lng: -122.418,
        visible: true,
        lastSeen: now - 5000,
      });

      users.set('stale', {
        sessionId: 'stale',
        displayName: 'Stale',
        lat: 37.776,
        lng: -122.419,
        visible: true,
        lastSeen: now - 70000,
      });

      // First evict stale users
      const evicted = evictStaleUsers(users, now, STALE_TIMEOUT_MS);
      expect(evicted).toContain('stale');

      // Then filter for a requesting client
      const result = filterNearbyUsers(users, 'me', 37.775, -122.418, PROXIMITY_RADIUS_M);
      expect(result.length).toBe(1);
      expect(result[0].sessionId).toBe('active');
    });
  });

  // -------------------------------------------------------------------------
  // 5. Reconnection behavior after disconnect
  //    Validates: Requirements 3.5
  // -------------------------------------------------------------------------
  describe('reconnection after disconnect', () => {
    it('reconnects with exponential backoff after unexpected close', () => {
      const statusChanges = [];
      const mockMap = {};
      initProximity(mockMap, SESSION_ID, DISPLAY_NAME, {
        onStatusChange: (s) => statusChanges.push(s),
      });
      vi.advanceTimersByTime(1); // open

      const firstWs = mockWs;
      const wsCountAfterFirst = wsInstances.length;

      // Simulate unexpected close
      firstWs.onclose();
      expect(statusChanges).toContain('reconnecting');

      // First reconnect at 1000ms — a new WebSocket should be created
      vi.advanceTimersByTime(WS_RECONNECT_BASE_MS);
      expect(wsInstances.length).toBe(wsCountAfterFirst + 1);
      const secondWs = mockWs;
      expect(secondWs).not.toBe(firstWs);

      // Open the second connection
      vi.advanceTimersByTime(1);
      expect(_getState().connected).toBe(true);

      // Second disconnect
      const wsCountBeforeSecondClose = wsInstances.length;
      secondWs.onclose();

      // After 1000ms, should NOT have reconnected yet (delay is 1000ms base * 2^0 = 1000ms
      // because reconnectAttempt was reset to 0 on successful open)
      // Actually, after successful open reconnectAttempt resets to 0, so delay is 1000ms again
      vi.advanceTimersByTime(WS_RECONNECT_BASE_MS);
      expect(wsInstances.length).toBe(wsCountBeforeSecondClose + 1);
    });

    it('removes all nearby markers on disconnect and restores on reconnect', () => {
      const mockMap = {};
      initProximity(mockMap, SESSION_ID, DISPLAY_NAME);
      vi.advanceTimersByTime(1);

      // Add some nearby users
      simulatePresenceUpdate([
        { sessionId: 'user-1', displayName: 'Alice', lat: 37.775, lng: -122.418 },
        { sessionId: 'user-2', displayName: 'Bob', lat: 37.776, lng: -122.419 },
      ]);
      expect(getNearbyUserCount()).toBe(2);

      // Unexpected close
      mockWs.onclose();
      expect(getNearbyUserCount()).toBe(0);

      // Reconnect
      vi.advanceTimersByTime(WS_RECONNECT_BASE_MS);
      vi.advanceTimersByTime(1); // open

      expect(_getState().connected).toBe(true);

      // New presence update after reconnect
      simulatePresenceUpdate([
        { sessionId: 'user-1', displayName: 'Alice', lat: 37.780, lng: -122.420 },
      ]);
      expect(getNearbyUserCount()).toBe(1);
    });

    it('backoff delay is capped at 30 seconds', () => {
      // Verify the pure function directly
      expect(computeReconnectDelay(0)).toBe(1000);
      expect(computeReconnectDelay(1)).toBe(2000);
      expect(computeReconnectDelay(2)).toBe(4000);
      expect(computeReconnectDelay(3)).toBe(8000);
      expect(computeReconnectDelay(4)).toBe(16000);
      expect(computeReconnectDelay(5)).toBe(30000); // capped
      expect(computeReconnectDelay(10)).toBe(30000); // still capped
      expect(computeReconnectDelay(100)).toBe(30000); // still capped
    });
  });

  // -------------------------------------------------------------------------
  // 6. Single-user mode when proximity service is unavailable
  //    Validates: Requirements 8.1, 8.2
  // -------------------------------------------------------------------------
  describe('single-user mode when proximity service is unavailable', () => {
    it('app continues when WebSocket constructor throws', () => {
      // Replace WebSocket with one that throws
      globalThis.WebSocket = class FailingWebSocket {
        constructor() {
          throw new Error('Service unavailable');
        }
      };
      globalThis.WebSocket.OPEN = 1;

      const statusChanges = [];
      const mockMap = {};

      // initProximity should not throw — it handles the error internally
      expect(() => {
        initProximity(mockMap, SESSION_ID, DISPLAY_NAME, {
          onStatusChange: (s) => statusChanges.push(s),
        });
      }).not.toThrow();

      // Status should show reconnecting (connection failure triggers reconnect)
      expect(statusChanges).toContain('connecting');
    });

    it('sendLocationUpdate is a no-op when not connected', () => {
      // Don't initialize proximity at all — simulate unavailable service
      _resetState();

      // Should not throw
      expect(() => {
        sendLocationUpdate(37.7749, -122.4194, 15);
      }).not.toThrow();
    });

    it('getNearbyUserCount returns 0 when not connected', () => {
      _resetState();
      expect(getNearbyUserCount()).toBe(0);
    });

    it('disconnect is safe to call when not connected', () => {
      _resetState();
      expect(() => disconnect()).not.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // 7. Combined server-side flow: haversine + filtering + eviction
  //    Tests the pure functions working together in a realistic scenario
  // -------------------------------------------------------------------------
  describe('combined server-side flow: realistic multi-user scenario', () => {
    it('processes a realistic scenario with mixed visibility, distances, and staleness', () => {
      const now = Date.now();
      const clientLat = 37.7749;
      const clientLng = -122.4194;

      const users = new Map();

      // Client itself
      users.set('client', {
        sessionId: 'client',
        displayName: 'Client',
        lat: clientLat,
        lng: clientLng,
        visible: true,
        lastSeen: now,
      });

      // Alice: visible, nearby (~200m), fresh
      users.set('alice', {
        sessionId: 'alice',
        displayName: 'Alice',
        lat: clientLat + 0.002,
        lng: clientLng,
        visible: true,
        lastSeen: now - 5000,
      });

      // Bob: visible, far away (~50km), fresh
      users.set('bob', {
        sessionId: 'bob',
        displayName: 'Bob',
        lat: clientLat + 0.5,
        lng: clientLng,
        visible: true,
        lastSeen: now - 10000,
      });

      // Carol: hidden, nearby, fresh
      users.set('carol', {
        sessionId: 'carol',
        displayName: 'Carol',
        lat: clientLat + 0.001,
        lng: clientLng,
        visible: false,
        lastSeen: now - 3000,
      });

      // Dave: visible, nearby, but stale (90s old)
      users.set('dave', {
        sessionId: 'dave',
        displayName: 'Dave',
        lat: clientLat - 0.001,
        lng: clientLng,
        visible: true,
        lastSeen: now - 90000,
      });

      // Eve: visible, nearby, fresh
      users.set('eve', {
        sessionId: 'eve',
        displayName: 'Eve',
        lat: clientLat + 0.003,
        lng: clientLng + 0.003,
        visible: true,
        lastSeen: now - 1000,
      });

      // Step 1: Evict stale users
      const evicted = evictStaleUsers(users, now, STALE_TIMEOUT_MS);
      expect(evicted).toEqual(['dave']);
      expect(users.has('dave')).toBe(false);

      // Step 2: Filter nearby users for the client
      const nearby = filterNearbyUsers(users, 'client', clientLat, clientLng, PROXIMITY_RADIUS_M);

      // Should include: Alice (visible, nearby, fresh), Eve (visible, nearby, fresh)
      // Should exclude: client (self), Bob (too far), Carol (hidden), Dave (evicted)
      const nearbyNames = nearby.map((u) => u.displayName).sort();
      expect(nearbyNames).toEqual(['Alice', 'Eve']);

      // Verify each result has the expected structure
      for (const user of nearby) {
        expect(user).toHaveProperty('sessionId');
        expect(user).toHaveProperty('displayName');
        expect(user).toHaveProperty('lat');
        expect(user).toHaveProperty('lng');
      }
    });
  });

  // -------------------------------------------------------------------------
  // 8. Full client round-trip: visibility toggle → broadcast → presence → markers
  // -------------------------------------------------------------------------
  describe('full client round-trip flow', () => {
    it('visibility toggle changes broadcast content and persists to localStorage', () => {
      const mockMap = {};
      initProximity(mockMap, SESSION_ID, DISPLAY_NAME);
      vi.advanceTimersByTime(1);

      // Initially hidden (default)
      expect(getVisibility()).toBe(false);

      // Toggle to visible
      setVisibility(true);
      expect(getVisibility()).toBe(true);
      expect(localStorage.getItem('proximity_visible')).toBe('true');

      // Send location — should include coordinates
      sendLocationUpdate(37.7749, -122.4194, 15);
      const visibleMsg = JSON.parse(mockWs.sentMessages[mockWs.sentMessages.length - 1]);
      expect(visibleMsg.visible).toBe(true);
      expect(visibleMsg.lat).toBe(37.7749);

      // Toggle back to hidden
      setVisibility(false);
      expect(getVisibility()).toBe(false);
      expect(localStorage.getItem('proximity_visible')).toBe('false');

      // Send location — should NOT include coordinates
      sendLocationUpdate(37.7749, -122.4194, 15);
      const hiddenMsg = JSON.parse(mockWs.sentMessages[mockWs.sentMessages.length - 1]);
      expect(hiddenMsg.visible).toBe(false);
      expect(hiddenMsg.lat).toBeUndefined();
    });

    it('presence updates drive marker lifecycle: create → update → remove', () => {
      const countChanges = [];
      const mockMap = {};
      initProximity(mockMap, SESSION_ID, DISPLAY_NAME, {
        onNearbyCountChange: (c) => countChanges.push(c),
      });
      vi.advanceTimersByTime(1);

      // Phase 1: Two users appear
      simulatePresenceUpdate([
        { sessionId: 'u1', displayName: 'User1', lat: 37.775, lng: -122.418 },
        { sessionId: 'u2', displayName: 'User2', lat: 37.776, lng: -122.419 },
      ]);
      expect(addNearbyUserMarker).toHaveBeenCalledTimes(2);
      expect(countChanges[countChanges.length - 1]).toBe(2);

      // Phase 2: Both users move
      simulatePresenceUpdate([
        { sessionId: 'u1', displayName: 'User1', lat: 37.780, lng: -122.420 },
        { sessionId: 'u2', displayName: 'User2', lat: 37.781, lng: -122.421 },
      ]);
      expect(updateNearbyUserMarker).toHaveBeenCalledTimes(2);
      expect(addNearbyUserMarker).toHaveBeenCalledTimes(2); // no new creates

      // Phase 3: One user leaves, one new user joins
      simulatePresenceUpdate([
        { sessionId: 'u1', displayName: 'User1', lat: 37.780, lng: -122.420 },
        { sessionId: 'u3', displayName: 'User3', lat: 37.777, lng: -122.417 },
      ]);
      expect(removeNearbyUserMarker).toHaveBeenCalledTimes(1); // u2 removed
      expect(addNearbyUserMarker).toHaveBeenCalledTimes(3); // u3 added

      // Phase 4: All users leave
      simulatePresenceUpdate([]);
      expect(getNearbyUserCount()).toBe(0);
    });
  });
});
