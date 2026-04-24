import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// --- Mock map.js (same approach as proximity-markers.property.test.js) ---
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

const {
  initProximity,
  sendLocationUpdate,
  setVisibility,
  getVisibility,
  disconnect,
  getNearbyUserCount,
  buildLocationBroadcast,
  _getState,
  _resetState,
  WS_RECONNECT_BASE_MS,
} = await import('../proximity.js');

// --- Mock WebSocket helper ---
let mockWs;
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

// --- Constants ---
const SESSION_ID = 'aaaaaaaa-bbbb-4ccc-9ddd-eeeeeeeeeeee';
const DISPLAY_NAME = 'TestUser';

// --- Helper to simulate a presence update ---
function simulatePresenceUpdate(users) {
  const message = JSON.stringify({ type: 'presence', users });
  if (mockWs && mockWs.onmessage) {
    mockWs.onmessage({ data: message });
  }
}

// ============================================================
// 1. Connection lifecycle
// ============================================================
describe('Proximity client — connection lifecycle', () => {
  beforeEach(() => {
    _resetState();
    createdMarkers.clear();
    markerIdCounter = 0;
    localStorage.clear();
    vi.useFakeTimers();
    installMockWebSocket();
  });

  afterEach(() => {
    _resetState();
    restoreWebSocket();
    vi.useRealTimers();
  });

  it('initProximity establishes a WebSocket connection', () => {
    const mockMap = {};
    initProximity(mockMap, SESSION_ID, DISPLAY_NAME);

    expect(mockWs).toBeDefined();
    expect(mockWs.url).toContain('sessionId=');
    expect(mockWs.url).toContain('displayName=');
  });

  it('state.connected becomes true after WebSocket opens', async () => {
    const mockMap = {};
    initProximity(mockMap, SESSION_ID, DISPLAY_NAME);

    // Before the async open fires
    expect(_getState().connected).toBe(false);

    // Advance timers to trigger the setTimeout in MockWebSocket constructor
    vi.advanceTimersByTime(1);

    expect(_getState().connected).toBe(true);
  });

  it('disconnect closes the WebSocket cleanly', () => {
    const mockMap = {};
    initProximity(mockMap, SESSION_ID, DISPLAY_NAME);
    vi.advanceTimersByTime(1);

    expect(_getState().connected).toBe(true);

    disconnect();

    expect(_getState().connected).toBe(false);
    expect(mockWs.readyState).toBe(WebSocket.CLOSED);
  });
});

// ============================================================
// 2. Reconnect with exponential backoff
// ============================================================
describe('Proximity client — reconnect on unexpected close', () => {
  beforeEach(() => {
    _resetState();
    createdMarkers.clear();
    markerIdCounter = 0;
    localStorage.clear();
    vi.useFakeTimers();
    installMockWebSocket();
  });

  afterEach(() => {
    _resetState();
    restoreWebSocket();
    vi.useRealTimers();
  });

  it('schedules reconnect when WebSocket closes unexpectedly', () => {
    const mockMap = {};
    initProximity(mockMap, SESSION_ID, DISPLAY_NAME);
    vi.advanceTimersByTime(1); // open

    const firstWs = mockWs;

    // Simulate unexpected close
    firstWs.onclose();

    expect(_getState().connected).toBe(false);

    // Advance past the first reconnect delay (1000ms base)
    vi.advanceTimersByTime(WS_RECONNECT_BASE_MS);

    // A new WebSocket should have been created
    expect(mockWs).not.toBe(firstWs);
  });

  it('reconnect delay doubles on successive failures', () => {
    const mockMap = {};
    initProximity(mockMap, SESSION_ID, DISPLAY_NAME);
    vi.advanceTimersByTime(1); // open

    // First unexpected close
    mockWs.onclose();
    const ws1 = mockWs;

    // Advance by first delay (1000ms) — should reconnect
    vi.advanceTimersByTime(1000);
    expect(mockWs).not.toBe(ws1);
    const ws2 = mockWs;

    // Second unexpected close
    ws2.onclose();

    // Advance by 1000ms — should NOT have reconnected yet (delay is 2000ms)
    vi.advanceTimersByTime(1000);
    // ws should still be the same since we haven't waited long enough
    const wsAfterPartial = mockWs;

    // Advance the remaining 1000ms
    vi.advanceTimersByTime(1000);
    expect(mockWs).not.toBe(wsAfterPartial);
  });
});

// ============================================================
// 3. Message sending when visible
// ============================================================
describe('Proximity client — sendLocationUpdate when visible', () => {
  beforeEach(() => {
    _resetState();
    createdMarkers.clear();
    markerIdCounter = 0;
    localStorage.clear();
    vi.useFakeTimers();
    installMockWebSocket();
  });

  afterEach(() => {
    _resetState();
    restoreWebSocket();
    vi.useRealTimers();
  });

  it('sends JSON with lat/lng/accuracy when visible=true', () => {
    const mockMap = {};
    initProximity(mockMap, SESSION_ID, DISPLAY_NAME);
    vi.advanceTimersByTime(1); // open

    setVisibility(true);
    sendLocationUpdate(37.7749, -122.4194, 15);

    expect(mockWs.sentMessages.length).toBeGreaterThanOrEqual(1);

    // The last sent message should be the location update
    const lastMsg = JSON.parse(mockWs.sentMessages[mockWs.sentMessages.length - 1]);
    expect(lastMsg.type).toBe('location');
    expect(lastMsg.sessionId).toBe(SESSION_ID);
    expect(lastMsg.displayName).toBe(DISPLAY_NAME);
    expect(lastMsg.visible).toBe(true);
    expect(lastMsg.lat).toBe(37.7749);
    expect(lastMsg.lng).toBe(-122.4194);
    expect(lastMsg.accuracy).toBe(15);
    expect(lastMsg.timestamp).toBeTypeOf('number');
  });
});

// ============================================================
// 4. Message sending when hidden
// ============================================================
describe('Proximity client — sendLocationUpdate when hidden', () => {
  beforeEach(() => {
    _resetState();
    createdMarkers.clear();
    markerIdCounter = 0;
    localStorage.clear();
    vi.useFakeTimers();
    installMockWebSocket();
  });

  afterEach(() => {
    _resetState();
    restoreWebSocket();
    vi.useRealTimers();
  });

  it('sends JSON without coordinates when visible=false', () => {
    const mockMap = {};
    initProximity(mockMap, SESSION_ID, DISPLAY_NAME);
    vi.advanceTimersByTime(1); // open

    // Default visibility is false, but set explicitly
    setVisibility(false);
    sendLocationUpdate(37.7749, -122.4194, 15);

    expect(mockWs.sentMessages.length).toBeGreaterThanOrEqual(1);

    const lastMsg = JSON.parse(mockWs.sentMessages[mockWs.sentMessages.length - 1]);
    expect(lastMsg.type).toBe('location');
    expect(lastMsg.sessionId).toBe(SESSION_ID);
    expect(lastMsg.visible).toBe(false);
    expect(lastMsg.lat).toBeUndefined();
    expect(lastMsg.lng).toBeUndefined();
    expect(lastMsg.accuracy).toBeUndefined();
  });

  it('does not send when WebSocket is not open', () => {
    const mockMap = {};
    initProximity(mockMap, SESSION_ID, DISPLAY_NAME);
    // Don't advance timers — ws.onopen hasn't fired, but readyState is OPEN in our mock
    // Instead, disconnect first
    disconnect();

    sendLocationUpdate(37.7749, -122.4194, 15);

    // No messages should be sent since ws is null after disconnect
    // (disconnect sets ws to null)
    const state = _getState();
    expect(state.ws).toBeNull();
  });
});

// ============================================================
// 5. Marker creation
// ============================================================
describe('Proximity client — marker creation on presence update', () => {
  beforeEach(() => {
    _resetState();
    createdMarkers.clear();
    markerIdCounter = 0;
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

  it('creates markers for new users in a presence update', () => {
    const mockMap = {};
    initProximity(mockMap, SESSION_ID, DISPLAY_NAME);
    vi.advanceTimersByTime(1);

    simulatePresenceUpdate([
      { sessionId: 'user-1', displayName: 'Alice', lat: 37.775, lng: -122.418 },
      { sessionId: 'user-2', displayName: 'Bob', lat: 37.776, lng: -122.419 },
    ]);

    expect(addNearbyUserMarker).toHaveBeenCalledTimes(2);
    expect(getNearbyUserCount()).toBe(2);
  });

  it('does not create a marker for own session ID', () => {
    const mockMap = {};
    initProximity(mockMap, SESSION_ID, DISPLAY_NAME);
    vi.advanceTimersByTime(1);

    simulatePresenceUpdate([
      { sessionId: SESSION_ID, displayName: DISPLAY_NAME, lat: 37.775, lng: -122.418 },
      { sessionId: 'user-1', displayName: 'Alice', lat: 37.776, lng: -122.419 },
    ]);

    expect(addNearbyUserMarker).toHaveBeenCalledTimes(1);
    expect(getNearbyUserCount()).toBe(1);
  });
});

// ============================================================
// 6. Marker update
// ============================================================
describe('Proximity client — marker update on presence update', () => {
  beforeEach(() => {
    _resetState();
    createdMarkers.clear();
    markerIdCounter = 0;
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

  it('updates existing marker position when user reappears in update', () => {
    const mockMap = {};
    initProximity(mockMap, SESSION_ID, DISPLAY_NAME);
    vi.advanceTimersByTime(1);

    // First update — creates marker
    simulatePresenceUpdate([
      { sessionId: 'user-1', displayName: 'Alice', lat: 37.775, lng: -122.418 },
    ]);
    expect(addNearbyUserMarker).toHaveBeenCalledTimes(1);

    // Second update — same user, new position
    simulatePresenceUpdate([
      { sessionId: 'user-1', displayName: 'Alice', lat: 37.780, lng: -122.420 },
    ]);

    // Should update, not create a new marker
    expect(addNearbyUserMarker).toHaveBeenCalledTimes(1);
    expect(updateNearbyUserMarker).toHaveBeenCalledTimes(1);

    const state = _getState();
    const marker = state.nearbyMarkers.get('user-1');
    expect(marker.lat).toBe(37.780);
    expect(marker.lng).toBe(-122.420);
  });
});

// ============================================================
// 7. Marker removal
// ============================================================
describe('Proximity client — marker removal', () => {
  beforeEach(() => {
    _resetState();
    createdMarkers.clear();
    markerIdCounter = 0;
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

  it('removes markers for users absent from a new presence update', () => {
    const mockMap = {};
    initProximity(mockMap, SESSION_ID, DISPLAY_NAME);
    vi.advanceTimersByTime(1);

    // First update with two users
    simulatePresenceUpdate([
      { sessionId: 'user-1', displayName: 'Alice', lat: 37.775, lng: -122.418 },
      { sessionId: 'user-2', displayName: 'Bob', lat: 37.776, lng: -122.419 },
    ]);
    expect(getNearbyUserCount()).toBe(2);

    // Second update with only one user
    simulatePresenceUpdate([
      { sessionId: 'user-1', displayName: 'Alice', lat: 37.775, lng: -122.418 },
    ]);

    expect(removeNearbyUserMarker).toHaveBeenCalledTimes(1);
    expect(getNearbyUserCount()).toBe(1);

    const state = _getState();
    expect(state.nearbyMarkers.has('user-1')).toBe(true);
    expect(state.nearbyMarkers.has('user-2')).toBe(false);
  });

  it('removes all markers when presence update is empty', () => {
    const mockMap = {};
    initProximity(mockMap, SESSION_ID, DISPLAY_NAME);
    vi.advanceTimersByTime(1);

    simulatePresenceUpdate([
      { sessionId: 'user-1', displayName: 'Alice', lat: 37.775, lng: -122.418 },
      { sessionId: 'user-2', displayName: 'Bob', lat: 37.776, lng: -122.419 },
    ]);
    expect(getNearbyUserCount()).toBe(2);

    simulatePresenceUpdate([]);

    expect(getNearbyUserCount()).toBe(0);
  });
});

// ============================================================
// 8. getNearbyUserCount
// ============================================================
describe('Proximity client — getNearbyUserCount', () => {
  beforeEach(() => {
    _resetState();
    createdMarkers.clear();
    markerIdCounter = 0;
    localStorage.clear();
    vi.useFakeTimers();
    installMockWebSocket();
  });

  afterEach(() => {
    _resetState();
    restoreWebSocket();
    vi.useRealTimers();
  });

  it('returns 0 initially', () => {
    const mockMap = {};
    initProximity(mockMap, SESSION_ID, DISPLAY_NAME);
    vi.advanceTimersByTime(1);

    expect(getNearbyUserCount()).toBe(0);
  });

  it('returns correct count after presence updates', () => {
    const mockMap = {};
    initProximity(mockMap, SESSION_ID, DISPLAY_NAME);
    vi.advanceTimersByTime(1);

    simulatePresenceUpdate([
      { sessionId: 'user-1', displayName: 'Alice', lat: 37.775, lng: -122.418 },
      { sessionId: 'user-2', displayName: 'Bob', lat: 37.776, lng: -122.419 },
      { sessionId: 'user-3', displayName: 'Carol', lat: 37.777, lng: -122.420 },
    ]);

    expect(getNearbyUserCount()).toBe(3);
  });

  it('decreases when users leave', () => {
    const mockMap = {};
    initProximity(mockMap, SESSION_ID, DISPLAY_NAME);
    vi.advanceTimersByTime(1);

    simulatePresenceUpdate([
      { sessionId: 'user-1', displayName: 'Alice', lat: 37.775, lng: -122.418 },
      { sessionId: 'user-2', displayName: 'Bob', lat: 37.776, lng: -122.419 },
    ]);
    expect(getNearbyUserCount()).toBe(2);

    simulatePresenceUpdate([
      { sessionId: 'user-1', displayName: 'Alice', lat: 37.775, lng: -122.418 },
    ]);
    expect(getNearbyUserCount()).toBe(1);
  });
});

// ============================================================
// 9. Disconnect removes all markers
// ============================================================
describe('Proximity client — disconnect removes all nearby markers', () => {
  beforeEach(() => {
    _resetState();
    createdMarkers.clear();
    markerIdCounter = 0;
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

  it('removes all nearby markers on disconnect', () => {
    const mockMap = {};
    initProximity(mockMap, SESSION_ID, DISPLAY_NAME);
    vi.advanceTimersByTime(1);

    simulatePresenceUpdate([
      { sessionId: 'user-1', displayName: 'Alice', lat: 37.775, lng: -122.418 },
      { sessionId: 'user-2', displayName: 'Bob', lat: 37.776, lng: -122.419 },
    ]);
    expect(getNearbyUserCount()).toBe(2);

    disconnect();

    expect(getNearbyUserCount()).toBe(0);
    expect(removeNearbyUserMarker).toHaveBeenCalledTimes(2);
  });

  it('removes all nearby markers on unexpected WebSocket close', () => {
    const mockMap = {};
    initProximity(mockMap, SESSION_ID, DISPLAY_NAME);
    vi.advanceTimersByTime(1);

    simulatePresenceUpdate([
      { sessionId: 'user-1', displayName: 'Alice', lat: 37.775, lng: -122.418 },
    ]);
    expect(getNearbyUserCount()).toBe(1);

    // Simulate unexpected close
    mockWs.onclose();

    expect(getNearbyUserCount()).toBe(0);
  });
});

// ============================================================
// 10. Status callbacks
// ============================================================
describe('Proximity client — onStatusChange callbacks', () => {
  beforeEach(() => {
    _resetState();
    createdMarkers.clear();
    markerIdCounter = 0;
    localStorage.clear();
    vi.useFakeTimers();
    installMockWebSocket();
  });

  afterEach(() => {
    _resetState();
    restoreWebSocket();
    vi.useRealTimers();
  });

  it('calls onStatusChange with "connecting" on init', () => {
    const statusChanges = [];
    const mockMap = {};
    initProximity(mockMap, SESSION_ID, DISPLAY_NAME, {
      onStatusChange: (status) => statusChanges.push(status),
    });

    expect(statusChanges).toContain('connecting');
  });

  it('calls onStatusChange with "connected" after WebSocket opens', () => {
    const statusChanges = [];
    const mockMap = {};
    initProximity(mockMap, SESSION_ID, DISPLAY_NAME, {
      onStatusChange: (status) => statusChanges.push(status),
    });

    vi.advanceTimersByTime(1);

    expect(statusChanges).toContain('connected');
  });

  it('calls onStatusChange with "reconnecting" on unexpected close', () => {
    const statusChanges = [];
    const mockMap = {};
    initProximity(mockMap, SESSION_ID, DISPLAY_NAME, {
      onStatusChange: (status) => statusChanges.push(status),
    });
    vi.advanceTimersByTime(1);

    mockWs.onclose();

    expect(statusChanges).toContain('reconnecting');
  });

  it('calls onStatusChange with "disconnected" on intentional disconnect', () => {
    const statusChanges = [];
    const mockMap = {};
    initProximity(mockMap, SESSION_ID, DISPLAY_NAME, {
      onStatusChange: (status) => statusChanges.push(status),
    });
    vi.advanceTimersByTime(1);

    disconnect();

    expect(statusChanges).toContain('disconnected');
  });
});
