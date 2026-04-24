// Worker entry point for the proximity service.
// Handles CORS, WebSocket upgrade validation, and Durable Object routing.

export { ProximityRoom } from './proximity-room.js';

const DISPLAY_NAME_MIN_LENGTH = 2;
const DISPLAY_NAME_MAX_LENGTH = 20;
const DISPLAY_NAME_PATTERN = /^[a-zA-Z0-9 _-]+$/;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Upgrade',
};

/**
 * Add CORS headers to an existing Response.
 * @param {Response} response
 * @returns {Response}
 */
function addCorsHeaders(response) {
  const newHeaders = new Headers(response.headers);
  for (const [key, value] of Object.entries(CORS_HEADERS)) {
    newHeaders.set(key, value);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: newHeaders,
    webSocket: response.webSocket,
  });
}

/**
 * Validate a display name string.
 * @param {string} name
 * @returns {boolean}
 */
function isValidDisplayName(name) {
  if (typeof name !== 'string') return false;
  if (name.length < DISPLAY_NAME_MIN_LENGTH || name.length > DISPLAY_NAME_MAX_LENGTH) return false;
  return DISPLAY_NAME_PATTERN.test(name);
}

export default {
  async fetch(request, env) {
    // Handle CORS preflight requests
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    // Validate WebSocket upgrade header
    const upgradeHeader = request.headers.get('Upgrade');
    if (!upgradeHeader || upgradeHeader.toLowerCase() !== 'websocket') {
      return addCorsHeaders(
        new Response('Expected WebSocket upgrade', { status: 426 })
      );
    }

    // Extract and validate query parameters
    const url = new URL(request.url);
    const sessionId = url.searchParams.get('sessionId');
    const displayName = url.searchParams.get('displayName');

    if (!sessionId) {
      return addCorsHeaders(
        new Response('Missing sessionId query parameter', { status: 400 })
      );
    }

    if (!displayName) {
      return addCorsHeaders(
        new Response('Missing displayName query parameter', { status: 400 })
      );
    }

    if (!isValidDisplayName(displayName)) {
      return addCorsHeaders(
        new Response(
          'Invalid displayName: must be 2-20 characters, alphanumeric/space/hyphen/underscore only',
          { status: 400 }
        )
      );
    }

    // Get the single global ProximityRoom Durable Object stub
    const id = env.PROXIMITY_ROOM.idFromName('global');
    const stub = env.PROXIMITY_ROOM.get(id);

    // Forward the request to the Durable Object
    const response = await stub.fetch(request);

    // Add CORS headers to the response
    return addCorsHeaders(response);
  },
};
