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
let allGeneratedOrdersThisRun = []; 
let agentMarkers = {};
let orderMarkers = {};
let simulationIntervalId;
let currentSimulationTime = 0;
let orderIdCounter = 0;
let agentIdCounter = 1;
let isSimulationRunning = false;
let deliveryTimeHeatmapLayer = null;
let deliveredOrderDataForHeatmap = [];
let orderGenerationBuffer = 0; 

// --- Fatigue Constants ---
const FATIGUE_CONSECUTIVE_DELIVERIES_THRESHOLD = 5; 
const FATIGUE_CONTINUOUSLY_ACTIVE_THRESHOLD_MIN = 90; 
const FATIGUE_REDUCTION_STEP = 0.1; 
const MIN_FATIGUE_FACTOR = 0.6;     
const FATIGUE_RECOVERY_IDLE_TIME_MIN = 20; 
const FATIGUE_RECOVERY_STEP = 0.05; 
const FATIGUE_UPDATE_INTERVAL = 5;

// --- Simulation Parameters (with defaults) ---
let simParams = {
    numAgents: 10, // Default 10, max 30 will be set by slider in HTML
    agentMinSpeed: 20,
    agentMaxSpeed: 30,
    handlingTime: 5,
    orderGenerationProfile: 'default_uniform',
    uniformOrderRadiusKm: 5,
    defaultFocusRadiusKm: 3,
    routeWaypoints: 1,
    baseTrafficFactor: 1.0,
    enableDynamicTraffic: false,
    currentDynamicTrafficFactor: 1.0,
    agentCostPerHour: 150,
    costPerKmTraveled: 5,
    fixedCostPerDelivery: 10,
    ordersPerMinute: 0.5, 
};

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
let orderGenerationProfileSelectEl, uniformOrderRadiusContainerEl, defaultOrderFocusRadiusContainerEl;
let statsTotalOrdersGeneratedEl, statsTotalOrdersDeliveredEl, statsAvgDeliveryTimeEl, statsMinDeliveryTimeEl,
    statsMaxDeliveryTimeEl, statsStdDevDeliveryTimeEl, statsAvgOrderWaitTimeEl, statsAvgAgentUtilizationEl,
    statsTotalAgentTravelTimeEl, statsTotalAgentHandlingTimeEl, statsTotalSimTimeEl,
    statsTotalAgentLaborCostEl, statsTotalTravelCostEl, statsTotalFixedDeliveryCostsEl,
    statsOverallTotalOperationalCostEl, statsAverageCostPerOrderEl, saveCurrentSimScenarioBtnEl;
let toggleDeliveryTimeHeatmapCheckboxEl;
let exportSimResultsBtnEl;
let analyzeSimResultsAIButtonEl, simulationAiAnalysisContainerEl, 
    simulationAiAnalysisLoadingEl, simulationAiAnalysisContentEl;
let ordersPerMinuteInputEl;


export function setSimParameter(key, value) {
    if (simParams.hasOwnProperty(key)) {
        simParams[key] = value;
        if (key === 'orderGenerationProfile') {
            toggleProfileSpecificControlsUI();
        }
    } else {
        console.warn(`[Sim] Attempted to set unknown simulation parameter: ${key}`);
    }
}
export function getSimParameter(key) {
    return simParams.hasOwnProperty(key) ? simParams[key] : undefined;
}

function toggleProfileSpecificControlsUI() {
    const selectedProfile = getSimParameter('orderGenerationProfile');
    const ordersPerMinuteElParent = ordersPerMinuteInputEl?.parentElement;

    if(uniformOrderRadiusContainerEl) uniformOrderRadiusContainerEl.classList.toggle('hidden', selectedProfile !== 'default_uniform');
    if(defaultOrderFocusRadiusContainerEl) defaultOrderFocusRadiusContainerEl.classList.toggle('hidden', selectedProfile !== 'default_focused');
    
    if(ordersPerMinuteElParent) {
        ordersPerMinuteElParent.classList.toggle('hidden', !selectedProfile.startsWith('default_'));
    }
}

function createAgent() {
    const agentId = agentIdCounter++;
    const speedRange = getSimParameter('agentMaxSpeed') - getSimParameter('agentMinSpeed');
    const baseSpeed = speedRange >= 0 ? getSimParameter('agentMinSpeed') + Math.random() * speedRange : getSimParameter('agentMinSpeed');
    
    const newAgent = {
        id: agentId,
        location: {
            lat: defaultDarkStoreLocationSim.lat + (Math.random() - 0.5) * 0.002,
            lng: defaultDarkStoreLocationSim.lng + (Math.random() - 0.5) * 0.002
        },
        baseSpeedKmph: baseSpeed,
        currentFatigueFactor: 1.0,
        consecutiveDeliveriesSinceRest: 0,
        timeContinuouslyActive: 0, 
        timeBecameAvailableAt: currentSimulationTime, 

        speedKmph: baseSpeed, 
        status: 'available', 
        assignedOrderId: null,
        currentOrderETA: null, 
        currentTaskStartTime: 0, 
        assignmentTime: null, 

        routePath: [], currentLegIndex: 0, legProgress: 0, timeSpentAtStore: 0,
        
        deliveriesMade: 0, 
        totalTime: 0,         
        busyTime: 0,          
        timeSpentIdle: 0,     
        timeSpentTraveling: 0,
        timeSpentHandling: 0, 
        distanceTraveledThisSimKm: 0,
        
        routePolyline: null,
    };
    agents.push(newAgent);
    if (simulationMap && agentMarkers) { 
        updateAgentPopup(newAgent); 
    }
}

function updateAgentPopup(agent) {
    if (!agentMarkers || !simulationMap) return;

    const effectiveSpeed = agent.baseSpeedKmph * agent.currentFatigueFactor;
    const fatiguePercent = ((1 - agent.currentFatigueFactor) * 100).toFixed(0);
    let taskTime = currentSimulationTime - agent.currentTaskStartTime;
    if (agent.status === 'available') taskTime = currentSimulationTime - agent.timeBecameAvailableAt;

    let popupContent = `<b>Agent ${agent.id}</b><br>Status: ${agent.status.replace(/_/g, ' ')}`;
    if (agent.assignedOrderId !== null) {
        popupContent += ` (Order: ${agent.assignedOrderId})`;
        if (agent.currentOrderETA !== null) {
            const assignmentTimeForETA = agent.assignmentTime !== null && agent.assignmentTime !== undefined ? agent.assignmentTime : agent.currentTaskStartTime;
            const remainingETA = Math.max(0, agent.currentOrderETA - (currentSimulationTime - assignmentTimeForETA)).toFixed(1);
            popupContent += `<br>Order ETA: ${remainingETA} min (Original: ${agent.currentOrderETA.toFixed(1)} min)`;
        }
    }
    popupContent += `<br>Task Time: ${taskTime} min`;
    popupContent += `<br>Base Speed: ${agent.baseSpeedKmph.toFixed(1)} km/h`;
    popupContent += `<br>Effective Speed: ${effectiveSpeed.toFixed(1)} km/h`;
    popupContent += `<br>Fatigue Level: ${fatiguePercent}%`;
    popupContent += `<br>Deliveries this Stint: ${agent.consecutiveDeliveriesSinceRest}`;

    if (agentMarkers[agent.id]) {
        agentMarkers[agent.id].setIcon(createAgentIcon(agent.id, agent.status !== 'available'));
        agentMarkers[agent.id].setPopupContent(popupContent);
    } else {
         agentMarkers[agent.id] = L.marker([agent.location.lat, agent.location.lng], { icon: createAgentIcon(agent.id, agent.status !== 'available') })
            .addTo(simulationMap)
            .bindPopup(popupContent);
    }
}


function updateSimTimeDisplayLocal(time) {
    const simTimeDisplaySpan = document.getElementById('simTimeDisplay');
    if (simTimeDisplaySpan) simTimeDisplaySpan.textContent = time;
    if (statsTotalSimTimeEl) statsTotalSimTimeEl.textContent = time + " min";
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
        statusText += ` | Fatigue: ${((1 - agent.currentFatigueFactor) * 100).toFixed(0)}%`;
        agentDiv.className = `p-1.5 rounded-md text-xs ${agent.status === 'available' ? 'bg-blue-100 text-blue-700 border border-blue-200' : 'bg-orange-100 text-orange-700 border border-orange-200'}`;
        agentDiv.textContent = statusText;
        agentStatusListEl.appendChild(agentDiv);
    });
}

function updatePendingOrdersListUI() {
    if (!pendingOrdersListEl) return;
    pendingOrdersListEl.innerHTML = '';
    const activeOrdersForList = orders.filter(o => o.status !== 'delivered');
    if (activeOrdersForList.length === 0) { pendingOrdersListEl.innerHTML = '<p class="text-slate-500 italic">No active orders.</p>'; return; }
    activeOrdersForList.forEach(order => {
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
    if (!statsTotalOrdersGeneratedEl) return;
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
    
    let totalAgentSimulatedTime = 0; 
    let totalAgentActualBusyTime = 0; 
    agents.forEach(agent => {
        totalAgentSimulatedTime += agent.totalTime; 
        totalAgentActualBusyTime += agent.busyTime;
    });
    const avgAgentUtilization = totalAgentSimulatedTime > 0 ? (totalAgentActualBusyTime / totalAgentSimulatedTime * 100).toFixed(1) : "N/A";
    statsAvgAgentUtilizationEl.textContent = avgAgentUtilization + (avgAgentUtilization !== "N/A" ? "%" : "");
    
    statsTotalAgentTravelTimeEl.textContent = stats.totalAgentTravelTime.toFixed(0) + " min";
    statsTotalAgentHandlingTimeEl.textContent = stats.totalAgentHandlingTime.toFixed(0) + " min";
    if (statsTotalSimTimeEl) statsTotalSimTimeEl.textContent = currentSimulationTime + " min";
    
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
    
    let pendingOrdersChart = getChartInstance('pendingOrders');
    if (pendingOrdersChart) {
        updateChartData('pendingOrders', liveChartData.simTimeHistory, [{ data: liveChartData.pendingOrdersHistory, label: 'Pending Orders', borderColor: 'rgb(255, 99, 132)', tension: 0.1, fill: false }]);
    }

    let activeAgentsChart = getChartInstance('activeAgents');
    if (activeAgentsChart) {
        updateChartData('activeAgents', liveChartData.simTimeHistory, [{ data: liveChartData.activeAgentsHistory, label: 'Active Agents', borderColor: 'rgb(54, 162, 235)', tension: 0.1, fill: false }]);
    }
}

function resetSimulationState() {
    currentSimulationTime = 0;
    orderIdCounter = 0;
    agentIdCounter = 1;
    isSimulationRunning = false;
    orderGenerationBuffer = 0;

    agents.forEach(agent => { if (agent.routePolyline && simulationMap) simulationMap.removeLayer(agent.routePolyline); });
    agents = [];
    orders = [];
    allGeneratedOrdersThisRun = [];
    Object.values(agentMarkers).forEach(m => { if (simulationMap) simulationMap.removeLayer(m); }); agentMarkers = {};
    Object.values(orderMarkers).forEach(m => { if (simulationMap) simulationMap.removeLayer(m); }); orderMarkers = {};

    deliveredOrderDataForHeatmap = [];
    if (deliveryTimeHeatmapLayer && simulationMap && simulationMap.hasLayer(deliveryTimeHeatmapLayer)) {
        simulationMap.removeLayer(deliveryTimeHeatmapLayer);
    }
    if (deliveryTimeHeatmapLayer) {
        deliveryTimeHeatmapLayer.setData({max:1, data:[]});
    }
    if (toggleDeliveryTimeHeatmapCheckboxEl) {
        toggleDeliveryTimeHeatmapCheckboxEl.checked = false;
        toggleDeliveryTimeHeatmapCheckboxEl.disabled = (deliveryTimeHeatmapLayer === null);
    }

    for (let key in stats) {
        if (Array.isArray(stats[key])) stats[key] = [];
        else if (typeof stats[key] === 'number') stats[key] = 0;
    }
    for (let key in liveChartData) {
        liveChartData[key] = [];
    }
    updateLiveCharts(); // Update charts with empty data

    simParams = {
        numAgents: parseInt(document.getElementById('numAgentsSlider')?.value) || 10,
        agentMinSpeed: parseInt(document.getElementById('agentMinSpeedSlider')?.value) || 20,
        agentMaxSpeed: parseInt(document.getElementById('agentMaxSpeedSlider')?.value) || 30,
        handlingTime: parseInt(document.getElementById('handlingTimeSlider')?.value) || 5,
        orderGenerationProfile: document.getElementById('orderGenerationProfileSelect')?.value || 'default_uniform',
        uniformOrderRadiusKm: parseFloat(document.getElementById('uniformOrderRadiusKmSlider')?.value) || 5,
        defaultFocusRadiusKm: parseFloat(document.getElementById('defaultOrderFocusRadiusSlider')?.value) || 3,
        routeWaypoints: parseInt(document.getElementById('routeWaypointsSelect')?.value) || 1,
        baseTrafficFactor: parseFloat(document.getElementById('manualTrafficControl')?.value) || 1.0,
        enableDynamicTraffic: document.getElementById('enableDynamicTraffic')?.checked || false,
        currentDynamicTrafficFactor: 1.0,
        agentCostPerHour: parseFloat(document.getElementById('agentCostPerHour')?.value) || 150,
        costPerKmTraveled: parseFloat(document.getElementById('costPerKmTraveled')?.value) || 5,
        fixedCostPerDelivery: parseFloat(document.getElementById('fixedCostPerDelivery')?.value) || 10,
        ordersPerMinute: parseFloat(ordersPerMinuteInputEl?.value) || 0.5,
    };

    const numAgents = getSimParameter('numAgents');
    for (let i = 0; i < numAgents; i++) {
        createAgent();
    }

    updateSimTimeDisplayLocal(currentSimulationTime); 
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

    if (simulationAiAnalysisContainerEl) simulationAiAnalysisContainerEl.classList.add('hidden');
    if (simulationAiAnalysisContentEl) simulationAiAnalysisContentEl.textContent = 'Click "Analyze with AI" to get insights on your simulation results.';
    if (analyzeSimResultsAIButtonEl) analyzeSimResultsAIButtonEl.disabled = true;
}

// --- Event Handler Functions ---
function startSimulation() {
    if (isSimulationRunning) return;
    if (currentSimulationTime === 0) {
        resetSimulationState(); 
        logMessage(`Simulation started. Orders/Min: ${getSimParameter('ordersPerMinute')}`, 'SYSTEM', simulationLogEl, currentSimulationTime);
    } else {
        logMessage(`Simulation resumed. Orders/Min: ${getSimParameter('ordersPerMinute')}`, 'SYSTEM', simulationLogEl, currentSimulationTime);
    }
    isSimulationRunning = true;
    simulationIntervalId = setInterval(simulationStep, SIMULATION_STEP_INTERVAL_MS);
    if (startSimBtnEl) startSimBtnEl.disabled = true;
    if (pauseSimBtnEl) pauseSimBtnEl.disabled = false;
    if (analyzeSimResultsAIButtonEl) analyzeSimResultsAIButtonEl.disabled = true;
    toggleSimConfigLock(true);
}

function pauseSimulation() {
    if (!isSimulationRunning) return;
    isSimulationRunning = false;
    clearInterval(simulationIntervalId);
    logMessage("Simulation paused.", 'SYSTEM', simulationLogEl, currentSimulationTime);
    if (startSimBtnEl) startSimBtnEl.disabled = false;
    if (pauseSimBtnEl) pauseSimBtnEl.disabled = true;
    if (analyzeSimResultsAIButtonEl && currentSimulationTime > 0) analyzeSimResultsAIButtonEl.disabled = false;
}

function resetSimulation() {
    if (isSimulationRunning) {
        isSimulationRunning = false;
        clearInterval(simulationIntervalId);
    }
    resetSimulationState();
}

function toggleDeliveryTimeHeatmapDisplay() { /* ... as before ... */ }
function updateDeliveryTimeHeatmapData() { /* ... as before ... */ }
function updateAgentFatigue(agent) { 
    if (currentSimulationTime % FATIGUE_UPDATE_INTERVAL !== 0 && agent.status !== 'available') return; 

    let fatigueStatusChanged = false;
    const previousFatigueFactor = agent.currentFatigueFactor;

    if (agent.status !== 'available') {
        if (agent.consecutiveDeliveriesSinceRest >= FATIGUE_CONSECUTIVE_DELIVERIES_THRESHOLD || 
            agent.timeContinuouslyActive >= FATIGUE_CONTINUOUSLY_ACTIVE_THRESHOLD_MIN) {
            
            if (agent.currentFatigueFactor > MIN_FATIGUE_FACTOR) {
                agent.currentFatigueFactor = Math.max(MIN_FATIGUE_FACTOR, agent.currentFatigueFactor - FATIGUE_REDUCTION_STEP);
                fatigueStatusChanged = true;
            }
        }
    } else { 
        const idleTimeSinceLastAvailable = currentSimulationTime - agent.timeBecameAvailableAt;
        if (agent.currentFatigueFactor < 1.0 && idleTimeSinceLastAvailable >= FATIGUE_RECOVERY_IDLE_TIME_MIN) {
            agent.currentFatigueFactor = Math.min(1.0, agent.currentFatigueFactor + FATIGUE_RECOVERY_STEP);
            if (agent.currentFatigueFactor === 1.0 || agent.currentFatigueFactor > previousFatigueFactor) {
                 agent.consecutiveDeliveriesSinceRest = 0;
                 agent.timeBecameAvailableAt = currentSimulationTime;
            }
            fatigueStatusChanged = true;
        }
    }

    if (fatigueStatusChanged) {
        logMessage(`Agent ${agent.id} fatigue factor is now ${agent.currentFatigueFactor.toFixed(2)}. Effective speed: ${(agent.baseSpeedKmph * agent.currentFatigueFactor).toFixed(1)} km/h.`, 'AGENT', simulationLogEl, currentSimulationTime);
        updateAgentPopup(agent);
    }
}

function generateUniformPointInChd(numPoints, polygonCoords) {
    const points = [];
    if (numPoints <= 0) return points;
    let attempts = 0;
    const localBounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
    polygonCoords.forEach(p => {
        if (p[0] < localBounds.minX) localBounds.minX = p[0];
        if (p[0] > localBounds.maxX) localBounds.maxX = p[0];
        if (p[1] < localBounds.minY) localBounds.minY = p[1];
        if (p[1] > localBounds.maxY) localBounds.maxY = p[1];
    });
    while (points.length < numPoints && attempts < numPoints * 200) {
        attempts++;
        const lng = Math.random() * (localBounds.maxX - localBounds.minX) + localBounds.minX;
        const lat = Math.random() * (localBounds.maxY - localBounds.minY) + localBounds.minY;
        if (isPointInPolygon([lng, lat], polygonCoords)) {
            points.push({ lat, lng });
        }
    }
    return points;
}


function generateOrder() {
    let newOrderLocation;
    const selectedProfileId = getSimParameter('orderGenerationProfile');
    let profileSourceInfo = `Profile: ${selectedProfileId}`;
    const customProfiles = getCustomDemandProfiles(); 

    if (selectedProfileId.startsWith('custom_')) {
        const profileName = selectedProfileId.substring('custom_'.length);
        profileSourceInfo = `Custom: ${profileName}`;
        const customProfile = customProfiles.find(p => p.name === profileName);

        if (!customProfile || !customProfile.zones || customProfile.zones.length === 0) {
             return; 
        }
        
        let orderGeneratedThisCall = false; 
        for (const zone of customProfile.zones) {
            if (orderGeneratedThisCall) break; 
            if (currentSimulationTime >= zone.startTime && currentSimulationTime <= (zone.endTime || Infinity)) {
                const ordersPerHour = (zone.minOrders + zone.maxOrders) / 2;
                const probPerStep = (ordersPerHour / 60) * MINUTES_PER_SIMULATION_STEP; 
                
                if (Math.random() < probPerStep) { 
                    profileSourceInfo += ` (Zone Type: ${zone.type})`;
                    if (zone.type === 'uniform') {
                        const uniformPoints = generateUniformPointInChd(1, chandigarhGeoJsonPolygon);
                        newOrderLocation = uniformPoints.length > 0 ? uniformPoints[0] : { ...defaultDarkStoreLocationSim };
                    } else if (zone.type === 'hotspot') {
                        const hotspotCenter = { lat: zone.centerLat, lng: zone.centerLng };
                        const spreadKm = zone.spreadKm || 1; const spreadDeg = spreadKm / 111;
                        let attempts = 0;
                        do {
                            newOrderLocation = { lat: hotspotCenter.lat + (Math.random() - 0.5) * 2 * spreadDeg, lng: hotspotCenter.lng + (Math.random() - 0.5) * 2 * spreadDeg };
                            attempts++;
                        } while (!isPointInPolygon([newOrderLocation.lng, newOrderLocation.lat], chandigarhGeoJsonPolygon) && attempts < 100);
                        if (attempts >= 100 && !isPointInPolygon([newOrderLocation.lng, newOrderLocation.lat], chandigarhGeoJsonPolygon)) {
                            newOrderLocation = { ...hotspotCenter };
                        }
                    } else if (zone.type === 'sector') {
                        if (zone.selectedSectors && zone.selectedSectors.length > 0) { // Use 'zone' not 'selectedZone'
                            const randomSectorName = zone.selectedSectors[Math.floor(Math.random() * zone.selectedSectors.length)];
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
                            } else { newOrderLocation = { ...defaultDarkStoreLocationSim }; }
                        } else { newOrderLocation = { ...defaultDarkStoreLocationSim }; }
                    } else if (zone.type === 'route') {
                         if (zone.routePoints && zone.routePoints.length >= 1) { // Use 'zone' not 'selectedZone'
                            const routeBounds = L.latLngBounds(zone.routePoints); 
                            const routeSpreadDeg = (zone.routeSpreadKm || 0.5) / 111;
                            let attempts = 0;
                            do {
                                const randLat = routeBounds.getSouthWest().lat + Math.random() * (routeBounds.getNorthEast().lat - routeBounds.getSouthWest().lat);
                                const randLng = routeBounds.getSouthWest().lng + Math.random() * (routeBounds.getNorthEast().lng - routeBounds.getSouthWest().lng);
                                newOrderLocation = { lat: randLat + (Math.random() - 0.5) * 2 * routeSpreadDeg, lng: randLng + (Math.random() - 0.5) * 2 * routeSpreadDeg };
                                attempts++;
                            } while(!isPointInPolygon([newOrderLocation.lng, newOrderLocation.lat], chandigarhGeoJsonPolygon) && attempts < 50);
                            if (attempts >= 50 && !isPointInPolygon([newOrderLocation.lng, newOrderLocation.lat], chandigarhGeoJsonPolygon)) {
                                newOrderLocation = generateUniformPointInChd(1, chandigarhGeoJsonPolygon)[0] || {...defaultDarkStoreLocationSim};
                            }
                        } else { newOrderLocation = generateUniformPointInChd(1, chandigarhGeoJsonPolygon)[0] || {...defaultDarkStoreLocationSim}; }
                    } else { newOrderLocation = { ...defaultDarkStoreLocationSim }; }
                    
                    if(newOrderLocation) orderGeneratedThisCall = true; 
                    break; 
                }
            }
        }
        if (!orderGeneratedThisCall) return; 

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
        return; 
    }
    stats.totalOrdersGenerated++; 
    const orderId = orderIdCounter++;

    const newOrder = {
        id: orderId, location: newOrderLocation, status: 'pending',
        assignedAgentId: null, etaMinutes: null, timePlaced: currentSimulationTime,
        assignmentTime: null, noAgentLogged: false,
        deliveryDuration: null
    };
    orders.push(newOrder);
    allGeneratedOrdersThisRun.push(newOrder);

    logMessage(`Order ${orderId} from ${profileSourceInfo} at [${newOrderLocation.lat.toFixed(4)}, ${newOrderLocation.lng.toFixed(4)}].`, 'ORDER_GEN', simulationLogEl, currentSimulationTime);

    if (simulationMap && orderMarkers) {
        orderMarkers[orderId] = L.marker([newOrder.location.lat, newOrder.location.lng], { icon: createOrderIcon(orderId, 'pending') })
            .addTo(simulationMap)
            .bindPopup(`<b>Order ${orderId}</b><br>Status: ${newOrder.status}<br>Placed at: T+${newOrder.timePlaced} min`);
    }
}

function calculateETA(agent, orderLocation) { 
    const effectiveTraffic = getSimParameter('enableDynamicTraffic') ? getSimParameter('currentDynamicTrafficFactor') : getSimParameter('baseTrafficFactor');
    const agentEffectiveSpeed = agent.baseSpeedKmph * agent.currentFatigueFactor;

    if (agentEffectiveSpeed <= 0 || effectiveTraffic <= 0) return Infinity;

    const agentToStoreDistKm = getDistanceKm(agent.location, defaultDarkStoreLocationSim);
    const storeToOrderDistKm = getDistanceKm(defaultDarkStoreLocationSim, orderLocation);
    const totalTravelDistKm = agentToStoreDistKm + storeToOrderDistKm;
    
    const travelTimeHours = totalTravelDistKm / (agentEffectiveSpeed * effectiveTraffic);
    const travelTimeMinutes = travelTimeHours * 60;
    return travelTimeMinutes + getSimParameter('handlingTime');
}

function assignOrders() { 
    orders.filter(o => o.status === 'pending').forEach(order => {
        let bestAgent = null;
        let shortestETA = Infinity;
        agents.filter(a => a.status === 'available').forEach(agent => {
            const eta = calculateETA(agent, order.location);
            if (eta < shortestETA) {
                shortestETA = eta; bestAgent = agent;
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
            bestAgent.status = (JSON.stringify(bestAgent.location) === JSON.stringify(defaultDarkStoreLocationSim)) ? 'at_store' : 'to_store';
            bestAgent.currentTaskStartTime = currentSimulationTime; 
            bestAgent.currentOrderETA = shortestETA; 
            bestAgent.timeSpentIdle += (currentSimulationTime - bestAgent.timeBecameAvailableAt); 
            bestAgent.timeContinuouslyActive = 0; 
            logMessage(`Agent ${bestAgent.id} assigned Order ${order.id}. ETA: ${shortestETA.toFixed(1)} min. Wait: ${waitTime} min.`, 'AGENT_ASSIGN', simulationLogEl, currentSimulationTime);
            const waypointsToStore = generateWaypoints(bestAgent.location, defaultDarkStoreLocationSim, getSimParameter('routeWaypoints'));
            bestAgent.routePath = [bestAgent.location, ...waypointsToStore, defaultDarkStoreLocationSim];
            bestAgent.currentLegIndex = 0;
            bestAgent.legProgress = 0;
            if (bestAgent.routePolyline && simulationMap) simulationMap.removeLayer(bestAgent.routePolyline);
            if (simulationMap && bestAgent.routePath.length > 0) {
                bestAgent.routePolyline = L.polyline(bestAgent.routePath.map(p => [p.lat, p.lng]), { color: '#0ea5e9', weight: 3, opacity: 0.7, dashArray: '5, 5' }).addTo(simulationMap);
            }
            if (orderMarkers[order.id]) {
                orderMarkers[order.id].setIcon(createOrderIcon(order.id, 'assigned')).setPopupContent(`<b>Order ${order.id}</b><br>Status: Assigned (Agent ${bestAgent.id})<br>ETA: ${order.etaMinutes.toFixed(1)} min`);
            }
            updateAgentPopup(bestAgent);
        } else {
            if (!order.noAgentLogged) {
                logMessage(`No available agent for Order ${order.id}. Order remains pending.`, 'SYS_WARN', simulationLogEl, currentSimulationTime);
                order.noAgentLogged = true;
            }
        }
    });
}
function updateAgentsMovementAndStatus() { 
    const effectiveTraffic = getSimParameter('enableDynamicTraffic') ? getSimParameter('currentDynamicTrafficFactor') : getSimParameter('baseTrafficFactor');
    agents.forEach(agent => {
        agent.totalTime += MINUTES_PER_SIMULATION_STEP;
        if (agent.status !== 'available') {
            agent.busyTime += MINUTES_PER_SIMULATION_STEP;
            stats.totalAgentActiveTime += MINUTES_PER_SIMULATION_STEP;
            agent.timeContinuouslyActive += MINUTES_PER_SIMULATION_STEP;
        } else {
            agent.timeSpentIdle += MINUTES_PER_SIMULATION_STEP; 
        }

        updateAgentFatigue(agent);
        const agentEffectiveSpeed = agent.baseSpeedKmph * agent.currentFatigueFactor;

        if (agent.status === 'available') {
             updateAgentPopup(agent); 
             return;
        }

        if (agent.status === 'at_store') {
            agent.timeSpentAtStore += MINUTES_PER_SIMULATION_STEP;
            stats.totalAgentHandlingTime += MINUTES_PER_SIMULATION_STEP; 
            agent.timeSpentHandling += MINUTES_PER_SIMULATION_STEP;   
            if (agent.timeSpentAtStore >= getSimParameter('handlingTime')) {
                const order = orders.find(o => o.id === agent.assignedOrderId);
                if (order && order.location) {
                    agent.status = 'to_customer';
                    agent.currentTaskStartTime = currentSimulationTime;
                    const waypointsToCustomer = generateWaypoints(defaultDarkStoreLocationSim, order.location, getSimParameter('routeWaypoints'));
                    agent.routePath = [defaultDarkStoreLocationSim, ...waypointsToCustomer, order.location];
                    order.status = 'out_for_delivery';
                    logMessage(`Agent ${agent.id} LEFT store with Order ${order.id}. En route to customer.`, 'AGENT_DEPART', simulationLogEl, currentSimulationTime);
                    agent.currentLegIndex = 0; agent.legProgress = 0; agent.timeSpentAtStore = 0;
                    if (agent.routePolyline && simulationMap) simulationMap.removeLayer(agent.routePolyline);
                    if (simulationMap && agent.routePath.length > 1) {
                        agent.routePolyline = L.polyline(agent.routePath.map(p => [p.lat, p.lng]), { color: '#16a34a', weight: 3, opacity: 0.8 }).addTo(simulationMap);
                    }
                    if (orderMarkers[order.id]) { orderMarkers[order.id].setIcon(createOrderIcon(order.id, 'assigned')); }
                } else {
                    logMessage(`Order ${agent.assignedOrderId} not found for Agent ${agent.id} at store. Agent becoming available.`, 'SYS_ERROR', simulationLogEl, currentSimulationTime);
                    agent.status = 'available'; agent.assignedOrderId = null; agent.timeBecameAvailableAt = currentSimulationTime; agent.timeContinuouslyActive = 0; agent.consecutiveDeliveriesSinceRest = 0; agent.currentOrderETA = null;
                    if (agent.routePolyline && simulationMap) { simulationMap.removeLayer(agent.routePolyline); agent.routePolyline = null; }
                }
            }
             updateAgentPopup(agent);
            return;
        }
        
        if (agent.status === 'to_store' || agent.status === 'to_customer') {
            stats.totalAgentTravelTime += MINUTES_PER_SIMULATION_STEP;
            agent.timeSpentTraveling += MINUTES_PER_SIMULATION_STEP;
        }

        if (!agent.routePath || agent.routePath.length < 2 || agent.currentLegIndex >= agent.routePath.length - 1) {
            if (agent.status === 'to_store' && JSON.stringify(agent.location) === JSON.stringify(defaultDarkStoreLocationSim)) {
                 agent.status = 'at_store'; agent.currentTaskStartTime = currentSimulationTime; agent.timeSpentAtStore = 0;
            } else if (agent.status === 'to_customer' && agent.routePath.length > 0 && JSON.stringify(agent.location) === JSON.stringify(agent.routePath[agent.routePath.length - 1])) {
                 const deliveredOrder = orders.find(o => o.id === agent.assignedOrderId);
                if (deliveredOrder && deliveredOrder.status !== 'delivered') { /* process delivery */ }
                agent.status = 'available'; /* reset agent */
            }
            updateAgentPopup(agent);
            return;
        }

        const startPoint = agent.routePath[agent.currentLegIndex];
        const endPoint = agent.routePath[agent.currentLegIndex + 1];

        if (!startPoint || !endPoint || typeof startPoint.lat !== 'number' || typeof endPoint.lat !== 'number') {
            logMessage(`Invalid route for Agent ${agent.id}. Resetting agent.`, 'SYS_ERROR', simulationLogEl, currentSimulationTime);
            agent.status = 'available'; agent.assignedOrderId = null; agent.timeBecameAvailableAt = currentSimulationTime; agent.timeContinuouslyActive = 0; agent.consecutiveDeliveriesSinceRest = 0; agent.currentOrderETA = null;
            if (agent.routePolyline && simulationMap) simulationMap.removeLayer(agent.routePolyline); 
            updateAgentPopup(agent);
            return;
        }

        const legDistanceKm = getDistanceKm(startPoint, endPoint);
        let distanceCoveredThisStepKm = 0;
        if (legDistanceKm < 0.001) { 
            agent.legProgress = 1;
        } else {
            distanceCoveredThisStepKm = (agentEffectiveSpeed * effectiveTraffic / 60) * MINUTES_PER_SIMULATION_STEP;
            agent.legProgress += (distanceCoveredThisStepKm / legDistanceKm);
            agent.distanceTraveledThisSimKm += distanceCoveredThisStepKm;
            stats.totalDistanceTraveledByAgentsKm += distanceCoveredThisStepKm;
        }

        if (agent.legProgress >= 1) {
            agent.legProgress = 0;
            agent.location = { ...endPoint };
            agent.currentLegIndex++;

            if (agent.currentLegIndex >= agent.routePath.length - 1) { 
                if (agent.status === 'to_store') {
                    agent.status = 'at_store';
                    agent.currentTaskStartTime = currentSimulationTime; 
                    agent.timeSpentAtStore = 0;
                    logMessage(`Agent ${agent.id} ARRIVED at Dark Store for Order ${agent.assignedOrderId}.`, 'AGENT_ARRIVE_STORE', simulationLogEl, currentSimulationTime);
                    const order = orders.find(o => o.id === agent.assignedOrderId);
                    if (order) order.status = 'at_store_with_agent';
                } else if (agent.status === 'to_customer') {
                    const deliveredOrder = orders.find(o => o.id === agent.assignedOrderId);
                    const masterOrderRecord = allGeneratedOrdersThisRun.find(o => o.id === agent.assignedOrderId);

                    if (deliveredOrder && deliveredOrder.status !== 'delivered') {
                        deliveredOrder.status = 'delivered';
                        deliveredOrder.deliveryTime = currentSimulationTime;
                        stats.totalOrdersDelivered++;
                        const deliveryDuration = currentSimulationTime - deliveredOrder.timePlaced;
                        if(masterOrderRecord) masterOrderRecord.deliveryDuration = deliveryDuration;

                        stats.sumDeliveryTimes += deliveryDuration;
                        stats.allDeliveryTimes.push(deliveryDuration);
                        logMessage(`Agent ${agent.id} DELIVERED Order ${agent.assignedOrderId}. Delivery time: ${deliveryDuration.toFixed(1)} min.`, 'ORDER_DELIVER', simulationLogEl, currentSimulationTime);

                        deliveredOrderDataForHeatmap.push({
                            lat: deliveredOrder.location.lat,
                            lng: deliveredOrder.location.lng,
                            value: deliveryDuration
                        });

                        if (orderMarkers[agent.assignedOrderId] && simulationMap) { simulationMap.removeLayer(orderMarkers[agent.assignedOrderId]); delete orderMarkers[agent.assignedOrderId]; }
                        agent.deliveriesMade++;
                        agent.consecutiveDeliveriesSinceRest++;
                    }
                    agent.status = 'available';
                    agent.timeBecameAvailableAt = currentSimulationTime;
                    agent.timeContinuouslyActive = 0; 
                    agent.currentOrderETA = null;
                    if (agent.routePolyline && simulationMap) { simulationMap.removeLayer(agent.routePolyline); agent.routePolyline = null; }
                    agent.assignedOrderId = null; agent.routePath = []; agent.currentLegIndex = 0;
                    updateAgentFatigue(agent); 
                }
            } else {
                 // Still more legs in the current routePath, currentTaskStartTime remains the same
            }
        } else { 
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
        updateAgentPopup(agent);
    });
}

function simulationStep() {
    if (!isSimulationRunning) return;
    currentSimulationTime += MINUTES_PER_SIMULATION_STEP;
    updateSimTimeDisplayLocal(currentSimulationTime); 
    updateSimTimeDisplay(currentSimulationTime); 

    if (getSimParameter('enableDynamicTraffic') && (currentSimulationTime % DYNAMIC_TRAFFIC_UPDATE_INTERVAL === 0 || currentSimulationTime === MINUTES_PER_SIMULATION_STEP)) {
        const factors = [0.7, 0.8, 0.9, 1.0, 1.1, 1.2, 1.3];
        setSimParameter('currentDynamicTrafficFactor', factors[Math.floor(Math.random() * factors.length)]);
        logMessage(`Dynamic traffic condition changed. New factor: ${getSimParameter('currentDynamicTrafficFactor').toFixed(1)}x`, "TRAFFIC", simulationLogEl, currentSimulationTime);
        updateTrafficStatusDisplay(getSimParameter('currentDynamicTrafficFactor'));
    }

    const selectedProfile = getSimParameter('orderGenerationProfile');
    if (selectedProfile.startsWith('default_')) {
        const ordersToAttemptThisStep = getSimParameter('ordersPerMinute') * MINUTES_PER_SIMULATION_STEP;
        orderGenerationBuffer += ordersToAttemptThisStep;
        while (orderGenerationBuffer >= 1.0) {
            generateOrder(); 
            orderGenerationBuffer -= 1.0;
        }
    } else if (selectedProfile.startsWith('custom_')) {
        generateOrder(); 
    }

    assignOrders(); 
    updateAgentsMovementAndStatus(); 
    
    updateAgentStatusListUI();
    updatePendingOrdersListUI();
    updateSimulationStatsUI();
    updateLiveCharts();
    orders = orders.filter(o => o.status !== 'delivered'); 
}


function initializeLiveCharts() { /* ... as before ... */ }
export function getCurrentSimulationParameters() { return { ...simParams }; }
export function getCurrentSimulationStats() { 
    if (!isSimulationRunning && currentSimulationTime > 0) {
        agents.forEach(agent => {
            if (agent.status === 'available') {
                // agent.timeSpentIdle += (currentSimulationTime - agent.timeBecameAvailableAt); 
                // agent.timeBecameAvailableAt = currentSimulationTime; 
            }
        });
    }
    return { ...stats, currentSimTime: currentSimulationTime, deliveredOrderLocationsForHeatmap: [...deliveredOrderDataForHeatmap], agentsData: [...agents], allOrdersData: [...allGeneratedOrdersThisRun] };
}

export function populateOrderGenerationProfileSelectorSim(customProfilesFromDemandModule) {
    if (!orderGenerationProfileSelectEl) {
        orderGenerationProfileSelectEl = document.getElementById('orderGenerationProfileSelect');
        if (!orderGenerationProfileSelectEl) {
            console.warn("[Sim] Order generation profile select element ('orderGenerationProfileSelect') not found during populate.");
            return;
        }
    }

    const currentVal = orderGenerationProfileSelectEl.value;
    const defaultOptions = Array.from(orderGenerationProfileSelectEl.options).filter(opt => opt.value.startsWith('default_'));
    orderGenerationProfileSelectEl.innerHTML = '';
    defaultOptions.forEach(opt => orderGenerationProfileSelectEl.appendChild(opt.cloneNode(true)));

    const profilesToUse = customProfilesFromDemandModule || getCustomDemandProfiles(); 
    
    profilesToUse.forEach(profile => {
        const option = document.createElement('option');
        option.value = `custom_${profile.name}`;
        option.textContent = `Custom: ${profile.name}`;
        orderGenerationProfileSelectEl.appendChild(option);
    });

    if (Array.from(orderGenerationProfileSelectEl.options).some(opt => opt.value === currentVal)) {
        orderGenerationProfileSelectEl.value = currentVal;
    } else {
        orderGenerationProfileSelectEl.value = 'default_uniform';
    }
    setSimParameter('orderGenerationProfile', orderGenerationProfileSelectEl.value);
}

function prepareSimulationDataForAI() { 
    const simData = getCurrentSimulationParameters();
    const simStats = getCurrentSimulationStats();

    let dataString = "Simulation Parameters:\n";
    for (const key in simData) {
        dataString += `${key}: ${simData[key]}\n`;
    }
    dataString += "\nOverall Statistics:\n";
    dataString += `Simulation Runtime: ${simStats.currentSimTime} minutes\n`;
    dataString += `Total Orders Generated: ${simStats.totalOrdersGenerated}\n`;
    dataString += `Total Orders Delivered: ${simStats.totalOrdersDelivered}\n`;
    dataString += `Delivery Completion Rate: ${simStats.totalOrdersGenerated > 0 ? ((simStats.totalOrdersDelivered / simStats.totalOrdersGenerated) * 100).toFixed(1) + '%' : 'N/A'}\n`;
    dataString += `Average Delivery Time: ${simStats.allDeliveryTimes.length > 0 && simStats.totalOrdersDelivered > 0 ? (simStats.sumDeliveryTimes / simStats.totalOrdersDelivered).toFixed(1) : 'N/A'} min\n`;
    dataString += `Min Delivery Time: ${simStats.allDeliveryTimes.length > 0 ? Math.min(...simStats.allDeliveryTimes).toFixed(1) : 'N/A'} min\n`;
    dataString += `Max Delivery Time: ${simStats.allDeliveryTimes.length > 0 && stats.allDeliveryTimes.length > 0 ? Math.max(...stats.allDeliveryTimes).toFixed(1) : 'N/A'} min\n`; // Added check for stats.allDeliveryTimes
    dataString += `Average Order Wait Time (Assignment): ${simStats.countAssignedOrders > 0 ? (simStats.sumOrderWaitTimes / simStats.countAssignedOrders).toFixed(1) : 'N/A'} min\n`;
    
    let totalAgentPossibleTime = 0;
    let totalAgentActualBusyTime = 0;
    simStats.agentsData.forEach(agent => {
        totalAgentPossibleTime += agent.totalTime;
        totalAgentActualBusyTime += agent.busyTime;
    });
    const avgAgentUtilizationOverall = totalAgentPossibleTime > 0 ? (totalAgentActualBusyTime / totalAgentPossibleTime * 100).toFixed(1) : "N/A";
    dataString += `Average Agent Utilization: ${avgAgentUtilizationOverall}%\n`;

    const totalAgentLaborCost = (simStats.totalAgentActiveTime / 60 * simData.agentCostPerHour);
    const totalTravelCost = (simStats.totalDistanceTraveledByAgentsKm * simData.costPerKmTraveled);
    const totalFixedDeliveryCosts = (simStats.totalOrdersDelivered * simData.fixedCostPerDelivery);
    const overallTotalOperationalCost = totalAgentLaborCost + totalTravelCost + totalFixedDeliveryCosts;

    dataString += `Total Agent Labor Cost: ₹${totalAgentLaborCost.toFixed(2)}\n`;
    dataString += `Total Travel Cost: ₹${totalTravelCost.toFixed(2)}\n`;
    dataString += `Total Fixed Delivery Costs: ₹${totalFixedDeliveryCosts.toFixed(2)}\n`;
    dataString += `Overall Total Operational Cost: ₹${overallTotalOperationalCost.toFixed(2)}\n`;
    dataString += `Average Cost per Order: ₹${simStats.totalOrdersDelivered > 0 ? (overallTotalOperationalCost / simStats.totalOrdersDelivered).toFixed(2) : 'N/A'}\n`;
    
    dataString += "\nAgent Performance Summary:\n";
    simStats.agentsData.forEach(agent => {
        const utilization = agent.totalTime > 0 ? (agent.busyTime / agent.totalTime * 100).toFixed(1) : "0.0";
        dataString += `Agent ${agent.id}: ${agent.deliveriesMade} deliveries, Util: ${utilization}%, Fatigue: ${((1 - agent.currentFatigueFactor) * 100).toFixed(0)}%, Dist: ${agent.distanceTraveledThisSimKm.toFixed(1)}km\n`;
    });
    return dataString;
}
async function handleAiAnalysisRequest() { 
    if (!simulationAiAnalysisContainerEl || !simulationAiAnalysisLoadingEl || !simulationAiAnalysisContentEl) {
        console.error("AI Analysis UI elements not found.");
        alert("AI Analysis UI components are missing. Cannot proceed.");
        return;
    }

    if (currentSimulationTime === 0 && stats.totalOrdersGenerated === 0) {
        simulationAiAnalysisContentEl.textContent = "Please run a simulation first to generate data for analysis.";
        simulationAiAnalysisContainerEl.classList.remove('hidden');
        return;
    }

    simulationAiAnalysisLoadingEl.classList.remove('hidden');
    simulationAiAnalysisContentEl.textContent = 'Generating AI analysis... Please wait.';
    simulationAiAnalysisContainerEl.classList.remove('hidden');

    const simulationDataSummary = prepareSimulationDataForAI();
    const prompt = `
        You are a logistics operations analyst. Based on the following simulation results for a quick commerce delivery operation in Chandigarh, provide a concise analysis.
        Focus on:
        1.  Overall Performance: Comment on delivery completion, average delivery time, and agent utilization.
        2.  Cost Efficiency: Comment on the average cost per order and its components.
        3.  Potential Bottlenecks or Issues: Identify any clear problems (e.g., very high wait times, low completion, high agent fatigue if data suggests it).
        4.  Key Positive Points: Highlight any strengths.
        5.  Actionable Suggestions: Provide 2-3 brief, actionable suggestions for improvement based *only* on the provided data. For example, if agent utilization is very high and delivery times are long, suggest increasing agent count. If cost per order is high due to travel, suggest route optimization (even if not modeled, it's a general suggestion). Do not suggest features not present in the parameters.

        Keep the analysis to around 4-6 concise paragraphs. Be direct and data-driven.

        Simulation Data:
        ${simulationDataSummary}
    `;

    try {
        let chatHistory = [{ role: "user", parts: [{ text: prompt }] }];
        const payload = { contents: chatHistory };
        const apiKey = "AIzaSyDwjlcdDvgre9mLWR7abRx2qta_NFLISuI"; // User-provided key
        
        if (!apiKey) {
            throw new Error("API Key is missing.");
        }

        const modelName = "gemini-2.0-flash"; 
        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;
        
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errorText = await response.text(); 
            let detailedErrorMessage = `API request failed with status ${response.status}: ${response.statusText}.`;
            try {
                const parsedError = JSON.parse(errorText);
                detailedErrorMessage = `API request failed with status ${response.status}: ${parsedError.error?.message || response.statusText}. Full response: ${errorText}`;
            } catch (e) {
                detailedErrorMessage += ` Raw response: ${errorText}`;
            }
            console.error("Gemini API Error Details:", detailedErrorMessage);
            throw new Error(detailedErrorMessage);
        }

        const result = await response.json();
        
        if (result.candidates && result.candidates.length > 0 &&
            result.candidates[0].content && result.candidates[0].content.parts &&
            result.candidates[0].content.parts.length > 0) {
            const analysisText = result.candidates[0].content.parts[0].text;
            simulationAiAnalysisContentEl.textContent = analysisText;
        } else if (result.candidates && result.candidates.length > 0 && result.candidates[0].finishReason) {
            simulationAiAnalysisContentEl.textContent = `AI model finished with reason: ${result.candidates[0].finishReason}. No content generated. Check prompt or model settings. Safety Ratings: ${JSON.stringify(result.candidates[0].safetyRatings || {})}`;
            console.warn("AI Analysis - Model finished with reason:", result.candidates[0].finishReason, result.candidates[0].safetyRatings);
        }
         else {
            console.error("Unexpected API response structure:", result);
            simulationAiAnalysisContentEl.textContent = "Could not retrieve analysis. The API response structure was unexpected.";
        }
    } catch (error) {
        console.error("Error fetching AI analysis:", error);
        simulationAiAnalysisContentEl.textContent = `Error fetching AI analysis: ${error.message}. Please check the console for more details.`;
    } finally {
        simulationAiAnalysisLoadingEl.classList.add('hidden');
    }
}

export function initializeSimulationSection() {
    agentStatusListEl = document.getElementById('agentStatusList');
    pendingOrdersListEl = document.getElementById('pendingOrdersList');
    simulationLogEl = document.getElementById('simulationLog');
    startSimBtnEl = document.getElementById('startSimBtn');
    pauseSimBtnEl = document.getElementById('pauseSimBtn');
    resetSimBtnEl = document.getElementById('resetSimBtn');
    orderGenerationProfileSelectEl = document.getElementById('orderGenerationProfileSelect');
    uniformOrderRadiusContainerEl = document.getElementById('uniformOrderRadiusContainer');
    defaultOrderFocusRadiusContainerEl = document.getElementById('defaultOrderFocusRadiusContainer');
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
    toggleDeliveryTimeHeatmapCheckboxEl = document.getElementById('toggleDeliveryTimeHeatmap');
    exportSimResultsBtnEl = document.getElementById('exportSimResultsBtn');
    analyzeSimResultsAIButtonEl = document.getElementById('analyzeSimResultsAI');
    simulationAiAnalysisContainerEl = document.getElementById('simulationAiAnalysisContainer');
    simulationAiAnalysisLoadingEl = document.getElementById('simulationAiAnalysisLoading');
    simulationAiAnalysisContentEl = document.getElementById('simulationAiAnalysisContent');
    ordersPerMinuteInputEl = document.getElementById('ordersPerMinuteInput'); 


    simulationMap = initializeMap('simulationMap', defaultDarkStoreLocationSim, 13, 'simulation');
    if (simulationMap) {
        simDarkStoreMarker = L.marker([defaultDarkStoreLocationSim.lat, defaultDarkStoreLocationSim.lng], { icon: darkStoreIcon })
            .addTo(simulationMap)
            .bindPopup('<b>Dark Store Chandigarh (Simulation)</b><br>Central Hub')
            .openPopup();

        if (typeof L.heatLayer === 'function') {
            deliveryTimeHeatmapLayer = L.heatLayer([], {
                radius: 25, maxOpacity: 0.7, scaleRadius: true, useLocalExtrema: true, valueField: 'value'
            });
        } else {
            console.error("[Sim] CRITICAL: L.heatLayer is NOT a function. leaflet-heatmap.js might not be loaded correctly or is missing. Heatmap functionality will be disabled.");
            deliveryTimeHeatmapLayer = null;
            if(toggleDeliveryTimeHeatmapCheckboxEl) toggleDeliveryTimeHeatmapCheckboxEl.disabled = true;
        }
    } else {
        console.error("[Sim] CRITICAL: Simulation map failed to initialize!");
        if(toggleDeliveryTimeHeatmapCheckboxEl) toggleDeliveryTimeHeatmapCheckboxEl.disabled = true;
    }

    initializeLiveCharts();

    startSimBtnEl?.addEventListener('click', startSimulation);
    pauseSimBtnEl?.addEventListener('click', pauseSimulation);
    resetSimBtnEl?.addEventListener('click', resetSimulation);
    saveCurrentSimScenarioBtnEl?.addEventListener('click', saveCurrentSimulationScenario);
    toggleDeliveryTimeHeatmapCheckboxEl?.addEventListener('change', toggleDeliveryTimeHeatmapDisplay);
    exportSimResultsBtnEl?.addEventListener('click', exportSimulationResultsToCSV);
    analyzeSimResultsAIButtonEl?.addEventListener('click', handleAiAnalysisRequest);


    orderGenerationProfileSelectEl?.addEventListener('change', () => {
        setSimParameter('orderGenerationProfile', orderGenerationProfileSelectEl.value);
    });
    ordersPerMinuteInputEl?.addEventListener('change', (e) => {
        let value = parseFloat(e.target.value);
        if (isNaN(value) || value <= 0) {
            value = 0.5; 
            e.target.value = value;
        }
        setSimParameter('ordersPerMinute', value);
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

    populateOrderGenerationProfileSelectorSim(); // Call without arguments, it will use getCustomDemandProfiles
    resetSimulationState();
    toggleSimConfigLock(false);
    if (pauseSimBtnEl) pauseSimBtnEl.disabled = true;
}
