// session.js — User Session Module
// Manages the user's identity (Session ID + Display Name) in localStorage.

// Constants
export const SESSION_ID_KEY = 'proximity_session_id';
export const DISPLAY_NAME_KEY = 'proximity_display_name';
export const DISPLAY_NAME_MIN_LENGTH = 2;
export const DISPLAY_NAME_MAX_LENGTH = 20;
export const DISPLAY_NAME_PATTERN = /^[a-zA-Z0-9 _-]+$/;

/**
 * Generate a UUID v4 string using crypto.randomUUID() with a manual fallback.
 * @returns {string} A UUID v4 string
 */
function generateUUID() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Manual fallback using crypto.getRandomValues
  return '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, (c) => {
    const byte = crypto.getRandomValues(new Uint8Array(1))[0];
    return (c ^ (byte & (15 >> (c / 4)))).toString(16);
  });
}

/**
 * Returns the existing session ID from localStorage, or generates and stores a new UUID v4.
 * @returns {string} The session ID (UUID v4)
 */
export function getSessionId() {
  let sessionId = localStorage.getItem(SESSION_ID_KEY);
  if (sessionId) {
    return sessionId;
  }
  sessionId = generateUUID();
  localStorage.setItem(SESSION_ID_KEY, sessionId);
  return sessionId;
}

/**
 * Returns the stored display name from localStorage, or null if none exists.
 * @returns {string|null} The display name or null
 */
export function getDisplayName() {
  return localStorage.getItem(DISPLAY_NAME_KEY);
}

/**
 * Validates a display name against length and character requirements.
 * @param {string} name - The display name to validate
 * @returns {{valid: boolean, error?: string}} Validation result
 */
export function validateDisplayName(name) {
  if (typeof name !== 'string') {
    return { valid: false, error: 'Display name must be a string.' };
  }

  if (name.length < DISPLAY_NAME_MIN_LENGTH) {
    return {
      valid: false,
      error: `Display name must be at least ${DISPLAY_NAME_MIN_LENGTH} characters.`,
    };
  }

  if (name.length > DISPLAY_NAME_MAX_LENGTH) {
    return {
      valid: false,
      error: `Display name must be at most ${DISPLAY_NAME_MAX_LENGTH} characters.`,
    };
  }

  if (!DISPLAY_NAME_PATTERN.test(name)) {
    return {
      valid: false,
      error: 'Display name can only contain letters, numbers, spaces, hyphens, and underscores.',
    };
  }

  return { valid: true };
}

/**
 * Validates and stores a display name in localStorage.
 * @param {string} name - The display name to set
 * @throws {Error} If the display name is invalid
 */
export function setDisplayName(name) {
  const result = validateDisplayName(name);
  if (!result.valid) {
    throw new Error(result.error);
  }
  localStorage.setItem(DISPLAY_NAME_KEY, name);
}

/**
 * Removes session data (session ID and display name) from localStorage.
 */
export function clearSession() {
  localStorage.removeItem(SESSION_ID_KEY);
  localStorage.removeItem(DISPLAY_NAME_KEY);
}
