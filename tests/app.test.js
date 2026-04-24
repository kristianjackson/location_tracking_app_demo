import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// --- Mock dependency modules ---

vi.mock('../geolocation.js', () => ({
  getCurrentPosition: vi.fn(),
  watchPosition: vi.fn(),
  clearWatch: vi.fn(),
  getErrorMessage: vi.fn(),
}));

vi.mock('../map.js', () => ({
  createMap: vi.fn(),
  centerMap: vi.fn(),
  addPositionMarker: vi.fn(),
  updatePositionMarker: vi.fn(),
  addAccuracyCircle: vi.fn(),
  updateAccuracyCircle: vi.fn(),
  onUserPan: vi.fn(),
}));

vi.mock('../ui.js', () => ({
  showLoading: vi.fn(),
  hideLoading: vi.fn(),
  showError: vi.fn(),
  hideError: vi.fn(),
  showSignalLost: vi.fn(),
  hideSignalLost: vi.fn(),
}));

import {
  init,
  handlePositionSuccess,
  handlePositionError,
  onPositionUpdate,
  resetSignalLostTimer,
  startWatching,
  state,
  SIGNAL_LOST_TIMEOUT_MS,
} from '../app.js';

import { getCurrentPosition, watchPosition, getErrorMessage } from '../geolocation.js';
import { createMap, centerMap, addPositionMarker, updatePositionMarker, addAccuracyCircle, updateAccuracyCircle, onUserPan } from '../map.js';
import { showLoading, hideLoading, showError, showSignalLost, hideSignalLost } from '../ui.js';

/**
 * Helper: build a fake GeolocationPosition-like object.
 */
function fakePosition(lat = 51.5, lng = -0.1, accuracy = 25) {
  return {
    coords: {
      latitude: lat,
      longitude: lng,
      accuracy,
      altitude: null,
      altitudeAccuracy: null,
      heading: null,
      speed: null,
    },
    timestamp: Date.now(),
  };
}

/**
 * Helper: build a fake GeolocationPositionError-like object.
 */
function fakeError(code) {
  return { code, message: '', PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 };
}

describe('app.js', () => {
  const mockMap = { id: 'mock-map' };
  const mockMarker = { id: 'mock-marker' };
  const mockCircle = { id: 'mock-circle' };

  beforeEach(() => {
    // Reset application state before each test
    state.map = null;
    state.marker = null;
    state.accuracyCircle = null;
    state.watchId = null;
    state.userHasPanned = false;
    state.signalLostTimerId = null;
    state.isInitialized = false;

    // Reset all mocks
    vi.clearAllMocks();

    // Default mock return values
    createMap.mockReturnValue(mockMap);
    addPositionMarker.mockReturnValue(mockMarker);
    addAccuracyCircle.mockReturnValue(mockCircle);
    watchPosition.mockReturnValue(7);
  });

  afterEach(() => {
    // Clear any lingering timers
    if (state.signalLostTimerId !== null) {
      clearTimeout(state.signalLostTimerId);
      state.signalLostTimerId = null;
    }
  });

  // --- init ---

  describe('init', () => {
    it('shows loading indicator and requests the current position', async () => {
      const pos = fakePosition();
      getCurrentPosition.mockResolvedValue(pos);

      await init();

      expect(showLoading).toHaveBeenCalledWith('Locating you...');
      expect(getCurrentPosition).toHaveBeenCalled();
    });

    it('calls handlePositionSuccess on successful geolocation', async () => {
      const pos = fakePosition(40.7, -74.0, 10);
      getCurrentPosition.mockResolvedValue(pos);

      await init();

      // handlePositionSuccess should have created the map
      expect(createMap).toHaveBeenCalledWith('map');
      expect(hideLoading).toHaveBeenCalled();
    });

    it('calls handlePositionError on geolocation failure', async () => {
      const err = fakeError(1);
      getCurrentPosition.mockRejectedValue(err);
      getErrorMessage.mockReturnValue('Permission denied message');

      await init();

      expect(hideLoading).toHaveBeenCalled();
      expect(showError).toHaveBeenCalledWith('Permission denied message');
    });
  });

  // --- handlePositionSuccess ---

  describe('handlePositionSuccess', () => {
    it('initializes the map centered on the received coordinates', () => {
      const pos = fakePosition(51.5, -0.1, 30);

      handlePositionSuccess(pos);

      expect(createMap).toHaveBeenCalledWith('map');
      expect(centerMap).toHaveBeenCalledWith(mockMap, 51.5, -0.1, 16);
    });

    it('adds a position marker and accuracy circle', () => {
      const pos = fakePosition(51.5, -0.1, 30);

      handlePositionSuccess(pos);

      expect(addPositionMarker).toHaveBeenCalledWith(mockMap, 51.5, -0.1);
      expect(addAccuracyCircle).toHaveBeenCalledWith(mockMap, 51.5, -0.1, 30);
    });

    it('stores map, marker, and accuracy circle in state', () => {
      const pos = fakePosition(51.5, -0.1, 30);

      handlePositionSuccess(pos);

      expect(state.map).toBe(mockMap);
      expect(state.marker).toBe(mockMarker);
      expect(state.accuracyCircle).toBe(mockCircle);
    });

    it('hides the loading indicator', () => {
      const pos = fakePosition();

      handlePositionSuccess(pos);

      expect(hideLoading).toHaveBeenCalled();
    });

    it('sets isInitialized to true', () => {
      const pos = fakePosition();

      handlePositionSuccess(pos);

      expect(state.isInitialized).toBe(true);
    });

    it('starts watching for position updates', () => {
      const pos = fakePosition();

      handlePositionSuccess(pos);

      expect(watchPosition).toHaveBeenCalledWith(
        expect.any(Function),
        expect.any(Function)
      );
      expect(onUserPan).toHaveBeenCalledWith(mockMap, expect.any(Function));
    });
  });

  // --- handlePositionError ---

  describe('handlePositionError', () => {
    it('hides loading and shows error for permission denied (code 1)', () => {
      const err = fakeError(1);
      getErrorMessage.mockReturnValue(
        'Location permission was denied. Please enable location access in your browser settings to use this app.'
      );

      handlePositionError(err);

      expect(hideLoading).toHaveBeenCalled();
      expect(getErrorMessage).toHaveBeenCalledWith(err);
      expect(showError).toHaveBeenCalledWith(
        'Location permission was denied. Please enable location access in your browser settings to use this app.'
      );
    });

    it('hides loading and shows error for position unavailable (code 2)', () => {
      const err = fakeError(2);
      getErrorMessage.mockReturnValue(
        'Your location could not be determined. Please ensure location services are enabled on your device.'
      );

      handlePositionError(err);

      expect(hideLoading).toHaveBeenCalled();
      expect(getErrorMessage).toHaveBeenCalledWith(err);
      expect(showError).toHaveBeenCalledWith(
        'Your location could not be determined. Please ensure location services are enabled on your device.'
      );
    });

    it('hides loading and shows error for timeout (code 3)', () => {
      const err = fakeError(3);
      getErrorMessage.mockReturnValue(
        'The location request timed out. Please check your connection and try again.'
      );

      handlePositionError(err);

      expect(hideLoading).toHaveBeenCalled();
      expect(getErrorMessage).toHaveBeenCalledWith(err);
      expect(showError).toHaveBeenCalledWith(
        'The location request timed out. Please check your connection and try again.'
      );
    });
  });

  // --- onPositionUpdate ---

  describe('onPositionUpdate', () => {
    beforeEach(() => {
      // Set up state as if handlePositionSuccess already ran
      state.map = mockMap;
      state.marker = mockMarker;
      state.accuracyCircle = mockCircle;
      state.isInitialized = true;
    });

    it('updates the marker position', () => {
      const pos = fakePosition(40.7, -74.0, 20);

      onPositionUpdate(pos);

      expect(updatePositionMarker).toHaveBeenCalledWith(mockMarker, 40.7, -74.0);
    });

    it('updates the accuracy circle position and radius', () => {
      const pos = fakePosition(40.7, -74.0, 50);

      onPositionUpdate(pos);

      expect(updateAccuracyCircle).toHaveBeenCalledWith(mockCircle, 40.7, -74.0, 50);
    });

    it('re-centers the map when user has not panned', () => {
      state.userHasPanned = false;
      const pos = fakePosition(40.7, -74.0, 20);

      onPositionUpdate(pos);

      expect(centerMap).toHaveBeenCalledWith(mockMap, 40.7, -74.0);
    });

    it('does NOT re-center the map when user has panned', () => {
      state.userHasPanned = true;
      const pos = fakePosition(40.7, -74.0, 20);

      onPositionUpdate(pos);

      expect(centerMap).not.toHaveBeenCalled();
    });

    it('calls resetSignalLostTimer on each update', () => {
      const pos = fakePosition();

      onPositionUpdate(pos);

      // resetSignalLostTimer hides signal-lost and sets a new timer
      expect(hideSignalLost).toHaveBeenCalled();
    });
  });

  // --- resetSignalLostTimer ---

  describe('resetSignalLostTimer', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('shows signal-lost notification after 30 seconds of no updates', () => {
      resetSignalLostTimer();

      expect(showSignalLost).not.toHaveBeenCalled();

      vi.advanceTimersByTime(SIGNAL_LOST_TIMEOUT_MS);

      expect(showSignalLost).toHaveBeenCalled();
    });

    it('hides signal-lost notification when timer is reset', () => {
      resetSignalLostTimer();

      expect(hideSignalLost).toHaveBeenCalled();
    });

    it('clears the previous timer when called again', () => {
      resetSignalLostTimer();
      resetSignalLostTimer();

      // Advance past the first timeout — only one showSignalLost should fire
      vi.advanceTimersByTime(SIGNAL_LOST_TIMEOUT_MS);

      expect(showSignalLost).toHaveBeenCalledTimes(1);
    });

    it('stores the timer ID in state', () => {
      resetSignalLostTimer();

      expect(state.signalLostTimerId).not.toBeNull();
    });
  });

  // --- SIGNAL_LOST_TIMEOUT_MS constant ---

  describe('SIGNAL_LOST_TIMEOUT_MS', () => {
    it('is 30000 milliseconds', () => {
      expect(SIGNAL_LOST_TIMEOUT_MS).toBe(30000);
    });
  });
});
