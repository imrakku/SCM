// js/modules/workforceOpt.js
import { chandigarhGeoJsonPolygon, chandigarhCenter } from '../data/chandigarhData.js';
import { initializeMap, getMapInstance, getDistanceKm, isPointInPolygon, darkStoreIcon as commonDarkStoreIcon } from '../mapUtils.js';
import { initializeChart, updateChartData, calculateStdDev, getChartInstance } from '../chartUtils.js';
import { logMessage } from '../logger.js';
import { globalClusteredDarkStores } from './clustering.js'; // To get dark store locations
import { getSimParameter } from './simulation.js'; // To get base sim params like speed, handling, cost

// Module-specific state
let optimizationMap; // Leaflet map instance for this section
let optDarkStoreMarkersLayer;
let optOrderMarkersLayer;
// let optOrderHeatmapLayer = null; // Heatmap might be too much for per-iteration display

let allOptimizationIterationsData = []; // To store results of each iteration for comparison

// DOM Elements
let optTargetDeliveryTimeInputEl, optSelectDarkStoreEl, optOrderGenerationRadiusInputEl,
    optOrdersPerIterationInputEl, optMinAgentsInputEl, optMaxAgentsInputEl,
    optMaxSimTimePerIterationInputEl, runOptimizationBtnEl, optimizationLogEl,
    optimizationMapContainerEl, optimizationComparisonContainerEl, optimizationChartsContainerEl,
    optimizationResultsContainerEl, optimizationComparisonTableBodyEl;

// Result display elements
let optResultAgentsEl, optResultAvgTimeEl, optResultTargetTimeEl, optResultMinDelTimeEl,
    optResultMaxDelTimeEl, optResultStdDevDelTimeEl, optResultAvgUtilizationEl,
    optResultAvgWaitTimeEl, optResultUndeliveredEl, optDarkStoreDistancesEl, optOverallAvgDistanceEl,
    optResultTotalAgentLaborCostEl, optResultTotalTravelCostEl, optResultTotalFixedDeliveryCostsEl,
    optResultOverallTotalOperationalCostEl, optResultAverageCostPerOrderEl;


/**
 * Initializes the Workforce Optimization section.
 */
export function initializeWorkforceOptimizationSection() {
    // Cache DOM Elements
    optTargetDeliveryTimeInputEl = document.getElementById('optTargetDeliveryTime');
    optSelectDarkStoreEl = document.getElementById('optSelectDarkStore');
    optOrderGenerationRadiusInputEl = document.getElementById('optOrderGenerationRadius');
    optOrdersPerIterationInputEl = document.getElementById('optOrdersPerIteration');
    optMinAgentsInputEl = document.getElementById('optMinAgents');
    optMaxAgentsInputEl = document.getElementById('optMaxAgents');
    optMaxSimTimePerIterationInputEl = document.getElementById('optMaxSimTimePerIteration');
    runOptimizationBtnEl = document.getElementById('runOptimizationBtn');
    optimizationLogEl = document.getElementById('optimizationLog');
    optimizationMapContainerEl = document.getElementById('optimizationMapContainer');
    optimizationComparisonContainerEl = document.getElementById('optimizationComparisonContainer');
    optimizationChartsContainerEl = document.getElementById('optimizationChartsContainer');
    optimizationResultsContainerEl = document.getElementById('optimizationResultsContainer');
    optimizationComparisonTableBodyEl = document.getElementById('optimizationComparisonTable')?.getElementsByTagName('tbody')[0];

    // Result display elements
    optResultAgentsEl = document.getElementById('optResultAgents');
    optResultAvgTimeEl = document.getElementById('optResultAvgTime');
    optResultTargetTimeEl = document.getElementById('optResultTargetTime');
    optResultMinDelTimeEl = document.getElementById('optResultMinDelTime');
    optResultMaxDelTimeEl = document.getElementById('optResultMaxDelTime');
    optResultStdDevDelTimeEl = document.getElementById('optResultStdDevDelTime');
    optResultAvgUtilizationEl = document.getElementById('optResultAvgUtilization');
    optResultAvgWaitTimeEl = document.getElementById('optResultAvgWaitTime');
    optResultUndeliveredEl = document.getElementById('optResultUndelivered');
    optDarkStoreDistancesEl = document.getElementById('optDarkStoreDistances');
    optOverallAvgDistanceEl = document.getElementById('optOverallAvgDistance');
    optResultTotalAgentLaborCostEl = document.getElementById('optResultTotalAgentLaborCost');
    optResultTotalTravelCostEl = document.getElementById('optResultTotalTravelCost');
    optResultTotalFixedDeliveryCostsEl = document.getElementById('optResultTotalFixedDeliveryCosts');
    optResultOverallTotalOperationalCostEl = document.getElementById('optResultOverallTotalOperationalCost');
    optResultAverageCostPerOrderEl = document.getElementById('optResultAverageCostPerOrder');

    // Initialize map (will be shown when optimization runs)
    // optimizationMap = initializeMap('optimizationMapViz', chandigarhCenter, 12, 'workforceOptimization');
    // optDarkStoreMarkersLayer = L.layerGroup().addTo(optimizationMap);
    // optOrderMarkersLayer = L.layerGroup().addTo(optimizationMap);


    // Event Listeners
    runOptimizationBtnEl?.addEventListener('click', runWorkforceOptimization);

    // Initial population of dark store selector
    populateDarkStoreSelectorForOpt();
    initializeOptimizationCharts(); // Initialize chart structures
}

/**
 * Populates the dark store selector dropdown using data from the clustering module.
 * @param {Array} [clusteredStores] Optional: Pass stores directly, otherwise uses globalClusteredDarkStores.
 */
export function populateDarkStoreSelectorForOpt(clusteredStores) {
    const stores = clusteredStores || globalClusteredDarkStores; // Use passed or global
    if (!optSelectDarkStoreEl || !runOptimizationBtnEl) return;

    const currentVal = optSelectDarkStoreEl.value;
    optSelectDarkStoreEl.innerHTML = ''; // Clear existing options

    if (stores && stores.length > 0) {
        stores.forEach(store => {
            const option = document.createElement('option');
            option.value = store.id;
            option.textContent = `${store.name} (ID: ${store.id} - Lat: ${store.lat.toFixed(3)}, Lng: ${store.lng.toFixed(3)})`;
            if (store.id.toString() === currentVal) {
                option.selected = true;
            }
            optSelectDarkStoreEl.appendChild(option);
        });
        optSelectDarkStoreEl.disabled = false;
        runOptimizationBtnEl.disabled = false;
    } else {
        const option = document.createElement('option');
        option.value = "";
        option.textContent = "-- Run Clustering First to Select a Store --";
        optSelectDarkStoreEl.appendChild(option);
        optSelectDarkStoreEl.disabled = true;
        runOptimizationBtnEl.disabled = true;
    }
}


/**
 * Runs the workforce optimization simulation series.
 */
async function runWorkforceOptimization() {
    allOptimizationIterationsData = [];
    if(optimizationComparisonContainerEl) optimizationComparisonContainerEl.classList.add('hidden');
    if(optimizationChartsContainerEl) optimizationChartsContainerEl.classList.add('hidden');
    if(optimizationResultsContainerEl) optimizationResultsContainerEl.classList.add('hidden');


    if (!optTargetDeliveryTimeInputEl || !optOrderGenerationRadiusInputEl || !optOrdersPerIterationInputEl ||
        !optMinAgentsInputEl || !optMaxAgentsInputEl || !optSelectDarkStoreEl || !optMaxSimTimePerIterationInputEl ||
        !optimizationResultsContainerEl || !optimizationLogEl || !runOptimizationBtnEl || !optimizationMapContainerEl) {
        console.error("One or more optimization UI elements are missing.");
        if (optimizationLogEl) logMessage("Error: Critical UI elements for optimization are missing.", 'ERROR', optimizationLogEl);
        if (runOptimizationBtnEl) { runOptimizationBtnEl.disabled = false; runOptimizationBtnEl.textContent = "Run Workforce Optimization"; }
        return;
    }

    const selectedDarkStoreId = parseInt(optSelectDarkStoreEl.value);
    const selectedDarkStore = globalClusteredDarkStores.find(ds => ds.id === selectedDarkStoreId);

    if (isNaN(selectedDarkStoreId) || !selectedDarkStore) {
        logMessage("Error: Please select a valid dark store. Run clustering first if list is empty.", 'ERROR', optimizationLogEl);
        if (runOptimizationBtnEl) { runOptimizationBtnEl.disabled = false; runOptimizationBtnEl.textContent = "Run Workforce Optimization"; }
        return;
    }
    const orderRadiusKm = parseFloat(optOrderGenerationRadiusInputEl.value);
    if (isNaN(orderRadiusKm) || orderRadiusKm <= 0) {
        logMessage("Error: Please enter a valid Order Generation Radius (>0 km).", 'ERROR', optimizationLogEl);
        if (runOptimizationBtnEl) { runOptimizationBtnEl.disabled = false; runOptimizationBtnEl.textContent = "Run Workforce Optimization"; }
        return;
    }

    let minAgentsToTest = parseInt(optMinAgentsInputEl.value);
    let maxAgentsToTest = parseInt(optMaxAgentsInputEl.value);

    if (isNaN(minAgentsToTest) || minAgentsToTest < 1) minAgentsToTest = 1;
    if (isNaN(maxAgentsToTest) || maxAgentsToTest < minAgentsToTest || maxAgentsToTest > 25) maxAgentsToTest = Math.min(Math.max(minAgentsToTest, 10), 25);
    optMinAgentsInputEl.value = minAgentsToTest; // Update UI if changed
    optMaxAgentsInputEl.value = maxAgentsToTest; // Update UI if changed

    runOptimizationBtnEl.disabled = true;
    runOptimizationBtnEl.textContent = "Optimizing...";
    if (optimizationLogEl) optimizationLogEl.innerHTML = ""; // Clear previous log
    logMessage(`Starting workforce optimization for Dark Store: ${selectedDarkStore.name}`, 'SYSTEM', optimizationLogEl);
    logMessage(`Order Generation Radius: ${orderRadiusKm} km. Testing agents: ${minAgentsToTest} to ${maxAgentsToTest}.`, 'SYSTEM', optimizationLogEl);

    // Get base parameters from the main simulation settings
    const baseMinAgentSpeed = getSimParameter('agentMinSpeed');
    const baseMaxAgentSpeed = getSimParameter('agentMaxSpeed');
    const baseHandlingTime = getSimParameter('handlingTime');
    const baseTrafficFactor = getSimParameter('baseTrafficFactor'); // Use manual traffic for consistency
    const baseOrderGenProb = getSimParameter('currentOrderGenerationProbability'); // Or a fixed one for opt
    const baseNumWaypoints = getSimParameter('routeWaypoints');
    const iterAgentCostPerHour = getSimParameter('agentCostPerHour');
    const iterCostPerKm = getSimParameter('costPerKmTraveled');
    const iterFixedCostPerDelivery = getSimParameter('fixedCostPerDelivery');

    if(optimizationResultsContainerEl) optimizationResultsContainerEl.classList.remove('hidden');
    if(optimizationMapContainerEl) optimizationMapContainerEl.classList.remove('hidden');

    if (!getMapInstance('workforceOptimization')) { // Initialize map if not already done
        optimizationMap = initializeMap('optimizationMapViz', selectedDarkStore, 13, 'workforceOptimization');
        optDarkStoreMarkersLayer = L.layerGroup().addTo(optimizationMap);
        optOrderMarkersLayer = L.layerGroup().addTo(optimizationMap);
    } else {
        optimizationMap = getMapInstance('workforceOptimization');
        optimizationMap.setView([selectedDarkStore.lat, selectedDarkStore.lng], 13);
        optDarkStoreMarkersLayer?.clearLayers();
        optOrderMarkersLayer?.clearLayers();
    }
    // Add selected dark store marker to opt map
    L.marker([selectedDarkStore.lat, selectedDarkStore.lng], { icon: commonDarkStoreIcon })
        .bindPopup(`<b>${selectedDarkStore.name}</b><br>(Optimization Target)`)
        .addTo(optDarkStoreMarkersLayer)
        .openPopup();


    // Reset result displays
    [optResultAgentsEl, optResultAvgTimeEl, optResultMinDelTimeEl, optResultMaxDelTimeEl,
     optResultStdDevDelTimeEl, optResultAvgUtilizationEl, optResultAvgWaitTimeEl,
     optResultUndeliveredEl, optOverallAvgDistanceEl, optResultTotalAgentLaborCostEl,
     optResultTotalTravelCostEl, optResultTotalFixedDeliveryCostsEl,
     optResultOverallTotalOperationalCostEl, optResultAverageCostPerOrderEl]
    .forEach(el => { if(el) el.textContent = "Calculating..."; });
    if(optDarkStoreDistancesEl) optDarkStoreDistancesEl.innerHTML = "";
    if(optResultTargetTimeEl) optResultTargetTimeEl.textContent = optTargetDeliveryTimeInputEl.value + " min";


    const targetAvgTime = parseInt(optTargetDeliveryTimeInputEl.value);
    const numOrdersToSimCap = parseInt(optOrdersPerIterationInputEl.value);
    const maxSimTimePerIteration = parseInt(optMaxSimTimePerIterationInputEl.value);

    let bestIterationResult = {
        agentCount: -1, avgDeliveryTime: Infinity, closestDiff: Infinity,
        minDeliveryTime: null, maxDeliveryTime: null, stdDevDeliveryTime: null,
        avgUtilization: 0, avgWaitTime: Infinity, undelivered: Infinity,
        totalOpCost: Infinity, avgCostPerOrder: Infinity,
        totalLaborCost: 0, totalTravelCost: 0, totalFixedDelCosts: 0,
        orderLocations: [], darkStoreDistanceStats: null
    };

    for (let currentNumAgents = minAgentsToTest; currentNumAgents <= maxAgentsToTest; currentNumAgents++) {
        logMessage(`Testing with ${currentNumAgents} agent(s)...`, 'ITERATION', optimizationLogEl);
        if (optimizationLogEl) optimizationLogEl.scrollTop = optimizationLogEl.scrollHeight;

        // --- Simplified Simulation for this Iteration ---
        let iterSimTime = 0;
        let iterOrders = [];
        let iterAgents = [];
        let iterOrderIdCounter = 0;
        let iterStats = {
            totalGenerated: 0, totalDelivered: 0, sumDeliveryTimes: 0, deliveryTimes: [],
            sumWaitTimes: 0, numAssigned: 0, totalAgentActiveTime: 0, totalAgentDistanceKm: 0
        };

        for (let i = 0; i < currentNumAgents; i++) {
            const speedRange = baseMaxAgentSpeed - baseMinAgentSpeed;
            iterAgents.push({
                id: i, location: { ...selectedDarkStore }, speedKmph: baseMinAgentSpeed + Math.random() * speedRange,
                status: 'available', assignedOrderId: null, routePath: [], currentLegIndex: 0,
                legProgress: 0, timeSpentAtStore: 0, totalTime: 0, busyTime: 0, distanceTraveled: 0
            });
        }

        while (iterSimTime < maxSimTimePerIteration && (iterStats.totalGenerated < numOrdersToSimCap || iterOrders.some(o => o.status !== 'delivered'))) {
            iterSimTime++; // Using 1 minute steps for optimization sim
            iterAgents.forEach(agent => agent.totalTime++);

            // Order Generation (around selected dark store)
            if (iterStats.totalGenerated < numOrdersToSimCap && Math.random() < baseOrderGenProb) {
                iterStats.totalGenerated++;
                const orderId = iterOrderIdCounter++;
                const radiusDeg = orderRadiusKm / 111;
                let orderLocation, attempts = 0;
                do {
                    const angle = Math.random() * 2 * Math.PI;
                    const distance = Math.sqrt(Math.random()) * radiusDeg;
                    orderLocation = { lat: selectedDarkStore.lat + distance * Math.sin(angle), lng: selectedDarkStore.lng + distance * Math.cos(angle) };
                    attempts++;
                } while (!isPointInPolygon([orderLocation.lng, orderLocation.lat], chandigarhGeoJsonPolygon) && attempts < 100);
                if (attempts >= 100 && !isPointInPolygon([orderLocation.lng, orderLocation.lat], chandigarhGeoJsonPolygon)) {
                    // Fallback if point generation fails boundary check too often
                    orderLocation = { ...selectedDarkStore }; // Place at store as fallback
                }
                iterOrders.push({
                    id: orderId, location: orderLocation, status: 'pending', assignedAgentId: null,
                    timePlaced: iterSimTime, assignmentTime: null
                });
            }

            // Order Assignment
            iterOrders.filter(o => o.status === 'pending').forEach(order => {
                let bestIterAgent = null; let shortestIterETA = Infinity;
                iterAgents.filter(a => a.status === 'available').forEach(agent => {
                    const travelTime = getDistanceKm(selectedDarkStore, order.location) / (agent.speedKmph * baseTrafficFactor);
                    const eta = (travelTime * 60) + baseHandlingTime;
                    if (eta < shortestIterETA) { shortestIterETA = eta; bestIterAgent = agent; }
                });
                if (bestIterAgent) {
                    order.status = 'assigned'; order.assignedAgentId = bestIterAgent.id;
                    order.assignmentTime = iterSimTime;
                    iterStats.sumWaitTimes += (order.assignmentTime - order.timePlaced);
                    iterStats.numAssigned++;
                    bestIterAgent.assignedOrderId = order.id; bestIterAgent.status = 'at_store'; // Simplified: agent goes to store, picks up, then delivers
                    bestIterAgent.routePath = [selectedDarkStore, order.location]; // Simplified route
                    bestIterAgent.currentLegIndex = 0; bestIterAgent.legProgress = 0; bestIterAgent.timeSpentAtStore = 0;
                }
            });

            // Agent Movement & Delivery
            iterAgents.forEach(agent => {
                if (agent.status === 'available') return;
                agent.busyTime++; iterStats.totalAgentActiveTime++;

                if (agent.status === 'at_store') {
                    agent.timeSpentAtStore++;
                    if (agent.timeSpentAtStore >= baseHandlingTime) {
                        agent.status = 'to_customer'; agent.timeSpentAtStore = 0; // Reset for next pickup if any
                    }
                    return;
                }
                // 'to_customer' (simplified from main sim: assumes pickup is instant after handling time)
                if (agent.status === 'to_customer') {
                    const startP = agent.routePath[0]; const endP = agent.routePath[1];
                    const legDist = getDistanceKm(startP, endP);
                    const distCovered = (agent.speedKmph * baseTrafficFactor / 60) * 1; // 1 min step
                    agent.distanceTraveled += distCovered; iterStats.totalAgentDistanceKm += distCovered;
                    agent.legProgress += (distCovered / legDist);

                    if (agent.legProgress >= 1) {
                        const deliveredOrder = iterOrders.find(o => o.id === agent.assignedOrderId);
                        if (deliveredOrder) {
                            deliveredOrder.status = 'delivered'; iterStats.totalDelivered++;
                            const deliveryDuration = iterSimTime - deliveredOrder.timePlaced;
                            iterStats.sumDeliveryTimes += deliveryDuration; iterStats.deliveryTimes.push(deliveryDuration);
                        }
                        agent.status = 'available'; agent.assignedOrderId = null; agent.legProgress = 0;
                    }
                }
            });
            // Early exit if all targeted orders are generated and delivered
            if (iterStats.totalGenerated >= numOrdersToSimCap && iterOrders.every(o => o.status === 'delivered')) break;
        } // End of single iteration while loop

        const avgDelTime = iterStats.totalDelivered > 0 ? (iterStats.sumDeliveryTimes / iterStats.totalDelivered) : Infinity;
        const avgUtil = (currentNumAgents * iterSimTime) > 0 ? (iterStats.totalAgentActiveTime / (currentNumAgents * iterSimTime) * 100) : 0;
        const avgWait = iterStats.numAssigned > 0 ? (iterStats.sumWaitTimes / iterStats.numAssigned) : Infinity;
        const undelivered = iterStats.totalGenerated - iterStats.totalDelivered;

        const laborCost = (iterStats.totalAgentActiveTime / 60) * iterAgentCostPerHour;
        const travelCost = iterStats.totalAgentDistanceKm * iterCostPerKm;
        const fixedDelCosts = iterStats.totalDelivered * iterFixedCostPerDelivery;
        const totalOpCost = laborCost + travelCost + fixedDelCosts;
        const avgCostPerOrder = iterStats.totalDelivered > 0 ? totalOpCost / iterStats.totalDelivered : Infinity;

        const minDelTime = iterStats.deliveryTimes.length > 0 ? Math.min(...iterStats.deliveryTimes) : null;
        const maxDelTime = iterStats.deliveryTimes.length > 0 ? Math.max(...iterStats.deliveryTimes) : null;
        const stdDevDelTime = iterStats.deliveryTimes.length > 1 ? calculateStdDev(iterStats.deliveryTimes, avgDelTime) : null;

        allOptimizationIterationsData.push({
            agents: currentNumAgents, generatedOrders: iterStats.totalGenerated, deliveredOrders: iterStats.totalDelivered,
            avgDeliveryTime: avgDelTime === Infinity ? null : avgDelTime,
            minDeliveryTime: minDelTime, maxDeliveryTime: maxDelTime, stdDevDeliveryTime: stdDevDelTime,
            avgAgentUtilization: avgUtil, avgOrderWaitTime: avgWait === Infinity ? null : avgWait,
            undeliveredOrders: undelivered, totalOpCost: totalOpCost, avgCostPerOrder: avgCostPerOrder === Infinity ? null : avgCostPerOrder,
        });
        logMessage(`&nbsp;&nbsp;Stats: AvgDel(${avgDelTime === Infinity ? 'N/A' : avgDelTime.toFixed(1)}m) Util(${avgUtil.toFixed(1)}%) Undel(${undelivered}) Cost(₹${avgCostPerOrder === Infinity ? 'N/A' : avgCostPerOrder.toFixed(2)}/order)`, 'STATS', optimizationLogEl);

        // Update best result
        const deliveryThreshold = iterStats.totalGenerated * 0.8; // e.g., at least 80% delivered
        if (iterStats.totalDelivered >= deliveryThreshold && iterStats.totalDelivered > 0) {
            const diff = Math.abs(avgDelTime - targetAvgTime);
            if (diff < bestIterationResult.closestDiff || (diff === bestIterationResult.closestDiff && avgDelTime < bestIterationResult.avgDeliveryTime)) {
                bestIterationResult = {
                    agentCount: currentNumAgents, avgDeliveryTime: avgDelTime, closestDiff: diff,
                    minDeliveryTime: minDelTime, maxDeliveryTime: maxDelTime, stdDevDeliveryTime: stdDevDelTime,
                    avgUtilization: avgUtil, avgWaitTime: avgWait, undelivered: undelivered,
                    totalOpCost: totalOpCost, avgCostPerOrder: avgCostPerOrder,
                    totalLaborCost: laborCost, totalTravelCost: travelCost, totalFixedDelCosts: fixedDelCosts,
                    orderLocations: iterOrders.filter(o => o.status === 'delivered').map(o => ({ lat: o.location.lat, lng: o.location.lng, count: 1 })),
                    darkStoreDistanceStats: { // Simplified for single store
                        locations: [selectedDarkStore],
                        perStore: [{ id: selectedDarkStore.id, name: selectedDarkStore.name,
                                     avgDist: iterStats.totalDelivered > 0 ? (iterOrders.filter(o=>o.status==='delivered').reduce((sum,o)=>sum + getDistanceKm(o.location,selectedDarkStore),0) / iterStats.totalDelivered).toFixed(2) : "N/A",
                                     orderCount: iterStats.totalDelivered }],
                        overallAvg: iterStats.totalDelivered > 0 ? (iterOrders.filter(o=>o.status==='delivered').reduce((sum,o)=>sum + getDistanceKm(o.location,selectedDarkStore),0) / iterStats.totalDelivered).toFixed(2) : "N/A"
                    }
                };
            }
        }
        await new Promise(resolve => setTimeout(resolve, 5)); // Small delay to allow UI to update if needed
    } // End of agent iteration loop

    // Display results
    displayOptimizationResults(bestIterationResult);
    populateOptimizationComparisonTable(allOptimizationIterationsData);
    renderOptimizationCharts(allOptimizationIterationsData, targetAvgTime);
    if(optimizationComparisonContainerEl) optimizationComparisonContainerEl.classList.remove('hidden');
    if(optimizationChartsContainerEl) optimizationChartsContainerEl.classList.remove('hidden');

    logMessage(`Optimization complete. Best result found with ${bestIterationResult.agentCount !== -1 ? bestIterationResult.agentCount : 'N/A'} agents.`, 'SYSTEM_BOLD', optimizationLogEl);
    if (optimizationLogEl) optimizationLogEl.scrollTop = optimizationLogEl.scrollHeight;
    if (runOptimizationBtnEl) { runOptimizationBtnEl.disabled = false; runOptimizationBtnEl.textContent = "Run Workforce Optimization"; }
}

/**
 * Displays the final optimization results in the UI.
 * @param {object} bestResult The best iteration result object.
 */
function displayOptimizationResults(bestResult) {
    if(optResultAgentsEl) optResultAgentsEl.textContent = bestResult.agentCount !== -1 ? bestResult.agentCount : "Not Found";
    if(optResultAvgTimeEl) optResultAvgTimeEl.textContent = bestResult.avgDeliveryTime !== Infinity ? bestResult.avgDeliveryTime.toFixed(1) + " min" : "N/A";
    if(optResultMinDelTimeEl) optResultMinDelTimeEl.textContent = bestResult.minDeliveryTime !== null ? bestResult.minDeliveryTime.toFixed(1) + " min" : "N/A";
    if(optResultMaxDelTimeEl) optResultMaxDelTimeEl.textContent = bestResult.maxDeliveryTime !== null ? bestResult.maxDeliveryTime.toFixed(1) + " min" : "N/A";
    if(optResultStdDevDelTimeEl) optResultStdDevDelTimeEl.textContent = bestResult.stdDevDeliveryTime !== null ? bestResult.stdDevDeliveryTime.toFixed(1) + " min" : "N/A";
    if(optResultAvgUtilizationEl) optResultAvgUtilizationEl.textContent = bestResult.avgUtilization.toFixed(1) + "%";
    if(optResultAvgWaitTimeEl) optResultAvgWaitTimeEl.textContent = bestResult.avgWaitTime !== Infinity ? bestResult.avgWaitTime.toFixed(1) + " min" : "N/A";
    if(optResultUndeliveredEl) optResultUndeliveredEl.textContent = bestResult.undelivered;

    if(optResultTotalAgentLaborCostEl) optResultTotalAgentLaborCostEl.textContent = `₹${(bestResult.totalLaborCost || 0).toFixed(2)}`;
    if(optResultTotalTravelCostEl) optResultTotalTravelCostEl.textContent = `₹${(bestResult.totalTravelCost || 0).toFixed(2)}`;
    if(optResultTotalFixedDeliveryCostsEl) optResultTotalFixedDeliveryCostsEl.textContent = `₹${(bestResult.totalFixedDelCosts || 0).toFixed(2)}`;
    if(optResultOverallTotalOperationalCostEl) optResultOverallTotalOperationalCostEl.textContent = `₹${(bestResult.totalOpCost || 0).toFixed(2)}`;
    if(optResultAverageCostPerOrderEl) optResultAverageCostPerOrderEl.textContent = bestResult.avgCostPerOrder === Infinity || isNaN(bestResult.avgCostPerOrder) ? "N/A" : `₹${bestResult.avgCostPerOrder.toFixed(2)}`;


    if (optDarkStoreDistancesEl) optDarkStoreDistancesEl.innerHTML = "";
    if (bestResult.darkStoreDistanceStats && bestResult.darkStoreDistanceStats.perStore && bestResult.darkStoreDistanceStats.perStore.length > 0) {
        const dsStat = bestResult.darkStoreDistanceStats.perStore[0];
        if (dsStat && optDarkStoreDistancesEl) {
            const li = document.createElement('li');
            li.textContent = `${dsStat.name}: Avg. Dist. ${dsStat.avgDist} km (${dsStat.orderCount} orders)`;
            optDarkStoreDistancesEl.appendChild(li);
        }
        if(optOverallAvgDistanceEl) optOverallAvgDistanceEl.textContent = bestResult.darkStoreDistanceStats.overallAvg + " km";
    } else {
        if(optOverallAvgDistanceEl) optOverallAvgDistanceEl.textContent = "N/A";
    }

    // Update optimization map with best scenario order locations
    if (optimizationMap && optOrderMarkersLayer) {
        optOrderMarkersLayer.clearLayers(); // Clear previous iteration's markers if any
        bestResult.orderLocations.forEach(orderLoc => {
            if (orderLoc && typeof orderLoc.lat === 'number' && typeof orderLoc.lng === 'number') {
                L.circleMarker([orderLoc.lat, orderLoc.lng], {
                    radius: 4, color: '#2563eb', fillColor: '#60a5fa', fillOpacity: 0.7, weight: 1, interactive: false
                }).addTo(optOrderMarkersLayer);
            }
        });
        optimizationMap.invalidateSize();
    }
}

/**
 * Populates the comparison table with data from all optimization iterations.
 * @param {Array<object>} iterationData Array of iteration result objects.
 */
function populateOptimizationComparisonTable(iterationData) {
    if (!optimizationComparisonTableBodyEl) return;
    optimizationComparisonTableBodyEl.innerHTML = "";

    iterationData.forEach(iter => {
        const row = optimizationComparisonTableBodyEl.insertRow();
        row.insertCell().textContent = iter.agents;
        row.insertCell().textContent = iter.generatedOrders;
        row.insertCell().textContent = iter.deliveredOrders;
        row.insertCell().textContent = iter.avgDeliveryTime !== null ? iter.avgDeliveryTime.toFixed(1) : "N/A";
        row.insertCell().textContent = iter.minDeliveryTime !== null ? iter.minDeliveryTime.toFixed(1) : "N/A";
        row.insertCell().textContent = iter.maxDeliveryTime !== null ? iter.maxDeliveryTime.toFixed(1) : "N/A";
        row.insertCell().textContent = iter.stdDevDeliveryTime !== null ? iter.stdDevDeliveryTime.toFixed(1) : "N/A";
        row.insertCell().textContent = iter.avgAgentUtilization !== null ? iter.avgAgentUtilization.toFixed(1) + "%" : "N/A";
        row.insertCell().textContent = iter.avgOrderWaitTime !== null ? iter.avgOrderWaitTime.toFixed(1) : "N/A";
        row.insertCell().textContent = iter.undeliveredOrders;
        row.insertCell().textContent = iter.totalOpCost !== null ? `₹${iter.totalOpCost.toFixed(2)}` : "N/A";
        row.insertCell().textContent = iter.avgCostPerOrder !== null ? `₹${iter.avgCostPerOrder.toFixed(2)}` : "N/A";
    });
}

/**
 * Initializes the Chart.js instances for optimization results.
 */
function initializeOptimizationCharts() {
    initializeChart('deliveryTimeChart', 'deliveryTimeOptimization', { type: 'line', data: { labels: [], datasets: [] }, options: { scales: { y: { beginAtZero: true, title: { display: true, text: 'Time (minutes)'}}, x: {title: {display: true, text: 'Number of Agents'}}} } });
    initializeChart('utilizationChart', 'utilizationOptimization', { type: 'bar', data: { labels: [], datasets: [] }, options: { scales: { y: { beginAtZero: true, max:100, title: {display: true, text: 'Utilization (%)'}}, x:{title: {display: true, text: 'Number of Agents'}}} } });
    initializeChart('totalDeliveredOrdersChart', 'totalDeliveredOrdersOptimization', { type: 'bar', data: { labels: [], datasets: [] }, options: { scales: { y: { beginAtZero: true, title:{display:true, text:'Number of Orders'}}, x:{title: {display: true, text: 'Number of Agents'}}} } });
    initializeChart('avgOrderWaitTimeChart', 'avgOrderWaitTimeOptimization', { type: 'line', data: { labels: [], datasets: [] }, options: { scales: { y: { beginAtZero: true, title:{display:true, text:'Time (minutes)'}}, x:{title: {display: true, text: 'Number of Agents'}}} } });
}

/**
 * Renders the charts with data from optimization iterations.
 * @param {Array<object>} iterationData Array of iteration result objects.
 * @param {number} targetTime The target average delivery time for reference line.
 */
function renderOptimizationCharts(iterationData, targetTime) {
    const labels = iterationData.map(iter => iter.agents);
    const avgDeliveryTimes = iterationData.map(iter => iter.avgDeliveryTime);
    const avgUtilizations = iterationData.map(iter => iter.avgAgentUtilization);
    const totalDelivered = iterationData.map(iter => iter.deliveredOrders);
    const avgWaitTimes = iterationData.map(iter => iter.avgOrderWaitTime);

    updateChartData('deliveryTimeOptimization', labels, [
        { label: 'Avg. Delivery Time (min)', data: avgDeliveryTimes, borderColor: 'rgb(75, 192, 192)', tension: 0.1, fill: false },
        { label: 'Target Avg. Delivery Time (min)', data: Array(labels.length).fill(targetTime), borderColor: 'rgb(255, 99, 132)', borderDash: [5, 5], fill: false, pointRadius: 0 }
    ]);
    updateChartData('utilizationOptimization', labels, [
        { label: 'Avg. Agent Utilization (%)', data: avgUtilizations, backgroundColor: 'rgba(54, 162, 235, 0.6)', borderColor: 'rgb(54, 162, 235)', borderWidth: 1 }
    ]);
    updateChartData('totalDeliveredOrdersOptimization', labels, [
        { label: 'Total Delivered Orders', data: totalDelivered, backgroundColor: 'rgba(75, 192, 192, 0.6)', borderColor: 'rgb(75, 192, 192)', borderWidth: 1 }
    ]);
    updateChartData('avgOrderWaitTimeOptimization', labels, [
        { label: 'Avg. Order Wait Time (min)', data: avgWaitTimes, borderColor: 'rgb(255, 159, 64)', tension: 0.1, fill: false }
    ]);
}
