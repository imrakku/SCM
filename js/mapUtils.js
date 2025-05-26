// js/mapUtils.js
import { chandigarhLeafletCoords, chandigarhCenter } from './data/chandigarhData.js';

// Store map instances here to avoid polluting global scope
let mapInstances = {
    clustering: null,
    simulation: null,
    demandProfiles: null,
    workforceOptimization: null,
};

/**
 * Initializes or re-initializes a Leaflet map.
 * @param {string} mapId The ID of the HTML element for the map.
 * @param {object} center LatLngLiteral for the map center.
 * @param {number} zoom Initial zoom level.
 * @param {string} mapKey A key to store the map instance (e.g., 'clustering').
 * @returns {L.Map} The Leaflet map instance.
 */
export function initializeMap(mapId, center, zoom, mapKey) {
    if (mapInstances[mapKey]) {
        mapInstances[mapKey].remove();
        mapInstances[mapKey] = null;
    }
    const map = L.map(mapId).setView([center.lat, center.lng], zoom);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        errorTileUrl: 'https://placehold.co/256x256/e2e8f0/cbd5e1?text=Map+Tile+Error' // Placeholder for tile errors
    }).on('tileerror', function(e){
        console.error('Tile load error for map', mapKey, ':', e.tile, e.error);
    }).addTo(map);

    // Add Chandigarh boundary to all maps by default
    L.polygon(chandigarhLeafletCoords, {
        color: '#334155', // slate-700
        weight: 3,
        fill: false,
        dashArray: '5, 5',
        interactive: false
    }).addTo(map);

    mapInstances[mapKey] = map;
    return map;
}

export function getMapInstance(mapKey) {
    return mapInstances[mapKey];
}

/**
 * Calculates the Haversine distance between two points in kilometers.
 * @param {{lat: number, lng: number}} coords1 - Latitude and longitude of the first point.
 * @param {{lat: number, lng: number}} coords2 - Latitude and longitude of the second point.
 * @returns {number} Distance in kilometers.
 */
export function getDistanceKm(coords1, coords2) {
    if (!coords1 || !coords2 || typeof coords1.lat !== 'number' || typeof coords1.lng !== 'number' || typeof coords2.lat !== 'number' || typeof coords2.lng !== 'number') return Infinity;
    const latLng1 = L.latLng(coords1.lat, coords1.lng);
    const latLng2 = L.latLng(coords2.lat, coords2.lng);
    return latLng1.distanceTo(latLng2) / 1000; // distanceTo returns meters
}

/**
 * Calculates a simple Euclidean distance (approximation, faster for clustering).
 * @param {{lat: number, lng: number}} p1
 * @param {{lat: number, lng: number}} p2
 * @returns {number} Approximate distance.
 */
export function getDistanceSimple(p1, p2) {
    if (!p1 || !p2 || typeof p1.lat !== 'number' || typeof p1.lng !== 'number' || typeof p2.lat !== 'number' || typeof p2.lng !== 'number') return Infinity;
    const dLat = p1.lat - p2.lat;
    const dLng = p1.lng - p2.lng;
    return Math.sqrt(dLat * dLat + dLng * dLng);
}

/**
 * Checks if a point is inside a polygon.
 * @param {[number, number]} point - [lng, lat]
 * @param {Array<[number, number]>} polygonGeoJsonCoords - Array of [lng, lat]
 * @returns {boolean} True if the point is inside, false otherwise.
 */
export function isPointInPolygon(point, polygonGeoJsonCoords) {
    let x = point[0], y = point[1]; // point is [lng, lat]
    let inside = false;
    for (let i = 0, j = polygonGeoJsonCoords.length - 1; i < polygonGeoJsonCoords.length; j = i++) {
        let xi = polygonGeoJsonCoords[i][0], yi = polygonGeoJsonCoords[i][1];
        let xj = polygonGeoJsonCoords[j][0], yj = polygonGeoJsonCoords[j][1];
        let intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
        if (intersect) inside = !inside;
    }
    return inside;
}

/**
 * Creates a custom HTML divIcon for agents.
 * @param {number|string} agentId
 * @param {boolean} isBusy
 * @returns {L.DivIcon}
 */
export function createAgentIcon(agentId, isBusy) {
    const colorClass = isBusy ? 'agent-busy' : 'agent-available';
    return L.divIcon({
        html: `<div class="marker-icon-base ${colorClass}">${agentId}</div>`,
        className: '', // Important to prevent default Leaflet icon styles interfering
        iconSize: [28, 28],
        iconAnchor: [14, 14], // Center of the icon
        popupAnchor: [0, -14] // Popup above the icon
    });
}

/**
 * Creates a custom HTML divIcon for orders.
 * @param {number|string} orderId
 * @param {string} status - e.g., 'pending', 'assigned'
 * @returns {L.DivIcon}
 */
export function createOrderIcon(orderId, status) {
    let colorClass = 'order-pending'; // Default
    if (status === 'assigned' || status === 'assigned_to_agent_going_to_store' || status === 'at_store_with_agent' || status === 'out_for_delivery') {
        colorClass = 'order-assigned';
    }
    // Add more status-to-color mappings if needed
    return L.divIcon({
        html: `<div class="marker-icon-base ${colorClass}">${orderId}</div>`,
        className: '',
        iconSize: [28, 28],
        iconAnchor: [14, 14],
        popupAnchor: [0, -14]
    });
}

// Standard red marker icon for dark stores (as used in the original)
export const darkStoreIcon = L.icon({
    iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41]
});

/**
 * Generates random waypoints between a start and end point.
 * Used to simulate more realistic, non-straight paths.
 * @param {{lat: number, lng: number}} start Start coordinates.
 * @param {{lat: number, lng: number}} end End coordinates.
 * @param {number} numWaypoints Number of waypoints to generate.
 * @returns {Array<{lat: number, lng: number}>} Array of waypoint coordinates.
 */
export function generateWaypoints(start, end, numWaypoints) {
    const waypoints = [];
    if (!start || !end || typeof start.lat !== 'number' || typeof start.lng !== 'number' ||
        typeof end.lat !== 'number' || typeof end.lng !== 'number') return waypoints;

    const legDistanceKm = getDistanceKm(start, end);
    if (legDistanceKm < 0.2 || numWaypoints === 0) return waypoints; // No waypoints for very short distances or if 0 requested

    for (let i = 1; i <= numWaypoints; i++) {
        const fraction = i / (numWaypoints + 1);
        const midLat = start.lat + (end.lat - start.lat) * fraction;
        const midLng = start.lng + (end.lng - start.lng) * fraction;

        // Add some random offset to make routes less straight
        // The offset should be proportional to the leg distance but capped
        const maxOffsetDegrees = Math.min(0.005, legDistanceKm * 0.0001); // Heuristic for offset
        const offsetX = (Math.random() - 0.5) * 2 * maxOffsetDegrees;
        const offsetY = (Math.random() - 0.5) * 2 * maxOffsetDegrees;

        waypoints.push({ lat: midLat + offsetY, lng: midLng + offsetX });
    }
    return waypoints;
}
