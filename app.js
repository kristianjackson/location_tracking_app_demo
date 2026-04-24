/**
 * Application Core Module
 * Orchestrates geolocation, map rendering, UI state, and proximity features.
 */

import { getCurrentPosition, watchPosition, clearWatch, getErrorMessage } from './geolocation.js';
import { createMap, centerMap, addPositionMarker, updatePositionMarker, addAccuracyCircle, updateAccuracyCircle, onUserPan } from './map.js';
import { showLoading, hideLoading, showError, hideError, showSignalLost, hideSignalLost } from './ui.js';
import { getSessionId, getDisplayName, setDisplayName } from './session.js';
import { initProximity, sendLocationUpdate, setVisibility, getVisibility, disconnect } from './proximity.js';
import { showDisplayNamePrompt, createVisibilityToggle, setToggleState, showConnectionStatus, updateNearbyCount, showPrivacyNotice, createSettingsButton } from './proximity-ui.js';

/** Time in ms before showing the signal-lost notification. */
export const SIGNAL_LOST_TIMEOUT_MS = 30000;

/** Application state. */
export const state = {
  map: null,
  marker: null,
  accuracyCircle: null,
  watchId: null,
  userHasPanned: false,
  signalLostTimerId: null,
  isInitialized: false,
  proximityInitialized: false,
};

/**
 * Initialize the application.
 * Shows a loading indicator, requests the user's current position,
 * and delegates to the appropriate handler on success or error.
 */
export async function init() {
  showLoading('Locating you...');

  try {
    const position = await getCurrentPosition();
    handlePositionSuccess(position);
  } catch (error) {
    handlePositionError(error);
  }
}

/**
 * Handle a successful initial position retrieval.
 * Initializes the map, adds markers, hides loading, starts watching,
 * and initializes the proximity feature.
 * @param {GeolocationPosition} pos - The position from the Geolocation API.
 */
export function handlePositionSuccess(pos) {
  const { latitude, longitude, accuracy } = pos.coords;

  state.map = createMap('map');
  centerMap(state.map, latitude, longitude, 16);

  state.marker = addPositionMarker(state.map, latitude, longitude);
  state.accuracyCircle = addAccuracyCircle(state.map, latitude, longitude, accuracy);

  hideLoading();
  state.isInitialized = true;

  startWatching();

  // Initialize proximity after existing init is complete
  initProximityFeature();
}

/**
 * Initialize the proximity feature.
 * Checks for a display name and either prompts the user or starts proximity directly.
 * Wrapped in try/catch for graceful degradation — the app continues in single-user mode
 * if the proximity service is unavailable.
 */
export function initProximityFeature() {
  try {
    const sessionId = getSessionId();
    const displayName = getDisplayName();

    if (!displayName) {
      showDisplayNamePrompt((name) => {
        setDisplayName(name);
        startProximity(state.map, sessionId, name);
      });
    } else {
      startProximity(state.map, sessionId, displayName);
    }
  } catch (err) {
    // Proximity feature failed to initialize — app continues in single-user mode
    console.warn('Proximity feature initialization failed:', err);
  }
}

/**
 * Start the proximity connection and set up UI controls.
 * @param {object} map - The Leaflet map instance.
 * @param {string} sessionId - The user's session ID.
 * @param {string} displayName - The user's display name.
 */
export function startProximity(map, sessionId, displayName) {
  try {
    const container = document.getElementById('proximity-controls');

    initProximity(map, sessionId, displayName, {
      onStatusChange: showConnectionStatus,
      onNearbyCountChange: updateNearbyCount,
    });

    if (container) {
      createVisibilityToggle(container, (visible) => {
        setVisibility(visible);
      });

      setToggleState(getVisibility());

      createSettingsButton(container, (newName) => {
        setDisplayName(newName);
      });
    }

    state.proximityInitialized = true;
  } catch (err) {
    // Proximity feature failed — app continues in single-user mode
    console.warn('Proximity startup failed:', err);
  }
}

/**
 * Handle a geolocation error during initial position retrieval.
 * Hides loading and displays a user-facing error message.
 * @param {GeolocationPositionError} err - The error from the Geolocation API.
 */
export function handlePositionError(err) {
  hideLoading();
  const message = getErrorMessage(err);
  showError(message);
}

/**
 * Subscribe to continuous position updates from the Geolocation API.
 */
export function startWatching() {
  state.watchId = watchPosition(onPositionUpdate, handlePositionError);

  onUserPan(state.map, () => {
    state.userHasPanned = true;
  });
}

/**
 * Handle an incoming position update during continuous tracking.
 * Updates the marker, accuracy circle, re-centers if needed, resets the signal-lost timer,
 * and sends a location update to the proximity service.
 * @param {GeolocationPosition} pos - The updated position.
 */
export function onPositionUpdate(pos) {
  const { latitude, longitude, accuracy } = pos.coords;

  updatePositionMarker(state.marker, latitude, longitude);
  updateAccuracyCircle(state.accuracyCircle, latitude, longitude, accuracy);

  if (!state.userHasPanned) {
    centerMap(state.map, latitude, longitude);
  }

  resetSignalLostTimer();

  // Send location update to proximity service (graceful degradation)
  try {
    sendLocationUpdate(latitude, longitude, accuracy);
  } catch (err) {
    // Proximity send failed — ignore silently, core tracking continues
  }
}

/**
 * Reset the signal-lost timer. Called on each position update.
 * If no update arrives within SIGNAL_LOST_TIMEOUT_MS, shows the signal-lost notification.
 */
export function resetSignalLostTimer() {
  if (state.signalLostTimerId !== null) {
    clearTimeout(state.signalLostTimerId);
    state.signalLostTimerId = null;
  }

  hideSignalLost();

  state.signalLostTimerId = setTimeout(() => {
    showSignalLost();
  }, SIGNAL_LOST_TIMEOUT_MS);
}

/**
 * Stop watching for position updates and clear the signal-lost timer.
 */
export function stopWatching() {
  if (state.watchId !== null) {
    clearWatch(state.watchId);
    state.watchId = null;
  }

  if (state.signalLostTimerId !== null) {
    clearTimeout(state.signalLostTimerId);
    state.signalLostTimerId = null;
  }
}

// Start the app when the DOM is ready.
document.addEventListener('DOMContentLoaded', init);
