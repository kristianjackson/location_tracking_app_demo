import { describe, it, expect, beforeEach } from 'vitest';
import fc from 'fast-check';
import { getSessionId, SESSION_ID_KEY } from '../session.js';
import {
  validateDisplayName,
  DISPLAY_NAME_MIN_LENGTH,
  DISPLAY_NAME_MAX_LENGTH,
  DISPLAY_NAME_PATTERN,
} from '../session.js';

const UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/**
 * Feature: multi-user-proximity, Property 1: Session ID is valid UUID v4
 *
 * **Validates: Requirements 1.1**
 *
 * For any call to getSessionId() when no session ID exists in localStorage,
 * the generated value SHALL be a valid UUID v4 string and SHALL be stored
 * in localStorage under the configured key.
 */
describe('Feature: multi-user-proximity, Property 1: Session ID is valid UUID v4', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('generated session IDs match UUID v4 pattern', () => {
    fc.assert(
      fc.property(
        fc.constant(null),
        () => {
          // Clear localStorage before each iteration to force new generation
          localStorage.clear();

          const sessionId = getSessionId();

          // The generated session ID must match UUID v4 pattern
          expect(sessionId).toMatch(UUID_V4_REGEX);
        }
      ),
      { numRuns: 100, verbose: true, endOnFailure: true }
    );
  });

  it('generated session ID is stored in localStorage under the configured key', () => {
    fc.assert(
      fc.property(
        fc.constant(null),
        () => {
          // Clear localStorage before each iteration to force new generation
          localStorage.clear();

          const sessionId = getSessionId();

          // The ID must be stored in localStorage under SESSION_ID_KEY
          const storedId = localStorage.getItem(SESSION_ID_KEY);
          expect(storedId).toBe(sessionId);
        }
      ),
      { numRuns: 100, verbose: true, endOnFailure: true }
    );
  });
});


/**
 * Feature: multi-user-proximity, Property 2: Display name validation accepts only valid names
 *
 * **Validates: Requirements 1.3**
 *
 * For any string input, validateDisplayName SHALL return valid=true if and only if
 * the string has length between 2 and 20 (inclusive) and contains only alphanumeric
 * characters, spaces, hyphens, and underscores. For all other strings, it SHALL
 * return valid=false with a non-empty error message.
 */
describe('Feature: multi-user-proximity, Property 2: Display name validation accepts only valid names', () => {
  // Helper: build a string from an array of allowed characters
  const allowedCharArb = fc.mapToConstant(
    { num: 26, build: (v) => String.fromCharCode(0x41 + v) }, // A-Z
    { num: 26, build: (v) => String.fromCharCode(0x61 + v) }, // a-z
    { num: 10, build: (v) => String.fromCharCode(0x30 + v) }, // 0-9
    { num: 1, build: () => ' ' },
    { num: 1, build: () => '_' },
    { num: 1, build: () => '-' }
  );

  // Arbitrary for valid display names: length 2–20, only allowed chars
  const validNameArb = fc
    .array(allowedCharArb, { minLength: DISPLAY_NAME_MIN_LENGTH, maxLength: DISPLAY_NAME_MAX_LENGTH })
    .map((chars) => chars.join(''));

  it('returns valid=true for strings with length 2–20 and allowed characters only', () => {
    fc.assert(
      fc.property(validNameArb, (name) => {
        const result = validateDisplayName(name);
        expect(result.valid).toBe(true);
        expect(result.error).toBeUndefined();
      }),
      { numRuns: 100, verbose: true, endOnFailure: true }
    );
  });

  it('returns valid=false with non-empty error for strings that are too short', () => {
    const tooShortArb = fc
      .array(allowedCharArb, { minLength: 0, maxLength: DISPLAY_NAME_MIN_LENGTH - 1 })
      .map((chars) => chars.join(''));

    fc.assert(
      fc.property(tooShortArb, (name) => {
        const result = validateDisplayName(name);
        expect(result.valid).toBe(false);
        expect(result.error).toBeTruthy();
        expect(typeof result.error).toBe('string');
        expect(result.error.length).toBeGreaterThan(0);
      }),
      { numRuns: 100, verbose: true, endOnFailure: true }
    );
  });

  it('returns valid=false with non-empty error for strings that are too long', () => {
    const tooLongArb = fc
      .array(allowedCharArb, { minLength: DISPLAY_NAME_MAX_LENGTH + 1, maxLength: DISPLAY_NAME_MAX_LENGTH + 50 })
      .map((chars) => chars.join(''));

    fc.assert(
      fc.property(tooLongArb, (name) => {
        const result = validateDisplayName(name);
        expect(result.valid).toBe(false);
        expect(result.error).toBeTruthy();
        expect(typeof result.error).toBe('string');
        expect(result.error.length).toBeGreaterThan(0);
      }),
      { numRuns: 100, verbose: true, endOnFailure: true }
    );
  });

  it('returns valid=false with non-empty error for strings with disallowed characters', () => {
    // Generate a single disallowed character via integer code point, filtered to exclude allowed chars
    const disallowedCharArb = fc
      .integer({ min: 0x0021, max: 0xFFFF })
      .map((code) => String.fromCharCode(code))
      .filter((c) => !DISPLAY_NAME_PATTERN.test(c));

    // Generate a valid prefix of length 1 to (max - 2) so total stays in valid length range
    const validPrefixArb = fc
      .array(allowedCharArb, { minLength: 1, maxLength: DISPLAY_NAME_MAX_LENGTH - 2 })
      .map((chars) => chars.join(''));

    fc.assert(
      fc.property(validPrefixArb, disallowedCharArb, (validPart, badChar) => {
        const name = validPart + badChar;
        // Only test if the resulting string is within valid length range
        fc.pre(name.length >= DISPLAY_NAME_MIN_LENGTH && name.length <= DISPLAY_NAME_MAX_LENGTH);

        const result = validateDisplayName(name);
        expect(result.valid).toBe(false);
        expect(result.error).toBeTruthy();
        expect(typeof result.error).toBe('string');
        expect(result.error.length).toBeGreaterThan(0);
      }),
      { numRuns: 100, verbose: true, endOnFailure: true }
    );
  });

  it('validation result matches the reference check for arbitrary strings', () => {
    fc.assert(
      fc.property(fc.string(), (name) => {
        const result = validateDisplayName(name);

        const isValidLength =
          name.length >= DISPLAY_NAME_MIN_LENGTH &&
          name.length <= DISPLAY_NAME_MAX_LENGTH;
        const hasValidChars = DISPLAY_NAME_PATTERN.test(name);
        const shouldBeValid = isValidLength && hasValidChars;

        expect(result.valid).toBe(shouldBeValid);

        if (!shouldBeValid) {
          expect(result.error).toBeTruthy();
          expect(typeof result.error).toBe('string');
          expect(result.error.length).toBeGreaterThan(0);
        } else {
          expect(result.error).toBeUndefined();
        }
      }),
      { numRuns: 200, verbose: true, endOnFailure: true }
    );
  });

  it('returns valid=false with non-empty error for non-string inputs', () => {
    const nonStringArb = fc.oneof(
      fc.integer(),
      fc.boolean(),
      fc.constant(null),
      fc.constant(undefined),
      fc.array(fc.anything()),
      fc.object()
    );

    fc.assert(
      fc.property(nonStringArb, (input) => {
        const result = validateDisplayName(input);
        expect(result.valid).toBe(false);
        expect(result.error).toBeTruthy();
        expect(typeof result.error).toBe('string');
        expect(result.error.length).toBeGreaterThan(0);
      }),
      { numRuns: 100, verbose: true, endOnFailure: true }
    );
  });
});
