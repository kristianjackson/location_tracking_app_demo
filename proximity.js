// proximity.js — Proximity Client Module
// Manages WebSocket connection to the Proximity Service, sends location broadcasts,
// receives presence updates, and manages nearby user markers on the map.

import {
  addNearbyUserMarker,
  updateNearbyUserMarker,
  removeNearbyUserMarker,
} from './map.js';

// Constants
export const WS_RECONNECT_BASE_MS = 1000;
export const WS_RECONNECT_MAX_MS = 30000;
export const NEARBY_MARKER_COLOR = '#34A853';
export const NEARBY_MARKER_RADIUS = 8;
export const VISIBILITY_KEY = 'proximity_visible';

/**
 * Default proximity service URL. Override via PROXIMITY_SERVICE_URL before calling initProximity.
 */
export let PROXIMITY_SERVICE_URL = 'wss://proximity-service.example.com';

// Module state
const state = {
  ws: null,
  map: null,
  sessionId: null,
  displayName: null,
  visible: false,
  nearbyMarkers: new Map(),
  reconnectAttempt: 0,
  reconnectTimer: null,
  connected: false,
};

// Callbacks
let onStatusChange = null;
let onNearbyCountChange = null;

/**
 * Compute the reconnect delay using exponential backoff with a cap.
 * @param {number} attempt - The current reconnect attempt number (0-based).
 * @returns {number} Delay in milliseconds, clamped to [WS_RECONNECT_BASE_MS, WS_RECONNECT_MAX_MS].
 */
export function computeReconnectDelay(attempt) {
  return Math.min(WS_RECONNECT_BASE_MS * Math.pow(2, attempt), WS_RECONNECT_MAX_MS);
}

/**
 * Build a LocationBroadcast message object.
 * When visible, includes lat/lng/accuracy. When hidden, omits coordinates.
 * @param {string} sessionId
 * @param {string} displayName
 * @param {boolean} visible
 * @param {number|null} lat
 * @param {number|null} lng
 * @param {number|null} accuracy
 * @returns {object} The LocationBroadcast message object.
 */
export function buildLocationBroadcast(sessionId, displayName, visible, lat, lng, accuracy) {
  const message = {
    type: 'location',
    sessionId,
    displayName,
    visible,
    timestamp: Date.now(),
  };

  if (visible) {
    message.lat = lat;
    message.lng = lng;
    message.accuracy = accuracy;
  }

  return message;
}

/**
 * Initialize the proximity client module.
 * Stores references, loads visibility from localStorage, and connects the WebSocket.
 * @param {object} map - The Leaflet map instance.
 * @param {string} sessionId - The user's session ID.
 * @param {string} displayName - The user's display name.
 * @param {object} [options] - Optional callbacks.
 * @param {function} [options.onStatusChange] - Called with status string on connection state changes.
 * @param {function} [options.onNearbyCountChange] - Called with count when nearby user count changes.
 */
export function initProximity(map, sessionId, displayName, options = {}) {
  state.map = map;
  state.sessionId = sessionId;
  state.displayName = displayName;

  // Load visibility preference from localStorage (default: false)
  const stored = localStorage.getItem(VISIBILITY_KEY);
  state.visible = stored === 'true';

  // Set callbacks
  onStatusChange = options.onStatusChange || null;
  onNearbyCountChange = options.onNearbyCountChange || null;

  connect();
}

/**
 * Establish a WebSocket connection to the proximity service.
 */
function connect() {
  if (onStatusChange) {
    onStatusChange('connecting');
  }

  const url = new URL(PROXIMITY_SERVICE_URL);
  url.searchParams.set('sessionId', state.sessionId);
  url.searchParams.set('displayName', state.displayName);

  try {
    state.ws = new WebSocket(url.toString());
  } catch (err) {
    handleConnectionFailure();
    return;
  }

  state.ws.onopen = () => {
    state.reconnectAttempt = 0;
    state.connected = true;
    if (onStatusChange) {
      onStatusChange('connected');
    }
  };

  state.ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      if (data.type === 'presence') {
        handlePresenceUpdate(data);
      }
    } catch (err) {
      // Invalid JSON — log and ignore per error handling strategy
      console.warn('proximity: invalid message from server', err);
    }
  };

  state.ws.onclose = () => {
    handleConnectionFailure();
  };

  state.ws.onerror = () => {
    // onclose will also fire after onerror, so we let onclose handle reconnect.
    // Just log the error here.
    console.warn('proximity: WebSocket error');
  };
}

/**
 * Handle a connection failure or close. Cleans up state, removes markers, and schedules reconnect.
 */
function handleConnectionFailure() {
  state.connected = false;
  state.ws = null;
  removeAllNearbyMarkers();

  if (onStatusChange) {
    onStatusChange('reconnecting');
  }

  scheduleReconnect();
}

/**
 * Schedule a reconnect attempt using exponential backoff.
 */
function scheduleReconnect() {
  if (state.reconnectTimer !== null) {
    return; // Already scheduled
  }

  const delay = computeReconnectDelay(state.reconnectAttempt);
  state.reconnectAttempt++;

  state.reconnectTimer = setTimeout(() => {
    state.reconnectTimer = null;
    connect();
  }, delay);
}

/**
 * Send a location update to the proximity service.
 * Constructs a LocationBroadcast based on current visibility state.
 * @param {number} lat - Latitude.
 * @param {number} lng - Longitude.
 * @param {number} accuracy - Accuracy in meters.
 */
export function sendLocationUpdate(lat, lng, accuracy) {
  if (!state.ws || state.ws.readyState !== WebSocket.OPEN) {
    return;
  }

  const message = buildLocationBroadcast(
    state.sessionId,
    state.displayName,
    state.visible,
    lat,
    lng,
    accuracy
  );

  state.ws.send(JSON.stringify(message));
}

/**
 * Set the user's visibility preference.
 * Persists to localStorage and sends an immediate location update.
 * @param {boolean} visible - Whether the user should be visible.
 */
export function setVisibility(visible) {
  state.visible = visible;
  localStorage.setItem(VISIBILITY_KEY, String(visible));

  // Send an update with the new visibility state.
  // When toggling to hidden, this sends a message without coordinates.
  if (state.ws && state.ws.readyState === WebSocket.OPEN) {
    const message = buildLocationBroadcast(
      state.sessionId,
      state.displayName,
      state.visible,
      null,
      null,
      null
    );
    state.ws.send(JSON.stringify(message));
  }
}

/**
 * Get the current visibility state.
 * @returns {boolean} Whether the user is currently visible.
 */
export function getVisibility() {
  return state.visible;
}

/**
 * Disconnect from the proximity service.
 * Closes the WebSocket, clears reconnect timer, and removes all nearby markers.
 */
export function disconnect() {
  // Clear any pending reconnect
  if (state.reconnectTimer !== null) {
    clearTimeout(state.reconnectTimer);
    state.reconnectTimer = null;
  }

  // Close WebSocket
  if (state.ws) {
    // Remove event handlers to prevent reconnect on intentional close
    state.ws.onclose = null;
    state.ws.onerror = null;
    state.ws.close();
    state.ws = null;
  }

  state.connected = false;
  removeAllNearbyMarkers();

  if (onStatusChange) {
    onStatusChange('disconnected');
  }
}

/**
 * Get the number of currently displayed nearby users.
 * @returns {number} The count of nearby user markers.
 */
export function getNearbyUserCount() {
  return state.nearbyMarkers.size;
}

/**
 * Handle a PresenceUpdate message from the server.
 * Adds, updates, or removes nearby user markers on the map.
 * @param {object} data - The PresenceUpdate payload with a `users` array.
 */
function handlePresenceUpdate(data) {
  const users = data.users || [];

  // Build a set of session IDs present in this update
  const currentIds = new Set(users.map((u) => u.sessionId));

  // Remove markers for users no longer in the update
  for (const [sid, marker] of state.nearbyMarkers) {
    if (!currentIds.has(sid)) {
      removeNearbyUserMarker(marker);
      state.nearbyMarkers.delete(sid);
    }
  }

  // Add or update markers for users in the update
  for (const user of users) {
    // Skip our own session ID (server should already filter, but be safe)
    if (user.sessionId === state.sessionId) {
      continue;
    }

    const existing = state.nearbyMarkers.get(user.sessionId);
    if (existing) {
      updateNearbyUserMarker(existing, user.lat, user.lng);
    } else {
      const marker = addNearbyUserMarker(state.map, user.lat, user.lng, user.displayName);
      state.nearbyMarkers.set(user.sessionId, marker);
    }
  }

  if (onNearbyCountChange) {
    onNearbyCountChange(state.nearbyMarkers.size);
  }
}

/**
 * Remove all nearby user markers from the map and clear the markers map.
 */
function removeAllNearbyMarkers() {
  for (const [, marker] of state.nearbyMarkers) {
    removeNearbyUserMarker(marker);
  }
  state.nearbyMarkers.clear();

  if (onNearbyCountChange) {
    onNearbyCountChange(0);
  }
}

/**
 * Set the onStatusChange callback.
 * @param {function} callback - Called with status string ('connecting', 'connected', 'reconnecting', 'disconnected').
 */
export function setOnStatusChange(callback) {
  onStatusChange = callback;
}

/**
 * Set the onNearbyCountChange callback.
 * @param {function} callback - Called with the current nearby user count.
 */
export function setOnNearbyCountChange(callback) {
  onNearbyCountChange = callback;
}

/**
 * Get the internal state (for testing purposes).
 * @returns {object} A shallow copy of the internal state.
 */
export function _getState() {
  return { ...state, nearbyMarkers: new Map(state.nearbyMarkers) };
}

/**
 * Reset the internal state (for testing purposes).
 */
export function _resetState() {
  if (state.reconnectTimer !== null) {
    clearTimeout(state.reconnectTimer);
  }
  if (state.ws) {
    state.ws.onclose = null;
    state.ws.onerror = null;
    state.ws.close();
  }
  state.ws = null;
  state.map = null;
  state.sessionId = null;
  state.displayName = null;
  state.visible = false;
  state.nearbyMarkers.clear();
  state.reconnectAttempt = 0;
  state.reconnectTimer = null;
  state.connected = false;
  onStatusChange = null;
  onNearbyCountChange = null;
}
