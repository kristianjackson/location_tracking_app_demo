import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  createMap,
  centerMap,
  addPositionMarker,
  updatePositionMarker,
  addAccuracyCircle,
  updateAccuracyCircle,
  onUserPan,
  addNearbyUserMarker,
  updateNearbyUserMarker,
  removeNearbyUserMarker,
} from '../map.js';

/**
 * Build a mock Leaflet (L) global before each test.
 * Each Leaflet factory returns a mock object with the methods
 * the map module is expected to call.
 */
function createMockLeaflet() {
  const mockTileLayer = { addTo: vi.fn() };
  const mockCircleMarker = {
    addTo: vi.fn().mockReturnThis(),
    setLatLng: vi.fn(),
    bindTooltip: vi.fn().mockReturnThis(),
    remove: vi.fn(),
  };
  const mockCircle = {
    addTo: vi.fn().mockReturnThis(),
    setLatLng: vi.fn(),
    setRadius: vi.fn(),
  };
  const mockMap = {
    setView: vi.fn(),
    on: vi.fn(),
  };

  return {
    map: vi.fn(() => mockMap),
    tileLayer: vi.fn(() => mockTileLayer),
    circleMarker: vi.fn(() => mockCircleMarker),
    circle: vi.fn(() => mockCircle),
    // Expose inner mocks for assertions
    _mockMap: mockMap,
    _mockTileLayer: mockTileLayer,
    _mockCircleMarker: mockCircleMarker,
    _mockCircle: mockCircle,
  };
}

describe('map.js', () => {
  let mockL;

  beforeEach(() => {
    mockL = createMockLeaflet();
    globalThis.L = mockL;
  });

  // --- createMap ---

  describe('createMap', () => {
    it('initializes a Leaflet map on the given container', () => {
      createMap('map');

      expect(mockL.map).toHaveBeenCalledWith('map');
    });

    it('adds an OpenStreetMap tile layer to the map', () => {
      createMap('map');

      expect(mockL.tileLayer).toHaveBeenCalledWith(
        'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
        expect.objectContaining({ attribution: expect.any(String) })
      );
      expect(mockL._mockTileLayer.addTo).toHaveBeenCalledWith(mockL._mockMap);
    });

    it('returns the map instance', () => {
      const map = createMap('map');

      expect(map).toBe(mockL._mockMap);
    });
  });

  // --- centerMap ---

  describe('centerMap', () => {
    it('sets the map view to the given coordinates with default zoom 16', () => {
      const map = mockL._mockMap;
      centerMap(map, 51.5, -0.1);

      expect(map.setView).toHaveBeenCalledWith([51.5, -0.1], 16);
    });

    it('accepts a custom zoom level', () => {
      const map = mockL._mockMap;
      centerMap(map, 40.7, -74.0, 12);

      expect(map.setView).toHaveBeenCalledWith([40.7, -74.0], 12);
    });
  });

  // --- addPositionMarker ---

  describe('addPositionMarker', () => {
    it('creates a CircleMarker at the given coordinates', () => {
      const map = mockL._mockMap;
      addPositionMarker(map, 51.5, -0.1);

      expect(mockL.circleMarker).toHaveBeenCalledWith(
        [51.5, -0.1],
        expect.objectContaining({
          radius: 8,
          color: '#4285F4',
        })
      );
    });

    it('adds the marker to the map', () => {
      const map = mockL._mockMap;
      addPositionMarker(map, 51.5, -0.1);

      expect(mockL._mockCircleMarker.addTo).toHaveBeenCalledWith(map);
    });

    it('returns the CircleMarker instance', () => {
      const map = mockL._mockMap;
      const marker = addPositionMarker(map, 51.5, -0.1);

      expect(marker).toBe(mockL._mockCircleMarker);
    });
  });

  // --- updatePositionMarker ---

  describe('updatePositionMarker', () => {
    it('moves the marker to new coordinates', () => {
      const marker = mockL._mockCircleMarker;
      updatePositionMarker(marker, 40.7, -74.0);

      expect(marker.setLatLng).toHaveBeenCalledWith([40.7, -74.0]);
    });
  });

  // --- addAccuracyCircle ---

  describe('addAccuracyCircle', () => {
    it('creates a circle with the correct radius and styling', () => {
      const map = mockL._mockMap;
      addAccuracyCircle(map, 51.5, -0.1, 50);

      expect(mockL.circle).toHaveBeenCalledWith(
        [51.5, -0.1],
        expect.objectContaining({
          radius: 50,
          color: '#4285F4',
          fillColor: '#4285F4',
          fillOpacity: 0.15,
        })
      );
    });

    it('adds the circle to the map', () => {
      const map = mockL._mockMap;
      addAccuracyCircle(map, 51.5, -0.1, 50);

      expect(mockL._mockCircle.addTo).toHaveBeenCalledWith(map);
    });

    it('returns the Circle instance', () => {
      const map = mockL._mockMap;
      const circle = addAccuracyCircle(map, 51.5, -0.1, 50);

      expect(circle).toBe(mockL._mockCircle);
    });
  });

  // --- updateAccuracyCircle ---

  describe('updateAccuracyCircle', () => {
    it('updates the circle position', () => {
      const circle = mockL._mockCircle;
      updateAccuracyCircle(circle, 40.7, -74.0, 100);

      expect(circle.setLatLng).toHaveBeenCalledWith([40.7, -74.0]);
    });

    it('updates the circle radius', () => {
      const circle = mockL._mockCircle;
      updateAccuracyCircle(circle, 40.7, -74.0, 100);

      expect(circle.setRadius).toHaveBeenCalledWith(100);
    });
  });

  // --- onUserPan ---

  describe('onUserPan', () => {
    it('registers a callback for the dragend event', () => {
      const map = mockL._mockMap;
      const callback = vi.fn();
      onUserPan(map, callback);

      expect(map.on).toHaveBeenCalledWith('dragend', callback);
    });
  });

  // --- addNearbyUserMarker ---

  describe('addNearbyUserMarker', () => {
    it('creates a CircleMarker with green color (#34A853) and radius 8', () => {
      const map = mockL._mockMap;
      addNearbyUserMarker(map, 51.5, -0.1, 'Alice');

      expect(mockL.circleMarker).toHaveBeenCalledWith(
        [51.5, -0.1],
        expect.objectContaining({
          radius: 8,
          color: '#34A853',
        })
      );
    });

    it('binds a tooltip with the display name', () => {
      const map = mockL._mockMap;
      addNearbyUserMarker(map, 51.5, -0.1, 'Bob');

      expect(mockL._mockCircleMarker.bindTooltip).toHaveBeenCalledWith('Bob');
    });

    it('adds the marker to the map', () => {
      const map = mockL._mockMap;
      addNearbyUserMarker(map, 51.5, -0.1, 'Carol');

      expect(mockL._mockCircleMarker.addTo).toHaveBeenCalledWith(map);
    });

    it('returns the CircleMarker instance', () => {
      const map = mockL._mockMap;
      const marker = addNearbyUserMarker(map, 51.5, -0.1, 'Dave');

      expect(marker).toBe(mockL._mockCircleMarker);
    });
  });

  // --- updateNearbyUserMarker ---

  describe('updateNearbyUserMarker', () => {
    it('moves the marker to new coordinates', () => {
      const marker = mockL._mockCircleMarker;
      updateNearbyUserMarker(marker, 40.7, -74.0);

      expect(marker.setLatLng).toHaveBeenCalledWith([40.7, -74.0]);
    });
  });

  // --- removeNearbyUserMarker ---

  describe('removeNearbyUserMarker', () => {
    it('removes the marker from the map', () => {
      const marker = mockL._mockCircleMarker;
      removeNearbyUserMarker(marker);

      expect(marker.remove).toHaveBeenCalled();
    });
  });
});
