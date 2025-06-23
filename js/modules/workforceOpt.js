// js/modules/workforceOpt.js
import { chandigarhGeoJsonPolygon, chandigarhCenter } from '../data/chandigarhData.js';
import { initializeMap, getMapInstance, getDistanceKm, isPointInPolygon, darkStoreIcon as commonDarkStoreIcon } from '../mapUtils.js';
import { initializeChart, updateChartData, calculateStdDev, getChartInstance } from '../chartUtils.js';
import { logMessage } from '../logger.js';
import { globalClusteredDarkStores } from './clustering.js';
import { getSimParameter as getMainSimParameter } from './simulation.js';
import { getCustomDemandProfiles } from './demandProfiles.js';

// Module-specific state
let optimizationMap;
let optDarkStoreMarkersLayer;
let optOrderMarkersLayer;
let allOptimizationIterationsData = [];
let bestIterationResultGlobal = null;

// Chart Instances
let optDeliveryTimeChartInstance, optUtilizationChartInstance,
    optTotalDeliveredOrdersChartInstance, optAvgOrderWaitTimeChartInstance,
    optOrdersWithinSlaChartInstance;

// DOM Elements
let optTargetDeliveryTimeInputEl, optSelectDarkStoreEl, 
    optDemandProfileSelectEl, optOrderGenerationRadiusInputEl,
    optTargetOrdersPerIterationInputEl, optMinAgentsInputEl, 
    optMaxAgentsInputEl, optMaxSimTimePerIterationInputEl, 
    runOptimizationBtnEl, optimizationLogEl, optNumRunsPerAgentCountInputEl,
    optimizationMapContainerEl, optimizationComparisonContainerEl, 
    optimizationChartsContainerEl, optimizationResultsContainerEl, 
    optimizationComparisonTableBodyEl, optimizationRecommendationTextEl, 
    exportWorkforceOptResultsBtnEl, optOrderRadiusContainerEl, 
    optTargetOrdersContainerEl, analyzeWorkforceAIButtonEl, 
    workforceAiAnalysisContainerEl, workforceAiAnalysisLoadingEl, 
    workforceAiAnalysisContentEl;

// Result display elements
let optResultAgentsEl, optResultAvgTimeEl, optResultTargetTimeEl, 
    optResultMinDelTimeEl, optResultMaxDelTimeEl, optResultStdDevDelTimeEl, 
    optResultAvgUtilizationEl, optResultAvgWaitTimeEl, optResultUndeliveredEl, 
    optDarkStoreDistancesEl, optOverallAvgDistanceEl,
    optResultTotalAgentLaborCostEl, optResultTotalTravelCostEl, 
    optResultTotalFixedDeliveryCostsEl, optResultOverallTotalOperationalCostEl, 
    optResultAverageCostPerOrderEl, optResultSlaMetEl;

const MIN_DELIVERY_COMPLETION_RATE = 0.95;
const TARGET_SLA_PERCENTAGE = 0.85;

export function initializeWorkforceOptimizationSection() {
    optTargetDeliveryTimeInputEl = document.getElementById('optTargetDeliveryTime');
    optSelectDarkStoreEl = document.getElementById('optSelectDarkStore');
    optDemandProfileSelectEl = document.getElementById('optDemandProfileSelect');
    optOrderGenerationRadiusInputEl = document.getElementById('optOrderGenerationRadius');
    optOrderRadiusContainerEl = document.getElementById('optOrderRadiusContainer');
    optTargetOrdersPerIterationInputEl = document.getElementById('optTargetOrdersPerIteration');
    optTargetOrdersContainerEl = document.getElementById('optTargetOrdersContainer');
    optMinAgentsInputEl = document.getElementById('optMinAgents');
    optMaxAgentsInputEl = document.getElementById('optMaxAgents');
    optNumRunsPerAgentCountInputEl = document.getElementById('optNumRunsPerAgentCount');
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
    
    analyzeWorkforceAIButtonEl = document.getElementById('analyzeWorkforceAI');
    workforceAiAnalysisContainerEl = document.getElementById('workforceAiAnalysisContainer');
    workforceAiAnalysisLoadingEl = document.getElementById('workforceAiAnalysisLoading');
    workforceAiAnalysisContentEl = document.getElementById('workforceAiAnalysisContent');

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
    analyzeWorkforceAIButtonEl?.addEventListener('click', handleWorkforceAiAnalysisRequest);
    optDemandProfileSelectEl?.addEventListener('change', toggleOptProfileSpecificInputs);

    populateDarkStoreSelectorForOpt();
    populateDemandProfileSelectorForOpt();
    initializeOptimizationChartsLocal();
    toggleOptProfileSpecificInputs();
    if(analyzeWorkforceAIButtonEl) analyzeWorkforceAIButtonEl.disabled = true;
}

function toggleOptProfileSpecificInputs() {
    if (!optDemandProfileSelectEl || !optOrderRadiusContainerEl || !optTargetOrdersContainerEl) return;
    const selectedProfile = optDemandProfileSelectEl.value;
    const showDefaultInputs = selectedProfile.startsWith('default_opt_');
    
    optOrderRadiusContainerEl.classList.toggle('hidden', !showDefaultInputs);
    optTargetOrdersContainerEl.classList.toggle('hidden', !showDefaultInputs);
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
            option.textContent = `${store.name} (ID: ${store.id})`;
            if (store.id.toString() === currentVal) option.selected = true;
            optSelectDarkStoreEl.appendChild(option);
        });
        optSelectDarkStoreEl.disabled = false;
        if(runOptimizationBtnEl) runOptimizationBtnEl.disabled = false;
    } else {
        const option = document.createElement('option');
        option.value = "";
        option.textContent = "-- Run Clustering First --";
        optSelectDarkStoreEl.appendChild(option);
        optSelectDarkStoreEl.disabled = true;
        if(runOptimizationBtnEl) runOptimizationBtnEl.disabled = true;
    }
}

function populateDemandProfileSelectorForOpt() {
    if (!optDemandProfileSelectEl) return;
    const currentVal = optDemandProfileSelectEl.value;
    const defaultOptions = Array.from(optDemandProfileSelectEl.options).filter(opt => opt.value.startsWith('default_opt_'));
    optDemandProfileSelectEl.innerHTML = '';
    defaultOptions.forEach(opt => optDemandProfileSelectEl.appendChild(opt.cloneNode(true)));

    const customProfiles = getCustomDemandProfiles();
    customProfiles.forEach(profile => {
        const option = document.createElement('option');
        option.value = `custom_${profile.name}`;
        option.textContent = `Custom: ${profile.name}`;
        optDemandProfileSelectEl.appendChild(option);
    });

    if (Array.from(optDemandProfileSelectEl.options).some(opt => opt.value === currentVal)) {
        optDemandProfileSelectEl.value = currentVal;
    } else {
        optDemandProfileSelectEl.value = 'default_opt_uniform';
    }
    toggleOptProfileSpecificInputs();
}

async function runWorkforceOptimization() {
    allOptimizationIterationsData = [];
    bestIterationResultGlobal = null;
    if(optimizationComparisonContainerEl) optimizationComparisonContainerEl.classList.add('hidden');
    if(optimizationChartsContainerEl) optimizationChartsContainerEl.classList.add('hidden');
    if(optimizationResultsContainerEl) optimizationResultsContainerEl.classList.add('hidden');
    if(optimizationRecommendationTextEl) optimizationRecommendationTextEl.innerHTML = '<p class="text-center p-4">Crunching numbers... Please wait.</p>';
    if(exportWorkforceOptResultsBtnEl) exportWorkforceOptResultsBtnEl.disabled = true;
    if(analyzeWorkforceAIButtonEl) analyzeWorkforceAIButtonEl.disabled = true;
    if(workforceAiAnalysisContainerEl) workforceAiAnalysisContainerEl.classList.add('hidden');

    const selectedDarkStoreId = parseInt(optSelectDarkStoreEl.value);
    const selectedDarkStore = globalClusteredDarkStores.find(ds => ds.id === selectedDarkStoreId);
    if (isNaN(selectedDarkStoreId) || !selectedDarkStore) {
        logMessage("Error: Please select a valid dark store.", 'ERROR', optimizationLogEl);
        return;
    }
    
    runOptimizationBtnEl.disabled = true;
    runOptimizationBtnEl.textContent = "Optimizing...";
    if (optimizationLogEl) optimizationLogEl.innerHTML = "";
    logMessage(`Starting workforce optimization for Dark Store: ${selectedDarkStore.name}`, 'SYSTEM', optimizationLogEl);

    const baseHandlingTime = getMainSimParameter('handlingTime');
    const baseTrafficFactor = getMainSimParameter('baseTrafficFactor');
    const iterAgentCostPerHour = getMainSimParameter('agentCostPerHour');
    const iterCostPerKm = getMainSimParameter('costPerKmTraveled');
    const iterFixedCostPerDelivery = getMainSimParameter('fixedCostPerDelivery');
    const minAgentsToTest = parseInt(optMinAgentsInputEl.value);
    const maxAgentsToTest = parseInt(optMaxAgentsInputEl.value);
    const numRunsPerAgentCount = parseInt(optNumRunsPerAgentCountInputEl.value);
    const maxSimTimePerIteration = parseInt(optMaxSimTimePerIterationInputEl.value);
    const targetOrdersPerIterationDefault = parseInt(optTargetOrdersPerIterationInputEl.value);
    const orderRadiusKm = parseFloat(optOrderGenerationRadiusInputEl.value);
    const targetAvgDeliveryTime = parseInt(optTargetDeliveryTimeInputEl.value);

    for (let currentNumAgents = minAgentsToTest; currentNumAgents <= maxAgentsToTest; currentNumAgents++) {
        logMessage(`Testing with ${currentNumAgents} agent(s) across ${numRunsPerAgentCount} runs...`, 'ITERATION', optimizationLogEl);
        
        let aggregatedStats = { totalGenerated: 0, totalDelivered: 0, sumDeliveryTimes: 0, deliveryTimes: [], ordersWithinSLA: 0, sumWaitTimes: 0, numAssigned: 0, totalAgentActiveTime: 0, totalAgentDistanceKm: 0, totalRuns: 0 };

        for (let run = 0; run < numRunsPerAgentCount; run++) {
            let iterSimTime = 0;
            let iterOrders = [];
            let iterAgents = [];
            let iterOrderIdCounter = 0;
            let currentRunStats = { totalGenerated: 0, totalDelivered: 0, sumDeliveryTimes: 0, deliveryTimes: [], ordersWithinSLA: 0, sumWaitTimes: 0, numAssigned: 0, totalAgentActiveTime: 0, totalAgentDistanceKm: 0 };
            
            let orderGenerationCounter = 0;
            const orderGenerationInterval = targetOrdersPerIterationDefault > 0 ? maxSimTimePerIteration / targetOrdersPerIterationDefault : Infinity;

            for (let i = 0; i < currentNumAgents; i++) {
                const speedRange = getMainSimParameter('agentMaxSpeed') - getMainSimParameter('agentMinSpeed');
                iterAgents.push({ id: i, location: { ...selectedDarkStore }, speedKmph: getMainSimParameter('agentMinSpeed') + Math.random() * speedRange, status: 'available', assignedOrderId: null, routePath: [], legProgress: 0, timeSpentAtStore: 0 });
            }

            while (iterSimTime < maxSimTimePerIteration) {
                iterSimTime++;
                orderGenerationCounter++;

                if (currentRunStats.totalGenerated < targetOrdersPerIterationDefault && orderGenerationCounter >= orderGenerationInterval) {
                    orderGenerationCounter = 0;
                    currentRunStats.totalGenerated++;
                    const orderId = iterOrderIdCounter++;
                    const radiusDeg = orderRadiusKm / 111;
                    let orderLocation, attempts = 0;
                    do {
                        const angle = Math.random() * 2 * Math.PI;
                        const distance = Math.sqrt(Math.random()) * radiusDeg;
                        orderLocation = { lat: selectedDarkStore.lat + distance * Math.sin(angle), lng: selectedDarkStore.lng + distance * Math.cos(angle) };
                        attempts++;
                    } while (!isPointInPolygon([orderLocation.lng, orderLocation.lat], chandigarhGeoJsonPolygon) && attempts < 100);
                    if (attempts >= 100) orderLocation = { ...selectedDarkStore };
                    iterOrders.push({ id: orderId, location: orderLocation, status: 'pending', timePlaced: iterSimTime });
                }
                
                iterOrders.filter(o => o.status === 'pending').forEach(order => {
                    let bestAgent = null, shortestETA = Infinity;
                    iterAgents.filter(a => a.status === 'available').forEach(agent => {
                        const timeToStore = (agent.location.lat === selectedDarkStore.lat && agent.location.lng === selectedDarkStore.lng) ? 0 : (getDistanceKm(agent.location, selectedDarkStore) / (agent.speedKmph * baseTrafficFactor)) * 60;
                        const timeToCustomer = (getDistanceKm(selectedDarkStore, order.location) / (agent.speedKmph * baseTrafficFactor)) * 60;
                        const eta = timeToStore + baseHandlingTime + timeToCustomer;
                        if (eta < shortestETA) { shortestETA = eta; bestAgent = agent; }
                    });
                    if (bestAgent) {
                        order.status = 'assigned'; order.assignedAgentId = bestAgent.id; order.assignmentTime = iterSimTime;
                        currentRunStats.sumWaitTimes += (iterSimTime - order.timePlaced); currentRunStats.numAssigned++;
                        bestAgent.assignedOrderId = order.id;
                        bestAgent.status = 'to_store'; 
                        bestAgent.routePath = [ {...bestAgent.location}, {...selectedDarkStore}, {...order.location} ]; 
                        bestAgent.legProgress = 0;
                    }
                });

                iterAgents.forEach(agent => {
                    if (agent.status === 'available') return;
                    currentRunStats.totalAgentActiveTime++;
                    let startPoint, endPoint;
                    if (agent.status === 'to_store') {
                        startPoint = agent.routePath[0];
                        endPoint = agent.routePath[1];
                    } else if (agent.status === 'at_store') {
                        agent.timeSpentAtStore++;
                        if (agent.timeSpentAtStore >= baseHandlingTime) {
                            agent.status = 'to_customer';
                            agent.legProgress = 0;
                        }
                        return; 
                    } else if (agent.status === 'to_customer') {
                        startPoint = agent.routePath[1];
                        endPoint = agent.routePath[2];
                    } else {
                        return;
                    }

                    const legDist = getDistanceKm(startPoint, endPoint);
                    if (legDist > 0.01) {
                        const distCovered = (agent.speedKmph * baseTrafficFactor) / 60;
                        currentRunStats.totalAgentDistanceKm += distCovered;
                        agent.legProgress += (distCovered / legDist);
                    } else {
                        agent.legProgress = 1;
                    }
                    
                    if (agent.legProgress >= 1) {
                        agent.location = { ...endPoint };
                        agent.legProgress = 0;
                        if (agent.status === 'to_store') {
                            agent.status = 'at_store';
                            agent.timeSpentAtStore = 0;
                        } else if (agent.status === 'to_customer') {
                            const deliveredOrder = iterOrders.find(o => o.id === agent.assignedOrderId);
                            if (deliveredOrder) {
                                deliveredOrder.status = 'delivered';
                                currentRunStats.totalDelivered++;
                                const deliveryDuration = iterSimTime - deliveredOrder.timePlaced;
                                currentRunStats.sumDeliveryTimes += deliveryDuration;
                                currentRunStats.deliveryTimes.push(deliveryDuration);
                                if (deliveryDuration <= targetAvgDeliveryTime) currentRunStats.ordersWithinSLA++;
                            }
                            agent.status = 'available';
                            agent.assignedOrderId = null;
                        }
                    }
                });

                if (currentRunStats.totalGenerated >= targetOrdersPerIterationDefault && currentRunStats.totalDelivered === currentRunStats.totalGenerated) {
                    break; 
                }
            }
            
            aggregatedStats.totalGenerated += currentRunStats.totalGenerated;
            aggregatedStats.totalDelivered += currentRunStats.totalDelivered;
            aggregatedStats.sumDeliveryTimes += currentRunStats.sumDeliveryTimes;
            aggregatedStats.deliveryTimes.push(...currentRunStats.deliveryTimes);
            aggregatedStats.ordersWithinSLA += currentRunStats.ordersWithinSLA;
            aggregatedStats.sumWaitTimes += currentRunStats.sumWaitTimes;
            aggregatedStats.numAssigned += currentRunStats.numAssigned;
            aggregatedStats.totalAgentActiveTime += currentRunStats.totalAgentActiveTime;
            aggregatedStats.totalAgentDistanceKm += currentRunStats.totalAgentDistanceKm;
            aggregatedStats.totalRuns++;
        }
        
        const avgGenerated = aggregatedStats.totalGenerated / aggregatedStats.totalRuns;
        const avgDelivered = aggregatedStats.totalDelivered / aggregatedStats.totalRuns;
        const avgDelTime = aggregatedStats.totalDelivered > 0 ? (aggregatedStats.sumDeliveryTimes / aggregatedStats.totalDelivered) : null;
        const percentOrdersSLA = aggregatedStats.totalDelivered > 0 ? (aggregatedStats.ordersWithinSLA / aggregatedStats.totalDelivered) * 100 : 0;
        const avgUtil = (currentNumAgents * maxSimTimePerIteration * aggregatedStats.totalRuns) > 0 ? (aggregatedStats.totalAgentActiveTime / (currentNumAgents * maxSimTimePerIteration * aggregatedStats.totalRuns) * 100) : 0;
        const avgWait = aggregatedStats.numAssigned > 0 ? (aggregatedStats.sumWaitTimes / aggregatedStats.numAssigned) : null;
        const allTimes = aggregatedStats.deliveryTimes;
        const minDelTime = allTimes.length > 0 ? Math.min(...allTimes) : null;
        const maxDelTime = allTimes.length > 0 ? Math.max(...allTimes) : null;
        const stdDevDelTime = allTimes.length > 1 && avgDelTime !== null ? calculateStdDev(allTimes, avgDelTime) : null;
        const totalLaborCost = (aggregatedStats.totalAgentActiveTime / aggregatedStats.totalRuns / 60) * iterAgentCostPerHour;
        const totalTravelCost = (aggregatedStats.totalAgentDistanceKm / aggregatedStats.totalRuns) * iterCostPerKm;
        const totalFixedCost = avgDelivered * iterFixedCostPerDelivery;
        const totalOpCost = totalLaborCost + totalTravelCost + totalFixedCost;
        const avgCostPerOrder = avgDelivered > 0 ? totalOpCost / avgDelivered : null;
        
        allOptimizationIterationsData.push({ agents: currentNumAgents, generatedOrders: avgGenerated, deliveredOrders: avgDelivered, avgDeliveryTime: avgDelTime, percentOrdersSLA: percentOrdersSLA, minDeliveryTime: minDelTime, maxDeliveryTime: maxDelTime, stdDevDeliveryTime: stdDevDelTime, avgAgentUtilization: avgUtil, avgOrderWaitTime: avgWait, undeliveredOrders: avgGenerated - avgDelivered, totalOpCost: totalOpCost, avgCostPerOrder: avgCostPerOrder, deliveryCompletionRate: avgGenerated > 0 ? avgDelivered / avgGenerated : 0 });
        logMessage(`Avg for ${currentNumAgents} Agents: Gen: ${avgGenerated.toFixed(1)}, Del: ${avgDelivered.toFixed(1)}, AvgDelTime: ${avgDelTime?.toFixed(1) ?? 'N/A'}m, Cost/Order: ₹${avgCostPerOrder?.toFixed(2) ?? 'N/A'}`, 'STATS', optimizationLogEl);
    }
    
    let qualifiedIterations = allOptimizationIterationsData.filter(iter => iter.deliveryCompletionRate >= MIN_DELIVERY_COMPLETION_RATE && iter.percentOrdersSLA >= TARGET_SLA_PERCENTAGE);
    if (qualifiedIterations.length === 0) { qualifiedIterations = allOptimizationIterationsData.filter(iter => iter.deliveryCompletionRate >= MIN_DELIVERY_COMPLETION_RATE); }
    if (qualifiedIterations.length === 0) { qualifiedIterations = allOptimizationIterationsData; }
    
    if (qualifiedIterations.length > 0) {
        qualifiedIterations.sort((a, b) => {
            const costA = a.avgCostPerOrder ?? Infinity;
            const costB = b.avgCostPerOrder ?? Infinity;
            if (Math.abs(costA - costB) > 0.50) { return costA - costB; }
            const timeA = a.avgDeliveryTime ?? Infinity;
            const timeB = b.avgDeliveryTime ?? Infinity;
            if (Math.abs(timeA - timeB) > 0.1) { return timeA - timeB; }
            const deliveredA = a.deliveredOrders ?? 0;
            const deliveredB = b.deliveredOrders ?? 0;
            return deliveredB - deliveredA;
        });
        bestIterationResultGlobal = qualifiedIterations[0];
    } else {
        bestIterationResultGlobal = null;
    }

    displayOptimizationResults(bestIterationResultGlobal, targetAvgDeliveryTime);
    populateOptimizationComparisonTable(allOptimizationIterationsData);
    renderOptimizationChartsLocal(allOptimizationIterationsData, targetAvgDeliveryTime);
    
    if(optimizationResultsContainerEl) optimizationResultsContainerEl.classList.remove('hidden');
    if(optimizationComparisonContainerEl) optimizationComparisonContainerEl.classList.remove('hidden');
    if(optimizationChartsContainerEl) optimizationChartsContainerEl.classList.remove('hidden');
    
    if(exportWorkforceOptResultsBtnEl) exportWorkforceOptResultsBtnEl.disabled = false;
    if(analyzeWorkforceAIButtonEl) analyzeWorkforceAIButtonEl.disabled = false;
    runOptimizationBtnEl.disabled = false;
    runOptimizationBtnEl.textContent = "Run Workforce Optimization";
}

function displayOptimizationResults(bestResult, targetTime) {
    if (!bestResult) {
        if(optResultAgentsEl) optResultAgentsEl.textContent = "Not Found";
        if(optResultAvgTimeEl) optResultAvgTimeEl.textContent = "N/A";
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
    if(optResultUndeliveredEl) optResultUndeliveredEl.textContent = bestResult.undeliveredOrders?.toFixed(1) ?? "N/A";
    if(optResultOverallTotalOperationalCostEl) optResultOverallTotalOperationalCostEl.textContent = `₹${(bestResult.totalOpCost || 0).toFixed(2)}`;
    if(optResultAverageCostPerOrderEl) optResultAverageCostPerOrderEl.textContent = bestResult.avgCostPerOrder === null || isNaN(bestResult.avgCostPerOrder) ? "N/A" : `₹${bestResult.avgCostPerOrder.toFixed(2)}`;
}

function populateOptimizationComparisonTable(iterationData) {
    if (!optimizationComparisonTableBodyEl) return;
    optimizationComparisonTableBodyEl.innerHTML = "";
    iterationData.forEach(iter => {
        const row = optimizationComparisonTableBodyEl.insertRow();
        row.insertCell().textContent = iter.agents;
        row.insertCell().textContent = iter.generatedOrders?.toFixed(1) ?? 'N/A';
        row.insertCell().textContent = iter.deliveredOrders?.toFixed(1) ?? 'N/A';
        row.insertCell().textContent = iter.avgDeliveryTime !== null ? iter.avgDeliveryTime.toFixed(1) : "N/A";
        row.insertCell().textContent = iter.percentOrdersSLA !== null ? iter.percentOrdersSLA.toFixed(1) + "%" : "N/A";
        row.insertCell().textContent = iter.minDeliveryTime !== null ? iter.minDeliveryTime.toFixed(1) : "N/A";
        row.insertCell().textContent = iter.maxDeliveryTime !== null ? iter.maxDeliveryTime.toFixed(1) : "N/A";
        row.insertCell().textContent = iter.stdDevDeliveryTime !== null ? iter.stdDevDeliveryTime.toFixed(1) : "N/A";
        row.insertCell().textContent = iter.avgAgentUtilization !== null ? iter.avgAgentUtilization.toFixed(1) + "%" : "N/A";
        row.insertCell().textContent = iter.avgOrderWaitTime !== null ? iter.avgOrderWaitTime.toFixed(1) : "N/A";
        row.insertCell().textContent = iter.undeliveredOrders?.toFixed(1) ?? 'N/A';
        row.insertCell().textContent = iter.totalOpCost !== null ? `₹${iter.totalOpCost.toFixed(2)}` : "N/A";
        row.insertCell().textContent = iter.avgCostPerOrder !== null ? `₹${iter.avgCostPerOrder.toFixed(2)}` : "N/A";
    });
}

function initializeOptimizationChartsLocal() {
    const commonChartOptions = { responsive: true, animation: false };
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
        { label: 'Avg. Total Delivered Orders', data: totalDelivered, backgroundColor: 'rgba(75, 192, 192, 0.6)', borderColor: 'rgb(75, 192, 192)', borderWidth: 1 }
    ]);
    if(getChartInstance('avgOrderWaitTimeOptimization')) updateChartData('avgOrderWaitTimeOptimization', labels, [
        { label: 'Avg. Order Wait Time (min)', data: avgWaitTimes, borderColor: 'rgb(255, 159, 64)', tension: 0.1, fill: false }
    ]);
    if(getChartInstance('ordersWithinSlaOptimization')) updateChartData('ordersWithinSlaOptimization', labels, [
        { label: 'Avg. % Orders within Target Time', data: percentSlaMet, borderColor: 'rgb(153, 102, 255)', tension: 0.1, fill: false}
    ]);
}

function exportWorkforceOptResultsToCSV() { /* Unchanged */ }
function prepareWorkforceDataForAI() { /* Unchanged */ }
async function handleWorkforceAiAnalysisRequest() { /* Unchanged */ }
