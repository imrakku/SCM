// js/modules/workforceOpt.js
import { chandigarhGeoJsonPolygon, chandigarhCenter } from '../data/chandigarhData.js';
import { initializeMap, getMapInstance, getDistanceKm, isPointInPolygon, darkStoreIcon as commonDarkStoreIcon } from '../mapUtils.js';
import { initializeChart, updateChartData, calculateStdDev, getChartInstance } from '../chartUtils.js';
import { logMessage } from '../logger.js';
import { globalClusteredDarkStores } from './clustering.js';
import { getSimParameter } from './simulation.js';

// Module-specific state
let optimizationMap;
let optDarkStoreMarkersLayer;
let optOrderMarkersLayer;
let allOptimizationIterationsData = [];

// Chart Instances (scoped to this module)
let optDeliveryTimeChartInstance, optUtilizationChartInstance,
    optTotalDeliveredOrdersChartInstance, optAvgOrderWaitTimeChartInstance,
    optOrdersWithinSlaChartInstance; // New chart instance

// DOM Elements
let optTargetDeliveryTimeInputEl, optSelectDarkStoreEl, optOrderGenerationRadiusInputEl,
    optOrdersPerIterationInputEl, optMinAgentsInputEl, optMaxAgentsInputEl,
    optMaxSimTimePerIterationInputEl, runOptimizationBtnEl, optimizationLogEl,
    optimizationMapContainerEl, optimizationComparisonContainerEl, optimizationChartsContainerEl,
    optimizationResultsContainerEl, optimizationComparisonTableBodyEl,
    optimizationRecommendationTextEl; // For the recommendation text

// Result display elements
let optResultAgentsEl, optResultAvgTimeEl, optResultTargetTimeEl, optResultMinDelTimeEl,
    optResultMaxDelTimeEl, optResultStdDevDelTimeEl, optResultAvgUtilizationEl,
    optResultAvgWaitTimeEl, optResultUndeliveredEl, optDarkStoreDistancesEl, optOverallAvgDistanceEl,
    optResultTotalAgentLaborCostEl, optResultTotalTravelCostEl, optResultTotalFixedDeliveryCostsEl,
    optResultOverallTotalOperationalCostEl, optResultAverageCostPerOrderEl,
    optResultSlaMetEl; // For displaying % SLA met


// --- Constants for Enhanced Logic ---
const MIN_DELIVERY_COMPLETION_RATE = 0.80; // Consider iterations where at least 80% of generated orders are delivered
const TARGET_SLA_PERCENTAGE = 0.75; // Target for at least 75% of delivered orders to be within optTargetDeliveryTime
const IDEAL_AGENT_UTILIZATION_MIN = 70; // Ideal min utilization %
const IDEAL_AGENT_UTILIZATION_MAX = 85; // Ideal max utilization %


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
    optimizationRecommendationTextEl = document.getElementById('optimizationRecommendationText');

    optResultAgentsEl = document.getElementById('optResultAgents');
    optResultAvgTimeEl = document.getElementById('optResultAvgTime');
    optResultTargetTimeEl = document.getElementById('optResultTargetTime');
    optResultSlaMetEl = document.getElementById('optResultSlaMet'); // New element
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

    runOptimizationBtnEl?.addEventListener('click', runWorkforceOptimization);
    populateDarkStoreSelectorForOpt();
    initializeOptimizationChartsLocal();
}

export function populateDarkStoreSelectorForOpt(clusteredStores) {
    const stores = clusteredStores || globalClusteredDarkStores;
    if (!optSelectDarkStoreEl || !runOptimizationBtnEl) return;
    const currentVal = optSelectDarkStoreEl.value;
    optSelectDarkStoreEl.innerHTML = '';
    if (stores && stores.length > 0) {
        stores.forEach(store => {
            const option = document.createElement('option');
            option.value = store.id;
            option.textContent = `${store.name} (ID: ${store.id} - Lat: ${store.lat.toFixed(3)}, Lng: ${store.lng.toFixed(3)})`;
            if (store.id.toString() === currentVal) option.selected = true;
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

async function runWorkforceOptimization() {
    allOptimizationIterationsData = [];
    if(optimizationComparisonContainerEl) optimizationComparisonContainerEl.classList.add('hidden');
    if(optimizationChartsContainerEl) optimizationChartsContainerEl.classList.add('hidden');
    if(optimizationResultsContainerEl) optimizationResultsContainerEl.classList.add('hidden');
    if(optimizationRecommendationTextEl) optimizationRecommendationTextEl.innerHTML = '<p>Analyzing data to find the best workforce configuration...</p>';


    if (!optTargetDeliveryTimeInputEl || /*... other essential elements ...*/ !optimizationLogEl) {
        // console.error("Workforce Opt: Critical UI elements missing.");
        if (optimizationLogEl) logMessage("Error: Critical UI elements missing.", 'ERROR', optimizationLogEl);
        if (runOptimizationBtnEl) { runOptimizationBtnEl.disabled = false; runOptimizationBtnEl.textContent = "Run Workforce Optimization"; }
        return;
    }

    const selectedDarkStoreId = parseInt(optSelectDarkStoreEl.value);
    const selectedDarkStore = globalClusteredDarkStores.find(ds => ds.id === selectedDarkStoreId);

    if (isNaN(selectedDarkStoreId) || !selectedDarkStore) {
        logMessage("Error: Please select a valid dark store.", 'ERROR', optimizationLogEl);
        if (runOptimizationBtnEl) { runOptimizationBtnEl.disabled = false; runOptimizationBtnEl.textContent = "Run Workforce Optimization"; }
        return;
    }
    // ... (parameter validation as before) ...
    const orderRadiusKm = parseFloat(optOrderGenerationRadiusInputEl.value);
    let minAgentsToTest = parseInt(optMinAgentsInputEl.value);
    let maxAgentsToTest = parseInt(optMaxAgentsInputEl.value);
    const targetAvgDeliveryTime = parseInt(optTargetDeliveryTimeInputEl.value);
    const numOrdersToSimCap = parseInt(optOrdersPerIterationInputEl.value);
    const maxSimTimePerIteration = parseInt(optMaxSimTimePerIterationInputEl.value);


    runOptimizationBtnEl.disabled = true;
    runOptimizationBtnEl.textContent = "Optimizing...";
    if (optimizationLogEl) optimizationLogEl.innerHTML = "";
    logMessage(`Starting workforce optimization for Dark Store: ${selectedDarkStore.name}`, 'SYSTEM', optimizationLogEl);
    logMessage(`Target Avg Delivery Time: ${targetAvgDeliveryTime} min. Orders per iteration: ${numOrdersToSimCap}.`, 'SYSTEM', optimizationLogEl);
    logMessage(`Testing agents from ${minAgentsToTest} to ${maxAgentsToTest}.`, 'SYSTEM', optimizationLogEl);


    // Get base parameters from the main simulation settings
    const baseMinAgentSpeed = getSimParameter('agentMinSpeed');
    const baseMaxAgentSpeed = getSimParameter('agentMaxSpeed');
    const baseHandlingTime = getSimParameter('handlingTime');
    const baseTrafficFactor = getSimParameter('baseTrafficFactor');
    const baseOrderGenProb = getSimParameter('currentOrderGenerationProbability');
    const iterAgentCostPerHour = getSimParameter('agentCostPerHour');
    const iterCostPerKm = getSimParameter('costPerKmTraveled');
    const iterFixedCostPerDelivery = getSimParameter('fixedCostPerDelivery');

    if(optimizationResultsContainerEl) optimizationResultsContainerEl.classList.remove('hidden');
    if(optimizationMapContainerEl) optimizationMapContainerEl.classList.remove('hidden');

    if (!getMapInstance('workforceOptimization')) {
        optimizationMap = initializeMap('optimizationMapViz', selectedDarkStore, 13, 'workforceOptimization');
        optDarkStoreMarkersLayer = L.layerGroup().addTo(optimizationMap);
        optOrderMarkersLayer = L.layerGroup().addTo(optimizationMap);
    } else {
        optimizationMap = getMapInstance('workforceOptimization');
        optimizationMap.setView([selectedDarkStore.lat, selectedDarkStore.lng], 13);
        optDarkStoreMarkersLayer?.clearLayers();
        optOrderMarkersLayer?.clearLayers();
    }
    L.marker([selectedDarkStore.lat, selectedDarkStore.lng], { icon: commonDarkStoreIcon })
        .bindPopup(`<b>${selectedDarkStore.name}</b><br>(Optimization Target)`)
        .addTo(optDarkStoreMarkersLayer)
        .openPopup();

    if(optResultTargetTimeEl) optResultTargetTimeEl.textContent = targetAvgDeliveryTime + " min";
    // ... (Reset other result display elements to "Calculating...")

    let bestIterationResult = null; // Will store the full data of the chosen best iteration

    for (let currentNumAgents = minAgentsToTest; currentNumAgents <= maxAgentsToTest; currentNumAgents++) {
        logMessage(`Testing with ${currentNumAgents} agent(s)...`, 'ITERATION', optimizationLogEl);
        if (optimizationLogEl) optimizationLogEl.scrollTop = optimizationLogEl.scrollHeight;

        let iterSimTime = 0;
        let iterOrders = [];
        let iterAgents = [];
        let iterOrderIdCounter = 0;
        let iterStats = {
            totalGenerated: 0, totalDelivered: 0, sumDeliveryTimes: 0, deliveryTimes: [],
            ordersWithinSLA: 0, // NEW: Count orders delivered within targetAvgDeliveryTime
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
            iterSimTime++;
            iterAgents.forEach(agent => agent.totalTime++);

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
                    orderLocation = { ...selectedDarkStore };
                }
                iterOrders.push({
                    id: orderId, location: orderLocation, status: 'pending', assignedAgentId: null,
                    timePlaced: iterSimTime, assignmentTime: null, deliveryTime: null
                });
            }

            iterOrders.filter(o => o.status === 'pending').forEach(order => {
                // ... (Order assignment logic as before) ...
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
                    bestIterAgent.assignedOrderId = order.id; bestIterAgent.status = 'at_store';
                    bestIterAgent.routePath = [selectedDarkStore, order.location];
                    bestIterAgent.currentLegIndex = 0; bestIterAgent.legProgress = 0; bestIterAgent.timeSpentAtStore = 0;
                }
            });

            iterAgents.forEach(agent => {
                if (agent.status === 'available') return;
                agent.busyTime++; iterStats.totalAgentActiveTime++;
                if (agent.status === 'at_store') {
                    agent.timeSpentAtStore++;
                    if (agent.timeSpentAtStore >= baseHandlingTime) {
                        agent.status = 'to_customer'; agent.timeSpentAtStore = 0;
                    }
                    return;
                }
                if (agent.status === 'to_customer') {
                    const startP = agent.routePath[0]; const endP = agent.routePath[1];
                    const legDist = getDistanceKm(startP, endP);
                    if (legDist === 0) { // Avoid division by zero if start and end are same
                        agent.legProgress = 1;
                    } else {
                        const distCovered = (agent.speedKmph * baseTrafficFactor / 60) * 1;
                        agent.distanceTraveled += distCovered; iterStats.totalAgentDistanceKm += distCovered;
                        agent.legProgress += (distCovered / legDist);
                    }

                    if (agent.legProgress >= 1) {
                        const deliveredOrder = iterOrders.find(o => o.id === agent.assignedOrderId);
                        if (deliveredOrder) {
                            deliveredOrder.status = 'delivered';
                            deliveredOrder.deliveryTime = iterSimTime; // Store actual delivery time
                            iterStats.totalDelivered++;
                            const deliveryDuration = iterSimTime - deliveredOrder.timePlaced;
                            iterStats.sumDeliveryTimes += deliveryDuration;
                            iterStats.deliveryTimes.push(deliveryDuration);
                            if (deliveryDuration <= targetAvgDeliveryTime) { // Check against the main target time
                                iterStats.ordersWithinSLA++;
                            }
                        }
                        agent.status = 'available'; agent.assignedOrderId = null; agent.legProgress = 0;
                    }
                }
            });
            if (iterStats.totalGenerated >= numOrdersToSimCap && iterOrders.every(o => o.status === 'delivered')) break;
        }

        const avgDelTime = iterStats.totalDelivered > 0 ? (iterStats.sumDeliveryTimes / iterStats.totalDelivered) : Infinity;
        const percentOrdersSLA = iterStats.totalDelivered > 0 ? (iterStats.ordersWithinSLA / iterStats.totalDelivered) * 100 : 0;
        const avgUtil = (currentNumAgents * iterSimTime) > 0 ? (iterStats.totalAgentActiveTime / (currentNumAgents * iterSimTime) * 100) : 0;
        const avgWait = iterStats.numAssigned > 0 ? (iterStats.sumWaitTimes / iterStats.numAssigned) : Infinity;
        const undelivered = iterStats.totalGenerated - iterStats.totalDelivered;
        const deliveryCompletionRate = iterStats.totalGenerated > 0 ? iterStats.totalDelivered / iterStats.totalGenerated : 0;

        const laborCost = (iterStats.totalAgentActiveTime / 60) * iterAgentCostPerHour;
        const travelCost = iterStats.totalAgentDistanceKm * iterCostPerKm;
        const fixedDelCosts = iterStats.totalDelivered * iterFixedCostPerDelivery;
        const totalOpCost = laborCost + travelCost + fixedDelCosts;
        const avgCostPerOrder = iterStats.totalDelivered > 0 ? totalOpCost / iterStats.totalDelivered : Infinity;

        const minDelTime = iterStats.deliveryTimes.length > 0 ? Math.min(...iterStats.deliveryTimes) : null;
        const maxDelTime = iterStats.deliveryTimes.length > 0 ? Math.max(...iterStats.deliveryTimes) : null;
        const stdDevDelTime = iterStats.deliveryTimes.length > 1 && avgDelTime !== Infinity ? calculateStdDev(iterStats.deliveryTimes, avgDelTime) : null;

        allOptimizationIterationsData.push({
            agents: currentNumAgents, generatedOrders: iterStats.totalGenerated, deliveredOrders: iterStats.totalDelivered,
            avgDeliveryTime: avgDelTime === Infinity ? null : avgDelTime,
            percentOrdersSLA: percentOrdersSLA, // New metric
            minDeliveryTime: minDelTime, maxDeliveryTime: maxDelTime, stdDevDeliveryTime: stdDevDelTime,
            avgAgentUtilization: avgUtil, avgOrderWaitTime: avgWait === Infinity ? null : avgWait,
            undeliveredOrders: undelivered, deliveryCompletionRate: deliveryCompletionRate,
            totalOpCost: totalOpCost, avgCostPerOrder: avgCostPerOrder === Infinity ? null : avgCostPerOrder,
            // Store for detailed display if this iteration is chosen
            orderLocations: iterOrders.filter(o => o.status === 'delivered').map(o => ({ lat: o.location.lat, lng: o.location.lng, count: 1 })),
            totalLaborCost: laborCost, totalTravelCost: travelCost, totalFixedDelCosts: fixedDelCosts,
        });
        // ... (logging stats as before)
        await new Promise(resolve => setTimeout(resolve, 5));
    }

    // --- New Logic to Determine Best Iteration ---
    let qualifiedIterations = allOptimizationIterationsData.filter(
        iter => iter.deliveryCompletionRate >= MIN_DELIVERY_COMPLETION_RATE && iter.percentOrdersSLA >= TARGET_SLA_PERCENTAGE
    );

    if (qualifiedIterations.length === 0) {
        // Fallback: If no one meets SLA, pick based on completion rate and then cost
        qualifiedIterations = allOptimizationIterationsData.filter(iter => iter.deliveryCompletionRate >= MIN_DELIVERY_COMPLETION_RATE);
        if (qualifiedIterations.length === 0) { // If still none, just take all iterations
            qualifiedIterations = [...allOptimizationIterationsData];
        }
        logMessage("Warning: No iterations met the target SLA. Showing best effort.", 'WARNING', optimizationLogEl);
    }

    if (qualifiedIterations.length > 0) {
        // Sort by average cost per order (ascending), then by utilization (closer to ideal range)
        qualifiedIterations.sort((a, b) => {
            if (a.avgCostPerOrder !== b.avgCostPerOrder) {
                return (a.avgCostPerOrder ?? Infinity) - (b.avgCostPerOrder ?? Infinity);
            }
            // Tie-breaker: utilization closer to midpoint of ideal range (e.g., 77.5% for 70-85%)
            const idealMidUtilization = (IDEAL_AGENT_UTILIZATION_MIN + IDEAL_AGENT_UTILIZATION_MAX) / 2;
            const aUtilDist = Math.abs((a.avgAgentUtilization ?? 0) - idealMidUtilization);
            const bUtilDist = Math.abs((b.avgAgentUtilization ?? 0) - idealMidUtilization);
            return aUtilDist - bUtilDist;
        });
        bestIterationResult = qualifiedIterations[0];
    } else if (allOptimizationIterationsData.length > 0) {
        // Fallback if no iterations are "qualified" at all, pick the one with most deliveries
        allOptimizationIterationsData.sort((a,b) => b.deliveredOrders - a.deliveredOrders);
        bestIterationResult = allOptimizationIterationsData[0];
        logMessage("Warning: No iterations were generally successful. Displaying iteration with most deliveries.", 'WARNING', optimizationLogEl);
    }


    displayOptimizationResults(bestIterationResult, targetAvgDeliveryTime); // Pass targetAvgDeliveryTime
    populateOptimizationComparisonTable(allOptimizationIterationsData); // Updated to include new column
    renderOptimizationChartsLocal(allOptimizationIterationsData, targetAvgDeliveryTime); // Updated to include new chart
    if(optimizationComparisonContainerEl) optimizationComparisonContainerEl.classList.remove('hidden');
    if(optimizationChartsContainerEl) optimizationChartsContainerEl.classList.remove('hidden');

    let recommendationMessage = "No suitable configuration found based on current criteria.";
    if (bestIterationResult) {
        recommendationMessage = `Based on the simulations, using <strong>${bestIterationResult.agents} agents</strong> is recommended. 
        This configuration achieved an average delivery time of ${bestIterationResult.avgDeliveryTime ? bestIterationResult.avgDeliveryTime.toFixed(1) : 'N/A'} min, 
        with ${bestIterationResult.percentOrdersSLA ? bestIterationResult.percentOrdersSLA.toFixed(1) : 'N/A'}% of orders delivered within the target time. 
        The average agent utilization was ${bestIterationResult.avgAgentUtilization ? bestIterationResult.avgAgentUtilization.toFixed(1) : 'N/A'}%, 
        and the average cost per order was ₹${bestIterationResult.avgCostPerOrder ? bestIterationResult.avgCostPerOrder.toFixed(2) : 'N/A'}.`;
        if (bestIterationResult.deliveryCompletionRate < MIN_DELIVERY_COMPLETION_RATE || bestIterationResult.percentOrdersSLA < TARGET_SLA_PERCENTAGE) {
            recommendationMessage += "<br><em>Note: This recommendation is a best effort as the ideal service levels or completion rates were not fully met. Consider adjusting parameters or workforce size further.</em>";
        }
    }
    if(optimizationRecommendationTextEl) optimizationRecommendationTextEl.innerHTML = recommendationMessage;


    logMessage(`Optimization complete. Recommendation: ${bestIterationResult ? bestIterationResult.agents : 'N/A'} agents.`, 'SYSTEM_BOLD', optimizationLogEl);
    if (optimizationLogEl) optimizationLogEl.scrollTop = optimizationLogEl.scrollHeight;
    if (runOptimizationBtnEl) { runOptimizationBtnEl.disabled = false; runOptimizationBtnEl.textContent = "Run Workforce Optimization"; }
}

function displayOptimizationResults(bestResult, targetTime) { // Added targetTime
    if (!bestResult) {
        // Clear fields or show "Not Found"
        if(optResultAgentsEl) optResultAgentsEl.textContent = "Not Found";
        // ... clear other fields ...
        if(optDarkStoreDistancesEl) optDarkStoreDistancesEl.innerHTML = "";
        if(optOverallAvgDistanceEl) optOverallAvgDistanceEl.textContent = "N/A";
        if(optimizationMap && optOrderMarkersLayer) optOrderMarkersLayer.clearLayers(); // Clear map markers
        return;
    }

    if(optResultAgentsEl) optResultAgentsEl.textContent = bestResult.agents;
    if(optResultAvgTimeEl) optResultAvgTimeEl.textContent = bestResult.avgDeliveryTime !== null ? bestResult.avgDeliveryTime.toFixed(1) + " min" : "N/A";
    if(optResultTargetTimeEl) optResultTargetTimeEl.textContent = targetTime + " min"; // Display the target time used
    if(optResultSlaMetEl) optResultSlaMetEl.textContent = bestResult.percentOrdersSLA !== null ? bestResult.percentOrdersSLA.toFixed(1) + "%" : "N/A";
    if(optResultMinDelTimeEl) optResultMinDelTimeEl.textContent = bestResult.minDeliveryTime !== null ? bestResult.minDeliveryTime.toFixed(1) + " min" : "N/A";
    if(optResultMaxDelTimeEl) optResultMaxDelTimeEl.textContent = bestResult.maxDeliveryTime !== null ? bestResult.maxDeliveryTime.toFixed(1) + " min" : "N/A";
    if(optResultStdDevDelTimeEl) optResultStdDevDelTimeEl.textContent = bestResult.stdDevDeliveryTime !== null ? bestResult.stdDevDeliveryTime.toFixed(1) + " min" : "N/A";
    if(optResultAvgUtilizationEl) optResultAvgUtilizationEl.textContent = bestResult.avgAgentUtilization !== null ? bestResult.avgAgentUtilization.toFixed(1) + "%" : "N/A";
    if(optResultAvgWaitTimeEl) optResultAvgWaitTimeEl.textContent = bestResult.avgOrderWaitTime !== null ? bestResult.avgOrderWaitTime.toFixed(1) + " min" : "N/A";
    if(optResultUndeliveredEl) optResultUndeliveredEl.textContent = bestResult.undeliveredOrders;

    if(optResultTotalAgentLaborCostEl) optResultTotalAgentLaborCostEl.textContent = `₹${(bestResult.totalLaborCost || 0).toFixed(2)}`;
    if(optResultTotalTravelCostEl) optResultTotalTravelCostEl.textContent = `₹${(bestResult.totalTravelCost || 0).toFixed(2)}`;
    if(optResultTotalFixedDeliveryCostsEl) optResultTotalFixedDeliveryCostsEl.textContent = `₹${(bestResult.totalFixedDelCosts || 0).toFixed(2)}`;
    if(optResultOverallTotalOperationalCostEl) optResultOverallTotalOperationalCostEl.textContent = `₹${(bestResult.totalOpCost || 0).toFixed(2)}`;
    if(optResultAverageCostPerOrderEl) optResultAverageCostPerOrderEl.textContent = bestResult.avgCostPerOrder === null || isNaN(bestResult.avgCostPerOrder) ? "N/A" : `₹${bestResult.avgCostPerOrder.toFixed(2)}`;

    if (optDarkStoreDistancesEl) optDarkStoreDistancesEl.innerHTML = "";
    // This part might need adjustment if darkStoreDistanceStats structure changed
    // For now, assuming it's still simplified for the single selected store
    const dsStat = bestResult.darkStoreDistanceStats?.perStore?.[0];
    if (dsStat && optDarkStoreDistancesEl) {
        const li = document.createElement('li');
        li.textContent = `${dsStat.name}: Avg. Dist. ${dsStat.avgDist} km (${dsStat.orderCount} orders)`;
        optDarkStoreDistancesEl.appendChild(li);
    }
    if(optOverallAvgDistanceEl) optOverallAvgDistanceEl.textContent = bestResult.darkStoreDistanceStats?.overallAvg ? bestResult.darkStoreDistanceStats.overallAvg + " km" : "N/A";


    if (optimizationMap && optOrderMarkersLayer) {
        optOrderMarkersLayer.clearLayers();
        bestResult.orderLocations?.forEach(orderLoc => {
            if (orderLoc && typeof orderLoc.lat === 'number' && typeof orderLoc.lng === 'number') {
                L.circleMarker([orderLoc.lat, orderLoc.lng], {
                    radius: 4, color: '#2563eb', fillColor: '#60a5fa', fillOpacity: 0.7, weight: 1, interactive: false
                }).addTo(optOrderMarkersLayer);
            }
        });
        optimizationMap.invalidateSize();
    }
}

function populateOptimizationComparisonTable(iterationData) {
    if (!optimizationComparisonTableBodyEl) return;
    optimizationComparisonTableBodyEl.innerHTML = "";

    iterationData.forEach(iter => {
        const row = optimizationComparisonTableBodyEl.insertRow();
        row.insertCell().textContent = iter.agents;
        row.insertCell().textContent = iter.generatedOrders;
        row.insertCell().textContent = iter.deliveredOrders;
        row.insertCell().textContent = iter.avgDeliveryTime !== null ? iter.avgDeliveryTime.toFixed(1) : "N/A";
        row.insertCell().textContent = iter.percentOrdersSLA !== null ? iter.percentOrdersSLA.toFixed(1) + "%" : "N/A"; // New Column
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

function initializeOptimizationChartsLocal() { // Renamed to avoid conflicts if global chart utils are also named this
    optDeliveryTimeChartInstance = initializeChart('deliveryTimeChart', 'deliveryTimeOptimization', { type: 'line', data: { labels: [], datasets: [] }, options: { scales: { y: { beginAtZero: true, title: { display: true, text: 'Time (minutes)'}}, x: {title: {display: true, text: 'Number of Agents'}}} } });
    optUtilizationChartInstance = initializeChart('utilizationChart', 'utilizationOptimization', { type: 'bar', data: { labels: [], datasets: [] }, options: { scales: { y: { beginAtZero: true, max:100, title: {display: true, text: 'Utilization (%)'}}, x:{title: {display: true, text: 'Number of Agents'}}} } });
    optTotalDeliveredOrdersChartInstance = initializeChart('totalDeliveredOrdersChart', 'totalDeliveredOrdersOptimization', { type: 'bar', data: { labels: [], datasets: [] }, options: { scales: { y: { beginAtZero: true, title:{display:true, text:'Number of Orders'}}, x:{title: {display: true, text: 'Number of Agents'}}} } });
    optAvgOrderWaitTimeChartInstance = initializeChart('avgOrderWaitTimeChart', 'avgOrderWaitTimeOptimization', { type: 'line', data: { labels: [], datasets: [] }, options: { scales: { y: { beginAtZero: true, title:{display:true, text:'Time (minutes)'}}, x:{title: {display: true, text: 'Number of Agents'}}} } });
    optOrdersWithinSlaChartInstance = initializeChart('ordersWithinSlaChart', 'ordersWithinSlaOptimization', {type: 'line', data: {labels: [], datasets: []}, options: {scales: {y: {beginAtZero: true, max: 100, title: {display: true, text: '% Orders in Target Time'}}, x:{title: {display:true, text: 'Number of Agents'}}}}});
}

function renderOptimizationChartsLocal(iterationData, targetTime) { // Renamed
    const labels = iterationData.map(iter => iter.agents);
    const avgDeliveryTimes = iterationData.map(iter => iter.avgDeliveryTime);
    const avgUtilizations = iterationData.map(iter => iter.avgAgentUtilization);
    const totalDelivered = iterationData.map(iter => iter.deliveredOrders);
    const avgWaitTimes = iterationData.map(iter => iter.avgOrderWaitTime);
    const percentSlaMet = iterationData.map(iter => iter.percentOrdersSLA); // New data

    // Ensure chart instances exist before updating
    if(getChartInstance('deliveryTimeOptimization')) updateChartData('deliveryTimeOptimization', labels, [
        { label: 'Avg. Delivery Time (min)', data: avgDeliveryTimes, borderColor: 'rgb(75, 192, 192)', tension: 0.1, fill: false },
        { label: `Target (${targetTime} min)`, data: Array(labels.length).fill(targetTime), borderColor: 'rgb(255, 99, 132)', borderDash: [5, 5], fill: false, pointRadius: 0 }
    ]);
    if(getChartInstance('utilizationOptimization')) updateChartData('utilizationOptimization', labels, [
        { label: 'Avg. Agent Utilization (%)', data: avgUtilizations, backgroundColor: 'rgba(54, 162, 235, 0.6)', borderColor: 'rgb(54, 162, 235)', borderWidth: 1 }
    ]);
    if(getChartInstance('totalDeliveredOrdersOptimization')) updateChartData('totalDeliveredOrdersOptimization', labels, [
        { label: 'Total Delivered Orders', data: totalDelivered, backgroundColor: 'rgba(75, 192, 192, 0.6)', borderColor: 'rgb(75, 192, 192)', borderWidth: 1 }
    ]);
    if(getChartInstance('avgOrderWaitTimeOptimization')) updateChartData('avgOrderWaitTimeOptimization', labels, [
        { label: 'Avg. Order Wait Time (min)', data: avgWaitTimes, borderColor: 'rgb(255, 159, 64)', tension: 0.1, fill: false }
    ]);
    if(getChartInstance('ordersWithinSlaOptimization')) updateChartData('ordersWithinSlaOptimization', labels, [ // New chart update
        { label: '% Orders within Target Time', data: percentSlaMet, borderColor: 'rgb(153, 102, 255)', tension: 0.1, fill: false}
    ]);
}
