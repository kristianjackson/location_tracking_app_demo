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
  addNearbyUserMarker: vi.fn(),
  updateNearbyUserMarker: vi.fn(),
  removeNearbyUserMarker: vi.fn(),
}));

vi.mock('../ui.js', () => ({
  showLoading: vi.fn(),
  hideLoading: vi.fn(),
  showError: vi.fn(),
  hideError: vi.fn(),
  showSignalLost: vi.fn(),
  hideSignalLost: vi.fn(),
}));

vi.mock('../session.js', () => ({
  getSessionId: vi.fn(() => 'test-session-id'),
  getDisplayName: vi.fn(() => 'TestUser'),
  setDisplayName: vi.fn(),
  validateDisplayName: vi.fn(() => ({ valid: true })),
  SESSION_ID_KEY: 'proximity_session_id',
  DISPLAY_NAME_KEY: 'proximity_display_name',
  DISPLAY_NAME_MIN_LENGTH: 2,
  DISPLAY_NAME_MAX_LENGTH: 20,
  DISPLAY_NAME_PATTERN: /^[a-zA-Z0-9 _-]+$/,
}));

vi.mock('../proximity.js', () => ({
  initProximity: vi.fn(),
  sendLocationUpdate: vi.fn(),
  setVisibility: vi.fn(),
  getVisibility: vi.fn(() => false),
  disconnect: vi.fn(),
  VISIBILITY_KEY: 'proximity_visible',
  WS_RECONNECT_BASE_MS: 1000,
  WS_RECONNECT_MAX_MS: 30000,
  NEARBY_MARKER_COLOR: '#34A853',
  NEARBY_MARKER_RADIUS: 8,
  computeReconnectDelay: vi.fn(),
  buildLocationBroadcast: vi.fn(),
  getNearbyUserCount: vi.fn(() => 0),
  setOnStatusChange: vi.fn(),
  setOnNearbyCountChange: vi.fn(),
  _getState: vi.fn(),
  _resetState: vi.fn(),
  PROXIMITY_SERVICE_URL: 'wss://proximity-service.example.com',
}));

vi.mock('../proximity-ui.js', () => ({
  showDisplayNamePrompt: vi.fn(),
  createVisibilityToggle: vi.fn(),
  setToggleState: vi.fn(),
  showConnectionStatus: vi.fn(),
  updateNearbyCount: vi.fn(),
  showPrivacyNotice: vi.fn(),
  createSettingsButton: vi.fn(),
}));

import {
  init,
  handlePositionSuccess,
  handlePositionError,
  onPositionUpdate,
  resetSignalLostTimer,
  startWatching,
  startProximity,
  initProximityFeature,
  state,
  SIGNAL_LOST_TIMEOUT_MS,
} from '../app.js';

import { getCurrentPosition, watchPosition, getErrorMessage } from '../geolocation.js';
import { createMap, centerMap, addPositionMarker, updatePositionMarker, addAccuracyCircle, updateAccuracyCircle, onUserPan } from '../map.js';
import { showLoading, hideLoading, showError, showSignalLost, hideSignalLost } from '../ui.js';
import { getSessionId, getDisplayName, setDisplayName } from '../session.js';
import { initProximity, sendLocationUpdate, setVisibility, getVisibility } from '../proximity.js';
import { showDisplayNamePrompt, createVisibilityToggle, setToggleState, showConnectionStatus, updateNearbyCount, createSettingsButton } from '../proximity-ui.js';

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
    state.proximityInitialized = false;

    // Reset all mocks
    vi.clearAllMocks();

    // Default mock return values
    createMap.mockReturnValue(mockMap);
    addPositionMarker.mockReturnValue(mockMarker);
    addAccuracyCircle.mockReturnValue(mockCircle);
    watchPosition.mockReturnValue(7);
    getSessionId.mockReturnValue('test-session-id');
    getDisplayName.mockReturnValue('TestUser');
    getVisibility.mockReturnValue(false);

    // Ensure proximity-controls container exists in DOM
    if (!document.getElementById('proximity-controls')) {
      const container = document.createElement('div');
      container.id = 'proximity-controls';
      document.body.appendChild(container);
    }
  });

  afterEach(() => {
    // Clear any lingering timers
    if (state.signalLostTimerId !== null) {
      clearTimeout(state.signalLostTimerId);
      state.signalLostTimerId = null;
    }

    // Clean up DOM
    const container = document.getElementById('proximity-controls');
    if (container) container.innerHTML = '';
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

    it('initializes the proximity feature after existing init', () => {
      const pos = fakePosition();

      handlePositionSuccess(pos);

      // Proximity should be initialized after map setup
      expect(getSessionId).toHaveBeenCalled();
      expect(getDisplayName).toHaveBeenCalled();
      expect(initProximity).toHaveBeenCalled();
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

    it('sends location update to proximity service', () => {
      const pos = fakePosition(40.7, -74.0, 20);

      onPositionUpdate(pos);

      expect(sendLocationUpdate).toHaveBeenCalledWith(40.7, -74.0, 20);
    });

    it('continues working if sendLocationUpdate throws', () => {
      sendLocationUpdate.mockImplementation(() => { throw new Error('WS not connected'); });
      const pos = fakePosition(40.7, -74.0, 20);

      // Should not throw
      expect(() => onPositionUpdate(pos)).not.toThrow();

      // Core tracking still works
      expect(updatePositionMarker).toHaveBeenCalledWith(mockMarker, 40.7, -74.0);
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

  // --- Proximity integration ---

  describe('proximity integration', () => {
    it('prompts for display name when none exists', () => {
      getDisplayName.mockReturnValue(null);

      initProximityFeature();

      expect(showDisplayNamePrompt).toHaveBeenCalledWith(expect.any(Function));
      // initProximity should NOT be called yet (waiting for name)
      expect(initProximity).not.toHaveBeenCalled();
    });

    it('starts proximity directly when display name exists', () => {
      getDisplayName.mockReturnValue('Alice');
      state.map = mockMap;

      initProximityFeature();

      expect(initProximity).toHaveBeenCalledWith(
        mockMap,
        'test-session-id',
        'Alice',
        expect.objectContaining({
          onStatusChange: showConnectionStatus,
          onNearbyCountChange: updateNearbyCount,
        })
      );
    });

    it('calls setDisplayName and startProximity when name is submitted via prompt', () => {
      getDisplayName.mockReturnValue(null);
      state.map = mockMap;

      initProximityFeature();

      // Get the callback passed to showDisplayNamePrompt
      const onSubmit = showDisplayNamePrompt.mock.calls[0][0];
      onSubmit('NewUser');

      expect(setDisplayName).toHaveBeenCalledWith('NewUser');
      expect(initProximity).toHaveBeenCalledWith(
        mockMap,
        'test-session-id',
        'NewUser',
        expect.objectContaining({
          onStatusChange: showConnectionStatus,
          onNearbyCountChange: updateNearbyCount,
        })
      );
    });

    it('creates visibility toggle and settings button', () => {
      state.map = mockMap;

      startProximity(mockMap, 'test-session-id', 'TestUser');

      expect(createVisibilityToggle).toHaveBeenCalledWith(
        expect.any(HTMLElement),
        expect.any(Function)
      );
      expect(createSettingsButton).toHaveBeenCalledWith(
        expect.any(HTMLElement),
        expect.any(Function)
      );
    });

    it('restores visibility toggle state from saved preference', () => {
      getVisibility.mockReturnValue(true);
      state.map = mockMap;

      startProximity(mockMap, 'test-session-id', 'TestUser');

      expect(setToggleState).toHaveBeenCalledWith(true);
    });

    it('wires visibility toggle onChange to setVisibility', () => {
      state.map = mockMap;

      startProximity(mockMap, 'test-session-id', 'TestUser');

      const onChange = createVisibilityToggle.mock.calls[0][1];
      onChange(true);

      expect(setVisibility).toHaveBeenCalledWith(true);
    });

    it('wires settings button to setDisplayName', () => {
      state.map = mockMap;

      startProximity(mockMap, 'test-session-id', 'TestUser');

      const onChangeName = createSettingsButton.mock.calls[0][1];
      onChangeName('NewName');

      expect(setDisplayName).toHaveBeenCalledWith('NewName');
    });

    it('continues working if proximity initialization throws', () => {
      getSessionId.mockImplementation(() => { throw new Error('localStorage unavailable'); });

      // Should not throw
      expect(() => initProximityFeature()).not.toThrow();

      // initProximity should not have been called
      expect(initProximity).not.toHaveBeenCalled();
    });

    it('continues working if startProximity throws', () => {
      initProximity.mockImplementation(() => { throw new Error('WebSocket failed'); });
      state.map = mockMap;

      // Should not throw
      expect(() => startProximity(mockMap, 'test-session-id', 'TestUser')).not.toThrow();
    });

    it('sets proximityInitialized to true on successful start', () => {
      initProximity.mockImplementation(() => {}); // Reset to non-throwing
      state.map = mockMap;

      startProximity(mockMap, 'test-session-id', 'TestUser');

      expect(state.proximityInitialized).toBe(true);
    });
  });
});
