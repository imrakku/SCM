// js/modules/clustering.js
import { chandigarhGeoJsonPolygon, chandigarhLeafletCoords, chandigarhCenter } from '../data/chandigarhData.js';
import { initializeMap, getMapInstance, getDistanceSimple, getDistanceKm, isPointInPolygon, darkStoreIcon as commonDarkStoreIcon } from '../mapUtils.js';
import { calculateStdDev } from '../chartUtils.js'; // For stats
import { populateDarkStoreSelectorForOpt as updateWorkforceOptSelector } from './workforceOpt.js';

// Module-specific state
let clusteringMap;
let demandPointsLayerGroup;
let darkStoreMarkersLayerGroup;
let voronoiLayerGroup;
let cityBoundaryOutlineLayer;
let orderToStoreLinesLayerGroup;

export let globalClusteredDarkStores = [];
let allClusteringData = { darkStores: [], clusters: [] }; // For export

// DOM Elements
let numBackgroundOrdersInput, numHotspotOrdersInput, numDarkStoresClusteringInput;
let totalOrdersDisplayClusteringEl, numDarkStoresDisplayEl;
let regenerateClusteringBtnEl, showOrderConnectionsToggleEl, exportClusteringResultsBtnEl;
let clusteringStatsDivEl, overallAvgClusterDistanceEl, overallMinClusterDistanceEl, overallMaxClusterDistanceEl, overallStdDevClusterDistanceEl;
let interStoreDistanceMatrixContainerEl;

/**
 * Initializes the clustering section.
 */
export function initializeClusteringSection() {
    clusteringMap = initializeMap('clusteringMapViz', chandigarhCenter, 12, 'clustering');
    voronoiLayerGroup = L.layerGroup().addTo(clusteringMap);
    demandPointsLayerGroup = L.layerGroup().addTo(clusteringMap);
    darkStoreMarkersLayerGroup = L.layerGroup().addTo(clusteringMap);
    orderToStoreLinesLayerGroup = L.layerGroup();

    numBackgroundOrdersInput = document.getElementById('numBackgroundOrders');
    numHotspotOrdersInput = document.getElementById('numHotspotOrders');
    numDarkStoresClusteringInput = document.getElementById('numDarkStoresForClustering');
    totalOrdersDisplayClusteringEl = document.getElementById('totalOrdersDisplayClustering');
    numDarkStoresDisplayEl = document.getElementById('numDarkStoresDisplay');
    regenerateClusteringBtnEl = document.getElementById('regenerateClusteringBtn');
    showOrderConnectionsToggleEl = document.getElementById('showOrderConnectionsToggle');
    exportClusteringResultsBtnEl = document.getElementById('exportClusteringResultsBtn');
    clusteringStatsDivEl = document.getElementById('clusteringStats');
    overallAvgClusterDistanceEl = document.getElementById('overallAvgClusterDistance');
    overallMinClusterDistanceEl = document.getElementById('overallMinClusterDistance');
    overallMaxClusterDistanceEl = document.getElementById('overallMaxClusterDistance');
    overallStdDevClusterDistanceEl = document.getElementById('overallStdDevClusterDistance');
    interStoreDistanceMatrixContainerEl = document.getElementById('interStoreDistanceMatrixContainer');

    numBackgroundOrdersInput?.addEventListener('input', updateTotalOrderDisplayClustering);
    numHotspotOrdersInput?.addEventListener('input', updateTotalOrderDisplayClustering);
    numDarkStoresClusteringInput?.addEventListener('input', () => {
        if (numDarkStoresDisplayEl) numDarkStoresDisplayEl.textContent = numDarkStoresClusteringInput.value;
    });

    regenerateClusteringBtnEl?.addEventListener('click', generateAndDisplayClusteringData);
    exportClusteringResultsBtnEl?.addEventListener('click', exportClusteringResultsToCSV);

    showOrderConnectionsToggleEl?.addEventListener('change', () => {
        if (showOrderConnectionsToggleEl.checked) {
            clusteringMap.addLayer(orderToStoreLinesLayerGroup);
        } else {
            clusteringMap.removeLayer(orderToStoreLinesLayerGroup);
        }
    });

    updateTotalOrderDisplayClustering();
    if (numDarkStoresDisplayEl && numDarkStoresClusteringInput) {
        numDarkStoresDisplayEl.textContent = numDarkStoresClusteringInput.value;
    }
    generateAndDisplayClusteringData();
}

function updateTotalOrderDisplayClustering() {
    if (!numBackgroundOrdersInput || !numHotspotOrdersInput || !totalOrdersDisplayClusteringEl) return;
    const bgCount = parseInt(numBackgroundOrdersInput.value) || 0;
    const hsCount = parseInt(numHotspotOrdersInput.value) || 0;
    totalOrdersDisplayClusteringEl.textContent = bgCount + hsCount;
}

function generateUniformPointInPolygon(numPoints, polygonGeoJsonCoords) {
    const points = [];
    if (numPoints <= 0) return points;
    const bounds = L.geoJSON({ type: "Polygon", coordinates: [polygonGeoJsonCoords] }).getBounds();
    const west = bounds.getWest(), south = bounds.getSouth(), east = bounds.getEast(), north = bounds.getNorth();
    let attempts = 0;
    while (points.length < numPoints && attempts < numPoints * 500) {
        attempts++;
        const lng = west + Math.random() * (east - west);
        const lat = south + Math.random() * (north - south);
        if (isPointInPolygon([lng, lat], polygonGeoJsonCoords)) {
            points.push({ lat, lng });
        }
    }
    return points;
}

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
    return points;
}

function kMeansClustering(points, k, maxIterations = 30) {
    if (points.length < k) {
        console.warn("[K-Means] Not enough points to form k clusters. Returning unique points as centroids.");
        k = points.length;
    }
    if (k === 0) return [];

    let centroids = [];
    const usedIndices = new Set();
    while (centroids.length < k && centroids.length < points.length) {
        const idx = Math.floor(Math.random() * points.length);
        if (!usedIndices.has(idx)) {
            centroids.push({ ...points[idx] });
            usedIndices.add(idx);
        }
    }

    let assignments = [];
    let converged = false;
    for (let iter = 0; iter < maxIterations && !converged; iter++) {
        assignments = points.map(point => {
            let minDist = Infinity, closestCentroidIndex = -1;
            centroids.forEach((centroid, index) => {
                const dist = getDistanceSimple(point, centroid);
                if (dist < minDist) { minDist = dist; closestCentroidIndex = index; }
            });
            return closestCentroidIndex;
        });

        const newCentroids = [];
        const oldCentroidsForConvergenceCheck = JSON.parse(JSON.stringify(centroids));

        for (let i = 0; i < k; i++) {
            const clusterPoints = points.filter((_, index) => assignments[index] === i);
            if (clusterPoints.length > 0) {
                const sumLat = clusterPoints.reduce((sum, p) => sum + p.lat, 0);
                const sumLng = clusterPoints.reduce((sum, p) => sum + p.lng, 0);
                newCentroids.push({ lat: sumLat / clusterPoints.length, lng: sumLng / clusterPoints.length });
            } else {
                console.warn(`[K-Means] Cluster ${i} became empty. Re-initializing centroid.`);
                const fallbackPoints = generateUniformPointInPolygon(1, chandigarhGeoJsonPolygon);
                newCentroids.push(fallbackPoints.length > 0 ? fallbackPoints[0] : { lat: chandigarhCenter.lat, lng: chandigarhCenter.lng });
            }
        }
        centroids = newCentroids;

        let totalMovement = 0;
        for (let i = 0; i < k; i++) {
            totalMovement += getDistanceSimple(oldCentroidsForConvergenceCheck[i], centroids[i]);
        }
        if (totalMovement < 0.0001) {
            converged = true;
        }
    }
    return centroids;
}

function getPolygonArea(polygon) {
    if (!polygon || polygon.length < 3) return 0;
    let area = 0;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const p1 = polygon[i], p2 = polygon[j];
        area += p1.lng * p2.lat - p2.lng * p1.lat;
    }
    return Math.abs(area / 2) * (111.32 * 111.32 * Math.cos(polygon[0].lat * Math.PI / 180));
}

function generateAndDisplayClusteringData() {
    demandPointsLayerGroup.clearLayers();
    darkStoreMarkersLayerGroup.clearLayers();
    voronoiLayerGroup.clearLayers();
    orderToStoreLinesLayerGroup.clearLayers();
    if (clusteringStatsDivEl) clusteringStatsDivEl.innerHTML = '<p class="italic text-center">Generating data...</p>';
    if (interStoreDistanceMatrixContainerEl) interStoreDistanceMatrixContainerEl.querySelector('#interStoreDistanceMatrix').innerHTML = '';

    const backgroundCount = parseInt(numBackgroundOrdersInput.value) || 0;
    const hotspotCount = parseInt(numHotspotOrdersInput.value) || 0;
    const numDarkStores = parseInt(numDarkStoresClusteringInput.value) || 0;

    totalOrdersDisplayClusteringEl.textContent = backgroundCount + hotspotCount;
    numDarkStoresDisplayEl.textContent = numDarkStores;

    let allOrderPoints = [
        ...generateUniformPointInPolygon(backgroundCount, chandigarhGeoJsonPolygon).map(p => ({ ...p, type: 'background' })),
        ...generateGaussianPointsInPolygon(chandigarhCenter, 0.05, hotspotCount, chandigarhGeoJsonPolygon).map(p => ({ ...p, type: 'hotspot' }))
    ];

    let kMeansDarkStoreLocations = kMeansClustering(allOrderPoints, numDarkStores);
    
    // **FIX**: Filter out duplicate centroids before processing
    const uniqueCentroidStrings = new Set();
    kMeansDarkStoreLocations = kMeansDarkStoreLocations.filter(ds => {
        const key = `${ds.lat.toFixed(5)},${ds.lng.toFixed(5)}`;
        if (uniqueCentroidStrings.has(key)) return false;
        uniqueCentroidStrings.add(key);
        return true;
    });
    
    if (kMeansDarkStoreLocations.length < numDarkStores) {
        console.warn(`K-Means produced ${kMeansDarkStoreLocations.length} unique centroids, less than the requested ${numDarkStores}.`);
        if (numDarkStoresDisplayEl) numDarkStoresDisplayEl.textContent = `${kMeansDarkStoreLocations.length} (Unique)`;
    }

    globalClusteredDarkStores = [];
    const dcPointsForVoronoi = [];
    kMeansDarkStoreLocations.forEach((store, index) => {
        L.marker([store.lat, store.lng], { icon: commonDarkStoreIcon })
            .bindPopup(`<b>Dark Store ${index + 1}</b>`)
            .addTo(darkStoreMarkersLayerGroup);
        dcPointsForVoronoi.push([store.lng, store.lat]);
        globalClusteredDarkStores.push({ id: index, name: `Dark Store ${index + 1}`, lat: store.lat, lng: store.lng });
    });
    updateWorkforceOptSelector(globalClusteredDarkStores);

    const clusterData = Array(globalClusteredDarkStores.length).fill(null).map(() => ({ orders: [], distances: [] }));
    let allDistances = [];
    allOrderPoints.forEach(p => {
        let minDist = Infinity, closestDsIndex = -1;
        globalClusteredDarkStores.forEach((ds, index) => {
            const dist = getDistanceSimple(p, ds);
            if (dist < minDist) { minDist = dist; closestDsIndex = index; }
        });
        if (closestDsIndex !== -1) {
            const distKm = getDistanceKm(p, globalClusteredDarkStores[closestDsIndex]);
            clusterData[closestDsIndex].orders.push(p);
            clusterData[closestDsIndex].distances.push(distKm);
            allDistances.push(distKm);
            L.polyline([[p.lat, p.lng], [globalClusteredDarkStores[closestDsIndex].lat, globalClusteredDarkStores[closestDsIndex].lng]], { color: '#94a3b8', opacity: 0.4, weight: 1 }).addTo(orderToStoreLinesLayerGroup);
        }
        const color = p.type === 'hotspot' ? '#a855f7' : '#3b82f6';
        L.circleMarker([p.lat, p.lng], { radius: 3, color, fillColor: color, fillOpacity: 0.8, weight: 1 }).addTo(demandPointsLayerGroup);
    });
    
    if (showOrderConnectionsToggleEl.checked) clusteringMap.addLayer(orderToStoreLinesLayerGroup);
    
    // **ENHANCEMENT**: Voronoi with fill and tooltips
    if (dcPointsForVoronoi.length >= 3 && typeof d3 !== 'undefined' && d3.Delaunay) {
        try {
            const delaunay = d3.Delaunay.from(dcPointsForVoronoi);
            const voronoiBounds = [-180, -90, 180, 90]; // Global bounds
            const voronoi = delaunay.voronoi(voronoiBounds);
            const maxOrdersInCluster = Math.max(...clusterData.map(d => d.orders.length));

            for (let i = 0; i < dcPointsForVoronoi.length; i++) {
                const cellPolygonGeoJson = voronoi.cellPolygon(i);
                if (cellPolygonGeoJson) {
                    const cellLeafletCoords = cellPolygonGeoJson.map(p => [p[1], p[0]]);
                    const orderCount = clusterData[i].orders.length;
                    const fillOpacity = orderCount > 0 ? 0.1 + (0.4 * (orderCount / maxOrdersInCluster)) : 0;
                    
                    const cellPolygon = L.polygon(cellLeafletCoords, { color: "#0ea5e9", weight: 2, fillColor: "#0ea5e9", fillOpacity: fillOpacity })
                        .addTo(voronoiLayerGroup);
                        
                    // Add tooltip to Voronoi cell
                    const avgDist = orderCount > 0 ? (clusterData[i].distances.reduce((a, b) => a + b, 0) / orderCount).toFixed(2) : "N/A";
                    cellPolygon.bindTooltip(`<b>Store ${i + 1} Area</b><br>Orders: ${orderCount}<br>Avg. Dist: ${avgDist} km`, { sticky: true });
                    
                    // Add area calculation to clusterData
                    const areaKm2 = getPolygonArea(cellPolygon.getLatLngs()[0].map(ll => ({lat: ll.lat, lng: ll.lng})));
                    clusterData[i].areaKm2 = areaKm2;
                }
            }
        } catch (e) {
            console.error("Error during Voronoi generation:", e);
        }
    }

    displayClusterStatistics(clusterData, allDistances);
    displayInterStoreDistanceMatrix(globalClusteredDarkStores);
    
    allClusteringData = { darkStores: globalClusteredDarkStores, clusters: clusterData }; // For export
}

function displayClusterStatistics(clusterData, allDistances) {
    if (clusteringStatsDivEl) clusteringStatsDivEl.innerHTML = '';
    clusterData.forEach((data, index) => {
        const numOrders = data.orders.length;
        const avgDist = numOrders > 0 ? (data.distances.reduce((a, b) => a + b, 0) / numOrders) : 0;
        const density = data.areaKm2 > 0.01 ? (numOrders / data.areaKm2) : 0;

        const statEl = document.createElement('div');
        statEl.className = 'stat-card p-4 text-left';
        statEl.innerHTML = `
            <h5 class="font-semibold text-lg text-blue-700 mb-2">Dark Store ${index + 1}</h5>
            <p><strong>Orders:</strong> ${numOrders}</p>
            <p><strong>Avg. Dist:</strong> ${avgDist.toFixed(2)} km</p>
            <p><strong>Min Dist:</strong> ${numOrders > 0 ? Math.min(...data.distances).toFixed(2) : 'N/A'} km</p>
            <p><strong>Max Dist:</strong> ${numOrders > 0 ? Math.max(...data.distances).toFixed(2) : 'N/A'} km</p>
            <p><strong>Std. Dev. Dist:</strong> ${numOrders > 1 ? calculateStdDev(data.distances).toFixed(2) : 'N/A'} km</p>
            <p><strong>Service Area:</strong> ${data.areaKm2 ? data.areaKm2.toFixed(2) : 'N/A'} km²</p>
            <p><strong>Order Density:</strong> ${density.toFixed(2)} orders/km²</p>
        `;
        clusteringStatsDivEl.appendChild(statEl);
    });

    const overallAvg = allDistances.length > 0 ? (allDistances.reduce((a, b) => a + b, 0) / allDistances.length) : NaN;
    overallAvgClusterDistanceEl.textContent = isNaN(overallAvg) ? "N/A" : `${overallAvg.toFixed(2)} km`;
    overallMinClusterDistanceEl.textContent = allDistances.length > 0 ? `${Math.min(...allDistances).toFixed(2)} km` : "N/A";
    overallMaxClusterDistanceEl.textContent = allDistances.length > 0 ? `${Math.max(...allDistances).toFixed(2)} km` : "N/A";
    overallStdDevClusterDistanceEl.textContent = allDistances.length > 1 ? `${calculateStdDev(allDistances).toFixed(2)} km` : "N/A";
}

function displayInterStoreDistanceMatrix(darkStores) {
    const matrixTable = interStoreDistanceMatrixContainerEl.querySelector('#interStoreDistanceMatrix');
    if (!matrixTable) return;
    matrixTable.innerHTML = '';
    const thead = matrixTable.createTHead();
    const tbody = matrixTable.createTBody();
    const headerRow = thead.insertRow();
    headerRow.insertCell().textContent = 'Store';
    darkStores.forEach(store => {
        const th = document.createElement('th');
        th.textContent = `DS ${store.id + 1}`;
        headerRow.appendChild(th);
    });
    darkStores.forEach(store1 => {
        const row = tbody.insertRow();
        const th = document.createElement('th');
        th.textContent = `DS ${store1.id + 1}`;
        row.appendChild(th);
        darkStores.forEach(store2 => {
            const cell = row.insertCell();
            const distance = getDistanceKm(store1, store2);
            cell.textContent = distance.toFixed(2);
            if (store1.id === store2.id) cell.style.backgroundColor = '#f1f5f9';
        });
    });
}

function exportClusteringResultsToCSV() {
    if (!allClusteringData.darkStores || allClusteringData.darkStores.length === 0) {
        alert("No clustering data available to export. Please generate data first.");
        return;
    }
    let csvContent = "data:text/csv;charset=utf-8,";
    // Dark Store Locations
    csvContent += "Dark Store ID,Name,Latitude,Longitude\r\n";
    allClusteringData.darkStores.forEach(ds => {
        csvContent += `${ds.id + 1},"${ds.name}",${ds.lat},${ds.lng}\r\n`;
    });
    csvContent += "\r\n";
    // Cluster Statistics
    csvContent += "Cluster ID,Orders,Avg Dist (km),Min Dist (km),Max Dist (km),Std Dev Dist (km),Area (km^2),Density (orders/km^2)\r\n";
    allClusteringData.clusters.forEach((cluster, index) => {
        const numOrders = cluster.orders.length;
        const avgDist = numOrders > 0 ? (cluster.distances.reduce((a, b) => a + b, 0) / numOrders) : 0;
        const minD = numOrders > 0 ? Math.min(...cluster.distances) : 0;
        const maxD = numOrders > 0 ? Math.max(...cluster.distances) : 0;
        const stdDevD = numOrders > 1 ? calculateStdDev(cluster.distances) : 0;
        const density = cluster.areaKm2 > 0 ? (numOrders / cluster.areaKm2) : 0;
        csvContent += `${index + 1},${numOrders},${avgDist.toFixed(2)},${minD.toFixed(2)},${maxD.toFixed(2)},${stdDevD.toFixed(2)},${cluster.areaKm2 ? cluster.areaKm2.toFixed(2) : 'N/A'},${density.toFixed(2)}\r\n`;
    });
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "clustering_results.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}
