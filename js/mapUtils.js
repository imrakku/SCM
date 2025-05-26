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

export function createAgentIcon(agentId, isBusy) {
    const colorClass = isBusy ? 'agent-busy' : 'agent-available';
    return L.divIcon({
        html: `<div class="marker-icon-base ${colorClass}">${agentId}</div>`,
        className: '',
        iconSize: [28, 28],
        iconAnchor: [14, 14],
        popupAnchor: [0, -14]
    });
}

/**
 * Creates a custom HTML divIcon for orders, now as a star.
 * @param {number|string} orderId
 * @param {string} status - e.g., 'pending', 'assigned'
 * @returns {L.DivIcon}
 */
export function createOrderIcon(orderId, status) {
    let starFillColor = '#16a34a'; // Default green for 'pending' (from .order-pending)
    let starStrokeColor = '#059669'; // A slightly darker green for stroke
    let textColor = 'white';
    const iconSize = 30; // Size of the SVG icon

    if (status === 'assigned' || status === 'assigned_to_agent_going_to_store' || status === 'at_store_with_agent' || status === 'out_for_delivery') {
        starFillColor = '#facc15'; // Yellow for 'assigned' states (from .order-assigned)
        starStrokeColor = '#eab308'; // A slightly darker yellow for stroke
        textColor = '#713f12'; // Darker text for yellow background
    }

    // A simple 5-pointed star SVG. You can adjust points for different star shapes.
    // The viewBox is important for scaling. Points are relative to this box.
    // "transform: translate(1px, 1px)" is a small hack to ensure stroke doesn't get cut off sometimes.
    const svgStarHtml = `
        <svg width="${iconSize}" height="${iconSize}" viewBox="0 0 24 24" fill="${starFillColor}" stroke="${starStrokeColor}" stroke-width="1.5" style="transform: translate(1px, 1px);">
            <path d="M12 .587l3.668 7.568 8.332 1.151-6.064 5.828 1.48 8.279-7.416-3.966-7.417 3.966 1.481-8.279-6.064-5.828 8.332-1.151z"/>
            <text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="${textColor}" font-size="10px" font-family="'Inter', sans-serif" font-weight="bold">
                ${orderId}
            </text>
        </svg>
    `;

    return L.divIcon({
        html: svgStarHtml,
        className: 'order-star-marker', // Add a class for potential further CSS styling if needed
        iconSize: [iconSize + 2, iconSize + 2], // Add a bit for the stroke
        iconAnchor: [(iconSize + 2) / 2, (iconSize + 2) / 2], // Center of the icon
        popupAnchor: [0, -(iconSize / 2 + 1)] // Popup above the icon
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
