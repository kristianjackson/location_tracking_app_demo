# Implementation Plan: Multi-User Proximity

## Overview

This plan implements the multi-user proximity feature in incremental steps, starting with foundational modules (session, server-side pure functions), then building the Cloudflare Worker/Durable Object backend, followed by client-side proximity and UI modules, and finally wiring everything into the existing app. Each task builds on previous ones so there is no orphaned code.

## Tasks

- [x] 1. Create the session module (`session.js`)
  - [x] 1.1 Implement `session.js` with UUID generation, display name validation, and localStorage persistence
    - Create `session.js` at the project root
    - Implement `getSessionId()` — generate UUID v4 if not in localStorage, otherwise return stored value
    - Implement `getDisplayName()` and `setDisplayName(name)` with validation
    - Implement `validateDisplayName(name)` — check length 2–20, pattern `/^[a-zA-Z0-9 _-]+$/`
    - Implement `clearSession()` to remove session data from localStorage
    - Export all constants: `SESSION_ID_KEY`, `DISPLAY_NAME_KEY`, `DISPLAY_NAME_MIN_LENGTH`, `DISPLAY_NAME_MAX_LENGTH`, `DISPLAY_NAME_PATTERN`
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_

  - [x] 1.2 Write property test: Session ID is valid UUID v4
    - **Property 1: Session ID is valid UUID v4**
    - Verify generated session IDs match UUID v4 pattern `^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$`
    - Verify the ID is stored in localStorage under the configured key
    - Install `fast-check` as a dev dependency
    - **Validates: Requirements 1.1**

  - [x] 1.3 Write property test: Display name validation accepts only valid names
    - **Property 2: Display name validation accepts only valid names**
    - Generate random strings of varying lengths and character sets
    - Verify `validateDisplayName` returns `valid=true` iff length is 2–20 and matches allowed characters
    - Verify `valid=false` results include a non-empty error message
    - **Validates: Requirements 1.3**

  - [x] 1.4 Write unit tests for session module
    - Test UUID reuse on subsequent calls to `getSessionId()`
    - Test `setDisplayName` throws on invalid input
    - Test `clearSession` removes all keys from localStorage
    - Test `getDisplayName` returns null when no name is stored
    - _Requirements: 1.1, 1.3, 1.5_

- [x] 2. Implement server-side pure functions and Durable Object
  - [x] 2.1 Scaffold the proximity service Worker project
    - Create `proximity-service/` directory with `src/index.js`, `src/proximity-room.js`, `wrangler.toml`, and `package.json`
    - Configure `wrangler.toml` with the Durable Object binding for `ProximityRoom`
    - _Requirements: 4.1, 4.7_

  - [x] 2.2 Implement `haversineDistance` pure function in `proximity-room.js`
    - Implement `haversineDistance(lat1, lon1, lat2, lon2)` returning distance in meters
    - Use Earth radius R = 6,371,000 meters
    - Export the function for direct unit testing
    - _Requirements: 4.6_

  - [x] 2.3 Write property test: Haversine distance properties
    - **Property 8: Haversine distance properties**
    - Generate random coordinate pairs with valid lat [-90, 90] and lng [-180, 180]
    - Verify non-negative, symmetric, zero-for-identical, and triangle inequality
    - **Validates: Requirements 4.6**

  - [x] 2.4 Implement stale client eviction logic as a pure function
    - Create an exported `evictStaleUsers(users, now, staleTimeoutMs)` function in `proximity-room.js`
    - Remove users where `(now - user.lastSeen) > staleTimeoutMs`
    - Return the list of evicted session IDs
    - _Requirements: 4.5_

  - [x] 2.5 Write property test: Stale client eviction
    - **Property 7: Stale client eviction**
    - Generate random users with timestamps and a current time value
    - Verify a user is evicted iff `(currentTime - lastSeen) > 60000`
    - **Validates: Requirements 4.5**

  - [x] 2.6 Implement presence filtering logic as a pure function
    - Create an exported `filterNearbyUsers(users, clientSessionId, clientLat, clientLng, radiusM)` function
    - Include a user only if visible, within radius (Haversine), and not the requesting client
    - Return array of `{sessionId, displayName, lat, lng}`
    - _Requirements: 4.4, 4.6, 5.6_

  - [x] 2.7 Write property test: Presence update includes only visible users within radius
    - **Property 6: Presence update includes only visible users within radius**
    - Generate random user sets with positions and visibility states
    - Verify filtering correctness: visible AND within 5000m AND not self
    - **Validates: Requirements 2.4, 4.4, 5.6**

  - [x] 2.8 Implement the `ProximityRoom` Durable Object class
    - Implement constructor with `this.users = new Map()`
    - Implement `fetch()` to handle WebSocket upgrade using Hibernation API (`this.ctx.acceptWebSocket`)
    - Tag WebSocket with sessionId for retrieval
    - Implement `webSocketMessage(ws, message)` to parse LocationBroadcast and update user entry
    - Implement `webSocketClose(ws)` and `webSocketError(ws)` to remove user from map
    - Implement `alarm()` to evict stale users, compute per-client nearby sets using `filterNearbyUsers`, send PresenceUpdate JSON, and reschedule alarm
    - Export constants: `PROXIMITY_RADIUS_M`, `BROADCAST_INTERVAL_MS`, `STALE_TIMEOUT_MS`
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.7, 7.2, 7.3_

  - [x] 2.9 Implement the Worker entry point (`index.js`)
    - Handle CORS preflight requests
    - Validate WebSocket upgrade header; return 426 if missing
    - Extract `sessionId` and `displayName` from query params; return 400 if missing/invalid
    - Get or create the single ProximityRoom Durable Object stub and forward the request
    - Export the `ProximityRoom` class for the Durable Object binding
    - _Requirements: 4.1, 7.1_

- [x] 3. Checkpoint
  - Ensure all server-side tests pass, ask the user if questions arise.

- [x] 4. Implement client-side proximity modules
  - [x] 4.1 Implement `proximity.js` — WebSocket client and marker management
    - Create `proximity.js` at the project root
    - Implement `initProximity(map, sessionId, displayName)` to establish WSS connection
    - Implement `sendLocationUpdate(lat, lng, accuracy)` to construct and send LocationBroadcast JSON
    - Implement `setVisibility(visible)` and `getVisibility()` with localStorage persistence
    - Implement `disconnect()` for clean WebSocket close
    - Implement `getNearbyUserCount()` returning current marker count
    - Implement internal `handlePresenceUpdate(data)` to add/update/remove nearby markers
    - Implement exponential backoff reconnect: `min(1000 * 2^attempt, 30000)` ms
    - Use `addNearbyUserMarker`, `updateNearbyUserMarker`, `removeNearbyUserMarker` from `map.js` for marker operations
    - Maintain `nearbyMarkers` Map (sessionId → marker) and remove all markers on disconnect
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 5.1, 5.4, 5.5, 5.6_

  - [x] 4.2 Write property test: LocationBroadcast structure matches visibility state
    - **Property 3: LocationBroadcast structure matches visibility state**
    - Generate random session data, coordinates, and visibility booleans
    - Verify message always includes `type`, `sessionId`, `displayName`, `visible`, `timestamp`
    - Verify `lat`, `lng`, `accuracy` present iff `visible` is true
    - **Validates: Requirements 2.3, 2.4, 3.2, 3.3, 3.4, 7.4**

  - [x] 4.3 Write property test: Visibility preference round-trip
    - **Property 4: Visibility preference round-trip**
    - Generate random boolean values
    - Verify `setVisibility` then `getVisibility` returns the original value
    - Verify the value is stored in localStorage
    - **Validates: Requirements 2.6**

  - [x] 4.4 Write property test: Reconnect delay follows exponential backoff with cap
    - **Property 5: Reconnect delay follows exponential backoff with cap**
    - Generate random non-negative integers for attempt number
    - Verify delay equals `min(1000 * 2^attempt, 30000)` and is within [1000, 30000]
    - **Validates: Requirements 3.5**

  - [x] 4.5 Write property test: Marker set matches presence update
    - **Property 9: Marker set matches presence update**
    - Generate random PresenceUpdate payloads with N users
    - Verify exactly N markers exist after processing, positioned at correct coordinates
    - Verify markers for users absent in new update are removed
    - **Validates: Requirements 5.1, 5.4, 5.5, 5.6, 6.4**

  - [x] 4.6 Write property test: Marker tooltip contains display name
    - **Property 10: Marker tooltip contains display name**
    - Generate random display names
    - Verify the corresponding marker's tooltip content contains the display name string
    - **Validates: Requirements 5.3**

  - [x] 4.7 Write unit tests for proximity client
    - Test WebSocket connection lifecycle (connect, disconnect, reconnect)
    - Test message sending when visible vs hidden
    - Test marker creation/update/removal for specific scenarios
    - Test `getNearbyUserCount` returns correct count
    - Test all nearby markers removed on disconnect
    - _Requirements: 3.1, 3.2, 3.3, 3.5, 3.6, 5.1, 5.4, 5.5_

- [x] 5. Checkpoint
  - Ensure all client-side proximity tests pass, ask the user if questions arise.

- [x] 6. Add nearby user marker functions to `map.js`
  - [x] 6.1 Implement `addNearbyUserMarker`, `updateNearbyUserMarker`, `removeNearbyUserMarker` in `map.js`
    - `addNearbyUserMarker(map, lat, lng, displayName)` — create green (#34A853) CircleMarker with radius 8, bind tooltip with display name, add to map, return marker
    - `updateNearbyUserMarker(marker, lat, lng)` — call `setLatLng` on existing marker
    - `removeNearbyUserMarker(marker)` — remove marker from map
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

  - [x] 6.2 Write unit tests for nearby user marker functions
    - Test marker created with correct color (#34A853) and radius (8)
    - Test tooltip is bound with display name
    - Test marker removal from map
    - Test marker position update
    - _Requirements: 5.2, 5.3_

- [ ] 7. Implement proximity UI module (`proximity-ui.js`)
  - [-] 7.1 Implement `proximity-ui.js` with all UI components
    - Create `proximity-ui.js` at the project root
    - Implement `showDisplayNamePrompt(onSubmit)` — modal overlay with input field, validation feedback, and submit button
    - Implement `createVisibilityToggle(container, onChange)` — toggle control defaulting to hidden, with distinct visible/hidden icons or colors
    - Implement `setToggleState(visible)` — update toggle visual state
    - Implement `showConnectionStatus(status)` — display 'connecting', 'connected', 'reconnecting', or 'disconnected' indicator
    - Implement `updateNearbyCount(count)` — update nearby user count badge
    - Implement `showPrivacyNotice()` — display privacy info modal
    - Implement `createSettingsButton(container, onChangeName)` — settings gear for name change
    - _Requirements: 1.2, 1.4, 1.6, 2.1, 2.2, 2.7, 6.1, 6.2, 6.3, 6.4, 6.5, 7.5_

  - [~] 7.2 Write unit tests for proximity UI module
    - Test display name prompt appears and validates input
    - Test visibility toggle renders with correct initial state (hidden)
    - Test connection status indicator shows correct text for each state
    - Test nearby count badge updates correctly
    - Test privacy notice modal displays and dismisses
    - _Requirements: 1.2, 1.4, 2.1, 2.2, 2.7, 6.1, 6.2, 6.3, 6.4_

- [ ] 8. Update `index.html` and `styles.css` for proximity UI
  - [~] 8.1 Add proximity UI containers to `index.html`
    - Add container for visibility toggle (positioned on map, e.g., top-right)
    - Add container for connection status indicator
    - Add container for nearby user count badge
    - Ensure containers do not obstruct the map or existing overlay
    - _Requirements: 2.1, 6.1, 6.2, 6.3, 6.4, 6.5_

  - [~] 8.2 Add proximity styles to `styles.css`
    - Style the visibility toggle with distinct visible/hidden states
    - Style the connection status indicator (subtle, non-obstructive)
    - Style the nearby count badge
    - Style the display name prompt modal
    - Style the privacy notice modal
    - Style the settings button
    - Ensure responsive behavior with existing media queries
    - _Requirements: 2.7, 6.5_

- [ ] 9. Wire proximity into the existing app (`app.js`)
  - [~] 9.1 Integrate proximity modules into `app.js`
    - Import `session.js`, `proximity.js`, and `proximity-ui.js`
    - After existing `handlePositionSuccess` initialization completes:
      1. Check for display name; call `showDisplayNamePrompt` if missing
      2. Call `initProximity(map, sessionId, displayName)` to connect
      3. Call `createVisibilityToggle` and wire `onChange` to `setVisibility`
      4. Call `createSettingsButton` for name change access
    - In `onPositionUpdate`, also call `sendLocationUpdate(lat, lng, accuracy)`
    - Wire connection status callbacks from `proximity.js` to `showConnectionStatus`
    - Wire presence update count to `updateNearbyCount`
    - Ensure proximity modules load only after existing init is complete
    - Ensure app continues to work if proximity service is unavailable (graceful degradation)
    - _Requirements: 1.2, 1.5, 1.6, 2.1, 3.1, 3.2, 3.7, 6.1, 6.2, 6.3, 6.4, 8.1, 8.2, 8.3_

  - [~] 9.2 Write unit tests for app.js proximity integration
    - Test proximity modules are loaded after existing init completes
    - Test display name prompt shown when no name exists
    - Test `sendLocationUpdate` called on each position update
    - Test app continues to function when proximity service is unavailable
    - Test visibility toggle wired correctly
    - _Requirements: 8.1, 8.2, 8.3_

- [~] 10. Checkpoint
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 11. Integration tests
  - [~] 11.1 Write integration tests for end-to-end proximity flows
    - Test WebSocket connection establishment with valid session
    - Test location broadcast delivery and presence update receipt
    - Test hidden user exclusion from presence updates
    - Test stale client cleanup after 60s timeout
    - Test reconnection behavior after disconnect
    - Test app operates in single-user mode when proximity service is unavailable
    - _Requirements: 3.1, 3.5, 4.3, 4.5, 8.1, 8.2_

- [~] 12. Final checkpoint
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- Server-side pure functions (Haversine, eviction, filtering) are tested directly without a Cloudflare runtime
- Client-side tests use the existing jsdom + Vitest setup with `fast-check` for property tests
