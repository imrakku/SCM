// js/modules/clustering.js
import { chandigarhGeoJsonPolygon, chandigarhLeafletCoords, chandigarhCenter } from '../data/chandigarhData.js';
import { initializeMap, getMapInstance, getDistanceSimple, getDistanceKm, isPointInPolygon, darkStoreIcon as commonDarkStoreIcon } from '../mapUtils.js';
import { calculateStdDev } from '../chartUtils.js'; // For stats
import { populateDarkStoreSelectorForOpt as updateWorkforceOptSelector } from './workforceOpt.js'; // To update selector in another module

// Module-specific state
let clusteringMap; // Leaflet map instance for this section
let demandPointsLayerGroup;
let darkStoreMarkersLayerGroup;
let voronoiLayerGroup;
let cityBoundaryOutlineLayer; // Keep a reference if added specifically here
let orderToStoreLinesLayerGroup;

export let globalClusteredDarkStores = []; // Export if other modules need direct access

// DOM Elements
let numBackgroundOrdersInput, numHotspotOrdersInput, numDarkStoresClusteringInput;
let totalOrdersDisplayClusteringEl, numDarkStoresDisplayEl;
let regenerateClusteringBtnEl, showOrderConnectionsToggleEl;
let clusteringStatsDivEl, overallAvgClusterDistanceEl, overallMinClusterDistanceEl, overallMaxClusterDistanceEl, overallStdDevClusterDistanceEl;

/**
 * Initializes the clustering section: sets up the map, DOM elements, and event listeners.
 */
export function initializeClusteringSection() {
    // Initialize map
    clusteringMap = initializeMap('clusteringMapViz', chandigarhCenter, 12, 'clustering');

    // Initialize layer groups
    voronoiLayerGroup = L.layerGroup().addTo(clusteringMap);
    demandPointsLayerGroup = L.layerGroup().addTo(clusteringMap);
    darkStoreMarkersLayerGroup = L.layerGroup().addTo(clusteringMap);
    orderToStoreLinesLayerGroup = L.layerGroup(); // Not added to map by default

    // Cache DOM elements
    numBackgroundOrdersInput = document.getElementById('numBackgroundOrders');
    numHotspotOrdersInput = document.getElementById('numHotspotOrders');
    numDarkStoresClusteringInput = document.getElementById('numDarkStoresForClustering');
    totalOrdersDisplayClusteringEl = document.getElementById('totalOrdersDisplayClustering');
    numDarkStoresDisplayEl = document.getElementById('numDarkStoresDisplay');
    regenerateClusteringBtnEl = document.getElementById('regenerateClusteringBtn');
    showOrderConnectionsToggleEl = document.getElementById('showOrderConnectionsToggle');
    clusteringStatsDivEl = document.getElementById('clusteringStats');
    overallAvgClusterDistanceEl = document.getElementById('overallAvgClusterDistance');
    overallMinClusterDistanceEl = document.getElementById('overallMinClusterDistance');
    overallMaxClusterDistanceEl = document.getElementById('overallMaxClusterDistance');
    overallStdDevClusterDistanceEl = document.getElementById('overallStdDevClusterDistance');


    // Event Listeners for clustering controls
    numBackgroundOrdersInput?.addEventListener('input', updateTotalOrderDisplayClustering);
    numHotspotOrdersInput?.addEventListener('input', updateTotalOrderDisplayClustering);
    numDarkStoresClusteringInput?.addEventListener('input', () => {
        if (numDarkStoresDisplayEl) numDarkStoresDisplayEl.textContent = numDarkStoresClusteringInput.value;
    });

    regenerateClusteringBtnEl?.addEventListener('click', () => {
        generateAndDisplayClusteringData();
    });

    showOrderConnectionsToggleEl?.addEventListener('change', () => {
        if (showOrderConnectionsToggleEl.checked) {
            if (!clusteringMap.hasLayer(orderToStoreLinesLayerGroup)) {
                orderToStoreLinesLayerGroup.addTo(clusteringMap);
            }
        } else {
            if (clusteringMap.hasLayer(orderToStoreLinesLayerGroup)) {
                clusteringMap.removeLayer(orderToStoreLinesLayerGroup);
            }
        }
    });

    // Initial setup
    updateTotalOrderDisplayClustering();
    if (numDarkStoresDisplayEl && numDarkStoresClusteringInput) {
        numDarkStoresDisplayEl.textContent = numDarkStoresClusteringInput.value;
    }
    generateAndDisplayClusteringData(); // Initial generation
}

function updateTotalOrderDisplayClustering() {
    if (numBackgroundOrdersInput && numHotspotOrdersInput && totalOrdersDisplayClusteringEl) {
        const bgCount = parseInt(numBackgroundOrdersInput.value) || 0;
        const hsCount = parseInt(numHotspotOrdersInput.value) || 0;
        totalOrdersDisplayClusteringEl.textContent = bgCount + hsCount;
    }
}

/**
 * Generates random points uniformly within a given polygon.
 * @param {number} numPoints Number of points to generate.
 * @param {Array<[number, number]>} polygonGeoJsonCoords Polygon boundary as [lng, lat] pairs.
 * @returns {Array<{lat: number, lng: number}>} Array of generated points.
 */
function generateUniformPointInPolygon(numPoints, polygonGeoJsonCoords) {
    const points = [];
    if (numPoints <= 0) return points;

    let attempts = 0;
    const localBounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
    polygonGeoJsonCoords.forEach(p => {
        if (p[0] < localBounds.minX) localBounds.minX = p[0];
        if (p[0] > localBounds.maxX) localBounds.maxX = p[0];
        if (p[1] < localBounds.minY) localBounds.minY = p[1];
        if (p[1] > localBounds.maxY) localBounds.maxY = p[1];
    });

    while (points.length < numPoints && attempts < numPoints * 500) {
        attempts++;
        const lng = Math.random() * (localBounds.maxX - localBounds.minX) + localBounds.minX;
        const lat = Math.random() * (localBounds.maxY - localBounds.minY) + localBounds.minY;
        if (isPointInPolygon([lng, lat], polygonGeoJsonCoords)) {
            points.push({ lat, lng });
        }
    }
    if (points.length < numPoints) {
        console.warn(`[Clustering] Only generated ${points.length}/${numPoints} uniform points within polygon after ${attempts} attempts.`);
    }
    return points;
}

/**
 * Generates points using a Gaussian (normal) distribution around a center, constrained by a polygon.
 * @param {{lat: number, lng: number}} center Center of the distribution.
 * @param {number} sigmaDegrees Standard deviation in degrees (approximate).
 * @param {number} numPoints Number of points to generate.
 * @param {Array<[number, number]>} polygonGeoJsonCoords Polygon boundary.
 * @returns {Array<{lat: number, lng: number}>} Array of generated points.
 */
function generateGaussianPointsInPolygon(center, sigmaDegrees, numPoints, polygonGeoJsonCoords) {
    const points = [];
    if (numPoints <= 0) return points;
    let attempts = 0;
    while (points.length < numPoints && attempts < numPoints * 500) {
        attempts++;
        let u, v, s;
        do { u = Math.random() * 2 - 1; v = Math.random() * 2 - 1; s = u * u + v * v; } while (s >= 1 || s === 0);
        const mul = Math.sqrt(-2.0 * Math.log(s) / s);
        const lng = center.lng + (sigmaDegrees * u * mul);
        const lat = center.lat + (sigmaDegrees * v * mul);
        if (isPointInPolygon([lng, lat], polygonGeoJsonCoords)) {
            points.push({ lat, lng });
        }
    }
    if (points.length < numPoints) {
        console.warn(`[Clustering] Only generated ${points.length}/${numPoints} Gaussian points for center ${JSON.stringify(center)} after ${attempts} attempts.`);
    }
    return points;
}

/**
 * Performs K-Means clustering on a set of points.
 * @param {Array<{lat: number, lng: number}>} points Array of points to cluster.
 * @param {number} k Number of clusters (centroids) to find.
 * @param {number} [maxIterations=20] Maximum number of iterations.
 * @returns {Array<{lat: number, lng: number}>} Array of centroid coordinates.
 */
function kMeansClustering(points, k, maxIterations = 20) {
    if (points.length === 0) return [];
    if (points.length < k) { k = Math.max(1, points.length); }

    let centroids = [];
    if (k > 0) {
        // Initialize centroids: pick k points randomly or spaced out
        centroids = points.slice(0, k).map(p => ({ ...p })); // Simple initialization
        if (points.length > k) { // More robust spaced initialization
            centroids = [];
            const step = Math.floor(points.length / k);
            for (let i = 0; i < k; i++) centroids.push({ ...points[i * step] });
        }
    } else {
        return [];
    }

    let assignments = [];
    for (let iter = 0; iter < maxIterations; iter++) {
        // Assign points to the nearest centroid
        assignments = points.map(point => {
            let minDist = Infinity, closestCentroidIndex = 0;
            centroids.forEach((centroid, index) => {
                if (!centroid || typeof centroid.lat !== 'number' || typeof centroid.lng !== 'number') { return; }
                const dist = getDistanceSimple(point, centroid);
                if (dist < minDist) { minDist = dist; closestCentroidIndex = index; }
            });
            return closestCentroidIndex;
        });

        // Recalculate centroids
        const newCentroids = [];
        for (let i = 0; i < k; i++) {
            const clusterPoints = points.filter((_, index) => assignments[index] === i);
            if (clusterPoints.length > 0) {
                const sumLat = clusterPoints.reduce((sum, p) => sum + p.lat, 0);
                const sumLng = clusterPoints.reduce((sum, p) => sum + p.lng, 0);
                newCentroids.push({ lat: sumLat / clusterPoints.length, lng: sumLng / clusterPoints.length });
            } else {
                // If a cluster becomes empty, re-initialize its centroid (e.g., random point or existing centroid)
                let fallbackPtArray = generateUniformPointInPolygon(1, chandigarhGeoJsonPolygon);
                let fallbackCentroid = centroids[i] || (fallbackPtArray.length > 0 ? fallbackPtArray[0] : { lat: chandigarhCenter.lat, lng: chandigarhCenter.lng });
                newCentroids.push(fallbackCentroid);
            }
        }

        // Check for convergence
        let converged = true;
        if (newCentroids.length !== centroids.length) { converged = false; }
        else {
            for (let i = 0; i < k; i++) {
                if (!centroids[i] || !newCentroids[i] || typeof centroids[i].lat !== 'number' || typeof newCentroids[i].lat !== 'number' || getDistanceSimple(centroids[i], newCentroids[i]) > 0.0001) {
                    converged = false; break;
                }
            }
        }
        centroids = newCentroids;
        if (converged) break;
    }
    return centroids;
}


/**
 * Main function to generate and display clustering data on the map.
 */
function generateAndDisplayClusteringData() {
    if (!clusteringMap || !demandPointsLayerGroup || !darkStoreMarkersLayerGroup || !voronoiLayerGroup) {
        console.error("Clustering map or critical layer group not initialized.");
        return;
    }

    // Clear previous layers
    demandPointsLayerGroup.clearLayers();
    darkStoreMarkersLayerGroup.clearLayers();
    voronoiLayerGroup.clearLayers();
    if (orderToStoreLinesLayerGroup) orderToStoreLinesLayerGroup.clearLayers();
    globalClusteredDarkStores = []; // Reset global array

    if (clusteringStatsDivEl) clusteringStatsDivEl.innerHTML = '<p class="italic text-slate-500 md:col-span-2 lg:col-span-3 text-center">Generating cluster statistics...</p>';

    const backgroundCount = parseInt(numBackgroundOrdersInput.value) || 700;
    const hotspotCount = parseInt(numHotspotOrdersInput.value) || 300;
    const totalPoints = backgroundCount + hotspotCount;
    if (totalOrdersDisplayClusteringEl) totalOrdersDisplayClusteringEl.textContent = totalPoints;

    const numDarkStores = parseInt(numDarkStoresClusteringInput.value) || 10;
    if (numDarkStoresDisplayEl) numDarkStoresDisplayEl.textContent = numDarkStores;

    // Generate demand points
    let allOrderPoints = [];
    generateUniformPointInPolygon(backgroundCount, chandigarhGeoJsonPolygon).forEach(p => {
        allOrderPoints.push({ ...p, type: 'background' });
    });

    const numHotspotCenters = 4; // Example: 4 hotspot areas
    const pointsPerHotspot = hotspotCount > 0 && numHotspotCenters > 0 ? Math.floor(hotspotCount / numHotspotCenters) : 0;
    if (pointsPerHotspot > 0) {
        const hotspotCenterCoords = generateUniformPointInPolygon(numHotspotCenters, chandigarhGeoJsonPolygon);
        hotspotCenterCoords.forEach(center => {
            generateGaussianPointsInPolygon(center, 0.008, pointsPerHotspot, chandigarhGeoJsonPolygon).forEach(p => {
                allOrderPoints.push({ ...p, type: 'hotspot' });
            });
        });
    }
    // Ensure total points match if generation was slightly off
    let currentGenerated = allOrderPoints.length;
    if (currentGenerated < totalPoints && (totalPoints - currentGenerated) > 0) {
        generateUniformPointInPolygon(totalPoints - currentGenerated, chandigarhGeoJsonPolygon).forEach(p => {
            allOrderPoints.push({ ...p, type: 'background' });
        });
    }
    allOrderPoints = allOrderPoints.slice(0, totalPoints); // Trim if over-generated

    // K-Means Clustering
    const kMeansDarkStoreLocations = kMeansClustering(allOrderPoints, numDarkStores);

    // Add dark store markers and populate global list
    const dcPointsForVoronoi = []; // For d3.Delaunay, expects [lng, lat]
    kMeansDarkStoreLocations.forEach((store, index) => {
        if (store && typeof store.lat === 'number' && typeof store.lng === 'number') {
            L.marker([store.lat, store.lng], { icon: commonDarkStoreIcon })
                .bindPopup(`<b>Dark Store ${index + 1}</b><br>Location: ${store.lat.toFixed(4)}, ${store.lng.toFixed(4)}`)
                .addTo(darkStoreMarkersLayerGroup);
            dcPointsForVoronoi.push([store.lng, store.lat]);
            globalClusteredDarkStores.push({ id: index, name: `Dark Store ${index + 1}`, lat: store.lat, lng: store.lng });
        }
    });
    updateWorkforceOptSelector(globalClusteredDarkStores); // Update selector in Workforce Opt module

    // Calculate stats and draw order points + lines
    const clusterData = Array(numDarkStores).fill(null).map(() => ({ orders: [], distances: [] }));
    let totalOverallDistance = 0;
    let totalAssignedOrders = 0;
    let allDistances = [];

    allOrderPoints.forEach(p => {
        let minDist = Infinity;
        let closestDsIndex = -1;
        kMeansDarkStoreLocations.forEach((ds, index) => {
            if (ds && typeof ds.lat === 'number' && typeof ds.lng === 'number') {
                const dist = getDistanceSimple(p, ds); // Use simple distance for assignment
                if (dist < minDist) {
                    minDist = dist;
                    closestDsIndex = index;
                }
            }
        });

        if (closestDsIndex !== -1 && kMeansDarkStoreLocations[closestDsIndex]) {
            const distKm = getDistanceKm(p, kMeansDarkStoreLocations[closestDsIndex]); // Actual km for stats
            clusterData[closestDsIndex].orders.push(p);
            clusterData[closestDsIndex].distances.push(distKm);
            allDistances.push(distKm);
            totalOverallDistance += distKm;
            totalAssignedOrders++;
            L.polyline([[p.lat, p.lng], [kMeansDarkStoreLocations[closestDsIndex].lat, kMeansDarkStoreLocations[closestDsIndex].lng]],
                       { color: '#94a3b8', opacity: 0.4, weight: 1 }).addTo(orderToStoreLinesLayerGroup);
        }

        const color = p.type === 'hotspot' ? '#a855f7' : '#3b82f6'; // Purple for hotspot, Blue for background
        L.circleMarker([p.lat, p.lng], { radius: p.type === 'hotspot' ? 3.5 : 2.5, color: color, fillColor: color, fillOpacity: 0.8, weight: 1 })
            .bindPopup(`Type: ${p.type}<br>Coords: ${p.lat.toFixed(4)}, ${p.lng.toFixed(4)}`).addTo(demandPointsLayerGroup);
    });

    // Display cluster statistics
    if (clusteringStatsDivEl) {
        clusteringStatsDivEl.innerHTML = '';
        clusterData.forEach((data, index) => {
            const numOrders = data.orders.length;
            const avgDist = numOrders > 0 ? (data.distances.reduce((a, b) => a + b, 0) / numOrders) : 0;
            const maxDist = numOrders > 0 ? Math.max(...data.distances) : 0;
            const minDist = numOrders > 0 ? Math.min(...data.distances) : 0;
            const stdDevDist = numOrders > 1 ? calculateStdDev(data.distances, avgDist) : 0;

            const statEl = document.createElement('div');
            statEl.className = 'stat-card p-4 text-left'; // Re-use stat-card class
            statEl.innerHTML = `
                <h5 class="font-semibold text-lg text-blue-700 mb-2">Dark Store ${index + 1}</h5>
                <p><strong class="text-slate-600">Orders:</strong> ${numOrders}</p>
                <p><strong class="text-slate-600">Avg. Dist:</strong> ${avgDist.toFixed(2)} km</p>
                <p><strong class="text-slate-600">Min Dist:</strong> ${minDist.toFixed(2)} km</p>
                <p><strong class="text-slate-600">Max Dist:</strong> ${maxDist.toFixed(2)} km</p>
                <p><strong class="text-slate-600">Std. Dev. Dist:</strong> ${stdDevDist.toFixed(2)} km</p>
            `;
            clusteringStatsDivEl.appendChild(statEl);
        });
        if (clusterData.every(d => d.orders.length === 0) && allOrderPoints.length > 0) {
            clusteringStatsDivEl.innerHTML = '<p class="italic text-slate-500 md:col-span-2 lg:col-span-3 text-center">Could not assign orders to clusters. Check K-Means output.</p>';
        } else if (allOrderPoints.length === 0) {
            clusteringStatsDivEl.innerHTML = '<p class="italic text-slate-500 md:col-span-2 lg:col-span-3 text-center">No orders generated for clustering.</p>';
        }
    }

    // Display overall statistics
    const overallAvg = totalAssignedOrders > 0 ? (totalOverallDistance / totalAssignedOrders) : NaN;
    if(overallAvgClusterDistanceEl) overallAvgClusterDistanceEl.textContent = isNaN(overallAvg) ? "N/A" : overallAvg.toFixed(2) + " km";
    if(overallMinClusterDistanceEl) overallMinClusterDistanceEl.textContent = allDistances.length > 0 ? Math.min(...allDistances).toFixed(2) + " km" : "N/A";
    if(overallMaxClusterDistanceEl) overallMaxClusterDistanceEl.textContent = allDistances.length > 0 ? Math.max(...allDistances).toFixed(2) + " km" : "N/A";
    const overallStdDev = allDistances.length > 1 && !isNaN(overallAvg) ? calculateStdDev(allDistances, overallAvg) : NaN;
    if(overallStdDevClusterDistanceEl) overallStdDevClusterDistanceEl.textContent = isNaN(overallStdDev) ? "N/A" : overallStdDev.toFixed(2) + " km";


    // Voronoi Diagram (using d3.Delaunay)
    if (dcPointsForVoronoi.length >= 3 && typeof d3 !== 'undefined' && d3.Delaunay) {
        try {
            const delaunay = d3.Delaunay.from(dcPointsForVoronoi);
            // Define bounds for Voronoi cells slightly larger than Chandigarh bounds
            const voronoiBounds = [
                chandigarhCenter.lng - 0.15, chandigarhCenter.lat - 0.15, // minLng, minLat (approx)
                chandigarhCenter.lng + 0.15, chandigarhCenter.lat + 0.15  // maxLng, maxLat (approx)
            ];
            const voronoi = delaunay.voronoi(voronoiBounds);

            for (let i = 0; i < dcPointsForVoronoi.length; i++) {
                const cellPolygonGeoJson = voronoi.cellPolygon(i); // Returns [lng, lat]
                if (cellPolygonGeoJson && cellPolygonGeoJson.length > 0) {
                    const cellLeafletCoords = cellPolygonGeoJson.map(p => [p[1], p[0]]); // Convert to [lat, lng]
                    L.polygon(cellLeafletCoords, {
                        className: 'voronoi-cell-path', // Uses style from style.css
                        color: "#0ea5e9", // sky-500
                        weight: 1.5,
                        fill: false,
                        fillOpacity: 0
                    }).addTo(voronoiLayerGroup);
                }
            }
        } catch (e) {
            console.error("Error during Voronoi generation:", e, dcPointsForVoronoi);
        }
    }

    // Ensure order-to-store lines are displayed based on toggle
    if (showOrderConnectionsToggleEl && showOrderConnectionsToggleEl.checked) {
        if (!clusteringMap.hasLayer(orderToStoreLinesLayerGroup)) {
            orderToStoreLinesLayerGroup.addTo(clusteringMap);
        }
    } else {
        if (clusteringMap.hasLayer(orderToStoreLinesLayerGroup)) {
            clusteringMap.removeLayer(orderToStoreLinesLayerGroup);
        }
    }
    clusteringMap.invalidateSize(); // Ensure map is rendered correctly
}
