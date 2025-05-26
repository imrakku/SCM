// js/modules/simulation.js
import {
    chandigarhGeoJsonPolygon,
    chandigarhSectors,
    defaultDarkStoreLocationSim,
    SIMULATION_STEP_INTERVAL_MS,
    MINUTES_PER_SIMULATION_STEP,
    DYNAMIC_TRAFFIC_UPDATE_INTERVAL
} from '../data/chandigarhData.js';
import {
    initializeMap,
    getMapInstance,
    getDistanceKm,
    isPointInPolygon,
    createAgentIcon,
    createOrderIcon,
    darkStoreIcon,
    generateWaypoints
} from '../mapUtils.js';
import { initializeChart, updateChartData, calculateStdDev, getChartInstance } from '../chartUtils.js';
import { logMessage } from '../logger.js';
import { getCustomDemandProfiles } from './demandProfiles.js';
import { updateTrafficStatusDisplay, updateSimTimeDisplay, toggleSimConfigLock } from '../uiElements.js';
import { saveCurrentSimulationScenario } from './scenarioAnalysis.js';


// --- Simulation State Variables ---
let simulationMap;
let simDarkStoreMarker;
let agents = [];
let orders = [];
let agentMarkers = {};
let orderMarkers = {};
let simulationIntervalId;
let currentSimulationTime = 0;
let orderIdCounter = 0;
let agentIdCounter = 1;
let isSimulationRunning = false;

// --- Heatmap Specific State ---
let deliveryTimeHeatmapLayer = null;
let deliveredOrderDataForHeatmap = []; // Stores {lat, lng, value: deliveryDuration}

// --- Simulation Parameters (with defaults) ---
let simParams = {
    numAgents: 5,
    agentMinSpeed: 20,
    agentMaxSpeed: 30,
    handlingTime: 5,
    orderGenerationProfile: 'default_uniform',
    uniformOrderRadiusKm: 5,
    defaultFocusRadiusKm: 3,
    orderLocationSpreadFactor: 0.05,
    routeWaypoints: 1,
    baseTrafficFactor: 1.0,
    enableDynamicTraffic: false,
    currentDynamicTrafficFactor: 1.0,
    agentCostPerHour: 150,
    costPerKmTraveled: 5,
    fixedCostPerDelivery: 10,
    currentOrderGenerationProbability: 0.40,
};

export const orderGenerationProbabilities = {
    1: 0.15, 2: 0.25, 3: 0.40, 4: 0.55, 5: 0.70
};
export const orderSpreadFactors = {1: 0.02, 2: 0.035, 3: 0.05, 4: 0.065, 5: 0.08};

// --- Statistics Tracking ---
let stats = {
    totalOrdersGenerated: 0,
    totalOrdersDelivered: 0,
    sumDeliveryTimes: 0,
    allDeliveryTimes: [],
    sumOrderWaitTimes: 0,
    countAssignedOrders: 0,
    totalAgentTravelTime: 0,
    totalAgentHandlingTime: 0,
    totalAgentActiveTime: 0,
    totalDistanceTraveledByAgentsKm: 0,
};

// --- Live Chart Data ---
let liveChartData = {
    simTimeHistory: [],
    pendingOrdersHistory: [],
    activeAgentsHistory: [],
};

// --- DOM Elements ---
let agentStatusListEl, pendingOrdersListEl, simulationLogEl;
let startSimBtnEl, pauseSimBtnEl, resetSimBtnEl;
let orderGenerationProfileSelectEl, uniformOrderRadiusContainerEl, defaultOrderFocusRadiusContainerEl, defaultOrderSpreadContainerEl;
let statsTotalOrdersGeneratedEl, statsTotalOrdersDeliveredEl, statsAvgDeliveryTimeEl, statsMinDeliveryTimeEl,
    statsMaxDeliveryTimeEl, statsStdDevDeliveryTimeEl, statsAvgOrderWaitTimeEl, statsAvgAgentUtilizationEl,
    statsTotalAgentTravelTimeEl, statsTotalAgentHandlingTimeEl, statsTotalSimTimeEl,
    statsTotalAgentLaborCostEl, statsTotalTravelCostEl, statsTotalFixedDeliveryCostsEl,
    statsOverallTotalOperationalCostEl, statsAverageCostPerOrderEl, saveCurrentSimScenarioBtnEl;
let toggleDeliveryTimeHeatmapCheckboxEl; // For the heatmap toggle


export function setSimParameter(key, value) {
    if (simParams.hasOwnProperty(key)) {
        simParams[key] = value;
        if (key === 'orderGenerationProfile') {
            toggleProfileSpecificControlsUI();
        }
    } else {
        console.warn(`Attempted to set unknown simulation parameter: ${key}`);
    }
}
export function getSimParameter(key) {
    return simParams.hasOwnProperty(key) ? simParams[key] : undefined;
}


export function initializeSimulationSection() {
    // Cache standard DOM elements
    agentStatusListEl = document.getElementById('agentStatusList');
    pendingOrdersListEl = document.getElementById('pendingOrdersList');
    simulationLogEl = document.getElementById('simulationLog');
    startSimBtnEl = document.getElementById('startSimBtn');
    pauseSimBtnEl = document.getElementById('pauseSimBtn');
    resetSimBtnEl = document.getElementById('resetSimBtn');
    orderGenerationProfileSelectEl = document.getElementById('orderGenerationProfileSelect');
    uniformOrderRadiusContainerEl = document.getElementById('uniformOrderRadiusContainer');
    defaultOrderFocusRadiusContainerEl = document.getElementById('defaultOrderFocusRadiusContainer');
    defaultOrderSpreadContainerEl = document.getElementById('defaultOrderSpreadContainer');
    statsTotalOrdersGeneratedEl = document.getElementById('statsTotalOrdersGenerated');
    statsTotalOrdersDeliveredEl = document.getElementById('statsTotalOrdersDelivered');
    statsAvgDeliveryTimeEl = document.getElementById('statsAvgDeliveryTime');
    statsMinDeliveryTimeEl = document.getElementById('statsMinDeliveryTime');
    statsMaxDeliveryTimeEl = document.getElementById('statsMaxDeliveryTime');
    statsStdDevDeliveryTimeEl = document.getElementById('statsStdDevDeliveryTime');
    statsAvgOrderWaitTimeEl = document.getElementById('statsAvgOrderWaitTime');
    statsAvgAgentUtilizationEl = document.getElementById('statsAvgAgentUtilization');
    statsTotalAgentTravelTimeEl = document.getElementById('statsTotalAgentTravelTime');
    statsTotalAgentHandlingTimeEl = document.getElementById('statsTotalAgentHandlingTime');
    statsTotalSimTimeEl = document.getElementById('statsTotalSimTime');
    statsTotalAgentLaborCostEl = document.getElementById('statsTotalAgentLaborCost');
    statsTotalTravelCostEl = document.getElementById('statsTotalTravelCost');
    statsTotalFixedDeliveryCostsEl = document.getElementById('statsTotalFixedDeliveryCosts');
    statsOverallTotalOperationalCostEl = document.getElementById('statsOverallTotalOperationalCost');
    statsAverageCostPerOrderEl = document.getElementById('statsAverageCostPerOrder');
    saveCurrentSimScenarioBtnEl = document.getElementById('saveCurrentSimScenarioBtn');
    toggleDeliveryTimeHeatmapCheckboxEl = document.getElementById('toggleDeliveryTimeHeatmap'); // Heatmap toggle

    simulationMap = initializeMap('simulationMap', defaultDarkStoreLocationSim, 13, 'simulation');
    if (simulationMap) {
        simDarkStoreMarker = L.marker([defaultDarkStoreLocationSim.lat, defaultDarkStoreLocationSim.lng], { icon: darkStoreIcon })
            .addTo(simulationMap)
            .bindPopup('<b>Dark Store Chandigarh (Simulation)</b><br>Central Hub')
            .openPopup();

        // Initialize heatmap layer (but don't add to map yet)
        deliveryTimeHeatmapLayer = L.heatLayer([], {
            radius: 25, // Adjust for desired spread of heat points
            maxOpacity: 0.7,
            scaleRadius: true, // Scale radius based on zoom
            useLocalExtrema: false, // Use global min/max for intensity scaling across all points
            valueField: 'value' // Property in data points that holds the intensity
        });

    } else {
        console.error("Simulation map failed to initialize!");
    }

    initializeLiveCharts();

    // Event Listeners
    startSimBtnEl?.addEventListener('click', startSimulation);
    pauseSimBtnEl?.addEventListener('click', pauseSimulation);
    resetSimBtnEl?.addEventListener('click', resetSimulation);
    saveCurrentSimScenarioBtnEl?.addEventListener('click', saveCurrentSimulationScenario);
    toggleDeliveryTimeHeatmapCheckboxEl?.addEventListener('change', toggleDeliveryTimeHeatmapDisplay); // Listener for heatmap toggle

    orderGenerationProfileSelectEl?.addEventListener('change', () => {
        setSimParameter('orderGenerationProfile', orderGenerationProfileSelectEl.value);
    });
    document.getElementById('routeWaypointsSelect')?.addEventListener('change', (e) => setSimParameter('routeWaypoints', parseInt(e.target.value)));
    document.getElementById('manualTrafficControl')?.addEventListener('change', (e) => {
        setSimParameter('baseTrafficFactor', parseFloat(e.target.value));
        if (!getSimParameter('enableDynamicTraffic')) {
            updateTrafficStatusDisplay(getSimParameter('baseTrafficFactor'));
        }
    });
    document.getElementById('enableDynamicTraffic')?.addEventListener('change', (e) => {
        setSimParameter('enableDynamicTraffic', e.target.checked);
        if (!e.target.checked) {
            updateTrafficStatusDisplay(getSimParameter('baseTrafficFactor'));
        } else {
            logMessage('Dynamic traffic enabled. Fluctuations will apply.', "TRAFFIC", simulationLogEl, currentSimulationTime);
        }
    });

    populateOrderGenerationProfileSelectorSim();
    resetSimulationState();
    toggleSimConfigLock(false);
    if (pauseSimBtnEl) pauseSimBtnEl.disabled = true;
}

function resetSimulationState() {
    currentSimulationTime = 0;
    orderIdCounter = 0;
    agentIdCounter = 1;
    isSimulationRunning = false;

    agents.forEach(agent => { if (agent.routePolyline && simulationMap) simulationMap.removeLayer(agent.routePolyline); });
    agents = [];
    orders = [];
    Object.values(agentMarkers).forEach(m => { if (simulationMap) simulationMap.removeLayer(m); }); agentMarkers = {};
    Object.values(orderMarkers).forEach(m => { if (simulationMap) simulationMap.removeLayer(m); }); orderMarkers = {};

    // Reset heatmap data and layer
    deliveredOrderDataForHeatmap = [];
    if (deliveryTimeHeatmapLayer && simulationMap && simulationMap.hasLayer(deliveryTimeHeatmapLayer)) {
        simulationMap.removeLayer(deliveryTimeHeatmapLayer);
    }
    if (deliveryTimeHeatmapLayer) { // Clear its data
        deliveryTimeHeatmapLayer.setData({max:1, data:[]});
    }
    if (toggleDeliveryTimeHeatmapCheckboxEl) { // Uncheck the toggle
        toggleDeliveryTimeHeatmapCheckboxEl.checked = false;
    }


    for (let key in stats) {
        if (Array.isArray(stats[key])) stats[key] = [];
        else if (typeof stats[key] === 'number') stats[key] = 0;
    }
    for (let key in liveChartData) {
        liveChartData[key] = [];
    }
    updateLiveCharts();

    const numAgents = getSimParameter('numAgents');
    for (let i = 0; i < numAgents; i++) {
        createAgent();
    }

    updateSimTimeDisplay(currentSimulationTime);
    updateTrafficStatusDisplay(getSimParameter('baseTrafficFactor'));
    updateAgentStatusListUI();
    updatePendingOrdersListUI();
    updateSimulationStatsUI();
    if (simulationLogEl) simulationLogEl.innerHTML = '<p class="log-system"><em>[SYS] Simulation log initialized.</em></p>';
    logMessage("Simulation state initialized/reset.", 'SYSTEM', simulationLogEl, currentSimulationTime);

    if (startSimBtnEl) startSimBtnEl.disabled = false;
    if (pauseSimBtnEl) pauseSimBtnEl.disabled = true;
    toggleSimConfigLock(false);
}

// --- HEATMAP FUNCTIONS ---
function toggleDeliveryTimeHeatmapDisplay() {
    if (!simulationMap || !deliveryTimeHeatmapLayer) return;

    if (toggleDeliveryTimeHeatmapCheckboxEl?.checked) {
        updateDeliveryTimeHeatmapData(); // Prepare and set data
        if (!simulationMap.hasLayer(deliveryTimeHeatmapLayer)) {
            deliveryTimeHeatmapLayer.addTo(simulationMap);
            logMessage("Delivery Time Heatmap ON.", 'SYSTEM', simulationLogEl, currentSimulationTime);
        }
    } else {
        if (simulationMap.hasLayer(deliveryTimeHeatmapLayer)) {
            simulationMap.removeLayer(deliveryTimeHeatmapLayer);
            logMessage("Delivery Time Heatmap OFF.", 'SYSTEM', simulationLogEl, currentSimulationTime);
        }
    }
}

function updateDeliveryTimeHeatmapData() {
    if (!deliveryTimeHeatmapLayer) return;

    if (deliveredOrderDataForHeatmap.length === 0) {
        deliveryTimeHeatmapLayer.setData({ max: 1, data: [] }); // Clear heatmap if no data
        return;
    }

    // For heatmap.js with leaflet-heatmap, 'value' is used for intensity.
    // We can use raw delivery times. leaflet-heatmap with useLocalExtrema:false
    // will need a meaningful 'max' for scaling, or useLocalExtrema:true will scale based on current points.
    // Let's try with useLocalExtrema: false first for a global perspective if many points are added over time.

    const deliveryTimes = deliveredOrderDataForHeatmap.map(d => d.value);
    const maxObservedTime = deliveryTimes.length > 0 ? Math.max(...deliveryTimes) : 1; // Avoid max=0
    // const minObservedTime = deliveryTimes.length > 0 ? Math.min(...deliveryTimes) : 0;

    // Normalize values for better visualization if not using useLocalExtrema: true
    // Or, provide a sensible 'max' value to the heatmap layer.
    // For simplicity with useLocalExtrema: false, we can set 'max' to a percentile or a fixed reasonable upper bound.
    // Let's use the maxObservedTime for now.
    // If delivery times vary wildly, normalization or a log scale might be better.

    const heatmapPoints = deliveredOrderDataForHeatmap.map(d => ({
        lat: d.lat,
        lng: d.lng,
        value: d.value
    }));

    deliveryTimeHeatmapLayer.setData({
        max: maxObservedTime, // Max intensity value
        data: heatmapPoints
    });
    // console.log(`Heatmap data updated. Points: ${heatmapPoints.length}, MaxValue: ${maxObservedTime}`);
}


// --- Standard Simulation Functions (generateOrder, assignOrders, etc. remain largely the same) ---
// ... (populateOrderGenerationProfileSelectorSim, toggleProfileSpecificControlsUI) ...
// ... (startSimulation, pauseSimulation, createAgent, generateUniformPointInChd) ...
// ... (generateOrder - with one addition) ...

function updateAgentsMovementAndStatus() {
    const effectiveTraffic = getSimParameter('enableDynamicTraffic') ? getSimParameter('currentDynamicTrafficFactor') : getSimParameter('baseTrafficFactor');
    agents.forEach(agent => {
        agent.totalTime += MINUTES_PER_SIMULATION_STEP;
        if (agent.status !== 'available') {
            agent.busyTime += MINUTES_PER_SIMULATION_STEP;
            stats.totalAgentActiveTime += MINUTES_PER_SIMULATION_STEP;
        }
        // ... (rest of agent movement logic) ...

        // --- MODIFICATION FOR HEATMAP DATA COLLECTION ---
        if (agent.status === 'to_customer' && agent.currentLegIndex === agent.routePath.length - 1) { // Arrived at customer
            const deliveredOrder = orders.find(o => o.id === agent.assignedOrderId);
            if (deliveredOrder && deliveredOrder.location.lat === agent.location.lat && deliveredOrder.location.lng === agent.location.lng) {
                // ... (existing logic for delivery) ...
                const deliveryDuration = currentSimulationTime - deliveredOrder.timePlaced;
                // ... (existing stats updates for deliveryDuration) ...

                // Store data for heatmap
                deliveredOrderDataForHeatmap.push({
                    lat: deliveredOrder.location.lat,
                    lng: deliveredOrder.location.lng,
                    value: deliveryDuration // Store raw delivery time
                });

                // Optional: If heatmap is currently active, update it in real-time
                // This might be too frequent. Updating on toggle is often better.
                // if (toggleDeliveryTimeHeatmapCheckboxEl?.checked) {
                //    updateDeliveryTimeHeatmapData();
                // }

                // ... (rest of delivery completion logic) ...
            }
            // ...
        }
        // --- END OF HEATMAP MODIFICATION ---
        // ... (rest of agent movement logic if any) ...
    });
}


// --- The rest of your simulation.js functions ---
// (generateOrder, calculateETA, assignOrders, simulationStep, UI update functions, chart functions, exports)
// Ensure these are present and correct from your last working version.
// For brevity, I'm not re-listing all of them if they don't have direct changes for the heatmap toggle.
// The key change is adding the data collection point in updateAgentsMovementAndStatus.

// Make sure all previously existing functions are here:
// populateOrderGenerationProfileSelectorSim, toggleProfileSpecificControlsUI,
// startSimulation, pauseSimulation, createAgent, generateUniformPointInChd,
// generateOrder, calculateETA, assignOrders, simulationStep,
// updateAgentStatusListUI, updatePendingOrdersListUI, updateSimulationStatsUI,
// initializeLiveCharts, updateLiveCharts,
// getCurrentSimulationParameters, getCurrentSimulationStats

// --- (Paste the rest of your simulation.js functions here, ensuring they are complete) ---

// Example of where generateOrder would be (ensure it's the full function from your working version)
function generateOrder() {
    stats.totalOrdersGenerated++;
    const orderId = orderIdCounter++;
    let newOrderLocation;
    const selectedProfileId = getSimParameter('orderGenerationProfile');
    let profileSourceInfo = `Profile: ${selectedProfileId}`;

    const customProfiles = getCustomDemandProfiles();

    if (selectedProfileId.startsWith('custom_')) {
        const profileName = selectedProfileId.substring('custom_'.length);
        profileSourceInfo = `Custom: ${profileName}`;
        const customProfile = customProfiles.find(p => p.name === profileName);

        if (customProfile && customProfile.zones && customProfile.zones.length > 0) {
            const activeZones = customProfile.zones.filter(zone => {
                const startTime = zone.startTime !== undefined ? zone.startTime : 0;
                const endTime = zone.endTime !== undefined ? zone.endTime : Infinity;
                return currentSimulationTime >= startTime && currentSimulationTime <= endTime;
            });

            if (activeZones.length > 0) {
                let totalOrderWeight = activeZones.reduce((sum, zone) => sum + (zone.maxOrders > 0 ? (zone.minOrders + zone.maxOrders) / 2 : 1), 0);
                if (totalOrderWeight === 0) totalOrderWeight = activeZones.length;
                let randomPick = Math.random() * totalOrderWeight;
                let selectedZone = null;
                for (const zone of activeZones) {
                    const weight = (zone.minOrders + zone.maxOrders) / 2 > 0 ? (zone.minOrders + zone.maxOrders) / 2 : (totalOrderWeight === activeZones.length ? 1 : 0);
                    if (randomPick < weight) { selectedZone = zone; break; }
                    randomPick -= weight;
                }
                if (!selectedZone && activeZones.length > 0) selectedZone = activeZones[Math.floor(Math.random() * activeZones.length)];

                if (selectedZone) {
                    profileSourceInfo += ` (Zone Type: ${selectedZone.type})`;
                    if (selectedZone.type === 'uniform') {
                        const uniformPoints = generateUniformPointInChd(1, chandigarhGeoJsonPolygon);
                        newOrderLocation = uniformPoints.length > 0 ? uniformPoints[0] : { ...defaultDarkStoreLocationSim };
                    } else if (selectedZone.type === 'hotspot') {
                        const hotspotCenter = { lat: selectedZone.centerLat, lng: selectedZone.centerLng };
                        const spreadKm = selectedZone.spreadKm; const spreadDeg = spreadKm / 111;
                        let attempts = 0;
                        do {
                            newOrderLocation = { lat: hotspotCenter.lat + (Math.random() - 0.5) * 2 * spreadDeg, lng: hotspotCenter.lng + (Math.random() - 0.5) * 2 * spreadDeg };
                            attempts++;
                        } while (!isPointInPolygon([newOrderLocation.lng, newOrderLocation.lat], chandigarhGeoJsonPolygon) && attempts < 100);
                        if (attempts >= 100 && !isPointInPolygon([newOrderLocation.lng, newOrderLocation.lat], chandigarhGeoJsonPolygon)) {
                            newOrderLocation = { ...hotspotCenter };
                        }
                    } else if (selectedZone.type === 'sector') {
                        if (selectedZone.selectedSectors && selectedZone.selectedSectors.length > 0) {
                            const randomSectorName = selectedZone.selectedSectors[Math.floor(Math.random() * selectedZone.selectedSectors.length)];
                            profileSourceInfo += ` - ${randomSectorName}`;
                            const sectorData = chandigarhSectors.find(s => s.name === randomSectorName);
                            if (sectorData) {
                                const sectorCenter = { lat: sectorData.lat, lng: sectorData.lng }; const sectorSpreadDeg = 0.005;
                                let attempts = 0;
                                do {
                                    newOrderLocation = { lat: sectorCenter.lat + (Math.random() - 0.5) * 2 * sectorSpreadDeg, lng: sectorCenter.lng + (Math.random() - 0.5) * 2 * sectorSpreadDeg };
                                    attempts++;
                                } while (!isPointInPolygon([newOrderLocation.lng, newOrderLocation.lat], chandigarhGeoJsonPolygon) && attempts < 50);
                                if (attempts >= 50 && !isPointInPolygon([newOrderLocation.lng, newOrderLocation.lat], chandigarhGeoJsonPolygon)){
                                     newOrderLocation = { ...sectorCenter };
                                }
                            } else {
                                newOrderLocation = { ...defaultDarkStoreLocationSim };
                            }
                        } else {
                             newOrderLocation = { ...defaultDarkStoreLocationSim };
                        }
                    } else if (selectedZone.type === 'route') {
                        if (selectedZone.routePoints && selectedZone.routePoints.length >= 1) {
                            const routeBounds = L.latLngBounds(selectedZone.routePoints);
                            const routeSpreadDeg = (selectedZone.routeSpreadKm || 0.5) / 111;
                            let attempts = 0;
                            do {
                                const randLat = routeBounds.getSouthWest().lat + Math.random() * (routeBounds.getNorthEast().lat - routeBounds.getSouthWest().lat);
                                const randLng = routeBounds.getSouthWest().lng + Math.random() * (routeBounds.getNorthEast().lng - routeBounds.getSouthWest().lng);
                                newOrderLocation = {
                                    lat: randLat + (Math.random() - 0.5) * 2 * routeSpreadDeg,
                                    lng: randLng + (Math.random() - 0.5) * 2 * routeSpreadDeg
                                };
                                attempts++;
                            } while(!isPointInPolygon([newOrderLocation.lng, newOrderLocation.lat], chandigarhGeoJsonPolygon) && attempts < 50);
                            if (attempts >= 50 && !isPointInPolygon([newOrderLocation.lng, newOrderLocation.lat], chandigarhGeoJsonPolygon)) {
                                newOrderLocation = generateUniformPointInChd(1, chandigarhGeoJsonPolygon)[0] || {...defaultDarkStoreLocationSim};
                            }
                        } else {
                            newOrderLocation = generateUniformPointInChd(1, chandigarhGeoJsonPolygon)[0] || {...defaultDarkStoreLocationSim};
                        }
                    } else {
                        newOrderLocation = { ...defaultDarkStoreLocationSim };
                    }
                } else {
                    stats.totalOrdersGenerated--; return;
                }
            } else {
                stats.totalOrdersGenerated--; return;
            }
        } else {
            stats.totalOrdersGenerated--; return;
        }
    } else if (selectedProfileId === 'default_focused') {
        profileSourceInfo = "Default Focused";
        const focusRadiusDeg = getSimParameter('defaultFocusRadiusKm') / 111;
        let attempts = 0;
        do {
            newOrderLocation = {
                lat: defaultDarkStoreLocationSim.lat + (Math.random() - 0.5) * 2 * focusRadiusDeg,
                lng: defaultDarkStoreLocationSim.lng + (Math.random() - 0.5) * 2 * focusRadiusDeg
            };
            attempts++;
        } while (!isPointInPolygon([newOrderLocation.lng, newOrderLocation.lat], chandigarhGeoJsonPolygon) && attempts < 100);
        if (attempts >= 100 && !isPointInPolygon([newOrderLocation.lng, newOrderLocation.lat], chandigarhGeoJsonPolygon)) {
            newOrderLocation = { ...defaultDarkStoreLocationSim };
        }
    } else if (selectedProfileId === 'default_uniform') {
        profileSourceInfo = `Default Uniform (Radius: ${getSimParameter('uniformOrderRadiusKm')}km)`;
        const radiusDeg = getSimParameter('uniformOrderRadiusKm') / 111.0;
        let attempts = 0;
        do {
            const angle = Math.random() * 2 * Math.PI;
            const distance = Math.sqrt(Math.random()) * radiusDeg;
            newOrderLocation = {
                lat: defaultDarkStoreLocationSim.lat + distance * Math.sin(angle),
                lng: defaultDarkStoreLocationSim.lng + distance * Math.cos(angle)
            };
            attempts++;
        } while (!isPointInPolygon([newOrderLocation.lng, newOrderLocation.lat], chandigarhGeoJsonPolygon) && attempts < 200);
        if (attempts >= 200 && !isPointInPolygon([newOrderLocation.lng, newOrderLocation.lat], chandigarhGeoJsonPolygon)) {
            const uniformPoints = generateUniformPointInChd(1, chandigarhGeoJsonPolygon);
            newOrderLocation = uniformPoints.length > 0 ? uniformPoints[0] : { ...defaultDarkStoreLocationSim };
            profileSourceInfo += " (Fallback to city boundary)";
        }
    } else {
        profileSourceInfo = "Fallback Uniform (Unknown Profile)";
        const uniformPoints = generateUniformPointInChd(1, chandigarhGeoJsonPolygon);
        newOrderLocation = uniformPoints.length > 0 ? uniformPoints[0] : { ...defaultDarkStoreLocationSim };
    }

    if (!newOrderLocation) {
        stats.totalOrdersGenerated--;
        return;
    }

    logMessage(`Order ${orderId} from ${profileSourceInfo} at [${newOrderLocation.lat.toFixed(4)}, ${newOrderLocation.lng.toFixed(4)}].`, 'ORDER_GEN', simulationLogEl, currentSimulationTime);
    const newOrder = {
        id: orderId, location: newOrderLocation, status: 'pending',
        assignedAgentId: null, etaMinutes: null, timePlaced: currentSimulationTime,
        assignmentTime: null, noAgentLogged: false,
    };
    orders.push(newOrder);
    if (simulationMap) {
        orderMarkers[orderId] = L.marker([newOrder.location.lat, newOrder.location.lng], { icon: createOrderIcon(orderId, 'pending') })
            .addTo(simulationMap)
            .bindPopup(`<b>Order ${orderId}</b><br>Status: ${newOrder.status}<br>Placed at: T+${newOrder.timePlaced} min`);
    }
}

function simulationStep() {
    if (!isSimulationRunning) return;
    currentSimulationTime += MINUTES_PER_SIMULATION_STEP;
    updateSimTimeDisplay(currentSimulationTime);

    if (getSimParameter('enableDynamicTraffic') && (currentSimulationTime % DYNAMIC_TRAFFIC_UPDATE_INTERVAL === 0 || currentSimulationTime === MINUTES_PER_SIMULATION_STEP)) {
        const factors = [0.7, 0.8, 0.9, 1.0, 1.1, 1.2, 1.3];
        setSimParameter('currentDynamicTrafficFactor', factors[Math.floor(Math.random() * factors.length)]);
        logMessage(`Dynamic traffic condition changed. New factor: ${getSimParameter('currentDynamicTrafficFactor').toFixed(1)}x`, "TRAFFIC", simulationLogEl, currentSimulationTime);
        updateTrafficStatusDisplay(getSimParameter('currentDynamicTrafficFactor'));
    }

    const orderGenProb = getSimParameter('currentOrderGenerationProbability');
    if (Math.random() < orderGenProb) {
        generateOrder();
    }

    updateAgentsMovementAndStatus(); // This now collects heatmap data
    assignOrders();
    updateAgentStatusListUI();
    updatePendingOrdersListUI();
    updateSimulationStatsUI();
    updateLiveCharts();
    orders = orders.filter(o => o.status !== 'delivered');
}

function updateAgentStatusListUI() {
    if (!agentStatusListEl) return;
    agentStatusListEl.innerHTML = '';
    if (agents.length === 0) { agentStatusListEl.innerHTML = '<p class="text-slate-500 italic">No agents yet.</p>'; return; }
    agents.forEach(agent => {
        const agentDiv = document.createElement('div');
        let statusText = `Agent ${agent.id}: ${agent.status.replace(/_/g, ' ')}`;
        if (agent.assignedOrderId !== null) statusText += ` (Order: ${agent.assignedOrderId})`;
        if (agent.status === 'at_store') statusText += ` (${agent.timeSpentAtStore}/${getSimParameter('handlingTime')} min)`;
        statusText += ` | Delivered: ${agent.deliveriesMade}`;
        const utilization = agent.totalTime > 0 ? (agent.busyTime / agent.totalTime * 100).toFixed(1) : 0;
        statusText += ` | Util: ${utilization}%`;
        agentDiv.className = `p-1.5 rounded-md text-xs ${agent.status === 'available' ? 'bg-blue-100 text-blue-700 border border-blue-200' : 'bg-orange-100 text-orange-700 border border-orange-200'}`;
        agentDiv.textContent = statusText;
        agentStatusListEl.appendChild(agentDiv);
    });
}

function updatePendingOrdersListUI() {
    if (!pendingOrdersListEl) return;
    pendingOrdersListEl.innerHTML = '';
    const activeOrders = orders.filter(o => o.status !== 'delivered');
    if (activeOrders.length === 0) { pendingOrdersListEl.innerHTML = '<p class="text-slate-500 italic">No active orders.</p>'; return; }
    activeOrders.forEach(order => {
        const orderDiv = document.createElement('div');
        let orderText = `Order ${order.id}: ${order.status.replace(/_/g, ' ')}`;
        if (order.assignedAgentId !== null) orderText += ` (Agent ${order.assignedAgentId}, ETA ${order.etaMinutes ? order.etaMinutes.toFixed(1) : 'N/A'} min)`;
        else orderText += ` (Placed: T+${order.timePlaced} min)`;
        orderDiv.className = `p-1.5 rounded-md text-xs ${order.status === 'pending' ? 'bg-green-100 text-green-700 border border-green-200' : 'bg-yellow-100 text-yellow-700 border border-yellow-200'}`;
        orderDiv.textContent = orderText;
        pendingOrdersListEl.appendChild(orderDiv);
    });
}

function updateSimulationStatsUI() {
    if (!statsTotalOrdersGeneratedEl) return; // Check if elements are cached
    statsTotalOrdersGeneratedEl.textContent = stats.totalOrdersGenerated;
    statsTotalOrdersDeliveredEl.textContent = stats.totalOrdersDelivered;
    const avgDeliveryTime = stats.totalOrdersDelivered > 0 ? (stats.sumDeliveryTimes / stats.totalOrdersDelivered) : NaN;
    statsAvgDeliveryTimeEl.textContent = isNaN(avgDeliveryTime) ? "N/A" : avgDeliveryTime.toFixed(1) + " min";
    statsMinDeliveryTimeEl.textContent = stats.allDeliveryTimes.length > 0 ? Math.min(...stats.allDeliveryTimes).toFixed(1) + " min" : "N/A";
    statsMaxDeliveryTimeEl.textContent = stats.allDeliveryTimes.length > 0 ? Math.max(...stats.allDeliveryTimes).toFixed(1) + " min" : "N/A";
    const stdDevDelTime = calculateStdDev(stats.allDeliveryTimes, avgDeliveryTime);
    statsStdDevDeliveryTimeEl.textContent = (stats.allDeliveryTimes.length > 1 && !isNaN(stdDevDelTime)) ? stdDevDelTime.toFixed(1) + " min" : "N/A";
    const avgOrderWaitTime = stats.countAssignedOrders > 0 ? (stats.sumOrderWaitTimes / stats.countAssignedOrders).toFixed(1) : "N/A";
    statsAvgOrderWaitTimeEl.textContent = avgOrderWaitTime + (avgOrderWaitTime !== "N/A" ? " min" : "");
    let totalAgentPossibleTime = 0;
    let totalAgentActualBusyTime = 0;
    agents.forEach(agent => {
        totalAgentPossibleTime += agent.totalTime;
        totalAgentActualBusyTime += agent.busyTime;
    });
    const avgAgentUtilization = totalAgentPossibleTime > 0 ? (totalAgentActualBusyTime / totalAgentPossibleTime * 100).toFixed(1) : "N/A";
    statsAvgAgentUtilizationEl.textContent = avgAgentUtilization + (avgAgentUtilization !== "N/A" ? "%" : "");
    statsTotalAgentTravelTimeEl.textContent = stats.totalAgentTravelTime.toFixed(0) + " min";
    statsTotalAgentHandlingTimeEl.textContent = stats.totalAgentHandlingTime.toFixed(0) + " min";
    statsTotalSimTimeEl.textContent = currentSimulationTime + " min";
    const totalAgentLaborCost = (stats.totalAgentActiveTime / 60) * getSimParameter('agentCostPerHour');
    const totalTravelCostVal = stats.totalDistanceTraveledByAgentsKm * getSimParameter('costPerKmTraveled');
    const totalFixedDeliveryCostsVal = stats.totalOrdersDelivered * getSimParameter('fixedCostPerDelivery');
    const overallTotalOperationalCostVal = totalAgentLaborCost + totalTravelCostVal + totalFixedDeliveryCostsVal;
    const averageCostPerOrderVal = stats.totalOrdersDelivered > 0 ? (overallTotalOperationalCostVal / stats.totalOrdersDelivered) : NaN;
    statsTotalAgentLaborCostEl.textContent = `₹${totalAgentLaborCost.toFixed(2)}`;
    statsTotalTravelCostEl.textContent = `₹${totalTravelCostVal.toFixed(2)}`;
    statsTotalFixedDeliveryCostsEl.textContent = `₹${totalFixedDeliveryCostsVal.toFixed(2)}`;
    statsOverallTotalOperationalCostEl.textContent = `₹${overallTotalOperationalCostVal.toFixed(2)}`;
    statsAverageCostPerOrderEl.textContent = isNaN(averageCostPerOrderVal) ? "N/A" : `₹${averageCostPerOrderVal.toFixed(2)}`;
}

function initializeLiveCharts() {
    initializeChart('pendingOrdersChart', 'pendingOrders', {
        type: 'line',
        data: { labels: [], datasets: [{ label: 'Pending Orders', data: [], borderColor: 'rgb(255, 99, 132)', tension: 0.1, fill: false }] },
        options: { scales: { y: { beginAtZero: true, suggestedMax: 10 }, x: { title: { display: true, text: 'Sim Time (min)'}} }, animation: { duration: 200 } }
    });
    initializeChart('activeAgentsChart', 'activeAgents', {
        type: 'line',
        data: { labels: [], datasets: [{ label: 'Active Agents', data: [], borderColor: 'rgb(54, 162, 235)', tension: 0.1, fill: false }] },
        options: { scales: { y: { beginAtZero: true, suggestedMax: (getSimParameter('numAgents') || 5) + 2 }, x: { title: { display: true, text: 'Sim Time (min)'}} }, animation: { duration: 200 } }
    });
}

function updateLiveCharts() {
    if (isSimulationRunning || currentSimulationTime === 0) {
        liveChartData.simTimeHistory.push(currentSimulationTime);
        liveChartData.pendingOrdersHistory.push(orders.filter(o => o.status !== 'delivered').length);
        liveChartData.activeAgentsHistory.push(agents.filter(a => a.status !== 'available').length);
        const maxHistoryLength = 100;
        if (liveChartData.simTimeHistory.length > maxHistoryLength) {
            liveChartData.simTimeHistory.shift();
            liveChartData.pendingOrdersHistory.shift();
            liveChartData.activeAgentsHistory.shift();
        }
    }
    if (getChartInstance('pendingOrders')) {
      updateChartData('pendingOrders', liveChartData.simTimeHistory, [liveChartData.pendingOrdersHistory]);
    }
    if (getChartInstance('activeAgents')) {
      updateChartData('activeAgents', liveChartData.simTimeHistory, [liveChartData.activeAgentsHistory]);
    }
}

export function getCurrentSimulationParameters() {
    return { ...simParams };
}
export function getCurrentSimulationStats() {
    // Include the heatmap data if needed by scenario analysis
    return { ...stats, currentSimTime: currentSimulationTime, deliveredOrderLocationsForHeatmap: [...deliveredOrderDataForHeatmap] };
}
