import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  getCurrentPosition,
  watchPosition,
  clearWatch,
  getErrorMessage,
  GEO_OPTIONS_INITIAL,
  GEO_OPTIONS_WATCH,
} from '../geolocation.js';

/**
 * Helper: build a fake GeolocationPosition-like object.
 */
function fakePosition(lat = 51.5, lng = -0.1, accuracy = 10) {
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
function fakeError(code, message = '') {
  return { code, message, PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 };
}

describe('geolocation.js', () => {
  beforeEach(() => {
    // Provide a fresh mock of navigator.geolocation before each test
    const geo = {
      getCurrentPosition: vi.fn(),
      watchPosition: vi.fn(),
      clearWatch: vi.fn(),
    };
    Object.defineProperty(navigator, 'geolocation', {
      value: geo,
      writable: true,
      configurable: true,
    });
  });

  // --- getErrorMessage ---

  describe('getErrorMessage', () => {
    it('returns permission-denied message for error code 1', () => {
      const msg = getErrorMessage(fakeError(1));
      expect(msg).toBe(
        'Location permission was denied. Please enable location access in your browser settings to use this app.'
      );
    });

    it('returns position-unavailable message for error code 2', () => {
      const msg = getErrorMessage(fakeError(2));
      expect(msg).toBe(
        'Your location could not be determined. Please ensure location services are enabled on your device.'
      );
    });

    it('returns timeout message for error code 3', () => {
      const msg = getErrorMessage(fakeError(3));
      expect(msg).toBe(
        'The location request timed out. Please check your connection and try again.'
      );
    });

    it('returns a fallback message for an unknown error code', () => {
      const msg = getErrorMessage(fakeError(99));
      expect(msg).toBe('An unknown location error occurred.');
    });
  });

  // --- getCurrentPosition ---

  describe('getCurrentPosition', () => {
    it('resolves with position data when the API succeeds', async () => {
      const pos = fakePosition(40.7, -74.0, 15);
      navigator.geolocation.getCurrentPosition.mockImplementation((success) => {
        success(pos);
      });

      const result = await getCurrentPosition();
      expect(result).toBe(pos);
      expect(navigator.geolocation.getCurrentPosition).toHaveBeenCalledWith(
        expect.any(Function),
        expect.any(Function),
        GEO_OPTIONS_INITIAL
      );
    });

    it('rejects with an error when the API fails', async () => {
      const err = fakeError(1, 'User denied');
      navigator.geolocation.getCurrentPosition.mockImplementation((_success, error) => {
        error(err);
      });

      await expect(getCurrentPosition()).rejects.toBe(err);
    });
  });

  // --- watchPosition ---

  describe('watchPosition', () => {
    it('calls the browser API with GEO_OPTIONS_WATCH and returns a watch ID', () => {
      navigator.geolocation.watchPosition.mockReturnValue(42);

      const onSuccess = vi.fn();
      const onError = vi.fn();
      const id = watchPosition(onSuccess, onError);

      expect(id).toBe(42);
      expect(navigator.geolocation.watchPosition).toHaveBeenCalledWith(
        onSuccess,
        onError,
        GEO_OPTIONS_WATCH
      );
    });
  });

  // --- clearWatch ---

  describe('clearWatch', () => {
    it('delegates to navigator.geolocation.clearWatch', () => {
      clearWatch(42);
      expect(navigator.geolocation.clearWatch).toHaveBeenCalledWith(42);
    });
  });
});
