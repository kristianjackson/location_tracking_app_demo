/**
 * Application Core Module
 * Orchestrates geolocation, map rendering, and UI state.
 */

import { getCurrentPosition, watchPosition, clearWatch, getErrorMessage } from './geolocation.js';
import { createMap, centerMap, addPositionMarker, updatePositionMarker, addAccuracyCircle, updateAccuracyCircle, onUserPan } from './map.js';
import { showLoading, hideLoading, showError, hideError, showSignalLost, hideSignalLost } from './ui.js';

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
 * Initializes the map, adds markers, hides loading, and starts watching.
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
}

/**
 * Handle a geolocation error during initial position retrieval.
 * Hides loading and displays a user-facing error message.
 * @param {GeolocationPositionError} err - The error from the Geolocation API.
 */
export function handlePositionError(err) {
  // TODO: Implement in task 6.3
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
 * Updates the marker, accuracy circle, re-centers if needed, and resets the signal-lost timer.
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
}

/**
 * Reset the signal-lost timer. Called on each position update.
 * If no update arrives within SIGNAL_LOST_TIMEOUT_MS, shows the signal-lost notification.
 */
export function resetSignalLostTimer() {
  // TODO: Implement in task 6.3
}

/**
 * Stop watching for position updates and clear the signal-lost timer.
 */
export function stopWatching() {
  // TODO: Implement in task 6.3
}

// Start the app when the DOM is ready.
document.addEventListener('DOMContentLoaded', init);
