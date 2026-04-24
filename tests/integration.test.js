import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Helpers: fake Geolocation positions and errors
// ---------------------------------------------------------------------------

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

function fakeError(code) {
  return { code, message: '', PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 };
}

// ---------------------------------------------------------------------------
// Leaflet mock — comprehensive L global that records calls for assertions.
// We store dragend callbacks so tests can simulate user panning.
// ---------------------------------------------------------------------------

function createLeafletMock() {
  const tileLayerInstance = {
    addTo: vi.fn().mockReturnThis(),
  };

  const dragendCallbacks = [];

  const mapInstance = {
    setView: vi.fn().mockReturnThis(),
    on: vi.fn((event, cb) => {
      if (event === 'dragend') {
        dragendCallbacks.push(cb);
      }
      return mapInstance;
    }),
    remove: vi.fn(),
    _dragendCallbacks: dragendCallbacks,
  };

  const circleMarkerInstance = {
    addTo: vi.fn().mockReturnThis(),
    setLatLng: vi.fn().mockReturnThis(),
  };

  const circleInstance = {
    addTo: vi.fn().mockReturnThis(),
    setLatLng: vi.fn().mockReturnThis(),
    setRadius: vi.fn().mockReturnThis(),
  };

  return {
    map: vi.fn(() => mapInstance),
    tileLayer: vi.fn(() => tileLayerInstance),
    circleMarker: vi.fn(() => circleMarkerInstance),
    circle: vi.fn(() => circleInstance),
    _mapInstance: mapInstance,
    _tileLayerInstance: tileLayerInstance,
    _circleMarkerInstance: circleMarkerInstance,
    _circleInstance: circleInstance,
  };
}

// ---------------------------------------------------------------------------
// Geolocation mock — captures callbacks so tests trigger them manually.
// ---------------------------------------------------------------------------

function createGeolocationMock() {
  let currentPositionResolve = null;
  let currentPositionReject = null;
  let watchSuccessCallback = null;
  let watchErrorCallback = null;

  return {
    getCurrentPosition: vi.fn((success, error) => {
      currentPositionResolve = success;
      currentPositionReject = error;
    }),
    watchPosition: vi.fn((success, error) => {
      watchSuccessCallback = success;
      watchErrorCallback = error;
      return 42;
    }),
    clearWatch: vi.fn(),
    _triggerSuccess(pos) { currentPositionResolve(pos); },
    _triggerError(err) { currentPositionReject(err); },
    _triggerWatchSuccess(pos) { watchSuccessCallback(pos); },
    _triggerWatchError(err) { watchErrorCallback(err); },
  };
}

// ---------------------------------------------------------------------------
// Set up browser-level mocks BEFORE importing the real modules.
// This ensures geolocation.js and map.js bind to our mocks.
// ---------------------------------------------------------------------------

let leafletMock = createLeafletMock();
globalThis.L = leafletMock;

const geoMock = createGeolocationMock();
Object.defineProperty(navigator, 'geolocation', {
  value: geoMock,
  writable: true,
  configurable: true,
});

// Now import the real app module — no vi.mock() calls.
// The real geolocation.js, map.js, and ui.js execute against our browser mocks.
import { init, state, onPositionUpdate, resetSignalLostTimer, SIGNAL_LOST_TIMEOUT_MS } from '../app.js';

// ---------------------------------------------------------------------------
// Integration test suite
// ---------------------------------------------------------------------------

describe('Integration: full application flow', () => {
  beforeEach(() => {
    // Set up DOM
    document.body.innerHTML = '<div id="map"></div><div id="overlay"></div>';

    // Reset application state
    state.map = null;
    state.marker = null;
    state.accuracyCircle = null;
    state.watchId = null;
    state.userHasPanned = false;
    if (state.signalLostTimerId !== null) {
      clearTimeout(state.signalLostTimerId);
      state.signalLostTimerId = null;
    }
    state.isInitialized = false;

    // Reset Leaflet mock — create fresh instances for each test
    leafletMock = createLeafletMock();
    globalThis.L = leafletMock;

    // Clear geolocation mock call history
    geoMock.getCurrentPosition.mockClear();
    geoMock.watchPosition.mockClear();
    geoMock.clearWatch.mockClear();
  });

  afterEach(() => {
    if (state.signalLostTimerId !== null) {
      clearTimeout(state.signalLostTimerId);
      state.signalLostTimerId = null;
    }
    document.body.innerHTML = '';
  });

  // -------------------------------------------------------------------------
  // 1. Init success flow
  //    Validates: Requirements 1.1, 1.2, 2.1, 6.1, 6.3
  // -------------------------------------------------------------------------
  describe('initialization success flow', () => {
    it('shows loading, then creates map with marker after geolocation succeeds', async () => {
      const pos = fakePosition(48.8566, 2.3522, 30);

      // Call init — shows loading and calls getCurrentPosition
      const initPromise = init();

      // Loading indicator should be visible
      const loadingEl = document.querySelector('.loading-indicator');
      expect(loadingEl).not.toBeNull();
      expect(loadingEl.textContent).toContain('Locating you...');

      // Simulate geolocation success
      geoMock._triggerSuccess(pos);
      await initPromise;

      // Loading should be hidden
      expect(document.querySelector('.loading-indicator')).toBeNull();

      // Map should have been created and centered
      expect(leafletMock.map).toHaveBeenCalledWith('map');
      expect(leafletMock._mapInstance.setView).toHaveBeenCalledWith([48.8566, 2.3522], 16);

      // Marker and accuracy circle should have been added
      expect(leafletMock.circleMarker).toHaveBeenCalled();
      expect(leafletMock._circleMarkerInstance.addTo).toHaveBeenCalled();
      expect(leafletMock.circle).toHaveBeenCalled();
      expect(leafletMock._circleInstance.addTo).toHaveBeenCalled();

      // watchPosition should have been called for continuous tracking
      expect(geoMock.watchPosition).toHaveBeenCalled();

      // State should be initialized
      expect(state.isInitialized).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // 2. Permission denied flow
  //    Validates: Requirements 1.3
  // -------------------------------------------------------------------------
  describe('permission denied flow', () => {
    it('shows loading, then displays error message when permission is denied', async () => {
      const err = fakeError(1);

      const initPromise = init();

      // Loading should be visible
      expect(document.querySelector('.loading-indicator')).not.toBeNull();

      // Simulate permission denied
      geoMock._triggerError(err);
      await initPromise;

      // Loading should be hidden
      expect(document.querySelector('.loading-indicator')).toBeNull();

      // Error message should be displayed
      const errorEl = document.querySelector('.error-message');
      expect(errorEl).not.toBeNull();
      expect(errorEl.textContent).toContain('Location permission was denied');

      // Map should NOT have been created
      expect(leafletMock.map).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // 3. Real-time update flow
  //    Validates: Requirements 3.1, 3.2, 4.1, 4.2
  // -------------------------------------------------------------------------
  describe('real-time update flow', () => {
    it('updates marker and accuracy circle when a new position arrives', async () => {
      const initialPos = fakePosition(51.5, -0.1, 25);

      const initPromise = init();
      geoMock._triggerSuccess(initialPos);
      await initPromise;

      // Clear call counts from initialization
      leafletMock._circleMarkerInstance.setLatLng.mockClear();
      leafletMock._circleInstance.setLatLng.mockClear();
      leafletMock._circleInstance.setRadius.mockClear();

      // Simulate a position update via watchPosition callback
      const updatedPos = fakePosition(51.51, -0.09, 15);
      geoMock._triggerWatchSuccess(updatedPos);

      // Marker should have been moved
      expect(leafletMock._circleMarkerInstance.setLatLng).toHaveBeenCalledWith([51.51, -0.09]);

      // Accuracy circle should have been updated
      expect(leafletMock._circleInstance.setLatLng).toHaveBeenCalledWith([51.51, -0.09]);
      expect(leafletMock._circleInstance.setRadius).toHaveBeenCalledWith(15);
    });
  });

  // -------------------------------------------------------------------------
  // 4. Smart re-centering
  //    Validates: Requirements 3.3
  // -------------------------------------------------------------------------
  describe('smart re-centering', () => {
    it('re-centers map on position update when user has not panned', async () => {
      const initialPos = fakePosition(51.5, -0.1, 25);

      const initPromise = init();
      geoMock._triggerSuccess(initialPos);
      await initPromise;

      leafletMock._mapInstance.setView.mockClear();

      // Trigger a position update — map should re-center
      const newPos = fakePosition(51.51, -0.09, 20);
      geoMock._triggerWatchSuccess(newPos);

      expect(leafletMock._mapInstance.setView).toHaveBeenCalledWith([51.51, -0.09], 16);
    });

    it('does NOT re-center map after user has manually panned', async () => {
      const initialPos = fakePosition(51.5, -0.1, 25);

      const initPromise = init();
      geoMock._triggerSuccess(initialPos);
      await initPromise;

      // Simulate user panning the map by triggering the dragend callback
      const dragendCallbacks = leafletMock._mapInstance._dragendCallbacks;
      expect(dragendCallbacks.length).toBeGreaterThan(0);
      dragendCallbacks.forEach((cb) => cb());

      leafletMock._mapInstance.setView.mockClear();

      // Trigger a position update — map should NOT re-center
      const newPos = fakePosition(51.51, -0.09, 20);
      geoMock._triggerWatchSuccess(newPos);

      expect(leafletMock._mapInstance.setView).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // 5. Signal-lost flow
  //    Validates: Requirements 3.4
  // -------------------------------------------------------------------------
  describe('signal-lost notification', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('shows signal-lost notification after 30s without a position update', async () => {
      const initialPos = fakePosition(51.5, -0.1, 25);

      const initPromise = init();
      geoMock._triggerSuccess(initialPos);
      await initPromise;

      // Trigger one position update to start the signal-lost timer
      const updatePos = fakePosition(51.51, -0.09, 20);
      geoMock._triggerWatchSuccess(updatePos);

      // No signal-lost notification yet
      expect(document.querySelector('.signal-lost')).toBeNull();

      // Advance time by 30 seconds
      vi.advanceTimersByTime(30000);

      // Signal-lost notification should now be visible
      const signalLostEl = document.querySelector('.signal-lost');
      expect(signalLostEl).not.toBeNull();
      expect(signalLostEl.textContent).toContain('Location signal lost');
    });

    it('does NOT show signal-lost if a position update arrives within 30s', async () => {
      const initialPos = fakePosition(51.5, -0.1, 25);

      const initPromise = init();
      geoMock._triggerSuccess(initialPos);
      await initPromise;

      // First update starts the timer
      geoMock._triggerWatchSuccess(fakePosition(51.51, -0.09, 20));

      // Advance 20 seconds
      vi.advanceTimersByTime(20000);

      // Another update resets the timer
      geoMock._triggerWatchSuccess(fakePosition(51.52, -0.08, 18));

      // Advance another 20 seconds (40s total, but only 20s since last update)
      vi.advanceTimersByTime(20000);

      // Should NOT show signal-lost because timer was reset
      expect(document.querySelector('.signal-lost')).toBeNull();

      // Advance the remaining 10 seconds (30s since last update)
      vi.advanceTimersByTime(10000);

      // NOW signal-lost should appear
      expect(document.querySelector('.signal-lost')).not.toBeNull();
    });
  });
});
