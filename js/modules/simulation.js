// js/modules/simulation.js
import {
    chandigarhGeoJsonPolygon,
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
import { getCustomDemandProfiles } from './demandProfiles.js'; // To get custom profile definitions
import { updateTrafficStatusDisplay, updateSimTimeDisplay, toggleSimConfigLock } from '../uiElements.js';


// --- Simulation State Variables ---
let simulationMap; // Leaflet map instance
let simDarkStoreMarker;
let agents = [];
let orders = [];
let agentMarkers = {}; // Stores Leaflet markers for agents
let orderMarkers = {}; // Stores Leaflet markers for orders
let simulationIntervalId;
let currentSimulationTime = 0;
let orderIdCounter = 0;
let agentIdCounter = 1; // Start agent IDs from 1
let isSimulationRunning = false;

// --- Simulation Parameters (with defaults) ---
// These will be updated by uiElements.js via setSimParameter
let simParams = {
    numAgents: 5,
    agentMinSpeed: 20, // km/h
    agentMaxSpeed: 30, // km/h
    handlingTime: 5, // minutes
    orderGenerationProfile: 'default_uniform', // or 'default_focused', or 'custom_PROFILE_NAME'
    uniformOrderRadiusKm: 5, // For 'default_uniform'
    defaultFocusRadiusKm: 3, // For 'default_focused'
    orderLocationSpreadFactor: 0.05, // Legacy, might be removed if not used by default profiles
    routeWaypoints: 1, // Number of waypoints for agent routes
    baseTrafficFactor: 1.0, // Manual traffic multiplier
    enableDynamicTraffic: false,
    currentDynamicTrafficFactor: 1.0, // Actual factor if dynamic is on
    agentCostPerHour: 150,
    costPerKmTraveled: 5,
    fixedCostPerDelivery: 10,
    currentOrderGenerationProbability: 0.2, // Default, updated by slider action
};

// For mapping slider values to probabilities/factors (used by uiElements.js)
export const orderGenerationProbabilities = { 1: 0.05, 2: 0.1, 3: 0.2, 4: 0.3, 5: 0.4 };
export const orderSpreadFactors = {1: 0.02, 2: 0.035, 3: 0.05, 4: 0.065, 5: 0.08};


// --- Statistics Tracking ---
let stats = {
    totalOrdersGenerated: 0,
    totalOrdersDelivered: 0,
    sumDeliveryTimes: 0,
    allDeliveryTimes: [], // To calculate min, max, std dev
    sumOrderWaitTimes: 0,
    countAssignedOrders: 0, // Orders that got an agent assigned
    totalAgentTravelTime: 0, // In minutes
    totalAgentHandlingTime: 0, // In minutes
    totalAgentActiveTime: 0, // Sum of (totalTime - availableTime) for all agents
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
// Stats display elements
let statsTotalOrdersGeneratedEl, statsTotalOrdersDeliveredEl, statsAvgDeliveryTimeEl, statsMinDeliveryTimeEl,
    statsMaxDeliveryTimeEl, statsStdDevDeliveryTimeEl, statsAvgOrderWaitTimeEl, statsAvgAgentUtilizationEl,
    statsTotalAgentTravelTimeEl, statsTotalAgentHandlingTimeEl, statsTotalSimTimeEl,
    statsTotalAgentLaborCostEl, statsTotalTravelCostEl, statsTotalFixedDeliveryCostsEl,
    statsOverallTotalOperationalCostEl, statsAverageCostPerOrderEl, saveCurrentSimScenarioBtnEl;


/**
 * Sets a simulation parameter. Called by uiElements.js or other modules.
 * @param {string} key The parameter key (must exist in simParams).
 * @param {*} value The new value for the parameter.
 */
export function setSimParameter(key, value) {
    if (simParams.hasOwnProperty(key)) {
        simParams[key] = value;
        // console.log(`SimParam Updated: ${key} = ${value}`); // For debugging
        // If specific UI updates are needed based on param change, do them here
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


/**
 * Initializes the Simulation section: map, UI elements, event listeners.
 */
export function initializeSimulationSection() {
    // Cache DOM elements
    agentStatusListEl = document.getElementById('agentStatusList');
    pendingOrdersListEl = document.getElementById('pendingOrdersList');
    simulationLogEl = document.getElementById('simulationLog');
    startSimBtnEl = document.getElementById('startSimBtn');
    pauseSimBtnEl = document.getElementById('pauseSimBtn');
    resetSimBtnEl = document.getElementById('resetSimBtn');
    orderGenerationProfileSelectEl = document.getElementById('orderGenerationProfileSelect');
    uniformOrderRadiusContainerEl = document.getElementById('uniformOrderRadiusContainer');
    defaultOrderFocusRadiusContainerEl = document.getElementById('defaultOrderFocusRadiusContainer');
    defaultOrderSpreadContainerEl = document.getElementById('defaultOrderSpreadContainer'); // Old slider container

    // Stats elements
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


    // Initialize map
    simulationMap = initializeMap('simulationMap', defaultDarkStoreLocationSim, 13, 'simulation');
    simDarkStoreMarker = L.marker([defaultDarkStoreLocationSim.lat, defaultDarkStoreLocationSim.lng], { icon: darkStoreIcon })
        .addTo(simulationMap)
        .bindPopup('<b>Dark Store Chandigarh (Simulation)</b><br>Central Hub')
        .openPopup();

    // Initialize live charts
    initializeLiveCharts();

    // Event Listeners for sim controls
    startSimBtnEl?.addEventListener('click', startSimulation);
    pauseSimBtnEl?.addEventListener('click', pauseSimulation);
    resetSimBtnEl?.addEventListener('click', resetSimulation);
    orderGenerationProfileSelectEl?.addEventListener('change', () => {
        setSimParameter('orderGenerationProfile', orderGenerationProfileSelectEl.value);
        // toggleProfileSpecificControlsUI is called by setSimParameter
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


    // Initial state setup
    populateOrderGenerationProfileSelectorSim(); // Populate with default and custom profiles
    resetSimulationState(); // Sets initial values for sim params, stats, UI
    toggleSimConfigLock(false); // Unlock controls initially
    if (pauseSimBtnEl) pauseSimBtnEl.disabled = true;
}

/**
 * Populates the order generation profile selector in the Simulation tab.
 * @param {Array} [customProfilesFromDemandModule] Optional array of custom profiles.
 */
export function populateOrderGenerationProfileSelectorSim(customProfilesFromDemandModule) {
    if (!orderGenerationProfileSelectEl) return;

    const currentVal = orderGenerationProfileSelectEl.value;
    // Preserve default options already in HTML, clear only custom ones
    const defaultOptions = Array.from(orderGenerationProfileSelectEl.options).filter(opt => opt.value.startsWith('default_'));
    orderGenerationProfileSelectEl.innerHTML = '';
    defaultOptions.forEach(opt => orderGenerationProfileSelectEl.appendChild(opt.cloneNode(true)));

    const profilesToUse = customProfilesFromDemandModule || getCustomDemandProfiles(); // Use passed profiles or fetch
    profilesToUse.forEach(profile => {
        const option = document.createElement('option');
        option.value = `custom_${profile.name}`;
        option.textContent = `Custom: ${profile.name}`;
        orderGenerationProfileSelectEl.appendChild(option);
    });

    // Restore previous selection if still valid, otherwise default
    if (Array.from(orderGenerationProfileSelectEl.options).some(opt => opt.value === currentVal)) {
        orderGenerationProfileSelectEl.value = currentVal;
    } else {
        orderGenerationProfileSelectEl.value = 'default_uniform';
    }
    setSimParameter('orderGenerationProfile', orderGenerationProfileSelectEl.value); // Update simParam
    // toggleProfileSpecificControlsUI is called by setSimParameter
}

/**
 * Toggles visibility of profile-specific radius/spread sliders.
 */
function toggleProfileSpecificControlsUI() {
    const selectedProfile = getSimParameter('orderGenerationProfile');
    uniformOrderRadiusContainerEl?.classList.toggle('hidden', selectedProfile !== 'default_uniform');
    defaultOrderFocusRadiusContainerEl?.classList.toggle('hidden', selectedProfile !== 'default_focused');
    defaultOrderSpreadContainerEl?.classList.toggle('hidden', true); // Keep old spread slider hidden
}


/**
 * Resets the simulation to its initial state.
 */
function resetSimulationState() {
    currentSimulationTime = 0;
    orderIdCounter = 0;
    agentIdCounter = 1;
    isSimulationRunning = false;

    agents.forEach(agent => { if (agent.routePolyline) agent.routePolyline.remove(); });
    agents = [];
    orders = [];
    Object.values(agentMarkers).forEach(m => m.remove()); agentMarkers = {};
    Object.values(orderMarkers).forEach(m => m.remove()); orderMarkers = {};

    // Reset stats
    for (let key in stats) {
        if (Array.isArray(stats[key])) stats[key] = [];
        else if (typeof stats[key] === 'number') stats[key] = 0;
    }

    // Reset live chart data
    for (let key in liveChartData) {
        liveChartData[key] = [];
    }
    updateLiveCharts(); // Clear charts

    // Create initial agents based on current slider value
    const numAgents = getSimParameter('numAgents');
    for (let i = 0; i < numAgents; i++) {
        createAgent();
    }

    // Update UI displays
    updateSimTimeDisplay(currentSimulationTime);
    updateTrafficStatusDisplay(getSimParameter('baseTrafficFactor')); // Use manual factor initially
    updateAgentStatusListUI();
    updatePendingOrdersListUI();
    updateSimulationStatsUI();
    if (simulationLogEl) simulationLogEl.innerHTML = '<p class="log-system"><em>[SYS] Simulation log initialized.</em></p>';
    logMessage("Simulation state initialized/reset.", 'SYSTEM', simulationLogEl, currentSimulationTime);

    if (startSimBtnEl) startSimBtnEl.disabled = false;
    if (pauseSimBtnEl) pauseSimBtnEl.disabled = true;
    toggleSimConfigLock(false); // Unlock config controls
}

/**
 * Starts or resumes the simulation.
 */
function startSimulation() {
    if (isSimulationRunning) return;

    if (currentSimulationTime === 0) { // Fresh start
        resetSimulationState(); // Ensure clean state based on current params
        logMessage("Simulation started.", 'SYSTEM', simulationLogEl, currentSimulationTime);
    } else { // Resuming
        logMessage("Simulation resumed.", 'SYSTEM', simulationLogEl, currentSimulationTime);
    }

    isSimulationRunning = true;
    simulationIntervalId = setInterval(simulationStep, SIMULATION_STEP_INTERVAL_MS);

    if (startSimBtnEl) startSimBtnEl.disabled = true;
    if (pauseSimBtnEl) pauseSimBtnEl.disabled = false;
    toggleSimConfigLock(true); // Lock config controls
}

/**
 * Pauses the currently running simulation.
 */
function pauseSimulation() {
    if (!isSimulationRunning) return;
    isSimulationRunning = false;
    clearInterval(simulationIntervalId);
    logMessage("Simulation paused.", 'SYSTEM', simulationLogEl, currentSimulationTime);
    if (startSimBtnEl) startSimBtnEl.disabled = false;
    if (pauseSimBtnEl) pauseSimBtnEl.disabled = true;
    // Config controls remain locked while paused, can only reset or resume
}

/**
 * Resets the simulation entirely.
 */
function resetSimulation() {
    if (isSimulationRunning) {
        isSimulationRunning = false;
        clearInterval(simulationIntervalId);
    }
    resetSimulationState();
    // Log message is handled by resetSimulationState
}


/**
 * Creates a new delivery agent.
 */
function createAgent() {
    const agentId = agentIdCounter++;
    const speedRange = getSimParameter('agentMaxSpeed') - getSimParameter('agentMinSpeed');
    const agentSpeed = speedRange >= 0 ? getSimParameter('agentMinSpeed') + Math.random() * speedRange : getSimParameter('agentMinSpeed');

    const newAgent = {
        id: agentId,
        location: { // Start near dark store with slight random offset
            lat: defaultDarkStoreLocationSim.lat + (Math.random() - 0.5) * 0.002,
            lng: defaultDarkStoreLocationSim.lng + (Math.random() - 0.5) * 0.002
        },
        speedKmph: agentSpeed,
        status: 'available', // 'available', 'to_store', 'at_store', 'to_customer'
        assignedOrderId: null,
        routePath: [], // Array of {lat, lng} points for current route
        currentLegIndex: 0,
        legProgress: 0, // 0 to 1 for current leg
        timeSpentAtStore: 0, // For handling time
        deliveriesMade: 0,
        totalTime: 0, // Total sim time agent has existed
        busyTime: 0,  // Time spent not 'available'
        routePolyline: null, // Leaflet polyline object
        distanceTraveledThisSimKm: 0,
    };
    agents.push(newAgent);

    if (simulationMap) {
        agentMarkers[agentId] = L.marker([newAgent.location.lat, newAgent.location.lng], { icon: createAgentIcon(agentId, false) })
            .addTo(simulationMap)
            .bindPopup(`<b>Agent ${newAgent.id}</b><br>Status: ${newAgent.status}<br>Speed: ${agentSpeed.toFixed(1)} km/h`);
    }
}

/**
 * Generates a new order based on the selected profile.
 */
function generateOrder() {
    stats.totalOrdersGenerated++;
    const orderId = orderIdCounter++;
    let newOrderLocation;
    const selectedProfileId = getSimParameter('orderGenerationProfile');
    let profileSourceInfo = "Unknown Profile";

    const customProfiles = getCustomDemandProfiles(); // Fetch current custom profiles

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
                // Weighted random pick of an active zone based on order volume (avg of min/max)
                let totalOrderWeight = activeZones.reduce((sum, zone) => sum + (zone.maxOrders > 0 ? (zone.minOrders + zone.maxOrders) / 2 : 1), 0);
                if (totalOrderWeight === 0) totalOrderWeight = activeZones.length; // Fallback if all weights are 0

                let randomPick = Math.random() * totalOrderWeight;
                let selectedZone = null;
                for (const zone of activeZones) {
                    const weight = (zone.minOrders + zone.maxOrders) / 2 > 0 ? (zone.minOrders + zone.maxOrders) / 2 : (totalOrderWeight === activeZones.length ? 1 : 0);
                    if (randomPick < weight) { selectedZone = zone; break; }
                    randomPick -= weight;
                }
                if (!selectedZone && activeZones.length > 0) selectedZone = activeZones[Math.floor(Math.random() * activeZones.length)]; // Fallback if weighting fails

                if (selectedZone) {
                    profileSourceInfo += ` (Zone Type: ${selectedZone.type})`;
                    if (selectedZone.type === 'uniform') {
                        const uniformPoints = generateUniformPointInPolygon(1, chandigarhGeoJsonPolygon);
                        newOrderLocation = uniformPoints.length > 0 ? uniformPoints[0] : { ...defaultDarkStoreLocationSim };
                    } else if (selectedZone.type === 'hotspot') {
                        const hotspotCenter = { lat: selectedZone.centerLat, lng: selectedZone.centerLng };
                        const spreadKm = selectedZone.spreadKm; const spreadDeg = spreadKm / 111; // Approx conversion
                        let attempts = 0;
                        do {
                            newOrderLocation = { lat: hotspotCenter.lat + (Math.random() - 0.5) * 2 * spreadDeg, lng: hotspotCenter.lng + (Math.random() - 0.5) * 2 * spreadDeg };
                            attempts++;
                        } while (!isPointInPolygon([newOrderLocation.lng, newOrderLocation.lat], chandigarhGeoJsonPolygon) && attempts < 100);
                        if (attempts >= 100 && !isPointInPolygon([newOrderLocation.lng, newOrderLocation.lat], chandigarhGeoJsonPolygon)) newOrderLocation = { ...hotspotCenter };
                    } else if (selectedZone.type === 'sector') {
                        if (selectedZone.selectedSectors && selectedZone.selectedSectors.length > 0) {
                            const randomSectorName = selectedZone.selectedSectors[Math.floor(Math.random() * selectedZone.selectedSectors.length)];
                            profileSourceInfo += ` - ${randomSectorName}`;
                            const sectorData = chandigarhSectors.find(s => s.name === randomSectorName); // chandigarhSectors needs to be imported
                            if (sectorData) {
                                const sectorCenter = { lat: sectorData.lat, lng: sectorData.lng }; const sectorSpreadDeg = 0.005; // Small spread within sector
                                let attempts = 0;
                                do {
                                    newOrderLocation = { lat: sectorCenter.lat + (Math.random() - 0.5) * 2 * sectorSpreadDeg, lng: sectorCenter.lng + (Math.random() - 0.5) * 2 * sectorSpreadDeg };
                                    attempts++;
                                } while (!isPointInPolygon([newOrderLocation.lng, newOrderLocation.lat], chandigarhGeoJsonPolygon) && attempts < 50);
                                if (attempts >= 50 && !isPointInPolygon([newOrderLocation.lng, newOrderLocation.lat], chandigarhGeoJsonPolygon)) newOrderLocation = { ...sectorCenter };
                            } else newOrderLocation = { ...defaultDarkStoreLocationSim };
                        } else newOrderLocation = { ...defaultDarkStoreLocationSim };
                    } else if (selectedZone.type === 'route') {
                        if (selectedZone.routePoints && selectedZone.routePoints.length >= 1) { // Need at least one point to define area
                            // For simplicity, pick a random point along the route or within its bounding box + spread
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
                                newOrderLocation = generateUniformPointInPolygon(1, chandigarhGeoJsonPolygon)[0] || {...defaultDarkStoreLocationSim};
                            }
                        } else newOrderLocation = generateUniformPointInPolygon(1, chandigarhGeoJsonPolygon)[0] || {...defaultDarkStoreLocationSim};
                    } else newOrderLocation = { ...defaultDarkStoreLocationSim }; // Fallback for unknown custom zone type
                } else { stats.totalOrdersGenerated--; return; } // No active zone in custom profile
            } else { stats.totalOrdersGenerated--; return; } // Custom profile defined but no zones or not found
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
            if (attempts >= 100 && !isPointInPolygon([newOrderLocation.lng, newOrderLocation.lat], chandigarhGeoJsonPolygon)) newOrderLocation = { ...defaultDarkStoreLocationSim };
        } else { // Default: 'default_uniform'
            profileSourceInfo = `Default Uniform (Radius: ${getSimParameter('uniformOrderRadiusKm')}km)`;
            const radiusDeg = getSimParameter('uniformOrderRadiusKm') / 111.0;
            let attempts = 0;
            do {
                const angle = Math.random() * 2 * Math.PI;
                const distance = Math.sqrt(Math.random()) * radiusDeg; // sqrt for uniform distribution in circle
                newOrderLocation = {
                    lat: defaultDarkStoreLocationSim.lat + distance * Math.sin(angle),
                    lng: defaultDarkStoreLocationSim.lng + distance * Math.cos(angle)
                };
                attempts++;
            } while (!isPointInPolygon([newOrderLocation.lng, newOrderLocation.lat], chandigarhGeoJsonPolygon) && attempts < 200);

            if (attempts >= 200 && !isPointInPolygon([newOrderLocation.lng, newOrderLocation.lat], chandigarhGeoJsonPolygon)) {
                const uniformPoints = generateUniformPointInPolygon(1, chandigarhGeoJsonPolygon); // Fallback
                newOrderLocation = uniformPoints.length > 0 ? uniformPoints[0] : { ...defaultDarkStoreLocationSim };
                profileSourceInfo += " (Fallback to city boundary)";
            }
        }
    } else { // Fallback if no profile selected or error
        profileSourceInfo = "Fallback Uniform";
        const uniformPoints = generateUniformPointInPolygon(1, chandigarhGeoJsonPolygon);
        newOrderLocation = uniformPoints.length > 0 ? uniformPoints[0] : { ...defaultDarkStoreLocationSim };
    }


    logMessage(`Order ${orderId} from ${profileSourceInfo} at [${newOrderLocation.lat.toFixed(4)}, ${newOrderLocation.lng.toFixed(4)}].`, 'ORDER_GEN', simulationLogEl, currentSimulationTime);

    const newOrder = {
        id: orderId,
        location: newOrderLocation,
        status: 'pending', // 'pending', 'assigned_to_agent_going_to_store', 'at_store_with_agent', 'out_for_delivery', 'delivered'
        assignedAgentId: null,
        etaMinutes: null,
        timePlaced: currentSimulationTime,
        assignmentTime: null, // Time when an agent was assigned
        noAgentLogged: false, // To prevent spamming "no agent" log
    };
    orders.push(newOrder);

    if (simulationMap) {
        orderMarkers[orderId] = L.marker([newOrder.location.lat, newOrder.location.lng], { icon: createOrderIcon(orderId, 'pending') })
            .addTo(simulationMap)
            .bindPopup(`<b>Order ${newOrder.id}</b><br>Status: ${newOrder.status}<br>Placed at: T+${newOrder.timePlaced} min`);
    }
}


/**
 * Calculates Estimated Time of Arrival for an agent to deliver an order.
 * @param {object} agent The agent object.
 * @param {object} orderLocation The order's location {lat, lng}.
 * @returns {number} ETA in minutes.
 */
function calculateETA(agent, orderLocation) {
    const effectiveTraffic = getSimParameter('enableDynamicTraffic') ? getSimParameter('currentDynamicTrafficFactor') : getSimParameter('baseTrafficFactor');
    const agentToStoreDistKm = getDistanceKm(agent.location, defaultDarkStoreLocationSim);
    const storeToOrderDistKm = getDistanceKm(defaultDarkStoreLocationSim, orderLocation);
    const totalTravelDistKm = agentToStoreDistKm + storeToOrderDistKm;
    const travelTimeHours = totalTravelDistKm / (agent.speedKmph * effectiveTraffic); // speedKmph already considers individual agent speed
    const travelTimeMinutes = travelTimeHours * 60;
    return travelTimeMinutes + getSimParameter('handlingTime');
}

/**
 * Assigns pending orders to available agents.
 */
function assignOrders() {
    orders.filter(o => o.status === 'pending').forEach(order => {
        let bestAgent = null;
        let shortestETA = Infinity;

        agents.filter(a => a.status === 'available').forEach(agent => {
            const eta = calculateETA(agent, order.location);
            if (eta < shortestETA) {
                shortestETA = eta;
                bestAgent = agent;
            }
        });

        if (bestAgent) {
            order.status = 'assigned_to_agent_going_to_store';
            order.assignedAgentId = bestAgent.id;
            order.etaMinutes = shortestETA;
            order.assignmentTime = currentSimulationTime;
            const waitTime = order.assignmentTime - order.timePlaced;
            stats.sumOrderWaitTimes += waitTime;
            stats.countAssignedOrders++;

            bestAgent.assignedOrderId = order.id;
            bestAgent.status = 'to_store';
            logMessage(`Agent ${bestAgent.id} assigned Order ${order.id}. ETA: ${shortestETA.toFixed(1)} min. Wait: ${waitTime} min.`, 'AGENT_ASSIGN', simulationLogEl, currentSimulationTime);

            const waypointsToStore = generateWaypoints(bestAgent.location, defaultDarkStoreLocationSim, getSimParameter('routeWaypoints'));
            bestAgent.routePath = [bestAgent.location, ...waypointsToStore, defaultDarkStoreLocationSim];
            bestAgent.currentLegIndex = 0;
            bestAgent.legProgress = 0;
            logMessage(`Agent ${bestAgent.id} en route to Dark Store for Order ${order.id}.`, 'AGENT_MOVE', simulationLogEl, currentSimulationTime);

            if (bestAgent.routePolyline) bestAgent.routePolyline.remove();
            if (simulationMap && bestAgent.routePath.length > 0) {
                bestAgent.routePolyline = L.polyline(bestAgent.routePath.map(p => [p.lat, p.lng]), { color: '#0ea5e9', weight: 3, opacity: 0.7, dashArray: '5, 5' }).addTo(simulationMap);
            }
            if (orderMarkers[order.id]) {
                orderMarkers[order.id].setIcon(createOrderIcon(order.id, 'assigned')).setPopupContent(`<b>Order ${order.id}</b><br>Status: Assigned (Agent ${bestAgent.id})<br>ETA: ${order.etaMinutes.toFixed(1)} min`);
            }
            if (agentMarkers[bestAgent.id]) {
                agentMarkers[bestAgent.id].setIcon(createAgentIcon(bestAgent.id, true)).setPopupContent(`<b>Agent ${bestAgent.id}</b><br>Status: To Store (Order ${order.id})`);
            }
        } else {
            if (!order.noAgentLogged) {
                logMessage(`No available agent for Order ${order.id}. Order remains pending.`, 'SYS_WARN', simulationLogEl, currentSimulationTime);
                order.noAgentLogged = true;
            }
        }
    });
}


/**
 * Updates agent movements, statuses, and handles deliveries.
 */
function updateAgentsMovementAndStatus() {
    const effectiveTraffic = getSimParameter('enableDynamicTraffic') ? getSimParameter('currentDynamicTrafficFactor') : getSimParameter('baseTrafficFactor');

    agents.forEach(agent => {
        agent.totalTime += MINUTES_PER_SIMULATION_STEP;
        if (agent.status !== 'available') {
            agent.busyTime += MINUTES_PER_SIMULATION_STEP;
            stats.totalAgentActiveTime += MINUTES_PER_SIMULATION_STEP;
        }

        if (agent.status === 'available') return;

        if (agent.status === 'at_store') {
            agent.timeSpentAtStore += MINUTES_PER_SIMULATION_STEP;
            stats.totalAgentHandlingTime += MINUTES_PER_SIMULATION_STEP;
            // logMessage(`Agent ${agent.id} handling Order ${agent.assignedOrderId} at store. (${agent.timeSpentAtStore}/${getSimParameter('handlingTime')} min done)`, 'AGENT_HANDLE', simulationLogEl, currentSimulationTime);

            if (agent.timeSpentAtStore >= getSimParameter('handlingTime')) {
                const order = orders.find(o => o.id === agent.assignedOrderId);
                if (order && order.location) {
                    agent.status = 'to_customer';
                    const waypointsToCustomer = generateWaypoints(defaultDarkStoreLocationSim, order.location, getSimParameter('routeWaypoints'));
                    agent.routePath = [defaultDarkStoreLocationSim, ...waypointsToCustomer, order.location];
                    order.status = 'out_for_delivery';
                    logMessage(`Agent ${agent.id} LEFT store with Order ${order.id}. En route to customer.`, 'AGENT_DEPART', simulationLogEl, currentSimulationTime);

                    agent.currentLegIndex = 0; agent.legProgress = 0; agent.timeSpentAtStore = 0;
                    if (agent.routePolyline) agent.routePolyline.remove();
                    if (simulationMap && agent.routePath.length > 1) {
                        agent.routePolyline = L.polyline(agent.routePath.map(p => [p.lat, p.lng]), { color: '#16a34a', weight: 3, opacity: 0.8 }).addTo(simulationMap);
                    }
                    if (agentMarkers[agent.id]) { agentMarkers[agent.id].setPopupContent(`<b>Agent ${agent.id}</b><br>Status: To Customer (Order ${agent.assignedOrderId})`); }
                    if (orderMarkers[order.id]) { orderMarkers[order.id].setIcon(createOrderIcon(order.id, 'assigned')); } // Keep 'assigned' icon for out_for_delivery
                } else {
                    logMessage(`Order ${agent.assignedOrderId} not found for Agent ${agent.id} at store. Agent becoming available.`, 'SYS_ERROR', simulationLogEl, currentSimulationTime);
                    agent.status = 'available'; agent.assignedOrderId = null;
                    if (agent.routePolyline) { agent.routePolyline.remove(); agent.routePolyline = null; }
                }
            }
            return;
        }

        // For 'to_store' or 'to_customer'
        if (agent.status === 'to_store' || agent.status === 'to_customer') {
            stats.totalAgentTravelTime += MINUTES_PER_SIMULATION_STEP;
        }

        if (!agent.routePath || agent.routePath.length < 2 || agent.currentLegIndex >= agent.routePath.length - 1) return;

        const startPoint = agent.routePath[agent.currentLegIndex];
        const endPoint = agent.routePath[agent.currentLegIndex + 1];

        if (!startPoint || !endPoint || typeof startPoint.lat !== 'number' || typeof endPoint.lat !== 'number') {
            logMessage(`Invalid route for Agent ${agent.id}. Resetting agent.`, 'SYS_ERROR', simulationLogEl, currentSimulationTime);
            agent.status = 'available'; agent.assignedOrderId = null; if (agent.routePolyline) agent.routePolyline.remove(); return;
        }

        const legDistanceKm = getDistanceKm(startPoint, endPoint);
        let distanceCoveredThisStepKm = 0;

        if (legDistanceKm < 0.001) { // Effectively at the waypoint
            agent.legProgress = 1;
        } else {
            distanceCoveredThisStepKm = (agent.speedKmph * effectiveTraffic / 60) * MINUTES_PER_SIMULATION_STEP;
            agent.legProgress += (distanceCoveredThisStepKm / legDistanceKm);
            agent.distanceTraveledThisSimKm += distanceCoveredThisStepKm;
            stats.totalDistanceTraveledByAgentsKm += distanceCoveredThisStepKm;
        }

        if (agent.legProgress >= 1) {
            agent.legProgress = 0;
            agent.location = { ...endPoint };
            agent.currentLegIndex++;

            if (agent.status === 'to_store' && agent.currentLegIndex === agent.routePath.length - 1) { // Arrived at store
                agent.status = 'at_store';
                agent.timeSpentAtStore = 0;
                logMessage(`Agent ${agent.id} ARRIVED at Dark Store for Order ${agent.assignedOrderId}.`, 'AGENT_ARRIVE_STORE', simulationLogEl, currentSimulationTime);
                const order = orders.find(o => o.id === agent.assignedOrderId);
                if (order) order.status = 'at_store_with_agent';
                if (agentMarkers[agent.id]) { agentMarkers[agent.id].setPopupContent(`<b>Agent ${agent.id}</b><br>Status: At Store (Order ${agent.assignedOrderId})`); }
            } else if (agent.status === 'to_customer' && agent.currentLegIndex === agent.routePath.length - 1) { // Arrived at customer
                const deliveredOrder = orders.find(o => o.id === agent.assignedOrderId);
                if (deliveredOrder && deliveredOrder.location.lat === agent.location.lat && deliveredOrder.location.lng === agent.location.lng) {
                    deliveredOrder.status = 'delivered';
                    stats.totalOrdersDelivered++;
                    const deliveryDuration = currentSimulationTime - deliveredOrder.timePlaced;
                    stats.sumDeliveryTimes += deliveryDuration;
                    stats.allDeliveryTimes.push(deliveryDuration);
                    logMessage(`Agent ${agent.id} DELIVERED Order ${agent.assignedOrderId}. Delivery time: ${deliveryDuration.toFixed(1)} min.`, 'ORDER_DELIVER', simulationLogEl, currentSimulationTime);

                    if (orderMarkers[agent.assignedOrderId]) { orderMarkers[agent.assignedOrderId].remove(); delete orderMarkers[agent.assignedOrderId]; }
                    agent.deliveriesMade++;
                    agent.status = 'available';
                    logMessage(`Agent ${agent.id} now AVAILABLE. Total deliveries: ${agent.deliveriesMade}.`, 'AGENT_AVAIL', simulationLogEl, currentSimulationTime);
                    if (agent.routePolyline) { agent.routePolyline.remove(); agent.routePolyline = null; }
                    agent.assignedOrderId = null; agent.routePath = []; agent.currentLegIndex = 0;
                    if (agentMarkers[agent.id]) {
                        agentMarkers[agent.id].setIcon(createAgentIcon(agent.id, false)).setPopupContent(`<b>Agent ${agent.id}</b><br>Status: Available`);
                    }
                } else {
                     logMessage(`Agent ${agent.id} arrived for Order ${agent.assignedOrderId}, but location mismatch or order not found. Agent becoming available.`, 'SYS_ERROR', simulationLogEl, currentSimulationTime);
                    agent.status = 'available'; agent.assignedOrderId = null; agent.routePath = []; agent.currentLegIndex = 0;
                }
            }
        } else { // Still on the current leg
            const currentLegStart = agent.routePath[agent.currentLegIndex];
            const currentLegEnd = agent.routePath[agent.currentLegIndex + 1];
            if (currentLegStart && currentLegEnd && typeof currentLegStart.lat === 'number' && typeof currentLegEnd.lat === 'number') {
                const newLat = currentLegStart.lat + (currentLegEnd.lat - currentLegStart.lat) * agent.legProgress;
                const newLng = currentLegStart.lng + (currentLegEnd.lng - currentLegStart.lng) * agent.legProgress;
                agent.location = { lat: newLat, lng: newLng };
            }
        }
        if (agentMarkers[agent.id] && simulationMap && agent.location && typeof agent.location.lat === 'number') {
            agentMarkers[agent.id].setLatLng([agent.location.lat, agent.location.lng]);
        }
    });
}

/**
 * The main simulation step, called at each interval.
 */
function simulationStep() {
    if (!isSimulationRunning) return;
    currentSimulationTime += MINUTES_PER_SIMULATION_STEP;
    updateSimTimeDisplay(currentSimulationTime);

    // Dynamic Traffic Update
    if (getSimParameter('enableDynamicTraffic') && (currentSimulationTime % DYNAMIC_TRAFFIC_UPDATE_INTERVAL === 0 || currentSimulationTime === MINUTES_PER_SIMULATION_STEP)) {
        const factors = [0.7, 0.8, 0.9, 1.0, 1.1, 1.2, 1.3]; // Example factors
        setSimParameter('currentDynamicTrafficFactor', factors[Math.floor(Math.random() * factors.length)]);
        logMessage(`Dynamic traffic condition changed. New factor: ${getSimParameter('currentDynamicTrafficFactor').toFixed(1)}x`, "TRAFFIC", simulationLogEl, currentSimulationTime);
        updateTrafficStatusDisplay(getSimParameter('currentDynamicTrafficFactor'));
    }

    // Order Generation
    if (Math.random() < getSimParameter('currentOrderGenerationProbability')) {
        generateOrder();
    }

    // Agent Logic
    updateAgentsMovementAndStatus();
    assignOrders();

    // UI Updates
    updateAgentStatusListUI();
    updatePendingOrdersListUI();
    updateSimulationStatsUI();
    updateLiveCharts();


    // Clean up delivered orders from main array (optional, for performance on very long sims)
    orders = orders.filter(o => o.status !== 'delivered');
}


// --- UI Update Functions ---
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

    // Cost calculations
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

// --- Live Chart Functions ---
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
    if (isSimulationRunning || currentSimulationTime === 0) { // Update if running or at the very start to clear
        liveChartData.simTimeHistory.push(currentSimulationTime);
        liveChartData.pendingOrdersHistory.push(orders.filter(o => o.status !== 'delivered').length);
        liveChartData.activeAgentsHistory.push(agents.filter(a => a.status !== 'available').length);

        // Keep history to a reasonable length to avoid performance issues
        const maxHistoryLength = 100;
        if (liveChartData.simTimeHistory.length > maxHistoryLength) {
            liveChartData.simTimeHistory.shift();
            liveChartData.pendingOrdersHistory.shift();
            liveChartData.activeAgentsHistory.shift();
        }
    }
    if (getChartInstance('pendingOrders')) { // Check if chart instance exists
      updateChartData('pendingOrders', liveChartData.simTimeHistory, [liveChartData.pendingOrdersHistory]);
    }
    if (getChartInstance('activeAgents')) {
      updateChartData('activeAgents', liveChartData.simTimeHistory, [liveChartData.activeAgentsHistory]);
    }
}

// Export functions that might be needed by other modules (e.g., scenario analysis to save parameters)
export function getCurrentSimulationParameters() {
    return { ...simParams }; // Return a copy
}
export function getCurrentSimulationStats() {
    return { ...stats, currentSimTime: currentSimulationTime }; // Return a copy
}

