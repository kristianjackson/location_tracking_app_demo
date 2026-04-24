# Implementation Plan: Location Tracker

## Overview

Build a lightweight, single-page web application that displays the user's real-time geographic position on an interactive map. The app uses vanilla HTML/CSS/JavaScript with ES modules, Leaflet.js for map rendering with OpenStreetMap tiles, and the browser Geolocation API. No build step is required.

## Tasks

- [x] 1. Create project structure and entry point
  - [x] 1.1 Create `index.html` with viewport meta tag, map container, overlay container, Leaflet CDN links, and app module script tag
    - Set viewport meta: `width=device-width, initial-scale=1.0, user-scalable=no`
    - Add `#map` div for Leaflet map container
    - Add `#overlay` div for loading/error UI
    - Load Leaflet CSS and JS from CDN
    - Load `app.js` as ES module
    - _Requirements: 5.4, 5.2, 6.2_
  - [x] 1.2 Create `styles.css` with responsive layout and overlay styles
    - Set `#map` to `width: 100vw; height: 100vh` for full-viewport map
    - Style `#overlay` as absolutely positioned centered overlay
    - Add touch-action rules to prevent browser gesture conflicts with Leaflet
    - Add media queries for screens wider than 768px
    - Style loading indicator, error message, and signal-lost notification elements
    - _Requirements: 5.1, 5.2, 5.3_

- [x] 2. Implement UI overlay module (`ui.js`)
  - [x] 2.1 Create `ui.js` with functions for loading, error, and signal-lost states
    - Implement `showLoading(message)` to display loading indicator with provided text
    - Implement `hideLoading()` to remove loading indicator
    - Implement `showError(message)` to display error message overlay
    - Implement `hideError()` to remove error message
    - Implement `showSignalLost()` to display signal-lost notification
    - Implement `hideSignalLost()` to remove signal-lost notification
    - Export all functions as ES module exports
    - _Requirements: 1.3, 1.4, 3.4, 6.1, 6.3_
  - [x] 2.2 Write unit tests for `ui.js`
    - Test that `showLoading` creates and displays the loading element with correct text
    - Test that `hideLoading` removes the loading element
    - Test that `showError` displays the error message
    - Test that `showSignalLost` and `hideSignalLost` toggle the notification
    - _Requirements: 1.3, 1.4, 3.4, 6.1_

- [x] 3. Implement geolocation wrapper module (`geolocation.js`)
  - [x] 3.1 Create `geolocation.js` with Geolocation API wrapper functions
    - Define `GEO_OPTIONS_INITIAL` with `enableHighAccuracy: true`, `timeout: 10000`, `maximumAge: 0`
    - Define `GEO_OPTIONS_WATCH` with `enableHighAccuracy: true`, `timeout: 15000`, `maximumAge: 0`
    - Implement `getCurrentPosition()` returning a Promise that resolves with `GeolocationPosition`
    - Implement `watchPosition(onSuccess, onError)` returning a watch ID
    - Implement `clearWatch(watchId)` to stop watching
    - Implement `getErrorMessage(error)` mapping error codes 1, 2, 3 to user-facing messages
    - Export all functions as ES module exports
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 3.1_
  - [x] 3.2 Write unit tests for `geolocation.js`
    - Test `getErrorMessage` returns correct message for each error code (1=permission denied, 2=position unavailable, 3=timeout)
    - Test `getCurrentPosition` resolves with position data when API succeeds
    - Test `getCurrentPosition` rejects with error when API fails
    - Test `watchPosition` calls the browser API with correct options
    - _Requirements: 1.3, 1.4_

- [x] 4. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Implement map view module (`map.js`)
  - [x] 5.1 Create `map.js` with Leaflet map management functions
    - Implement `createMap(containerId)` to initialize a Leaflet map with OpenStreetMap tile layer
    - Implement `centerMap(map, lat, lng, zoom)` to set map view, default zoom level 16
    - Implement `addPositionMarker(map, lat, lng)` to add a `CircleMarker` with radius 8px and color `#4285F4`
    - Implement `updatePositionMarker(marker, lat, lng)` to move the marker to new coordinates
    - Implement `addAccuracyCircle(map, lat, lng, radiusMeters)` to add a `Circle` with color `#4285F4` and opacity 0.15
    - Implement `updateAccuracyCircle(circle, lat, lng, radiusMeters)` to update circle position and radius
    - Implement `onUserPan(map, callback)` to detect user-initiated map panning via Leaflet `dragend` event
    - Export all functions as ES module exports
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 4.1, 4.2_
  - [x] 5.2 Write unit tests for `map.js`
    - Test `createMap` initializes a Leaflet map with OSM tile layer
    - Test `addPositionMarker` creates a CircleMarker at the given coordinates
    - Test `updatePositionMarker` moves the marker to new coordinates
    - Test `addAccuracyCircle` creates a circle with correct radius and styling
    - Test `updateAccuracyCircle` updates circle position and radius
    - _Requirements: 2.2, 4.1, 4.2_

- [ ] 6. Implement application core (`app.js`)
  - [ ] 6.1 Create `app.js` with application state and initialization logic
    - Define application state object: `map`, `marker`, `accuracyCircle`, `watchId`, `userHasPanned`, `signalLostTimerId`, `isInitialized`
    - Define constants: `SIGNAL_LOST_TIMEOUT_MS = 30000`
    - Implement `init()` function called on `DOMContentLoaded`:
      - Show loading indicator with "Locating you..."
      - Call `getCurrentPosition()` from geolocation module
      - On success: call `handlePositionSuccess`
      - On error: call `handlePositionError`
    - _Requirements: 1.1, 1.2, 6.1_
  - [ ] 6.2 Implement position success handler and real-time tracking
    - Implement `handlePositionSuccess(pos)`:
      - Initialize map centered on received coordinates at zoom level 16
      - Add position marker and accuracy circle
      - Hide loading indicator
      - Call `startWatching()`
    - Implement `startWatching()`:
      - Subscribe to continuous position updates via `watchPosition`
      - Register `onUserPan` callback to set `userHasPanned = true`
    - Implement `onPositionUpdate(pos)`:
      - Update marker position
      - Update accuracy circle position and radius
      - Re-center map if `userHasPanned` is false
      - Call `resetSignalLostTimer()`
    - _Requirements: 2.1, 2.2, 2.3, 3.1, 3.2, 3.3, 4.1, 4.2, 6.3_
  - [ ] 6.3 Implement error handling and signal-lost timer
    - Implement `handlePositionError(err)`:
      - Hide loading indicator
      - Get user-facing message from `getErrorMessage`
      - Show error via UI module
    - Implement `resetSignalLostTimer()`:
      - Clear existing timer if any
      - Start new 30-second timer
      - On timeout: show signal-lost notification via UI module
    - Implement `stopWatching()`:
      - Clear geolocation watch
      - Clear signal-lost timer
    - _Requirements: 1.3, 1.4, 3.4_
  - [ ] 6.4 Write unit tests for `app.js`
    - Test `init` shows loading indicator and requests position
    - Test `handlePositionSuccess` initializes map, adds marker, hides loading, starts watching
    - Test `handlePositionError` shows correct error message for each error code
    - Test `onPositionUpdate` updates marker and accuracy circle
    - Test `onPositionUpdate` re-centers map only when user has not panned
    - Test `resetSignalLostTimer` shows signal-lost notification after 30 seconds of no updates
    - _Requirements: 1.3, 1.4, 2.1, 3.2, 3.3, 3.4, 6.1_

- [ ] 7. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 8. Wire everything together and finalize
  - [ ] 8.1 Integrate all modules in `index.html` and verify end-to-end flow
    - Ensure `index.html` correctly loads `app.js` as module entry point
    - Verify module imports chain: `app.js` → `map.js`, `geolocation.js`, `ui.js`
    - Confirm loading indicator appears on page load
    - Confirm map renders after position is obtained
    - Confirm position marker and accuracy circle display correctly
    - Confirm real-time updates move the marker
    - Confirm signal-lost notification appears after 30s without updates
    - _Requirements: 1.1, 1.2, 2.1, 2.2, 3.1, 3.2, 3.4, 4.1, 6.1, 6.3_
  - [ ] 8.2 Write integration tests for the full application flow
    - Test initialization flow: loading → permission → map render
    - Test permission denied flow: loading → error message
    - Test real-time update flow: marker and accuracy circle update on new position
    - Test smart re-centering: map follows user unless manually panned
    - Test signal-lost: notification appears after 30s timeout
    - _Requirements: 1.1, 1.2, 1.3, 2.1, 3.1, 3.3, 3.4_

- [ ] 9. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- The application requires HTTPS hosting for the Geolocation API to work
- Leaflet.js is loaded from CDN, no package installation needed
