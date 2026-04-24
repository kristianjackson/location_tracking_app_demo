/**
 * Map View Module
 * Encapsulates all Leaflet map interactions including map creation,
 * position markers, accuracy circles, and user pan detection.
 */

/** Marker radius in pixels. */
const MARKER_RADIUS = 8;

/** Marker color (Google Maps-style blue). */
const MARKER_COLOR = '#4285F4';

/** Accuracy circle color. */
const ACCURACY_CIRCLE_COLOR = '#4285F4';

/** Accuracy circle fill opacity. */
const ACCURACY_CIRCLE_OPACITY = 0.15;

/** Nearby user marker color (green). */
const NEARBY_MARKER_COLOR = '#34A853';

/** Default zoom level (~500m radius neighborhood view). */
const INITIAL_ZOOM = 16;

/**
 * Create and initialize a Leaflet map with an OpenStreetMap tile layer.
 * @param {string} containerId - The DOM element ID for the map container.
 * @returns {L.Map} The initialized Leaflet map instance.
 */
export function createMap(containerId) {
  const map = L.map(containerId);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  }).addTo(map);
  return map;
}

/**
 * Center the map on the given coordinates at the specified zoom level.
 * @param {L.Map} map - The Leaflet map instance.
 * @param {number} lat - Latitude.
 * @param {number} lng - Longitude.
 * @param {number} [zoom=16] - Zoom level (defaults to INITIAL_ZOOM).
 */
export function centerMap(map, lat, lng, zoom = INITIAL_ZOOM) {
  map.setView([lat, lng], zoom);
}

/**
 * Add a position marker (CircleMarker) to the map.
 * @param {L.Map} map - The Leaflet map instance.
 * @param {number} lat - Latitude.
 * @param {number} lng - Longitude.
 * @returns {L.CircleMarker} The created CircleMarker.
 */
export function addPositionMarker(map, lat, lng) {
  return L.circleMarker([lat, lng], {
    radius: MARKER_RADIUS,
    color: MARKER_COLOR,
    fillColor: MARKER_COLOR,
    fillOpacity: 1,
  }).addTo(map);
}

/**
 * Move an existing position marker to new coordinates.
 * @param {L.CircleMarker} marker - The CircleMarker to update.
 * @param {number} lat - New latitude.
 * @param {number} lng - New longitude.
 */
export function updatePositionMarker(marker, lat, lng) {
  marker.setLatLng([lat, lng]);
}

/**
 * Add an accuracy circle to the map.
 * @param {L.Map} map - The Leaflet map instance.
 * @param {number} lat - Latitude.
 * @param {number} lng - Longitude.
 * @param {number} radiusMeters - Accuracy radius in meters.
 * @returns {L.Circle} The created Circle.
 */
export function addAccuracyCircle(map, lat, lng, radiusMeters) {
  return L.circle([lat, lng], {
    radius: radiusMeters,
    color: ACCURACY_CIRCLE_COLOR,
    fillColor: ACCURACY_CIRCLE_COLOR,
    fillOpacity: ACCURACY_CIRCLE_OPACITY,
    weight: 1,
  }).addTo(map);
}

/**
 * Update an existing accuracy circle's position and radius.
 * @param {L.Circle} circle - The Circle to update.
 * @param {number} lat - New latitude.
 * @param {number} lng - New longitude.
 * @param {number} radiusMeters - New accuracy radius in meters.
 */
export function updateAccuracyCircle(circle, lat, lng, radiusMeters) {
  circle.setLatLng([lat, lng]);
  circle.setRadius(radiusMeters);
}

/**
 * Register a callback for when the user manually pans the map.
 * Listens to the Leaflet `dragend` event.
 * @param {L.Map} map - The Leaflet map instance.
 * @param {() => void} callback - Function to call when the user pans.
 */
export function onUserPan(map, callback) {
  map.on('dragend', callback);
}

/**
 * Add a nearby user marker (green CircleMarker) to the map with a tooltip.
 * @param {L.Map} map - The Leaflet map instance.
 * @param {number} lat - Latitude.
 * @param {number} lng - Longitude.
 * @param {string} displayName - The nearby user's display name.
 * @returns {L.CircleMarker} The created CircleMarker.
 */
export function addNearbyUserMarker(map, lat, lng, displayName) {
  const marker = L.circleMarker([lat, lng], {
    radius: MARKER_RADIUS,
    color: NEARBY_MARKER_COLOR,
    fillColor: NEARBY_MARKER_COLOR,
    fillOpacity: 1,
  });
  marker.bindTooltip(displayName);
  marker.addTo(map);
  return marker;
}

/**
 * Move an existing nearby user marker to new coordinates.
 * @param {L.CircleMarker} marker - The CircleMarker to update.
 * @param {number} lat - New latitude.
 * @param {number} lng - New longitude.
 */
export function updateNearbyUserMarker(marker, lat, lng) {
  marker.setLatLng([lat, lng]);
}

/**
 * Remove a nearby user marker from the map.
 * @param {L.CircleMarker} marker - The CircleMarker to remove.
 */
export function removeNearbyUserMarker(marker) {
  marker.remove();
}
