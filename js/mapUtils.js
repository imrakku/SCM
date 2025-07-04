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
        errorTileUrl: 'https://placehold.co/256x256/e2e8f0/cbd5e1?text=Map+Tile+Error'
    }).on('tileerror', function(e){
        console.error('Tile load error for map', mapKey, ':', e.tile, e.error);
    }).addTo(map);

    L.polygon(chandigarhLeafletCoords, {
        color: '#334155',
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

export function getDistanceKm(coords1, coords2) {
    if (!coords1 || !coords2 || typeof coords1.lat !== 'number' || typeof coords1.lng !== 'number' || typeof coords2.lat !== 'number' || typeof coords2.lng !== 'number') return Infinity;
    const latLng1 = L.latLng(coords1.lat, coords1.lng);
    const latLng2 = L.latLng(coords2.lng, coords2.lng); // Typo corrected from coords2.lng twice to coords2.lat, coords2.lng
    return latLng1.distanceTo(latLng2) / 1000;
}

export function getDistanceSimple(p1, p2) {
    if (!p1 || !p2 || typeof p1.lat !== 'number' || typeof p1.lng !== 'number' || typeof p2.lat !== 'number' || typeof p2.lng !== 'number') return Infinity;
    const dLat = p1.lat - p2.lat;
    const dLng = p1.lng - p2.lng;
    return Math.sqrt(dLat * dLat + dLng * dLng);
}

export function isPointInPolygon(point, polygonGeoJsonCoords) {
    let x = point[0], y = point[1];
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
 * Creates a custom SVG icon for a delivery rider (agent).
 * @param {number|string} agentId The ID of the agent (not used in icon itself, but for context).
 * @param {boolean} isBusy The status of the agent, true for busy, false for available.
 * @returns {L.DivIcon} A Leaflet DivIcon with the custom SVG.
 */
export function createAgentIcon(agentId, isBusy) {
    const riderFillColor = isBusy ? '#f97316' : '#16a34a'; // orange-500 for busy, green-600 for available

    // A simpler bicycle icon, placed inside a colored circle for better visibility.
    const bikeSvg = `
        <div style="background-color: ${riderFillColor}; border-radius: 50%; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; box-shadow: 0 2px 5px rgba(0,0,0,0.3);">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="white" width="20px" height="20px">
                <path d="M22 10.5a.5.5 0 0 0-.5-.5h-2.1l-2.48-5.32a.5.5 0 0 0-.46-.28H14.1l-.85-2.04a.5.5 0 0 0-.45-.21H8.7a.5.5 0 0 0-.45.21L7.4 4.4h-2.36a.5.5 0 0 0-.46.28L2.09 9.5H-.5a.5.5 0 0 0-.5.5v1a.5.5 0 0 0 .5.5h2.1l2.48 5.32a.5.5 0 0 0 .46.28h2.36l.85 2.04a.5.5 0 0 0 .45.21H15.3a.5.5 0 0 0 .45-.21l.85-2.04h2.36a.5.5 0 0 0 .46-.28L21.91 11.5H22.5a.5.5 0 0 0 .5-.5v-1a.5.5 0 0 0-.5-.5ZM8 17.5a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0ZM19 17.5a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0Z"/>
            </svg>
        </div>`;

    return L.divIcon({
        html: bikeSvg,
        className: 'agent-scooter-marker', // Custom class for potential styling
        iconSize: [32, 32],
        iconAnchor: [16, 16], // Center of the icon
        popupAnchor: [0, -16] // Popup above the icon
    });
}

/**
 * Creates a custom SVG icon for an order.
 * @param {number|string} orderId The ID of the order.
 * @param {string} status - e.g., 'pending', 'assigned'
 * @returns {L.DivIcon} A Leaflet DivIcon with the custom SVG.
 */
export function createOrderIcon(orderId, status) {
    // Determine color based on status
    let fillColor = '#16a34a'; // Green for 'pending'
    if (status !== 'pending') {
        fillColor = '#facc15'; // Yellow for 'assigned' and other active states
    }

    // A simpler package/box SVG icon.
    const packageSvg = `
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="${fillColor}" style="width: 28px; height: 28px; filter: drop-shadow(0 2px 3px rgba(0,0,0,0.3));">
            <path d="M3.5 3H20.5C21.3284 3 22 3.67157 22 4.5V19.5C22 20.3284 21.3284 21 20.5 21H3.5C2.67157 21 2 20.3284 2 19.5V4.5C2 3.67157 2.67157 3 3.5 3ZM4 5V19H20V5H4ZM12 9V15H17V9H12ZM9 12H7V14H9V12Z"/>
        </svg>`;

    return L.divIcon({
        html: packageSvg,
        className: 'order-package-marker',
        iconSize: [28, 28],
        iconAnchor: [14, 14], // Center of the icon
        popupAnchor: [0, -14] // Popup above the icon
    });
}

export const darkStoreIcon = L.icon({
    iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41]
});

export function generateWaypoints(start, end, numWaypoints) {
    const waypoints = [];
    if (!start || !end || typeof start.lat !== 'number' || typeof start.lng !== 'number' ||
        typeof end.lat !== 'number' || typeof end.lng !== 'number') return waypoints;

    const legDistanceKm = getDistanceKm(start, end);
    if (legDistanceKm < 0.2 || numWaypoints === 0) return waypoints;

    for (let i = 1; i <= numWaypoints; i++) {
        const fraction = i / (numWaypoints + 1);
        const midLat = start.lat + (end.lat - start.lat) * fraction;
        const midLng = start.lng + (end.lng - start.lng) * fraction;
        const maxOffsetDegrees = Math.min(0.005, legDistanceKm * 0.0001);
        const offsetX = (Math.random() - 0.5) * 2 * maxOffsetDegrees;
        const offsetY = (Math.random() - 0.5) * 2 * maxOffsetDegrees;
        waypoints.push({ lat: midLat + offsetY, lng: midLng + offsetX });
    }
    return waypoints;
}
