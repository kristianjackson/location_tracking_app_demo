import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { buildLocationBroadcast } from '../proximity.js';

/**
 * Feature: multi-user-proximity, Property 3: LocationBroadcast structure matches visibility state
 *
 * **Validates: Requirements 2.3, 2.4, 3.2, 3.3, 3.4, 7.4**
 *
 * For any valid session ID, display name, coordinates (lat, lng, accuracy), and visibility boolean,
 * the constructed LocationBroadcast message SHALL:
 * - Always include `type`, `sessionId`, `displayName`, `visible`, and `timestamp` fields
 * - Include `lat`, `lng`, and `accuracy` fields if and only if `visible` is true
 * - Never include coordinate fields when `visible` is false
 */
describe('Feature: multi-user-proximity, Property 3: LocationBroadcast structure matches visibility state', () => {
  // Arbitrary for UUID-like session IDs
  const sessionIdArb = fc.uuid();

  // Arbitrary for valid display names (2–20 chars, alphanumeric + space/hyphen/underscore)
  const allowedCharArb = fc.mapToConstant(
    { num: 26, build: (v) => String.fromCharCode(0x41 + v) }, // A-Z
    { num: 26, build: (v) => String.fromCharCode(0x61 + v) }, // a-z
    { num: 10, build: (v) => String.fromCharCode(0x30 + v) }, // 0-9
    { num: 1, build: () => ' ' },
    { num: 1, build: () => '_' },
    { num: 1, build: () => '-' }
  );
  const displayNameArb = fc
    .array(allowedCharArb, { minLength: 2, maxLength: 20 })
    .map((chars) => chars.join(''));

  // Arbitrary for coordinates
  const latArb = fc.double({ min: -90, max: 90, noNaN: true });
  const lngArb = fc.double({ min: -180, max: 180, noNaN: true });
  const accuracyArb = fc.double({ min: 0, max: 10000, noNaN: true });

  // Arbitrary for visibility
  const visibleArb = fc.boolean();

  it('message always includes type, sessionId, displayName, visible, and timestamp', () => {
    fc.assert(
      fc.property(
        sessionIdArb,
        displayNameArb,
        visibleArb,
        latArb,
        lngArb,
        accuracyArb,
        (sessionId, displayName, visible, lat, lng, accuracy) => {
          const msg = buildLocationBroadcast(sessionId, displayName, visible, lat, lng, accuracy);

          expect(msg).toHaveProperty('type', 'location');
          expect(msg).toHaveProperty('sessionId', sessionId);
          expect(msg).toHaveProperty('displayName', displayName);
          expect(msg).toHaveProperty('visible', visible);
          expect(msg).toHaveProperty('timestamp');
          expect(typeof msg.timestamp).toBe('number');
        }
      ),
      { numRuns: 100, verbose: true, endOnFailure: true }
    );
  });

  it('includes lat, lng, accuracy when visible is true, matching input values', () => {
    fc.assert(
      fc.property(
        sessionIdArb,
        displayNameArb,
        latArb,
        lngArb,
        accuracyArb,
        (sessionId, displayName, lat, lng, accuracy) => {
          const msg = buildLocationBroadcast(sessionId, displayName, true, lat, lng, accuracy);

          expect(msg).toHaveProperty('lat', lat);
          expect(msg).toHaveProperty('lng', lng);
          expect(msg).toHaveProperty('accuracy', accuracy);
        }
      ),
      { numRuns: 100, verbose: true, endOnFailure: true }
    );
  });

  it('does NOT include lat, lng, accuracy when visible is false', () => {
    fc.assert(
      fc.property(
        sessionIdArb,
        displayNameArb,
        latArb,
        lngArb,
        accuracyArb,
        (sessionId, displayName, lat, lng, accuracy) => {
          const msg = buildLocationBroadcast(sessionId, displayName, false, lat, lng, accuracy);

          expect(msg.lat).toBeUndefined();
          expect(msg.lng).toBeUndefined();
          expect(msg.accuracy).toBeUndefined();
        }
      ),
      { numRuns: 100, verbose: true, endOnFailure: true }
    );
  });
});
