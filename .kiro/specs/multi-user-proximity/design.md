# Design Document: Multi-User Proximity

## Overview

The multi-user proximity feature extends the existing Location Tracker application to allow multiple users to see each other's real-time locations on the map. Users within a 5 km radius appear as green markers with display name tooltips. The feature is opt-in via a visibility toggle (defaulting to hidden) and requires no account creation — just a self-chosen display name stored in local storage alongside an auto-generated UUID.

### Key Design Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Backend runtime | Cloudflare Worker + Durable Object | Already deployed on Cloudflare Pages; Durable Objects provide single-point coordination for WebSocket fan-out with in-memory state — no external database needed |
| Real-time transport | WebSocket (Hibernation API) | Bidirectional, low-latency; Hibernation API reduces cost when connections are idle |
| Proximity broadcast | Server-side alarm at ≤3 s interval | Durable Object alarm fires periodically, computes per-client nearby sets using Haversine, and pushes Presence Updates — keeps clients thin |
| Distance calculation | Haversine formula | Standard great-circle distance; accurate enough for 5 km radius at any latitude |
| Identity | UUID v4 + display name in localStorage | No auth overhead; sufficient for an anonymous proximity app |
| Visibility default | Hidden | Privacy-first; user must explicitly opt in to share location |
| Nearby user markers | Green (#34A853) Leaflet CircleMarkers with tooltip | Visually distinct from the blue (#4285F4) self-marker; lightweight rendering |
| Deployment model | Separate Worker for proximity service | Cloudflare Pages cannot host Durable Object classes directly; the Worker is deployed independently and the client connects via its URL |

## Architecture

The system adds a backend layer (Proximity Service) to the existing client-only architecture. The client continues to use the Geolocation API and Leaflet for its own position, and additionally opens a WebSocket to the Proximity Service to exchange location data with other users.

```
┌──────────────────────────────────────────────────────────────────┐
│                         Browser (Client)                         │
│                                                                  │
│  ┌────────────┐  ┌───────────┐  ┌─────────┐  ┌───────────────┐  │
│  │ Geolocation │─▶│ App Core  │─▶│ Map View│  │  Proximity    │  │
│  │ API        │  │ (app.js)  │  │(map.js) │  │  Client       │  │
│  └────────────┘  └─────┬─────┘  └────▲────┘  │(proximity.js) │  │
│                        │             │        └───────┬───────┘  │
│                   ┌────▼─────┐       │                │          │
│                   │ UI / UX  │       │                │          │
│                   │(ui.js)   │       │          WSS   │          │
│                   └──────────┘       │                │          │
│                                      │                │          │
│                   ┌──────────────────┘                │          │
│                   │  Nearby user markers              │          │
│                   │  added/removed by proximity.js    │          │
└───────────────────┼───────────────────────────────────┼──────────┘
                    │                                   │
                    │                              WSS  │
                    │                                   ▼
          ┌─────────────────────────────────────────────────────┐
          │              Cloudflare Edge                         │
          │                                                     │
          │  ┌─────────────────┐    ┌────────────────────────┐  │
          │  │  Worker          │───▶│  Durable Object        │  │
          │  │  (HTTP → WS     │    │  (ProximityRoom)       │  │
          │  │   upgrade +     │    │                        │  │
          │  │   routing)      │    │  - In-memory user map  │  │
          │  └─────────────────┘    │  - Haversine filtering │  │
          │                         │  - Alarm-based broadcast│  │
          │                         │  - Stale client cleanup│  │
          │                         └────────────────────────┘  │
          └─────────────────────────────────────────────────────┘
```

### Data Flow

```mermaid
sequenceDiagram
    participant Client as Browser Client
    participant Worker as CF Worker
    participant DO as Durable Object (ProximityRoom)

    Note over Client: User opens app, gets position, enters display name
    Client->>Worker: WSS upgrade request (/ws?sessionId=...&name=...)
    Worker->>DO: Forward upgrade to ProximityRoom (single global instance)
    DO-->>Client: 101 Switching Protocols

    loop Every position update (while visible)
        Client->>DO: LocationBroadcast {sessionId, name, lat, lng, accuracy, visible: true, ts}
        DO->>DO: Store/update user entry in memory
    end

    loop Alarm fires every ≤3 seconds
        DO->>DO: For each connected client, compute Haversine distances
        DO->>DO: Filter to visible users within 5 km
        DO-->>Client: PresenceUpdate {users: [{sessionId, name, lat, lng}, ...]}
    end

    Note over Client: User toggles visibility to hidden
    Client->>DO: LocationBroadcast {sessionId, visible: false}
    DO->>DO: Mark user hidden; exclude from next PresenceUpdate

    Note over DO: Client disconnects or 60 s without broadcast
    DO->>DO: Remove user from memory
```

### Deployment Architecture

The proximity service is a standalone Cloudflare Worker with a Durable Object binding. It is deployed separately from the static Cloudflare Pages site. The client connects to the Worker's URL directly over WebSocket.

```
┌─────────────────────┐         ┌──────────────────────────┐
│  Cloudflare Pages   │         │  Cloudflare Worker       │
│  (Static Site)      │         │  proximity-service       │
│                     │         │                          │
│  index.html         │  WSS   │  ┌────────────────────┐  │
│  app.js             │────────▶│  │ ProximityRoom (DO) │  │
│  proximity.js       │         │  └────────────────────┘  │
│  map.js, ui.js ...  │         │                          │
└─────────────────────┘         └──────────────────────────┘
```

## Components and Interfaces

### 1. `session.js` — User Session Module (New)

Manages the user's identity (Session ID + Display Name) in localStorage.

```javascript
// Public API
export function getSessionId();          // Returns existing UUID or generates + stores a new one
export function getDisplayName();        // Returns stored display name or null
export function setDisplayName(name);    // Validates and stores display name; throws on invalid
export function validateDisplayName(name); // Returns {valid: boolean, error?: string}
export function clearSession();          // Removes session data from localStorage

// Constants
export const SESSION_ID_KEY = 'proximity_session_id';
export const DISPLAY_NAME_KEY = 'proximity_display_name';
export const DISPLAY_NAME_MIN_LENGTH = 2;
export const DISPLAY_NAME_MAX_LENGTH = 20;
export const DISPLAY_NAME_PATTERN = /^[a-zA-Z0-9 _-]+$/;
```

### 2. `proximity.js` — Proximity Client Module (New)

Manages the WebSocket connection to the Proximity Service, sends location broadcasts, receives presence updates, and manages nearby user markers on the map.

```javascript
// Public API
export function initProximity(map, sessionId, displayName);  // Connect and start sharing
export function sendLocationUpdate(lat, lng, accuracy);       // Send position to server
export function setVisibility(visible);                       // Toggle visibility on/off
export function getVisibility();                              // Current visibility state
export function disconnect();                                 // Clean close
export function getNearbyUserCount();                         // Number of visible nearby users

// Internal
function connect(url, sessionId, displayName);   // Establish WSS connection
function handlePresenceUpdate(data);             // Update markers on map
function handleReconnect();                      // Exponential backoff reconnect
function addNearbyMarker(user);                  // Add green marker + tooltip
function updateNearbyMarker(user);               // Move existing marker
function removeNearbyMarker(sessionId);          // Remove marker from map
function removeAllNearbyMarkers();               // Clear all nearby markers

// State
const state = {
  ws: null,                    // WebSocket instance
  map: null,                   // Leaflet map reference
  sessionId: null,
  displayName: null,
  visible: false,              // Defaults to hidden
  nearbyMarkers: new Map(),    // sessionId → L.CircleMarker
  reconnectAttempt: 0,
  reconnectTimer: null,
  connected: false,
};

// Constants
export const WS_RECONNECT_BASE_MS = 1000;
export const WS_RECONNECT_MAX_MS = 30000;
export const NEARBY_MARKER_COLOR = '#34A853';
export const NEARBY_MARKER_RADIUS = 8;
```

### 3. `proximity-ui.js` — Proximity UI Module (New)

Manages the visibility toggle, display name prompt/settings, connection status indicator, and nearby user count badge.

```javascript
// Public API
export function showDisplayNamePrompt(onSubmit);    // Modal for first-time name entry
export function createVisibilityToggle(container, onChange);  // Add toggle to map UI
export function setToggleState(visible);            // Update toggle visual
export function showConnectionStatus(status);       // 'connecting' | 'connected' | 'reconnecting' | 'disconnected'
export function updateNearbyCount(count);           // Update badge text
export function showPrivacyNotice();                // Display privacy info modal
export function createSettingsButton(container, onChangeName); // Settings gear for name change
```

### 4. Worker: `proximity-service/src/index.js` — Worker Entry Point (New)

The Cloudflare Worker that handles HTTP/WebSocket upgrade requests and routes them to the Durable Object.

```javascript
// Worker entry point
export default {
  async fetch(request, env) {
    // Handle CORS preflight
    // Validate WebSocket upgrade header
    // Extract sessionId and displayName from query params
    // Get or create the single ProximityRoom Durable Object
    // Forward the request to the DO
  }
};
```

### 5. Worker: `proximity-service/src/proximity-room.js` — Durable Object (New)

The ProximityRoom Durable Object that coordinates all connected users.

```javascript
import { DurableObject } from "cloudflare:workers";

export class ProximityRoom extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.users = new Map();  // sessionId → {ws, sessionId, displayName, lat, lng, accuracy, visible, lastSeen}
  }

  async fetch(request) {
    // Handle WebSocket upgrade
    // Accept with Hibernation API: this.ctx.acceptWebSocket(server)
    // Tag WebSocket with sessionId for retrieval
    // Schedule alarm if not already set
  }

  async webSocketMessage(ws, message) {
    // Parse LocationBroadcast JSON
    // Update user entry in this.users
    // Update lastSeen timestamp
  }

  async webSocketClose(ws, code, reason, wasClean) {
    // Remove user from this.users
    // If no users remain, cancel alarm
  }

  async webSocketError(ws, error) {
    // Remove user, log error
  }

  async alarm() {
    // Evict stale users (lastSeen > 60s ago)
    // For each connected client:
    //   Compute Haversine distance to all visible users
    //   Filter to within PROXIMITY_RADIUS_M
    //   Exclude the client's own sessionId
    //   Send PresenceUpdate JSON
    // Reschedule alarm if users remain
  }
}

// Pure function — exported for unit testing
export function haversineDistance(lat1, lon1, lat2, lon2) {
  // Returns distance in meters
}

// Constants
export const PROXIMITY_RADIUS_M = 5000;
export const BROADCAST_INTERVAL_MS = 3000;
export const STALE_TIMEOUT_MS = 60000;
```

### 6. Modified: `app.js` — Application Core (Updated)

After existing initialization completes, loads the proximity feature.

```javascript
// New additions to app.js
import { getSessionId, getDisplayName, setDisplayName } from './session.js';
import { initProximity, sendLocationUpdate, setVisibility, disconnect } from './proximity.js';
import { showDisplayNamePrompt, createVisibilityToggle, ... } from './proximity-ui.js';

// In handlePositionSuccess(), after existing init:
//   1. Check for display name; prompt if missing
//   2. Initialize proximity client
//   3. Create visibility toggle UI
//   4. Hook into onPositionUpdate to also call sendLocationUpdate()
```

### 7. Modified: `map.js` — Map View Module (Updated)

Add functions for nearby user markers.

```javascript
// New exports
export function addNearbyUserMarker(map, lat, lng, displayName);   // Returns L.CircleMarker with tooltip
export function updateNearbyUserMarker(marker, lat, lng);          // Move marker
export function removeNearbyUserMarker(marker);                    // Remove from map
```

### 8. Modified: `index.html` (Updated)

Add containers for the visibility toggle, status indicator, and nearby count badge.

## Data Models

### LocationBroadcast (Client → Server)

```json
{
  "type": "location",
  "sessionId": "550e8400-e29b-41d4-a716-446655440000",
  "displayName": "Alice",
  "lat": 37.7749,
  "lng": -122.4194,
  "accuracy": 15.0,
  "visible": true,
  "timestamp": 1700000000000
}
```

When visibility is hidden, coordinates are omitted:

```json
{
  "type": "location",
  "sessionId": "550e8400-e29b-41d4-a716-446655440000",
  "displayName": "Alice",
  "visible": false,
  "timestamp": 1700000000000
}
```

### PresenceUpdate (Server → Client)

```json
{
  "type": "presence",
  "users": [
    {
      "sessionId": "660e8400-e29b-41d4-a716-446655440001",
      "displayName": "Bob",
      "lat": 37.7751,
      "lng": -122.4180
    },
    {
      "sessionId": "770e8400-e29b-41d4-a716-446655440002",
      "displayName": "Carol",
      "lat": 37.7740,
      "lng": -122.4200
    }
  ]
}
```

### User Entry (Server In-Memory)

```javascript
// Stored in ProximityRoom.users Map, keyed by sessionId
{
  sessionId: "550e8400-e29b-41d4-a716-446655440000",
  displayName: "Alice",
  lat: 37.7749,
  lng: -122.4194,
  accuracy: 15.0,
  visible: true,
  lastSeen: 1700000000000,  // timestamp of last LocationBroadcast
  ws: WebSocket              // reference to the connected WebSocket
}
```

### Client Proximity State

```javascript
{
  ws: WebSocket | null,
  map: L.Map | null,
  sessionId: string,
  displayName: string,
  visible: boolean,                // persisted in localStorage
  nearbyMarkers: Map<string, L.CircleMarker>,  // sessionId → marker
  reconnectAttempt: number,
  reconnectTimer: number | null,
  connected: boolean,
}
```

### localStorage Keys

| Key | Value | Purpose |
|---|---|---|
| `proximity_session_id` | UUID v4 string | Persistent user identity |
| `proximity_display_name` | String (2–20 chars) | User's chosen nickname |
| `proximity_visible` | `"true"` or `"false"` | Visibility preference (default: `"false"`) |

### Constants

| Constant | Value | Location |
|---|---|---|
| `PROXIMITY_RADIUS_M` | 5000 | Server |
| `BROADCAST_INTERVAL_MS` | 3000 | Server |
| `STALE_TIMEOUT_MS` | 60000 | Server |
| `WS_RECONNECT_BASE_MS` | 1000 | Client |
| `WS_RECONNECT_MAX_MS` | 30000 | Client |
| `NEARBY_MARKER_COLOR` | `#34A853` | Client |
| `NEARBY_MARKER_RADIUS` | 8 | Client |
| `DISPLAY_NAME_MIN_LENGTH` | 2 | Client |
| `DISPLAY_NAME_MAX_LENGTH` | 20 | Client |
| `DISPLAY_NAME_PATTERN` | `/^[a-zA-Z0-9 _-]+$/` | Client |

### Haversine Formula

The server uses the Haversine formula to compute great-circle distance between two coordinate pairs:

```
a = sin²(Δlat/2) + cos(lat1) · cos(lat2) · sin²(Δlng/2)
c = 2 · atan2(√a, √(1−a))
d = R · c
```

Where R = 6,371,000 meters (Earth's mean radius). This is implemented as a pure function `haversineDistance(lat1, lon1, lat2, lon2)` returning distance in meters, exported for direct unit testing.


## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Session ID is valid UUID v4

*For any* call to `getSessionId()` when no session ID exists in localStorage, the generated value SHALL be a valid UUID v4 string (matching the pattern `^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$`) and SHALL be stored in localStorage under the configured key.

**Validates: Requirements 1.1**

### Property 2: Display name validation accepts only valid names

*For any* string input, `validateDisplayName` SHALL return valid=true if and only if the string has length between 2 and 20 (inclusive) and contains only alphanumeric characters, spaces, hyphens, and underscores. For all other strings, it SHALL return valid=false with a non-empty error message.

**Validates: Requirements 1.3**

### Property 3: LocationBroadcast structure matches visibility state

*For any* valid session ID, display name, coordinates (lat, lng, accuracy), and visibility boolean, the constructed LocationBroadcast message SHALL:
- Always include `type`, `sessionId`, `displayName`, `visible`, and `timestamp` fields
- Include `lat`, `lng`, and `accuracy` fields if and only if `visible` is true
- Never include coordinate fields when `visible` is false

**Validates: Requirements 2.3, 2.4, 3.2, 3.3, 3.4, 7.4**

### Property 4: Visibility preference round-trip

*For any* boolean visibility value, storing it via `setVisibility` and then retrieving it via `getVisibility` SHALL return the original value. The value SHALL also be present in localStorage under the configured key.

**Validates: Requirements 2.6**

### Property 5: Reconnect delay follows exponential backoff with cap

*For any* non-negative integer attempt number, the computed reconnect delay SHALL equal `min(1000 * 2^attempt, 30000)` milliseconds. The delay SHALL never be less than 1000 ms or greater than 30000 ms.

**Validates: Requirements 3.5**

### Property 6: Presence update includes only visible users within radius

*For any* set of users with random positions and visibility states, and *for any* requesting client position, the generated Presence Update SHALL include a user if and only if: (a) the user's visibility is set to visible, AND (b) the Haversine distance between the user and the requesting client is ≤ 5000 meters, AND (c) the user is not the requesting client itself.

**Validates: Requirements 2.4, 4.4, 5.6**

### Property 7: Stale client eviction

*For any* set of users with random `lastSeen` timestamps and *for any* current time value, the eviction logic SHALL remove a user if and only if `(currentTime - user.lastSeen) > 60000` milliseconds.

**Validates: Requirements 4.5**

### Property 8: Haversine distance properties

*For any* two coordinate pairs (lat1, lon1) and (lat2, lon2) with valid latitude [-90, 90] and longitude [-180, 180]:
- The distance SHALL be non-negative
- The distance SHALL be symmetric: `haversine(A, B) === haversine(B, A)`
- The distance SHALL be zero when both points are identical
- The distance SHALL satisfy the triangle inequality: `haversine(A, C) ≤ haversine(A, B) + haversine(B, C)`

**Validates: Requirements 4.6**

### Property 9: Marker set matches presence update

*For any* Presence Update containing N users (none of which share the current user's session ID), after processing the update, the map SHALL contain exactly N nearby user markers, each positioned at the coordinates specified in the update. If a user from a previous update is absent in the new update, their marker SHALL be removed.

**Validates: Requirements 5.1, 5.4, 5.5, 5.6, 6.4**

### Property 10: Marker tooltip contains display name

*For any* nearby user with a display name, the corresponding marker's tooltip content SHALL contain that display name string.

**Validates: Requirements 5.3**

## Error Handling

### Client-Side Errors

| Error Scenario | Handling Strategy |
|---|---|
| **WebSocket connection fails** | Show "Connecting..." status; begin exponential backoff reconnect (1s → 30s max). App continues in single-user mode. |
| **WebSocket disconnects unexpectedly** | Show "Reconnecting..." status; begin exponential backoff. Remove all nearby markers. Existing self-tracking continues unaffected. |
| **Invalid JSON from server** | Log warning, ignore the message. Do not crash or disconnect. |
| **Display name validation fails** | Show inline error message describing requirements (2–20 chars, allowed characters). Do not connect to proximity service until valid name is provided. |
| **localStorage unavailable** | Generate a temporary in-memory session ID. Display name prompt still works but preferences won't persist across reloads. |
| **Geolocation API fails** | Existing error handling in `app.js` applies. Proximity module does not initialize — no WebSocket connection is attempted without a valid position. |
| **Proximity service unavailable** | App operates in single-user mode. All existing location tracking features remain functional. A subtle status indicator shows the proximity service is offline. |

### Server-Side Errors

| Error Scenario | Handling Strategy |
|---|---|
| **Invalid LocationBroadcast JSON** | Log warning, ignore the message. Do not close the WebSocket. |
| **Missing or invalid sessionId** | Reject the WebSocket upgrade with HTTP 400. |
| **WebSocket error event** | Remove the user from the in-memory map. Log the error. |
| **Alarm handler failure** | Durable Object alarms have built-in retry with exponential backoff (up to 6 retries). If retries are exhausted, schedule a new alarm to ensure broadcasts resume. |
| **Durable Object hibernation** | On wake, the constructor re-initializes the users Map as empty. Connected WebSockets are still attached via the Hibernation API. Users will re-populate on next LocationBroadcast from each client. |

### Graceful Degradation

The proximity feature is designed as an additive layer. If any part of the proximity system fails:
1. The core location tracking (self-position, accuracy circle, real-time updates) continues to work.
2. Proximity modules are loaded only after the existing app initialization completes.
3. WebSocket failures do not propagate errors to the main app flow.

## Testing Strategy

### Unit Tests (Example-Based)

Unit tests cover specific scenarios, edge cases, and UI behavior:

- **Session module**: UUID generation on first call, reuse on subsequent calls, display name validation with specific valid/invalid examples, localStorage persistence
- **Proximity UI**: Display name prompt appears when no name exists, visibility toggle renders with correct initial state, connection status indicator shows correct text for each state, nearby count badge updates
- **Proximity client**: WebSocket connection lifecycle (connect, disconnect, reconnect), message sending when visible vs hidden, marker creation/update/removal for specific scenarios
- **Map module**: Nearby user marker creation with correct color (#34A853), tooltip binding, marker removal
- **Backward compatibility**: App initializes normally when proximity service is unavailable, self-tracking continues during WebSocket disconnection

### Property-Based Tests

Property-based tests verify universal correctness properties across randomized inputs. Each property test runs a minimum of 100 iterations.

**Library**: [fast-check](https://github.com/dubzzz/fast-check) — the standard PBT library for JavaScript/TypeScript, compatible with Vitest.

**Tests to implement** (one test per property from the Correctness Properties section):

1. **Property 1**: Generate random empty-localStorage states → verify UUID v4 format
   - Tag: `Feature: multi-user-proximity, Property 1: Session ID is valid UUID v4`

2. **Property 2**: Generate random strings (varying length, character sets) → verify validation correctness
   - Tag: `Feature: multi-user-proximity, Property 2: Display name validation accepts only valid names`

3. **Property 3**: Generate random session data + coordinates + visibility → verify message structure
   - Tag: `Feature: multi-user-proximity, Property 3: LocationBroadcast structure matches visibility state`

4. **Property 4**: Generate random boolean values → verify localStorage round-trip
   - Tag: `Feature: multi-user-proximity, Property 4: Visibility preference round-trip`

5. **Property 5**: Generate random non-negative integers → verify backoff formula
   - Tag: `Feature: multi-user-proximity, Property 5: Reconnect delay follows exponential backoff with cap`

6. **Property 6**: Generate random user sets with positions + visibility → verify filtering
   - Tag: `Feature: multi-user-proximity, Property 6: Presence update includes only visible users within radius`

7. **Property 7**: Generate random users with timestamps + current time → verify eviction
   - Tag: `Feature: multi-user-proximity, Property 7: Stale client eviction`

8. **Property 8**: Generate random coordinate pairs → verify distance properties (non-negative, symmetric, zero-for-identical, triangle inequality)
   - Tag: `Feature: multi-user-proximity, Property 8: Haversine distance properties`

9. **Property 9**: Generate random PresenceUpdate payloads → verify marker set matches
   - Tag: `Feature: multi-user-proximity, Property 9: Marker set matches presence update`

10. **Property 10**: Generate random display names → verify tooltip content
    - Tag: `Feature: multi-user-proximity, Property 10: Marker tooltip contains display name`

### Integration Tests

Integration tests verify end-to-end behavior between client and server:

- WebSocket connection establishment with valid session
- Location broadcast delivery and presence update receipt
- Hidden user exclusion from presence updates within timing requirements
- Stale client cleanup after 60s timeout
- Reconnection behavior after server restart
- Concurrent multi-client scenarios

### Test Configuration

```javascript
// fast-check configuration for property tests
{
  numRuns: 100,        // Minimum 100 iterations per property
  verbose: true,       // Show counterexamples on failure
  endOnFailure: true   // Stop on first failure for debugging
}
```

Tests run via `vitest run` using the existing jsdom environment for client-side tests. Server-side pure functions (Haversine, eviction logic, presence filtering) are tested directly without a Cloudflare runtime — they are exported as pure functions specifically for this purpose.
