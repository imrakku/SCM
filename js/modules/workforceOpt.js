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
// These will be initialized in initializeOptimizationChartsLocal
let optDeliveryTimeChartInstance, optUtilizationChartInstance,
    optTotalDeliveredOrdersChartInstance, optAvgOrderWaitTimeChartInstance,
    optOrdersWithinSlaChartInstance;

// DOM Elements
let optTargetDeliveryTimeInputEl, optSelectDarkStoreEl, optOrderGenerationRadiusInputEl,
    optOrdersPerIterationInputEl, optMinAgentsInputEl, optMaxAgentsInputEl,
    optMaxSimTimePerIterationInputEl, runOptimizationBtnEl, optimizationLogEl,
    optimizationMapContainerEl, optimizationComparisonContainerEl, optimizationChartsContainerEl,
    optimizationResultsContainerEl, optimizationComparisonTableBodyEl,
    optimizationRecommendationTextEl, exportWorkforceOptResultsBtnEl;

// Result display elements
let optResultAgentsEl, optResultAvgTimeEl, optResultTargetTimeEl, optResultMinDelTimeEl,
    optResultMaxDelTimeEl, optResultStdDevDelTimeEl, optResultAvgUtilizationEl,
    optResultAvgWaitTimeEl, optResultUndeliveredEl, optDarkStoreDistancesEl, optOverallAvgDistanceEl,
    optResultTotalAgentLaborCostEl, optResultTotalTravelCostEl, optResultTotalFixedDeliveryCostsEl,
    optResultOverallTotalOperationalCostEl, optResultAverageCostPerOrderEl,
    optResultSlaMetEl;


// --- Constants for Enhanced Logic ---
const MIN_DELIVERY_COMPLETION_RATE = 0.80;
const TARGET_SLA_PERCENTAGE = 0.75;
const IDEAL_AGENT_UTILIZATION_MIN = 60;
const IDEAL_AGENT_UTILIZATION_MAX = 90;
const COST_PER_ORDER_TOLERANCE = 0.10;


export function initializeWorkforceOptimizationSection() {
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
    exportWorkforceOptResultsBtnEl = document.getElementById('exportWorkforceOptResultsBtn');

    optResultAgentsEl = document.getElementById('optResultAgents');
    optResultAvgTimeEl = document.getElementById('optResultAvgTime');
    optResultTargetTimeEl = document.getElementById('optResultTargetTime');
    optResultSlaMetEl = document.getElementById('optResultSlaMet');
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
    exportWorkforceOptResultsBtnEl?.addEventListener('click', exportWorkforceOptResultsToCSV);

    populateDarkStoreSelectorForOpt();
    initializeOptimizationChartsLocal(); // Initialize charts with new options
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
    if(optimizationRecommendationTextEl) optimizationRecommendationTextEl.innerHTML = '<p class="text-center p-4">Crunching numbers... Please wait.</p>';
    if(exportWorkforceOptResultsBtnEl) exportWorkforceOptResultsBtnEl.disabled = true;

    const selectedDarkStoreId = parseInt(optSelectDarkStoreEl.value);
    const selectedDarkStore = globalClusteredDarkStores.find(ds => ds.id === selectedDarkStoreId);

    if (isNaN(selectedDarkStoreId) || !selectedDarkStore) {
        logMessage("Error: Please select a valid dark store.", 'ERROR', optimizationLogEl);
        if (runOptimizationBtnEl) { runOptimizationBtnEl.disabled = false; runOptimizationBtnEl.textContent = "Run Workforce Optimization"; }
        return;
    }
    
    const orderRadiusKm = parseFloat(optOrderGenerationRadiusInputEl.value);
    let minAgentsToTest = parseInt(optMinAgentsInputEl.value);
    let maxAgentsToTest = parseInt(optMaxAgentsInputEl.value);
    const targetAvgDeliveryTime = parseInt(optTargetDeliveryTimeInputEl.value);
    const numOrdersToSimCap = parseInt(optOrdersPerIterationInputEl.value);
    const maxSimTimePerIteration = parseInt(optMaxSimTimePerIterationInputEl.value);

    if (isNaN(orderRadiusKm) || orderRadiusKm <= 0 || isNaN(targetAvgDeliveryTime) || targetAvgDeliveryTime <=0 || isNaN(numOrdersToSimCap) || numOrdersToSimCap <=0 || isNaN(maxSimTimePerIteration) || maxSimTimePerIteration <=0) {
        logMessage("Error: Please ensure all optimization parameters are valid positive numbers.", 'ERROR', optimizationLogEl);
        if (runOptimizationBtnEl) { runOptimizationBtnEl.disabled = false; runOptimizationBtnEl.textContent = "Run Workforce Optimization"; }
        return;
    }
    if (isNaN(minAgentsToTest) || minAgentsToTest < 1) minAgentsToTest = 1;
    if (isNaN(maxAgentsToTest) || maxAgentsToTest < minAgentsToTest || maxAgentsToTest > 50) maxAgentsToTest = Math.min(Math.max(minAgentsToTest, 10), 50);
    optMinAgentsInputEl.value = minAgentsToTest;
    optMaxAgentsInputEl.value = maxAgentsToTest;

    runOptimizationBtnEl.disabled = true;
    runOptimizationBtnEl.textContent = "Optimizing...";
    if (optimizationLogEl) optimizationLogEl.innerHTML = "";
    logMessage(`Starting workforce optimization for Dark Store: ${selectedDarkStore.name}`, 'SYSTEM', optimizationLogEl);
    logMessage(`Target Avg Delivery Time: ${targetAvgDeliveryTime} min. Orders per iteration: ${numOrdersToSimCap}.`, 'SYSTEM', optimizationLogEl);
    logMessage(`Testing agents from ${minAgentsToTest} to ${maxAgentsToTest}.`, 'SYSTEM', optimizationLogEl);

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

    let bestIterationResult = null;

    for (let currentNumAgents = minAgentsToTest; currentNumAgents <= maxAgentsToTest; currentNumAgents++) {
        logMessage(`Testing with ${currentNumAgents} agent(s)...`, 'ITERATION', optimizationLogEl);
        if (optimizationLogEl) optimizationLogEl.scrollTop = optimizationLogEl.scrollHeight;

        let iterSimTime = 0;
        let iterOrders = [];
        let iterAgents = [];
        let iterOrderIdCounter = 0;
        let iterStats = {
            totalGenerated: 0, totalDelivered: 0, sumDeliveryTimes: 0, deliveryTimes: [],
            ordersWithinSLA: 0,
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
                    if (legDist === 0) {
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
                            deliveredOrder.deliveryTime = iterSimTime;
                            iterStats.totalDelivered++;
                            const deliveryDuration = iterSimTime - deliveredOrder.timePlaced;
                            iterStats.sumDeliveryTimes += deliveryDuration;
                            iterStats.deliveryTimes.push(deliveryDuration);
                            if (deliveryDuration <= targetAvgDeliveryTime) {
                                iterStats.ordersWithinSLA++;
                            }
                        }
                        agent.status = 'available'; agent.assignedOrderId = null; agent.legProgress = 0;
                    }
                }
            });
            if (iterStats.totalGenerated >= numOrdersToSimCap && iterOrders.every(o => o.status === 'delivered')) break;
        }

        const avgDelTime = iterStats.totalDelivered > 0 ? (iterStats.sumDeliveryTimes / iterStats.totalDelivered) : null;
        const percentOrdersSLA = iterStats.totalDelivered > 0 ? (iterStats.ordersWithinSLA / iterStats.totalDelivered) * 100 : 0;
        const avgUtil = (currentNumAgents * iterSimTime) > 0 ? (iterStats.totalAgentActiveTime / (currentNumAgents * iterSimTime) * 100) : 0;
        const avgWait = iterStats.numAssigned > 0 ? (iterStats.sumWaitTimes / iterStats.numAssigned) : null;
        const undelivered = iterStats.totalGenerated - iterStats.totalDelivered;
        const deliveryCompletionRate = iterStats.totalGenerated > 0 ? iterStats.totalDelivered / iterStats.totalGenerated : 0;

        const laborCost = (iterStats.totalAgentActiveTime / 60) * iterAgentCostPerHour;
        const travelCost = iterStats.totalAgentDistanceKm * iterCostPerKm;
        const fixedDelCosts = iterStats.totalDelivered * iterFixedCostPerDelivery;
        const totalOpCost = laborCost + travelCost + fixedDelCosts;
        const avgCostPerOrder = iterStats.totalDelivered > 0 ? totalOpCost / iterStats.totalDelivered : null;

        const minDelTime = iterStats.deliveryTimes.length > 0 ? Math.min(...iterStats.deliveryTimes) : null;
        const maxDelTime = iterStats.deliveryTimes.length > 0 ? Math.max(...iterStats.deliveryTimes) : null;
        const stdDevDelTime = iterStats.deliveryTimes.length > 1 && avgDelTime !== null ? calculateStdDev(iterStats.deliveryTimes, avgDelTime) : null;

        allOptimizationIterationsData.push({
            agents: currentNumAgents, generatedOrders: iterStats.totalGenerated, deliveredOrders: iterStats.totalDelivered,
            avgDeliveryTime: avgDelTime, percentOrdersSLA: percentOrdersSLA,
            minDeliveryTime: minDelTime, maxDeliveryTime: maxDelTime, stdDevDeliveryTime: stdDevDelTime,
            avgAgentUtilization: avgUtil, avgOrderWaitTime: avgWait,
            undeliveredOrders: undelivered, deliveryCompletionRate: deliveryCompletionRate,
            totalOpCost: totalOpCost, avgCostPerOrder: avgCostPerOrder,
            orderLocations: iterOrders.filter(o => o.status === 'delivered').map(o => ({ lat: o.location.lat, lng: o.location.lng, count: 1 })),
            totalLaborCost: laborCost, totalTravelCost: travelCost, totalFixedDelCosts: fixedDelCosts,
        });
        logMessage(`  Agents: ${currentNumAgents}, AvgDel: ${avgDelTime?.toFixed(1) ?? 'N/A'}m, SLA Met: ${percentOrdersSLA?.toFixed(1) ?? 'N/A'}%, Util: ${avgUtil?.toFixed(1) ?? 'N/A'}%, Cost/Order: ₹${avgCostPerOrder?.toFixed(2) ?? 'N/A'}`, 'STATS', optimizationLogEl);
        await new Promise(resolve => setTimeout(resolve, 10));
    }

    let qualifiedByCompletionAndSLA = allOptimizationIterationsData.filter(
        iter => iter.deliveryCompletionRate >= MIN_DELIVERY_COMPLETION_RATE && iter.percentOrdersSLA >= TARGET_SLA_PERCENTAGE
    );

    let recommendationReason = "";

    if (qualifiedByCompletionAndSLA.length === 0) {
        qualifiedByCompletionAndSLA = allOptimizationIterationsData.filter(iter => iter.deliveryCompletionRate >= MIN_DELIVERY_COMPLETION_RATE);
        if (qualifiedByCompletionAndSLA.length > 0) {
            recommendationReason = `No iterations met the target SLA of ${TARGET_SLA_PERCENTAGE * 100}%. Recommendation is based on highest completion rate, then lowest cost per order. Consider increasing agent count or adjusting target delivery time.`;
        } else {
            qualifiedByCompletionAndSLA = [...allOptimizationIterationsData];
            recommendationReason = "No iterations met minimum completion rate or SLA. Showing best attempt based on cost per order among all iterations. Results may not be reliable.";
        }
        logMessage(`Warning: ${recommendationReason}`, 'WARNING', optimizationLogEl);
    } else {
        recommendationReason = `Selected from iterations meeting >=${(MIN_DELIVERY_COMPLETION_RATE*100).toFixed(0)}% order completion and >=${(TARGET_SLA_PERCENTAGE*100).toFixed(0)}% orders within target delivery time. Prioritized lowest cost per order, then optimal utilization.`;
    }

    if (qualifiedByCompletionAndSLA.length > 0) {
        qualifiedByCompletionAndSLA.sort((a, b) => (a.avgCostPerOrder ?? Infinity) - (b.avgCostPerOrder ?? Infinity));
        const lowestCostPerOrder = qualifiedByCompletionAndSLA[0].avgCostPerOrder ?? Infinity;
        const similarCostIterations = qualifiedByCompletionAndSLA.filter(
            iter => (iter.avgCostPerOrder ?? Infinity) <= lowestCostPerOrder * (1 + COST_PER_ORDER_TOLERANCE)
        );

        let bestUtilIterations = similarCostIterations.filter(
            iter => (iter.avgAgentUtilization ?? 0) >= IDEAL_AGENT_UTILIZATION_MIN &&
                    (iter.avgAgentUtilization ?? 0) <= IDEAL_AGENT_UTILIZATION_MAX
        );

        if (bestUtilIterations.length > 0) {
            bestUtilIterations.sort((a,b) => {
                if (Math.abs((b.avgAgentUtilization ?? 0) - (a.avgAgentUtilization ?? 0)) > 1.0) {
                    return (b.avgAgentUtilization ?? 0) - (a.avgAgentUtilization ?? 0);
                }
                return a.agents - b.agents;
            });
            bestIterationResult = bestUtilIterations[0];
            recommendationReason += ` Preferred configuration within ideal utilization range (${IDEAL_AGENT_UTILIZATION_MIN}-${IDEAL_AGENT_UTILIZATION_MAX}%).`;
        } else if (similarCostIterations.length > 0) {
            similarCostIterations.sort((a,b) => {
                const aIsBelowMin = (a.avgAgentUtilization ?? 0) < IDEAL_AGENT_UTILIZATION_MIN;
                const bIsBelowMin = (b.avgAgentUtilization ?? 0) < IDEAL_AGENT_UTILIZATION_MIN;
                if (aIsBelowMin && !bIsBelowMin) return 1;
                if (!aIsBelowMin && bIsBelowMin) return -1;
                if (aIsBelowMin && bIsBelowMin) {
                    return Math.abs((a.avgAgentUtilization ?? 0) - IDEAL_AGENT_UTILIZATION_MIN) - Math.abs((b.avgAgentUtilization ?? 0) - IDEAL_AGENT_UTILIZATION_MIN);
                }
                return (a.avgCostPerOrder ?? Infinity) - (b.avgCostPerOrder ?? Infinity);
            });
            bestIterationResult = similarCostIterations[0];
            if ((bestIterationResult.avgAgentUtilization ?? 0) < IDEAL_AGENT_UTILIZATION_MIN) {
                recommendationReason += ` Selected best cost option. Note: Agent utilization (${bestIterationResult.avgAgentUtilization?.toFixed(1) ?? 'N/A'}%) is below the ideal minimum of ${IDEAL_AGENT_UTILIZATION_MIN}%, suggesting potential overstaffing for this scenario.`;
            } else if ((bestIterationResult.avgAgentUtilization ?? 0) > IDEAL_AGENT_UTILIZATION_MAX) {
                 recommendationReason += ` Selected best cost option. Note: Agent utilization (${bestIterationResult.avgAgentUtilization?.toFixed(1) ?? 'N/A'}%) is above the ideal maximum of ${IDEAL_AGENT_UTILIZATION_MAX}%, suggesting agents might be overworked.`;
            } else {
                recommendationReason += ` Selected best cost option. Agent utilization is within an acceptable range.`;
            }
        } else {
            bestIterationResult = qualifiedByCompletionAndSLA[0];
        }
    } else if (allOptimizationIterationsData.length > 0) {
        allOptimizationIterationsData.sort((a,b) => (a.avgCostPerOrder ?? Infinity) - (b.avgCostPerOrder ?? Infinity));
        bestIterationResult = allOptimizationIterationsData[0];
    }

    displayOptimizationResults(bestIterationResult, targetAvgDeliveryTime);
    populateOptimizationComparisonTable(allOptimizationIterationsData);
    renderOptimizationChartsLocal(allOptimizationIterationsData, targetAvgDeliveryTime);
    if(optimizationResultsContainerEl) optimizationResultsContainerEl.classList.remove('hidden');
    if(optimizationComparisonContainerEl) optimizationComparisonContainerEl.classList.remove('hidden');
    if(optimizationChartsContainerEl) optimizationChartsContainerEl.classList.remove('hidden');
    if(exportWorkforceOptResultsBtnEl) exportWorkforceOptResultsBtnEl.disabled = false;

    let finalRecommendationMessage = "No suitable configuration found based on current criteria and simulation runs. Please review the iteration table and charts for insights, or adjust parameters and re-run.";
    if (bestIterationResult) {
        finalRecommendationMessage = `Based on the simulations, using <strong>${bestIterationResult.agents} agents</strong> is recommended. 
        This configuration achieved an average delivery time of ${bestIterationResult.avgDeliveryTime ? bestIterationResult.avgDeliveryTime.toFixed(1) : 'N/A'} min, 
        with ${bestIterationResult.percentOrdersSLA ? bestIterationResult.percentOrdersSLA.toFixed(1) : 'N/A'}% of orders delivered within the target time. 
        The average agent utilization was ${bestIterationResult.avgAgentUtilization ? bestIterationResult.avgAgentUtilization.toFixed(1) : 'N/A'}%, 
        and the average cost per order was ₹${bestIterationResult.avgCostPerOrder ? bestIterationResult.avgCostPerOrder.toFixed(2) : 'N/A'}.
        <br><small class="text-slate-500 mt-2 block"><em>Selection Rationale: ${recommendationReason}</em></small>`;
    }
    if(optimizationRecommendationTextEl) optimizationRecommendationTextEl.innerHTML = finalRecommendationMessage;

    logMessage(`Optimization complete. Recommendation: ${bestIterationResult ? bestIterationResult.agents : 'N/A'} agents.`, 'SYSTEM_BOLD', optimizationLogEl);
    if (optimizationLogEl) optimizationLogEl.scrollTop = optimizationLogEl.scrollHeight;
    if (runOptimizationBtnEl) { runOptimizationBtnEl.disabled = false; runOptimizationBtnEl.textContent = "Run Workforce Optimization"; }
}

function displayOptimizationResults(bestResult, targetTime) {
    if (!bestResult) {
        if(optResultAgentsEl) optResultAgentsEl.textContent = "Not Found";
        if(optResultAvgTimeEl) optResultAvgTimeEl.textContent = "N/A";
        if(optResultSlaMetEl) optResultSlaMetEl.textContent = "N/A";
        if(optResultMinDelTimeEl) optResultMinDelTimeEl.textContent = "N/A";
        if(optResultMaxDelTimeEl) optResultMaxDelTimeEl.textContent = "N/A";
        if(optResultStdDevDelTimeEl) optResultStdDevDelTimeEl.textContent = "N/A";
        if(optResultAvgUtilizationEl) optResultAvgUtilizationEl.textContent = "N/A";
        if(optResultAvgWaitTimeEl) optResultAvgWaitTimeEl.textContent = "N/A";
        if(optResultUndeliveredEl) optResultUndeliveredEl.textContent = "N/A";
        if(optResultTotalAgentLaborCostEl) optResultTotalAgentLaborCostEl.textContent = "₹0.00";
        if(optResultTotalTravelCostEl) optResultTotalTravelCostEl.textContent = "₹0.00";
        if(optResultTotalFixedDeliveryCostsEl) optResultTotalFixedDeliveryCostsEl.textContent = "₹0.00";
        if(optResultOverallTotalOperationalCostEl) optResultOverallTotalOperationalCostEl.textContent = "₹0.00";
        if(optResultAverageCostPerOrderEl) optResultAverageCostPerOrderEl.textContent = "N/A";
        if(optDarkStoreDistancesEl) optDarkStoreDistancesEl.innerHTML = "";
        if(optOverallAvgDistanceEl) optOverallAvgDistanceEl.textContent = "N/A";
        if(optimizationMap && optOrderMarkersLayer) optOrderMarkersLayer.clearLayers();
        return;
    }

    if(optResultAgentsEl) optResultAgentsEl.textContent = bestResult.agents;
    if(optResultAvgTimeEl) optResultAvgTimeEl.textContent = bestResult.avgDeliveryTime !== null ? bestResult.avgDeliveryTime.toFixed(1) + " min" : "N/A";
    if(optResultTargetTimeEl) optResultTargetTimeEl.textContent = targetTime + " min";
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
    const selectedDarkStore = globalClusteredDarkStores.find(ds => ds.id === parseInt(optSelectDarkStoreEl.value));
    if (selectedDarkStore && bestResult.orderLocations && bestResult.orderLocations.length > 0) {
        let sumDist = 0;
        bestResult.orderLocations.forEach(ol => sumDist += getDistanceKm(ol, selectedDarkStore));
        const avgDist = (sumDist / bestResult.orderLocations.length).toFixed(2);
        const li = document.createElement('li');
        li.textContent = `${selectedDarkStore.name}: Avg. Dist. ${avgDist} km (${bestResult.orderLocations.length} delivered orders)`;
        optDarkStoreDistancesEl.appendChild(li);
        if(optOverallAvgDistanceEl) optOverallAvgDistanceEl.textContent = avgDist + " km";
    } else {
        if(optOverallAvgDistanceEl) optOverallAvgDistanceEl.textContent = "N/A";
    }

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
        row.insertCell().textContent = iter.percentOrdersSLA !== null ? iter.percentOrdersSLA.toFixed(1) + "%" : "N/A";
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

function initializeOptimizationChartsLocal() {
    const commonChartOptions = {
        responsive: true,
        maintainAspectRatio: false,
    };
    optDeliveryTimeChartInstance = initializeChart('deliveryTimeChart', 'deliveryTimeOptimization', { type: 'line', data: { labels: [], datasets: [] }, options: { ...commonChartOptions, scales: { y: { beginAtZero: true, title: { display: true, text: 'Time (minutes)'}}, x: {title: {display: true, text: 'Number of Agents'}}} } });
    optUtilizationChartInstance = initializeChart('utilizationChart', 'utilizationOptimization', { type: 'bar', data: { labels: [], datasets: [] }, options: { ...commonChartOptions, scales: { y: { beginAtZero: true, max:100, title: {display: true, text: 'Utilization (%)'}}, x:{title: {display: true, text: 'Number of Agents'}}} } });
    optTotalDeliveredOrdersChartInstance = initializeChart('totalDeliveredOrdersChart', 'totalDeliveredOrdersOptimization', { type: 'bar', data: { labels: [], datasets: [] }, options: { ...commonChartOptions, scales: { y: { beginAtZero: true, title:{display:true, text:'Number of Orders'}}, x:{title: {display: true, text: 'Number of Agents'}}} } });
    optAvgOrderWaitTimeChartInstance = initializeChart('avgOrderWaitTimeChart', 'avgOrderWaitTimeOptimization', { type: 'line', data: { labels: [], datasets: [] }, options: { ...commonChartOptions, scales: { y: { beginAtZero: true, title:{display:true, text:'Time (minutes)'}}, x:{title: {display: true, text: 'Number of Agents'}}} } });
    optOrdersWithinSlaChartInstance = initializeChart('ordersWithinSlaChart', 'ordersWithinSlaOptimization', {type: 'line', data: {labels: [], datasets: []}, options: { ...commonChartOptions, scales: {y: {beginAtZero: true, max: 100, title: {display: true, text: '% Orders in Target Time'}}, x:{title: {display:true, text: 'Number of Agents'}}}}});
}

function renderOptimizationChartsLocal(iterationData, targetTime) {
    const labels = iterationData.map(iter => iter.agents);
    const avgDeliveryTimes = iterationData.map(iter => iter.avgDeliveryTime);
    const avgUtilizations = iterationData.map(iter => iter.avgAgentUtilization);
    const totalDelivered = iterationData.map(iter => iter.deliveredOrders);
    const avgWaitTimes = iterationData.map(iter => iter.avgOrderWaitTime);
    const percentSlaMet = iterationData.map(iter => iter.percentOrdersSLA);

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
    if(getChartInstance('ordersWithinSlaOptimization')) updateChartData('ordersWithinSlaOptimization', labels, [
        { label: '% Orders within Target Time', data: percentSlaMet, borderColor: 'rgb(153, 102, 255)', tension: 0.1, fill: false}
    ]);
}

function exportWorkforceOptResultsToCSV() {
    if (allOptimizationIterationsData.length === 0) {
        alert("No optimization data to export. Please run an optimization first.");
        return;
    }

    let csvContent = "data:text/csv;charset=utf-8,";
    const headers = [
        "Agents", "Generated Orders", "Delivered Orders", "Avg Delivery Time (min)",
        "% Orders within Target Time", "Min Delivery Time (min)", "Max Delivery Time (min)",
        "Std Dev Delivery Time (min)", "Avg Agent Utilization (%)", "Avg Order Wait Time (min)",
        "Undelivered Orders", "Total Op Cost (₹)", "Avg Cost/Order (₹)"
    ];
    csvContent += headers.join(",") + "\r\n";

    allOptimizationIterationsData.forEach(iter => {
        const row = [
            iter.agents,
            iter.generatedOrders,
            iter.deliveredOrders,
            iter.avgDeliveryTime !== null ? iter.avgDeliveryTime.toFixed(1) : "N/A",
            iter.percentOrdersSLA !== null ? iter.percentOrdersSLA.toFixed(1) : "N/A",
            iter.minDeliveryTime !== null ? iter.minDeliveryTime.toFixed(1) : "N/A",
            iter.maxDeliveryTime !== null ? iter.maxDeliveryTime.toFixed(1) : "N/A",
            iter.stdDevDeliveryTime !== null ? iter.stdDevDeliveryTime.toFixed(1) : "N/A",
            iter.avgAgentUtilization !== null ? iter.avgAgentUtilization.toFixed(1) : "N/A",
            iter.avgOrderWaitTime !== null ? iter.avgOrderWaitTime.toFixed(1) : "N/A",
            iter.undeliveredOrders,
            iter.totalOpCost !== null ? iter.totalOpCost.toFixed(2) : "N/A",
            iter.avgCostPerOrder !== null ? iter.avgCostPerOrder.toFixed(2) : "N/A"
        ];
        // Quote all fields and escape double quotes within fields
        csvContent += row.map(val => `"${String(val).replace(/"/g, '""')}"`).join(",") + "\r\n";
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    const selectedStoreName = optSelectDarkStoreEl.options[optSelectDarkStoreEl.selectedIndex]?.text.split(' (')[0] || "Optimization";
    link.setAttribute("download", `${selectedStoreName.replace(/\s+/g, '_')}_Workforce_Optimization_Results.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    logMessage("Workforce optimization results exported to CSV.", 'SYSTEM', optimizationLogEl);
}
