import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { haversineDistance } from '../proximity-service/src/proximity-room.js';

// Arbitrary for valid latitude [-90, 90]
const latArb = fc.double({ min: -90, max: 90, noNaN: true, noDefaultInfinity: true });

// Arbitrary for valid longitude [-180, 180]
const lngArb = fc.double({ min: -180, max: 180, noNaN: true, noDefaultInfinity: true });

// Arbitrary for a coordinate pair {lat, lng}
const coordArb = fc.record({ lat: latArb, lng: lngArb });

/**
 * Feature: multi-user-proximity, Property 8: Haversine distance properties
 *
 * **Validates: Requirements 4.6**
 *
 * For any two coordinate pairs (lat1, lon1) and (lat2, lon2) with valid
 * latitude [-90, 90] and longitude [-180, 180]:
 * - The distance SHALL be non-negative
 * - The distance SHALL be symmetric: haversine(A, B) === haversine(B, A)
 * - The distance SHALL be zero when both points are identical
 * - The distance SHALL satisfy the triangle inequality: haversine(A, C) ≤ haversine(A, B) + haversine(B, C)
 */
describe('Feature: multi-user-proximity, Property 8: Haversine distance properties', () => {
  it('distance is non-negative for all valid coordinate pairs', () => {
    fc.assert(
      fc.property(coordArb, coordArb, (a, b) => {
        const d = haversineDistance(a.lat, a.lng, b.lat, b.lng);
        expect(d).toBeGreaterThanOrEqual(0);
      }),
      { numRuns: 100, verbose: true, endOnFailure: true }
    );
  });

  it('distance is symmetric: haversine(A, B) === haversine(B, A)', () => {
    fc.assert(
      fc.property(coordArb, coordArb, (a, b) => {
        const dAB = haversineDistance(a.lat, a.lng, b.lat, b.lng);
        const dBA = haversineDistance(b.lat, b.lng, a.lat, a.lng);
        expect(dAB).toBeCloseTo(dBA, 6);
      }),
      { numRuns: 100, verbose: true, endOnFailure: true }
    );
  });

  it('distance is zero when both points are identical', () => {
    fc.assert(
      fc.property(coordArb, (a) => {
        const d = haversineDistance(a.lat, a.lng, a.lat, a.lng);
        expect(d).toBe(0);
      }),
      { numRuns: 100, verbose: true, endOnFailure: true }
    );
  });

  it('distance satisfies the triangle inequality: haversine(A, C) ≤ haversine(A, B) + haversine(B, C)', () => {
    fc.assert(
      fc.property(coordArb, coordArb, coordArb, (a, b, c) => {
        const dAC = haversineDistance(a.lat, a.lng, c.lat, c.lng);
        const dAB = haversineDistance(a.lat, a.lng, b.lat, b.lng);
        const dBC = haversineDistance(b.lat, b.lng, c.lat, c.lng);

        // Small epsilon tolerance for floating point arithmetic
        const epsilon = 1e-6;
        expect(dAC).toBeLessThanOrEqual(dAB + dBC + epsilon);
      }),
      { numRuns: 100, verbose: true, endOnFailure: true }
    );
  });
});
