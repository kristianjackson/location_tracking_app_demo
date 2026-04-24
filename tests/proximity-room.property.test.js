import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { haversineDistance, evictStaleUsers, filterNearbyUsers } from '../proximity-service/src/proximity-room.js';

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

        // Small epsilon tolerance for floating point arithmetic.
        // Near-antipodal points can accumulate rounding errors up to ~0.002m,
        // so 1e-2 (1 cm) is still extremely precise for geographic distances.
        const epsilon = 1e-2;
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


/**
 * Feature: multi-user-proximity, Property 6: Presence update includes only visible users within radius
 *
 * **Validates: Requirements 2.4, 4.4, 5.6**
 *
 * For any set of users with random positions and visibility states, and for any
 * requesting client position, the generated Presence Update SHALL include a user
 * if and only if:
 * (a) the user's visibility is set to visible, AND
 * (b) the Haversine distance between the user and the requesting client is ≤ 5000 meters, AND
 * (c) the user is not the requesting client itself.
 */
describe('Feature: multi-user-proximity, Property 6: Presence update includes only visible users within radius', () => {
  const RADIUS_M = 5000;

  // Arbitrary for valid latitude [-90, 90]
  const latArb = fc.double({ min: -90, max: 90, noNaN: true, noDefaultInfinity: true });

  // Arbitrary for valid longitude [-180, 180]
  const lngArb = fc.double({ min: -180, max: 180, noNaN: true, noDefaultInfinity: true });

  // Arbitrary for a display name (2–20 alphanumeric/space/hyphen/underscore chars)
  const allowedChars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 _-';
  const displayNameArb = fc
    .array(fc.constantFrom(...allowedChars.split('')), { minLength: 2, maxLength: 20 })
    .map((chars) => chars.join(''));

  // Arbitrary for a single user entry
  const userEntryArb = fc.record({
    sessionId: fc.uuid(),
    displayName: displayNameArb,
    lat: latArb,
    lng: lngArb,
    visible: fc.boolean(),
    lastSeen: fc.integer({ min: 0, max: Number.MAX_SAFE_INTEGER }),
  });

  // Arbitrary for a set of users with unique session IDs, a client session ID, and client position
  const scenarioArb = fc
    .record({
      users: fc.array(userEntryArb, { minLength: 0, maxLength: 15 }),
      clientSessionId: fc.uuid(),
      clientLat: latArb,
      clientLng: lngArb,
    })
    .map(({ users, clientSessionId, clientLat, clientLng }) => {
      // Ensure unique session IDs by appending index
      const uniqueUsers = users.map((u, i) => ({
        ...u,
        sessionId: `${u.sessionId}-${i}`,
      }));
      return { users: uniqueUsers, clientSessionId, clientLat, clientLng };
    });

  it('filterNearbyUsers returns exactly the users who are visible, within 5000m, and not the client', () => {
    fc.assert(
      fc.property(scenarioArb, ({ users, clientSessionId, clientLat, clientLng }) => {
        // Build the users Map as expected by filterNearbyUsers
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

        // Call the function under test
        const result = filterNearbyUsers(usersMap, clientSessionId, clientLat, clientLng, RADIUS_M);

        // Compute expected set independently
        const expected = users.filter((u) => {
          if (u.sessionId === clientSessionId) return false;
          if (!u.visible) return false;
          if (haversineDistance(clientLat, clientLng, u.lat, u.lng) > RADIUS_M) return false;
          return true;
        });

        // Same number of results
        expect(result.length).toBe(expected.length);

        // Every expected user appears in the result
        const resultIds = new Set(result.map((r) => r.sessionId));
        for (const e of expected) {
          expect(resultIds.has(e.sessionId)).toBe(true);
        }

        // Every result user was expected
        const expectedIds = new Set(expected.map((e) => e.sessionId));
        for (const r of result) {
          expect(expectedIds.has(r.sessionId)).toBe(true);
        }

        // Verify returned objects have the correct shape: {sessionId, displayName, lat, lng}
        for (const r of result) {
          expect(r).toHaveProperty('sessionId');
          expect(r).toHaveProperty('displayName');
          expect(r).toHaveProperty('lat');
          expect(r).toHaveProperty('lng');
          expect(Object.keys(r).sort()).toEqual(['displayName', 'lat', 'lng', 'sessionId']);

          // Verify values match the original user data
          const originalUser = users.find((u) => u.sessionId === r.sessionId);
          expect(r.displayName).toBe(originalUser.displayName);
          expect(r.lat).toBe(originalUser.lat);
          expect(r.lng).toBe(originalUser.lng);
        }
      }),
      { numRuns: 100, verbose: true, endOnFailure: true }
    );
  });
});
