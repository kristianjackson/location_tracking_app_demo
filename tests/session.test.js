import { describe, it, expect, beforeEach } from 'vitest';
import {
  getSessionId,
  getDisplayName,
  setDisplayName,
  validateDisplayName,
  clearSession,
  SESSION_ID_KEY,
  DISPLAY_NAME_KEY,
  DISPLAY_NAME_MIN_LENGTH,
  DISPLAY_NAME_MAX_LENGTH,
  DISPLAY_NAME_PATTERN,
} from '../session.js';

const UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('session.js', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  // --- Constants ---

  describe('constants', () => {
    it('exports the correct localStorage keys', () => {
      expect(SESSION_ID_KEY).toBe('proximity_session_id');
      expect(DISPLAY_NAME_KEY).toBe('proximity_display_name');
    });

    it('exports the correct display name constraints', () => {
      expect(DISPLAY_NAME_MIN_LENGTH).toBe(2);
      expect(DISPLAY_NAME_MAX_LENGTH).toBe(20);
      expect(DISPLAY_NAME_PATTERN).toEqual(/^[a-zA-Z0-9 _-]+$/);
    });
  });

  // --- getSessionId ---

  describe('getSessionId', () => {
    it('generates a valid UUID v4 on first call', () => {
      const id = getSessionId();
      expect(id).toMatch(UUID_V4_REGEX);
    });

    it('stores the generated UUID in localStorage', () => {
      const id = getSessionId();
      expect(localStorage.getItem(SESSION_ID_KEY)).toBe(id);
    });

    it('returns the same UUID on subsequent calls', () => {
      const first = getSessionId();
      const second = getSessionId();
      expect(second).toBe(first);
    });

    it('returns an existing UUID from localStorage', () => {
      const existingId = '550e8400-e29b-41d4-a716-446655440000';
      localStorage.setItem(SESSION_ID_KEY, existingId);
      expect(getSessionId()).toBe(existingId);
    });
  });

  // --- getDisplayName ---

  describe('getDisplayName', () => {
    it('returns null when no display name is stored', () => {
      expect(getDisplayName()).toBeNull();
    });

    it('returns the stored display name', () => {
      localStorage.setItem(DISPLAY_NAME_KEY, 'Alice');
      expect(getDisplayName()).toBe('Alice');
    });
  });

  // --- validateDisplayName ---

  describe('validateDisplayName', () => {
    it('accepts a valid name', () => {
      expect(validateDisplayName('Alice')).toEqual({ valid: true });
    });

    it('accepts names with spaces, hyphens, and underscores', () => {
      expect(validateDisplayName('Bob Smith')).toEqual({ valid: true });
      expect(validateDisplayName('user-name')).toEqual({ valid: true });
      expect(validateDisplayName('user_name')).toEqual({ valid: true });
    });

    it('accepts names at minimum length', () => {
      expect(validateDisplayName('AB')).toEqual({ valid: true });
    });

    it('accepts names at maximum length', () => {
      const name = 'A'.repeat(DISPLAY_NAME_MAX_LENGTH);
      expect(validateDisplayName(name)).toEqual({ valid: true });
    });

    it('rejects names shorter than minimum length', () => {
      const result = validateDisplayName('A');
      expect(result.valid).toBe(false);
      expect(result.error).toBeTruthy();
    });

    it('rejects empty strings', () => {
      const result = validateDisplayName('');
      expect(result.valid).toBe(false);
      expect(result.error).toBeTruthy();
    });

    it('rejects names longer than maximum length', () => {
      const name = 'A'.repeat(DISPLAY_NAME_MAX_LENGTH + 1);
      const result = validateDisplayName(name);
      expect(result.valid).toBe(false);
      expect(result.error).toBeTruthy();
    });

    it('rejects names with special characters', () => {
      expect(validateDisplayName('user@name')).toEqual(
        expect.objectContaining({ valid: false })
      );
      expect(validateDisplayName('user!name')).toEqual(
        expect.objectContaining({ valid: false })
      );
      expect(validateDisplayName('user.name')).toEqual(
        expect.objectContaining({ valid: false })
      );
    });

    it('rejects non-string input', () => {
      expect(validateDisplayName(123)).toEqual(
        expect.objectContaining({ valid: false })
      );
      expect(validateDisplayName(null)).toEqual(
        expect.objectContaining({ valid: false })
      );
      expect(validateDisplayName(undefined)).toEqual(
        expect.objectContaining({ valid: false })
      );
    });
  });

  // --- setDisplayName ---

  describe('setDisplayName', () => {
    it('stores a valid display name in localStorage', () => {
      setDisplayName('Alice');
      expect(localStorage.getItem(DISPLAY_NAME_KEY)).toBe('Alice');
    });

    it('throws on invalid display name', () => {
      expect(() => setDisplayName('A')).toThrow();
      expect(() => setDisplayName('')).toThrow();
      expect(() => setDisplayName('A'.repeat(21))).toThrow();
      expect(() => setDisplayName('user@name')).toThrow();
    });

    it('does not store an invalid display name', () => {
      try {
        setDisplayName('A');
      } catch {
        // expected
      }
      expect(localStorage.getItem(DISPLAY_NAME_KEY)).toBeNull();
    });
  });

  // --- clearSession ---

  describe('clearSession', () => {
    it('removes session ID and display name from localStorage', () => {
      localStorage.setItem(SESSION_ID_KEY, 'some-id');
      localStorage.setItem(DISPLAY_NAME_KEY, 'Alice');

      clearSession();

      expect(localStorage.getItem(SESSION_ID_KEY)).toBeNull();
      expect(localStorage.getItem(DISPLAY_NAME_KEY)).toBeNull();
    });

    it('does not throw when localStorage is already empty', () => {
      expect(() => clearSession()).not.toThrow();
    });
  });
});
