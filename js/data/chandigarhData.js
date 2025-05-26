// js/data/chandigarhData.js

// --- Chandigarh Sector Data (Approximate Centers) ---
export const chandigarhSectors = [
    { name: "Sector 1 (Capitol Complex)", lat: 30.742, lng: 76.784 }, { name: "Sector 2", lat: 30.749, lng: 76.790 },
    { name: "Sector 3", lat: 30.745, lng: 76.794 }, { name: "Sector 4", lat: 30.750, lng: 76.799 },
    { name: "Sector 5", lat: 30.755, lng: 76.804 }, { name: "Sector 6", lat: 30.762, lng: 76.809 },
    { name: "Sector 7", lat: 30.738, lng: 76.799 }, { name: "Sector 8", lat: 30.742, lng: 76.804 },
    { name: "Sector 9", lat: 30.736, lng: 76.788 }, { name: "Sector 10", lat: 30.739, lng: 76.784 },
    { name: "Sector 11", lat: 30.744, lng: 76.778 }, { name: "Sector 12 (PGIMER)", lat: 30.758, lng: 76.767 },
    { name: "Sector 14 (Panjab University)", lat: 30.755, lng: 76.760 }, { name: "Sector 15", lat: 30.749, lng: 76.772 },
    { name: "Sector 16", lat: 30.738, lng: 76.778 }, { name: "Sector 17 (City Center)", lat: 30.733, lng: 76.781 },
    { name: "Sector 18", lat: 30.730, lng: 76.790 }, { name: "Sector 19", lat: 30.725, lng: 76.795 },
    { name: "Sector 20", lat: 30.720, lng: 76.800 }, { name: "Sector 21", lat: 30.716, lng: 76.793 },
    { name: "Sector 22", lat: 30.730, lng: 76.774 }, { name: "Sector 23", lat: 30.740, lng: 76.765 },
    { name: "Sector 24", lat: 30.749, lng: 76.758 }, { name: "Sector 25", lat: 30.755, lng: 76.750 },
    { name: "Sector 26 (Grain Market)", lat: 30.735, lng: 76.805 }, { name: "Sector 27", lat: 30.720, lng: 76.787 },
    { name: "Sector 28", lat: 30.715, lng: 76.782 }, { name: "Sector 29", lat: 30.708, lng: 76.788 },
    { name: "Sector 30", lat: 30.704, lng: 76.781 }, { name: "Sector 31", lat: 30.698, lng: 76.795 },
    { name: "Sector 32", lat: 30.710, lng: 76.775 }, { name: "Sector 33", lat: 30.718, lng: 76.770 },
    { name: "Sector 34", lat: 30.725, lng: 76.765 }, { name: "Sector 35", lat: 30.730, lng: 76.760 },
    { name: "Sector 36", lat: 30.738, lng: 76.755 }, { name: "Sector 37", lat: 30.745, lng: 76.750 },
    { name: "Sector 38", lat: 30.750, lng: 76.743 }, { name: "Sector 38 West", lat: 30.748, lng: 76.735 },
    { name: "Sector 39", lat: 30.760, lng: 76.738 }, { name: "Sector 40", lat: 30.755, lng: 76.730 },
    { name: "Sector 41", lat: 30.748, lng: 76.725 }, { name: "Sector 42", lat: 30.735, lng: 76.748 },
    { name: "Sector 43 (ISBT)", lat: 30.728, lng: 76.755 }, { name: "Sector 44", lat: 30.720, lng: 76.760 },
    { name: "Sector 45", lat: 30.715, lng: 76.765 }, { name: "Sector 46", lat: 30.708, lng: 76.770 },
    { name: "Sector 47", lat: 30.700, lng: 76.775 }, { name: "Sector 48", lat: 30.690, lng: 76.765 },
    { name: "Sector 49", lat: 30.695, lng: 76.755 }, { name: "Sector 50", lat: 30.705, lng: 76.750 },
    { name: "Sector 51", lat: 30.715, lng: 76.745 }, { name: "Sector 52", lat: 30.725, lng: 76.740 },
    { name: "Sector 53", lat: 30.700, lng: 76.730 }, { name: "Sector 54 (Mohali)", lat: 30.690, lng: 76.720 },
    { name: "Sector 55", lat: 30.730, lng: 76.725 }, { name: "Sector 56", lat: 30.740, lng: 76.720 },
    { name: "Industrial Area Phase 1", lat: 30.710, lng: 76.790 }, { name: "Industrial Area Phase 2", lat: 30.695, lng: 76.780 },
    { name: "Manimajra", lat: 30.725, lng: 76.835 }, { name: "Dhanas", lat: 30.760, lng: 76.720 },
];

// --- Chandigarh Boundary ---
export const chandigarhGeoJsonPolygon = [ // [lng, lat]
    [76.6827, 30.7683], [76.7031, 30.7925], [76.7327, 30.8067], [76.7639, 30.8105],
    [76.7958, 30.8063], [76.8234, 30.7909], [76.8404, 30.7688], [76.8468, 30.7406],
    [76.8397, 30.7123], [76.8227, 30.6882], [76.7915, 30.6693], [76.7624, 30.6635],
    [76.7312, 30.6698], [76.7000, 30.6861], [76.6789, 30.7153], [76.6765, 30.7432],
    [76.6827, 30.7683]
];
export const chandigarhLeafletCoords = chandigarhGeoJsonPolygon.map(p => [p[1], p[0]]); // [lat, lng] for Leaflet

let minLat = 90, maxLat = -90, minLng = 180, maxLng = -180;
chandigarhLeafletCoords.forEach(coord => {
    if (coord[0] < minLat) minLat = coord[0];
    if (coord[0] > maxLat) maxLat = coord[0];
    if (coord[1] < minLng) minLng = coord[1];
    if (coord[1] > maxLng) maxLng = coord[1];
});

export const chandigarhBounds = L.latLngBounds(L.latLng(minLat, minLng), L.latLng(maxLat, maxLng));
export const chandigarhCenter = chandigarhBounds.getCenter();

// Default dark store location for simulation (Sector 17)
export const defaultDarkStoreLocationSim = { lat: 30.7333, lng: 76.7794 };

// Simulation constants (can be moved to simulation.js if only used there)
export const SIMULATION_STEP_INTERVAL_MS = 1000;
export const MINUTES_PER_SIMULATION_STEP = 1;
export const DYNAMIC_TRAFFIC_UPDATE_INTERVAL = 15; // in simulation minutes
