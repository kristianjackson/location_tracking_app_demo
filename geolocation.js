/**
 * Geolocation Wrapper Module
 * Wraps the browser Geolocation API with consistent error handling
 * and configuration options.
 */

/** Options for the initial one-shot position request. */
export const GEO_OPTIONS_INITIAL = {
  enableHighAccuracy: true,
  timeout: 10000,
  maximumAge: 0,
};

/** Options for continuous position watching. */
export const GEO_OPTIONS_WATCH = {
  enableHighAccuracy: true,
  timeout: 15000,
  maximumAge: 0,
};

/**
 * Error code → user-facing message mapping.
 * @type {Record<number, string>}
 */
const ERROR_MESSAGES = {
  1: 'Location permission was denied. Please enable location access in your browser settings to use this app.',
  2: 'Your location could not be determined. Please ensure location services are enabled on your device.',
  3: 'The location request timed out. Please check your connection and try again.',
};

/**
 * Request the user's current position as a one-shot call.
 * @returns {Promise<GeolocationPosition>} Resolves with the position or rejects with a GeolocationPositionError.
 */
export function getCurrentPosition() {
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, GEO_OPTIONS_INITIAL);
  });
}

/**
 * Subscribe to continuous position updates.
 * @param {(pos: GeolocationPosition) => void} onSuccess - Called on each position update.
 * @param {(err: GeolocationPositionError) => void} onError - Called when an error occurs.
 * @returns {number} A watch ID that can be passed to clearWatch.
 */
export function watchPosition(onSuccess, onError) {
  return navigator.geolocation.watchPosition(onSuccess, onError, GEO_OPTIONS_WATCH);
}

/**
 * Stop watching for position updates.
 * @param {number} watchId - The ID returned by watchPosition.
 */
export function clearWatch(watchId) {
  navigator.geolocation.clearWatch(watchId);
}

/**
 * Map a GeolocationPositionError to a user-facing message string.
 * @param {GeolocationPositionError} error - The error from the Geolocation API.
 * @returns {string} A descriptive, user-friendly error message.
 */
export function getErrorMessage(error) {
  return ERROR_MESSAGES[error.code] || 'An unknown location error occurred.';
}
