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
    const latLng2 = L.latLng(coords2.lat, coords2.lng);
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

    // A modern scooter SVG icon, placed inside a colored circle for better visibility.
    const scooterSvg = `
        <div style="background-color: ${riderFillColor}; border-radius: 50%; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; box-shadow: 0 2px 5px rgba(0,0,0,0.3);">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="white" width="20px" height="20px">
                <path d="M19.49 5.51a.75.75 0 0 0-1.06-1.06L16 6.88V5.25a.75.75 0 0 0-1.5 0v3a.75.75 0 0 0 .75.75h3a.75.75 0 0 0 0-1.5h-1.63l2.43-2.43ZM22 12.5a1 1 0 0 1-2 0c0-2.22-1.21-4.15-3-5.19V6a1 1 0 0 0-2 0v1.32a6.996 6.996 0 0 0-11.95 2.43A.75.75 0 0 0 4 11.25h1.1a5.5 5.5 0 0 1 10.85-1.92A5.5 5.5 0 0 1 15.5 18H8.25a.75.75 0 0 0 0 1.5h3.11l-1.72 3.44a.75.75 0 1 0 1.34.67L12.5 20.42l1.52 3.19a.75.75 0 1 0 1.36-.65L13.89 20h2.86a.75.75 0 0 0 0-1.5h-2.14l.89-1.87A7.014 7.014 0 0 0 22 12.5Z"/>
                <circle cx="6.5" cy="18" r="2.5"/>
            </svg>
        </div>`;

    return L.divIcon({
        html: scooterSvg,
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

    // A modern package SVG icon.
    const packageSvg = `
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" style="width: 28px; height: 28px; filter: drop-shadow(0 2px 3px rgba(0,0,0,0.3));">
            <path d="M12.0001 1.5C12.2132 1.5 12.4132 1.59407 12.548 1.75224L22.548 13.7522C22.645 13.8687 22.7042 14.0177 22.7163 14.1729L22.9922 18.0478C23.0083 18.2619 22.9423 18.4735 22.808 18.6443L13.308 22.8943C12.5463 23.2323 11.6963 23.2203 10.9447 22.8594L1.44466 18.6094C1.29837 18.5273 1.18374 18.3949 1.12158 18.237L0.845663 14.362C0.828602 14.1458 0.892602 13.931 1.02516 13.7594L11.0252 1.75938C11.1622 1.59859 11.3632 1.5 11.5751 1.5H12.0001Z" fill="${fillColor}"/>
            <path d="M12.0001 1.5L1.02516 13.7594C1.34116 13.8704 1.57516 14.1224 1.63116 14.437L3.06516 22.187C3.12116 22.497 3.35916 22.744 3.67516 22.849L12.0001 2.25L20.3252 22.849C20.6412 22.744 20.8792 22.497 20.9352 22.187L22.3692 14.437C22.4252 14.1224 22.6592 13.8704 22.9752 13.7594L12.0001 1.5Z" fill="rgba(255,255,255,0.3)"/>
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
