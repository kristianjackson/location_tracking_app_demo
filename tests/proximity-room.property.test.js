import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { haversineDistance, evictStaleUsers } from '../proximity-service/src/proximity-room.js';

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


// Arbitrary for a session ID (simple unique string)
const sessionIdArb = fc.uuid();

// Arbitrary for a timestamp in a reasonable range
const timestampArb = fc.integer({ min: 0, max: Number.MAX_SAFE_INTEGER });

// Arbitrary for a single user entry with a lastSeen timestamp
const userEntryArb = (nowArb) =>
  fc.record({
    sessionId: sessionIdArb,
    lastSeen: timestampArb,
    displayName: fc.string({ minLength: 2, maxLength: 20 }),
    lat: fc.double({ min: -90, max: 90, noNaN: true, noDefaultInfinity: true }),
    lng: fc.double({ min: -180, max: 180, noNaN: true, noDefaultInfinity: true }),
    visible: fc.boolean(),
  });

// Arbitrary for a list of users (with unique session IDs) and a current time
const usersAndNowArb = fc
  .array(userEntryArb(), { minLength: 0, maxLength: 20 })
  .chain((users) =>
    timestampArb.map((now) => ({
      users: users.reduce((acc, u, i) => {
        // Ensure unique session IDs by appending index
        const uniqueId = `${u.sessionId}-${i}`;
        acc.push({ ...u, sessionId: uniqueId });
        return acc;
      }, []),
      now,
    }))
  );

/**
 * Feature: multi-user-proximity, Property 7: Stale client eviction
 *
 * **Validates: Requirements 4.5**
 *
 * For any set of users with random lastSeen timestamps and for any current
 * time value, the eviction logic SHALL remove a user if and only if
 * (currentTime - user.lastSeen) > 60000 milliseconds.
 */
describe('Feature: multi-user-proximity, Property 7: Stale client eviction', () => {
  const STALE_TIMEOUT_MS = 60000;

  it('a user is evicted iff (now - lastSeen) > 60000', () => {
    fc.assert(
      fc.property(usersAndNowArb, ({ users, now }) => {
        // Build the Map input
        const usersMap = new Map();
        for (const u of users) {
          usersMap.set(u.sessionId, {
            displayName: u.displayName,
            lat: u.lat,
            lng: u.lng,
            visible: u.visible,
            lastSeen: u.lastSeen,
          });
        }

        const originalSize = usersMap.size;

        // Compute expected evictions
        const expectedEvicted = users
          .filter((u) => (now - u.lastSeen) > STALE_TIMEOUT_MS)
          .map((u) => u.sessionId);
        const expectedRemaining = users
          .filter((u) => !((now - u.lastSeen) > STALE_TIMEOUT_MS))
          .map((u) => u.sessionId);

        // Call the function under test
        const evicted = evictStaleUsers(usersMap, now, STALE_TIMEOUT_MS);

        // Evicted array contains exactly the expected session IDs
        expect(evicted.sort()).toEqual(expectedEvicted.sort());

        // Users NOT evicted remain in the Map
        for (const sid of expectedRemaining) {
          expect(usersMap.has(sid)).toBe(true);
        }

        // Evicted users are removed from the Map
        for (const sid of expectedEvicted) {
          expect(usersMap.has(sid)).toBe(false);
        }

        // Map size is correct
        expect(usersMap.size).toBe(originalSize - expectedEvicted.length);
      }),
      { numRuns: 100, verbose: true, endOnFailure: true }
    );
  });
});
