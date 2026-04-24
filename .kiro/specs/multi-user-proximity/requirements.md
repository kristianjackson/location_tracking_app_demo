# Requirements Document

## Introduction

This document defines the requirements for a multi-user proximity feature that extends the existing Location Tracker application. The feature enables multiple users to see each other's real-time locations on the map, similar to dating-style proximity apps (e.g., Bumble, Tinder). Each user can control whether they are visible to others via a visibility toggle, providing a safety mechanism. The feature requires backend infrastructure for real-time location sharing, a lightweight user identity system, and WebSocket-based communication between clients and the server.

## Glossary

- **Location_Tracker**: The existing web-based application that obtains and displays the user's geographic location on a map using Leaflet.js and the browser Geolocation API.
- **Proximity_Service**: The backend service (Cloudflare Worker + Durable Object) responsible for receiving, storing, and broadcasting user locations to connected clients in real time.
- **Nearby_User**: A user whose current location is within the configured proximity radius of the viewing user and whose visibility is set to visible.
- **Nearby_User_Marker**: A visual indicator on the Map_View representing the position of a Nearby_User, visually distinct from the current user's own Position_Marker.
- **Visibility_Toggle**: A UI control that allows the user to switch between visible and hidden states, controlling whether the Proximity_Service shares their location with other users.
- **User_Session**: A lightweight identity consisting of a unique session identifier and a user-chosen display name, persisted in the browser's local storage.
- **Session_ID**: A unique identifier (UUID) generated for each user on first visit and stored in local storage to maintain identity across page reloads.
- **Display_Name**: A user-chosen nickname shown on Nearby_User_Markers to identify users on the map.
- **Proximity_Radius**: The maximum distance (in meters) within which other users are considered nearby and displayed on the map. Default value is 5000 meters (5 km).
- **WebSocket_Connection**: A persistent, bidirectional communication channel between the client and the Proximity_Service used for real-time location updates.
- **Location_Broadcast**: A message sent from the client to the Proximity_Service containing the user's current coordinates, accuracy, and visibility state.
- **Presence_Update**: A message sent from the Proximity_Service to connected clients containing the positions and display names of all visible Nearby_Users.

## Requirements

### Requirement 1: User Session and Identity

**User Story:** As a user, I want to have a simple identity when using the app, so that other users can recognize me on the map.

#### Acceptance Criteria

1. WHEN a user opens the Location_Tracker for the first time, THE Location_Tracker SHALL generate a Session_ID (UUID v4) and store it in the browser's local storage.
2. WHEN a user opens the Location_Tracker and no Display_Name exists in local storage, THE Location_Tracker SHALL prompt the user to enter a Display_Name before connecting to the Proximity_Service.
3. THE Location_Tracker SHALL validate that the Display_Name is between 2 and 20 characters in length and contains only alphanumeric characters, spaces, hyphens, and underscores.
4. IF the user submits a Display_Name that fails validation, THEN THE Location_Tracker SHALL display a message describing the validation requirements.
5. WHEN a user opens the Location_Tracker and a valid Session_ID and Display_Name exist in local storage, THE Location_Tracker SHALL reuse the stored Session_ID and Display_Name without prompting.
6. THE Location_Tracker SHALL allow the user to change their Display_Name through a settings control accessible from the map interface.

### Requirement 2: Visibility Toggle

**User Story:** As a user, I want to control whether other users can see my location, so that I can protect my privacy and feel safe.

#### Acceptance Criteria

1. THE Location_Tracker SHALL display a Visibility_Toggle control on the map interface that is accessible at all times during active tracking.
2. THE Visibility_Toggle SHALL default to the hidden state when the user first opens the Location_Tracker.
3. WHEN the user activates the Visibility_Toggle to the visible state, THE Location_Tracker SHALL include the user's coordinates in Location_Broadcasts sent to the Proximity_Service.
4. WHEN the user activates the Visibility_Toggle to the hidden state, THE Location_Tracker SHALL send a Location_Broadcast with the visibility set to hidden, and THE Proximity_Service SHALL exclude the user from Presence_Updates sent to other clients.
5. WHEN the Proximity_Service receives a Location_Broadcast with visibility set to hidden, THE Proximity_Service SHALL remove the user from all Presence_Updates within 2 seconds.
6. THE Location_Tracker SHALL persist the Visibility_Toggle state in local storage so that the user's preference is restored on subsequent visits.
7. THE Visibility_Toggle SHALL display a clear visual indicator of the current state (visible or hidden) using distinct icons or colors.

### Requirement 3: Real-Time Location Sharing via WebSocket

**User Story:** As a user, I want my location to be shared with nearby users in real time, so that we can see each other on the map as we move.

#### Acceptance Criteria

1. WHEN the Location_Tracker has a valid User_Session and the user's initial position is obtained, THE Location_Tracker SHALL establish a WebSocket_Connection to the Proximity_Service.
2. WHILE the WebSocket_Connection is open and the Visibility_Toggle is set to visible, THE Location_Tracker SHALL send a Location_Broadcast to the Proximity_Service each time a new position update is received from the Geolocation API.
3. WHILE the WebSocket_Connection is open and the Visibility_Toggle is set to hidden, THE Location_Tracker SHALL send a Location_Broadcast containing only the Session_ID and hidden visibility flag (no coordinates) to maintain the connection.
4. THE Location_Broadcast SHALL include the Session_ID, Display_Name, latitude, longitude, accuracy, visibility state, and a timestamp.
5. IF the WebSocket_Connection is lost, THEN THE Location_Tracker SHALL attempt to reconnect using exponential backoff starting at 1 second, doubling up to a maximum interval of 30 seconds.
6. WHILE the WebSocket_Connection is disconnected, THE Location_Tracker SHALL display a notification indicating that the connection to the Proximity_Service is lost.
7. WHEN the WebSocket_Connection is re-established after a disconnection, THE Location_Tracker SHALL send the current position and visibility state immediately.

### Requirement 4: Proximity Service Backend

**User Story:** As a user, I want a reliable backend service that manages location sharing, so that I can see nearby users without delays.

#### Acceptance Criteria

1. THE Proximity_Service SHALL accept WebSocket connections from Location_Tracker clients and authenticate them using the Session_ID.
2. WHEN the Proximity_Service receives a Location_Broadcast from a client, THE Proximity_Service SHALL store the user's latest position, Display_Name, visibility state, and timestamp.
3. THE Proximity_Service SHALL send Presence_Updates to each connected client at a regular interval not exceeding 3 seconds.
4. WHEN generating a Presence_Update for a client, THE Proximity_Service SHALL include only Nearby_Users whose positions are within the Proximity_Radius (5000 meters) of the requesting client and whose visibility is set to visible.
5. IF a client has not sent a Location_Broadcast for more than 60 seconds, THEN THE Proximity_Service SHALL consider the client disconnected and remove the client from Presence_Updates sent to other users.
6. THE Proximity_Service SHALL calculate the distance between two users using the Haversine formula applied to their latitude and longitude coordinates.
7. THE Proximity_Service SHALL NOT store location data persistently beyond the active session; all location data SHALL be held in memory only.

### Requirement 5: Display Nearby Users on Map

**User Story:** As a user, I want to see other nearby users on the map, so that I can know who is around me.

#### Acceptance Criteria

1. WHEN the Location_Tracker receives a Presence_Update from the Proximity_Service, THE Map_View SHALL display a Nearby_User_Marker for each Nearby_User included in the update.
2. THE Nearby_User_Marker SHALL be visually distinct from the current user's Position_Marker by using a different color (green, hex #34A853).
3. THE Nearby_User_Marker SHALL display the Nearby_User's Display_Name in a tooltip or label visible on the map.
4. WHEN a Nearby_User's position changes in a subsequent Presence_Update, THE Map_View SHALL move the corresponding Nearby_User_Marker to the updated coordinates.
5. WHEN a Nearby_User is no longer included in a Presence_Update (moved out of range or became hidden), THE Map_View SHALL remove the corresponding Nearby_User_Marker from the map.
6. THE Map_View SHALL NOT display a Nearby_User_Marker for the current user's own Session_ID.

### Requirement 6: Connection and Status Indicators

**User Story:** As a user, I want to see the status of my connection and visibility, so that I know whether the proximity feature is working.

#### Acceptance Criteria

1. WHILE the WebSocket_Connection is being established, THE Location_Tracker SHALL display a status indicator showing "Connecting...".
2. WHEN the WebSocket_Connection is successfully established, THE Location_Tracker SHALL display a status indicator showing the connection is active.
3. WHILE the WebSocket_Connection is disconnected and reconnection attempts are in progress, THE Location_Tracker SHALL display a status indicator showing "Reconnecting...".
4. THE Location_Tracker SHALL display the count of currently visible Nearby_Users on the map interface.
5. THE status indicators SHALL be positioned so they do not obstruct the map or the Visibility_Toggle.

### Requirement 7: Privacy and Data Safety

**User Story:** As a user, I want my location data to be handled safely, so that I can trust the application with my position information.

#### Acceptance Criteria

1. THE Proximity_Service SHALL transmit all data between the client and server over encrypted connections (WSS for WebSocket, HTTPS for any HTTP endpoints).
2. THE Proximity_Service SHALL NOT log or persist individual user coordinates to any storage beyond the in-memory session state.
3. WHEN a user closes the Location_Tracker or the WebSocket_Connection is terminated, THE Proximity_Service SHALL remove the user's location data from memory within 5 seconds.
4. THE Location_Tracker SHALL NOT share the user's coordinates with the Proximity_Service when the Visibility_Toggle is set to hidden.
5. THE Location_Tracker SHALL include a brief privacy notice accessible from the map interface explaining what location data is shared and how it is used.

### Requirement 8: Backward Compatibility

**User Story:** As an existing user, I want the core location tracking features to continue working, so that the new proximity feature does not break my current experience.

#### Acceptance Criteria

1. THE Location_Tracker SHALL continue to display the user's own position, accuracy circle, and real-time updates regardless of the WebSocket_Connection state.
2. IF the Proximity_Service is unavailable, THEN THE Location_Tracker SHALL operate in single-user mode with all existing location tracking features functional.
3. THE Location_Tracker SHALL load the proximity feature modules only after the existing location tracking initialization is complete.
