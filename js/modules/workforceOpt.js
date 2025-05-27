// js/modules/workforceOpt.js
import { chandigarhGeoJsonPolygon, chandigarhCenter, chandigarhSectors } from '../data/chandigarhData.js';
import { initializeMap, getMapInstance, getDistanceKm, isPointInPolygon, darkStoreIcon as commonDarkStoreIcon, generateWaypoints } from '../mapUtils.js';
import { initializeChart, updateChartData, calculateStdDev, getChartInstance } from '../chartUtils.js';
import { logMessage } from '../logger.js';
import { globalClusteredDarkStores } from './clustering.js';
import { getSimParameter as getMainSimParameter, orderGenerationProbabilities as mainSimOrderProbs } from './simulation.js';
import { getCustomDemandProfiles } from './demandProfiles.js';

// Module-specific state
let optimizationMap;
let optDarkStoreMarkersLayer;
let optOrderMarkersLayer;
let allOptimizationIterationsData = [];

// Chart Instances
let optDeliveryTimeChartInstance, optUtilizationChartInstance,
    optTotalDeliveredOrdersChartInstance, optAvgOrderWaitTimeChartInstance,
    optOrdersWithinSlaChartInstance;

// DOM Elements
let optTargetDeliveryTimeInputEl, optSelectDarkStoreEl, 
    optDemandProfileSelectEl, optOrderGenerationRadiusInputEl,
    optTargetOrdersPerIterationInputEl, // For default profiles if selected
    optMinAgentsInputEl, optMaxAgentsInputEl,
    optMaxSimTimePerIterationInputEl, runOptimizationBtnEl, optimizationLogEl,
    optNumRunsPerAgentCountInputEl, // New input for number of runs
    optimizationMapContainerEl, optimizationComparisonContainerEl, optimizationChartsContainerEl,
    optimizationResultsContainerEl, optimizationComparisonTableBodyEl,
    optimizationRecommendationTextEl, exportWorkforceOptResultsBtnEl,
    optOrderRadiusContainerEl, optTargetOrdersContainerEl;

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
    optDemandProfileSelectEl = document.getElementById('optDemandProfileSelect');
    optOrderGenerationRadiusInputEl = document.getElementById('optOrderGenerationRadius');
    optOrderRadiusContainerEl = document.getElementById('optOrderRadiusContainer');
    optTargetOrdersPerIterationInputEl = document.getElementById('optTargetOrdersPerIteration');
    optTargetOrdersContainerEl = document.getElementById('optTargetOrdersContainer');
    optMinAgentsInputEl = document.getElementById('optMinAgents');
    optMaxAgentsInputEl = document.getElementById('optMaxAgents');
    optNumRunsPerAgentCountInputEl = document.getElementById('optNumRunsPerAgentCount'); // New
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
    optDemandProfileSelectEl?.addEventListener('change', toggleOptProfileSpecificInputs);

    populateDarkStoreSelectorForOpt();
    populateDemandProfileSelectorForOpt();
    initializeOptimizationChartsLocal();
    toggleOptProfileSpecificInputs();
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
            option.textContent = `${store.name} (ID: ${store.id} - Lat: ${store.lat.toFixed(3)}, Lng: ${store.lng.toFixed(3)})`;
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
    if(optimizationComparisonContainerEl) optimizationComparisonContainerEl.classList.add('hidden');
    if(optimizationChartsContainerEl) optimizationChartsContainerEl.classList.add('hidden');
    if(optimizationResultsContainerEl) optimizationResultsContainerEl.classList.add('hidden');
    if(optimizationRecommendationTextEl) optimizationRecommendationTextEl.innerHTML = '<p class="text-center p-4">Crunching numbers... Please wait.</p>';
    if(exportWorkforceOptResultsBtnEl) exportWorkforceOptResultsBtnEl.disabled = true;

    const requiredElements = {
        optTargetDeliveryTimeInputEl, optSelectDarkStoreEl, optDemandProfileSelectEl,
        optMinAgentsInputEl, optMaxAgentsInputEl, optMaxSimTimePerIterationInputEl,
        optNumRunsPerAgentCountInputEl
        // optOrderGenerationRadiusInputEl and optTargetOrdersPerIterationInputEl are checked conditionally later
    };

    for (const elKey in requiredElements) {
        if (!requiredElements[elKey]) {
            const errorMessage = `Error: Input element for "${elKey}" not found. Optimization cannot proceed.`;
            console.error(errorMessage);
            if(optimizationLogEl) logMessage(errorMessage, 'ERROR', optimizationLogEl);
            if (runOptimizationBtnEl) { runOptimizationBtnEl.disabled = false; runOptimizationBtnEl.textContent = "Run Workforce Optimization"; }
            return;
        }
    }

    const selectedDarkStoreId = parseInt(optSelectDarkStoreEl.value);
    const selectedDarkStore = globalClusteredDarkStores.find(ds => ds.id === selectedDarkStoreId);
    if (isNaN(selectedDarkStoreId) || !selectedDarkStore) {
        logMessage("Error: Please select a valid dark store.", 'ERROR', optimizationLogEl);
        if (runOptimizationBtnEl) { runOptimizationBtnEl.disabled = false; runOptimizationBtnEl.textContent = "Run Workforce Optimization"; }
        return;
    }
    
    const selectedDemandProfileId = optDemandProfileSelectEl.value;
    const orderRadiusKm = parseFloat(optOrderGenerationRadiusInputEl.value);
    const targetOrdersPerIterationDefault = parseInt(optTargetOrdersPerIterationInputEl.value);
    let minAgentsToTest = parseInt(optMinAgentsInputEl.value);
    let maxAgentsToTest = parseInt(optMaxAgentsInputEl.value);
    const numRunsPerAgentCount = parseInt(optNumRunsPerAgentCountInputEl.value);
    const targetAvgDeliveryTime = parseInt(optTargetDeliveryTimeInputEl.value);
    const maxSimTimePerIteration = parseInt(optMaxSimTimePerIterationInputEl.value);

    if ( (selectedDemandProfileId.startsWith('default_opt_') && (isNaN(orderRadiusKm) || orderRadiusKm <= 0 || isNaN(targetOrdersPerIterationDefault) || targetOrdersPerIterationDefault <=0)) || 
        isNaN(targetAvgDeliveryTime) || targetAvgDeliveryTime <=0 || 
        isNaN(maxSimTimePerIteration) || maxSimTimePerIteration <=0 ||
        isNaN(numRunsPerAgentCount) || numRunsPerAgentCount < 1) {
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
    logMessage(`Target Avg Delivery Time: ${targetAvgDeliveryTime} min. Demand Profile: ${selectedDemandProfileId}. Runs per agent count: ${numRunsPerAgentCount}.`, 'SYSTEM', optimizationLogEl);
    logMessage(`Testing agents from ${minAgentsToTest} to ${maxAgentsToTest}. Max sim time per iter: ${maxSimTimePerIteration} min.`, 'SYSTEM', optimizationLogEl);

    const baseMinAgentSpeed = getMainSimParameter('agentMinSpeed');
    const baseMaxAgentSpeed = getMainSimParameter('agentMaxSpeed');
    const baseHandlingTime = getMainSimParameter('handlingTime');
    const baseTrafficFactor = getMainSimParameter('baseTrafficFactor');
    const iterAgentCostPerHour = getMainSimParameter('agentCostPerHour');
    const iterCostPerKm = getMainSimParameter('costPerKmTraveled');
    const iterFixedCostPerDelivery = getMainSimParameter('fixedCostPerDelivery');

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
    const customProfiles = getCustomDemandProfiles();

    for (let currentNumAgents = minAgentsToTest; currentNumAgents <= maxAgentsToTest; currentNumAgents++) {
        logMessage(`Testing with ${currentNumAgents} agent(s) across ${numRunsPerAgentCount} runs...`, 'ITERATION', optimizationLogEl);
        
        let aggregatedStatsForAgentCount = {
            totalGenerated: 0, totalDelivered: 0, sumDeliveryTimes: 0, deliveryTimes: [],
            ordersWithinSLA: 0, sumWaitTimes: 0, numAssigned: 0, 
            totalAgentActiveTime: 0, totalAgentDistanceKm: 0,
            totalOpCost: 0, totalRuns: 0
        };

        for (let run = 0; run < numRunsPerAgentCount; run++) {
            logMessage(`  Run ${run + 1}/${numRunsPerAgentCount} for ${currentNumAgents} agents...`, 'SYSTEM', optimizationLogEl);
            if (optimizationLogEl) optimizationLogEl.scrollTop = optimizationLogEl.scrollHeight;

            let iterSimTime = 0;
            let iterOrders = [];
            let iterAgents = [];
            let iterOrderIdCounter = 0; // Reset for each small run
            let currentRunStats = { // Stats for this single run
                totalGenerated: 0, totalDelivered: 0, sumDeliveryTimes: 0, deliveryTimes: [],
                ordersWithinSLA: 0, sumWaitTimes: 0, numAssigned: 0, 
                totalAgentActiveTime: 0, totalAgentDistanceKm: 0
            };


            for (let i = 0; i < currentNumAgents; i++) {
                const speedRange = baseMaxAgentSpeed - baseMinAgentSpeed;
                iterAgents.push({
                    id: i, location: { ...selectedDarkStore }, speedKmph: baseMinAgentSpeed + Math.random() * speedRange,
                    status: 'available', assignedOrderId: null, routePath: [], currentLegIndex: 0,
                    legProgress: 0, timeSpentAtStore: 0, totalTime: 0, busyTime: 0, distanceTraveled: 0
                });
            }

            // Order Generation Loop
            while (iterSimTime < maxSimTimePerIteration) {
                iterSimTime++;
                iterAgents.forEach(agent => agent.totalTime++);

                let ordersGeneratedThisStep = 0;
                if (selectedDemandProfileId.startsWith('custom_')) {
                    const profileName = selectedDemandProfileId.substring('custom_'.length);
                    const customProfile = customProfiles.find(p => p.name === profileName);
                    if (customProfile && customProfile.zones) {
                        customProfile.zones.forEach(zone => {
                            if (iterSimTime >= zone.startTime && iterSimTime <= (zone.endTime || Infinity)) {
                                const ordersPerHour = (zone.minOrders + zone.maxOrders) / 2;
                                const probPerMinute = ordersPerHour / 60;
                                if (Math.random() < probPerMinute) {
                                    ordersGeneratedThisStep++;
                                    let orderLocation;
                                    if (zone.type === 'uniform') {
                                        const uniformPoints = generateUniformPointInChd(1, chandigarhGeoJsonPolygon);
                                        orderLocation = uniformPoints.length > 0 ? uniformPoints[0] : { ...selectedDarkStore };
                                    } else if (zone.type === 'hotspot') {
                                        const hotspotCenter = { lat: zone.centerLat, lng: zone.centerLng };
                                        const spreadDeg = (zone.spreadKm || 1) / 111;
                                        let attempts = 0;
                                        do {
                                            orderLocation = { lat: hotspotCenter.lat + (Math.random() - 0.5) * 2 * spreadDeg, lng: hotspotCenter.lng + (Math.random() - 0.5) * 2 * spreadDeg };
                                            attempts++;
                                        } while (!isPointInPolygon([orderLocation.lng, orderLocation.lat], chandigarhGeoJsonPolygon) && attempts < 50);
                                        if (attempts >= 50 && !isPointInPolygon([orderLocation.lng, orderLocation.lat], chandigarhGeoJsonPolygon)) orderLocation = { ...hotspotCenter };
                                    } else { 
                                         orderLocation = { lat: selectedDarkStore.lat + (Math.random() - 0.5) * 2 * (orderRadiusKm / 111), lng: selectedDarkStore.lng + (Math.random() - 0.5) * 2 * (orderRadiusKm / 111)};
                                         if (!isPointInPolygon([orderLocation.lng, orderLocation.lat], chandigarhGeoJsonPolygon)) orderLocation = {...selectedDarkStore};
                                    }
                                    if (orderLocation) {
                                        iterOrders.push({ id: iterOrderIdCounter++, location: orderLocation, status: 'pending', timePlaced: iterSimTime });
                                        currentRunStats.totalGenerated++;
                                    }
                                }
                            }
                        });
                    }
                } else { // Default optimization profiles
                    const probForDefault = (targetOrdersPerIterationDefault / maxSimTimePerIteration);
                    if (currentRunStats.totalGenerated < targetOrdersPerIterationDefault && Math.random() < probForDefault) {
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
                        if (attempts >= 100 && !isPointInPolygon([orderLocation.lng, orderLocation.lat], chandigarhGeoJsonPolygon)) {
                            orderLocation = { ...selectedDarkStore };
                        }
                        iterOrders.push({ id: orderId, location: orderLocation, status: 'pending', timePlaced: iterSimTime });
                    }
                }
                
                // Order Assignment & Agent Movement (simplified)
                iterOrders.filter(o => o.status === 'pending').forEach(order => {
                    let bestIterAgent = null; let shortestIterETA = Infinity;
                    iterAgents.filter(a => a.status === 'available').forEach(agent => {
                        let timeToStore = 0;
                        if(agent.location.lat !== selectedDarkStore.lat || agent.location.lng !== selectedDarkStore.lng) {
                            timeToStore = (getDistanceKm(agent.location, selectedDarkStore) / (agent.speedKmph * baseTrafficFactor)) * 60;
                        }
                        const timeToCustomer = (getDistanceKm(selectedDarkStore, order.location) / (agent.speedKmph * baseTrafficFactor)) * 60;
                        const eta = timeToStore + baseHandlingTime + timeToCustomer;
                        if (eta < shortestIterETA) { shortestIterETA = eta; bestIterAgent = agent; }
                    });
                    if (bestIterAgent) {
                        order.status = 'assigned'; order.assignedAgentId = bestIterAgent.id;
                        order.assignmentTime = iterSimTime;
                        currentRunStats.sumWaitTimes += (order.assignmentTime - order.timePlaced);
                        currentRunStats.numAssigned++;
                        bestIterAgent.assignedOrderId = order.id; 
                        bestIterAgent.status = (bestIterAgent.location.lat === selectedDarkStore.lat && bestIterAgent.location.lng === selectedDarkStore.lng) ? 'at_store' : 'to_store';
                        bestIterAgent.routePath = [bestIterAgent.location, selectedDarkStore, order.location];
                        bestIterAgent.currentLegIndex = 0; bestIterAgent.legProgress = 0; bestIterAgent.timeSpentAtStore = 0;
                    }
                });
                iterAgents.forEach(agent => {
                    if (agent.status === 'available') return;
                    agent.busyTime++; currentRunStats.totalAgentActiveTime++;
                    if (agent.status === 'to_store') {
                        const legDist = getDistanceKm(agent.location, selectedDarkStore);
                        const distCovered = (agent.speedKmph * baseTrafficFactor / 60) * 1;
                        agent.distanceTraveled += distCovered; currentRunStats.totalAgentDistanceKm += distCovered;
                         if (legDist <= distCovered || legDist < 0.01) { agent.location = {...selectedDarkStore}; agent.status = 'at_store'; agent.timeSpentAtStore = 0;}
                    } else if (agent.status === 'at_store') {
                        agent.timeSpentAtStore++;
                        if (agent.timeSpentAtStore >= baseHandlingTime) {
                            agent.status = 'to_customer'; agent.timeSpentAtStore = 0;
                            const currentOrder = iterOrders.find(o=>o.id === agent.assignedOrderId);
                            if (currentOrder) agent.routePath = [selectedDarkStore, currentOrder.location]; else agent.status = 'available';
                            agent.currentLegIndex = 0; agent.legProgress = 0;
                        }
                    } else if (agent.status === 'to_customer') {
                        const customerLocation = agent.routePath[1];
                        const legDist = getDistanceKm(agent.location, customerLocation);
                        if (legDist === 0) { agent.legProgress = 1; }
                        else {
                            const distCovered = (agent.speedKmph * baseTrafficFactor / 60) * 1;
                            agent.distanceTraveled += distCovered; currentRunStats.totalAgentDistanceKm += distCovered;
                            agent.legProgress += (distCovered / legDist);
                        }
                        if (agent.legProgress >= 1) {
                            agent.location = {...customerLocation};
                            const deliveredOrder = iterOrders.find(o => o.id === agent.assignedOrderId);
                            if (deliveredOrder) {
                                deliveredOrder.status = 'delivered'; deliveredOrder.deliveryTime = iterSimTime;
                                currentRunStats.totalDelivered++;
                                const deliveryDuration = iterSimTime - deliveredOrder.timePlaced;
                                currentRunStats.sumDeliveryTimes += deliveryDuration; currentRunStats.deliveryTimes.push(deliveryDuration);
                                if (deliveryDuration <= targetAvgDeliveryTime) currentRunStats.ordersWithinSLA++;
                            }
                            agent.status = 'available'; agent.assignedOrderId = null; agent.legProgress = 0;
                        }
                    }
                });
                if (iterOrders.length > 0 && iterOrders.every(o => o.status === 'delivered')) {
                    if (selectedDemandProfileId.startsWith('custom_') || currentRunStats.totalGenerated >= targetOrdersPerIterationDefault) {
                        break; 
                    }
                }
            } // End of single run's while loop

            // Aggregate stats from this run
            aggregatedStatsForAgentCount.totalGenerated += currentRunStats.totalGenerated;
            aggregatedStatsForAgentCount.totalDelivered += currentRunStats.totalDelivered;
            aggregatedStatsForAgentCount.sumDeliveryTimes += currentRunStats.sumDeliveryTimes;
            aggregatedStatsForAgentCount.deliveryTimes.push(...currentRunStats.deliveryTimes);
            aggregatedStatsForAgentCount.ordersWithinSLA += currentRunStats.ordersWithinSLA;
            aggregatedStatsForAgentCount.sumWaitTimes += currentRunStats.sumWaitTimes;
            aggregatedStatsForAgentCount.numAssigned += currentRunStats.numAssigned;
            aggregatedStatsForAgentCount.totalAgentActiveTime += currentRunStats.totalAgentActiveTime;
            aggregatedStatsForAgentCount.totalAgentDistanceKm += currentRunStats.totalAgentDistanceKm;
            aggregatedStatsForAgentCount.totalRuns++;
        } // End of multiple runs loop for a single agent count

        // Calculate averages for this agent count
        const avgGenerated = aggregatedStatsForAgentCount.totalGenerated / aggregatedStatsForAgentCount.totalRuns;
        const avgDelivered = aggregatedStatsForAgentCount.totalDelivered / aggregatedStatsForAgentCount.totalRuns;
        const avgDelTime = aggregatedStatsForAgentCount.totalDelivered > 0 ? (aggregatedStatsForAgentCount.sumDeliveryTimes / aggregatedStatsForAgentCount.totalDelivered) : null;
        const percentOrdersSLA = aggregatedStatsForAgentCount.totalDelivered > 0 ? (aggregatedStatsForAgentCount.ordersWithinSLA / aggregatedStatsForAgentCount.totalDelivered) * 100 : 0;
        const avgUtil = (currentNumAgents * maxSimTimePerIteration * aggregatedStatsForAgentCount.totalRuns) > 0 ? (aggregatedStatsForAgentCount.totalAgentActiveTime / (currentNumAgents * maxSimTimePerIteration * aggregatedStatsForAgentCount.totalRuns) * 100) : 0;
        const avgWait = aggregatedStatsForAgentCount.numAssigned > 0 ? (aggregatedStatsForAgentCount.sumWaitTimes / aggregatedStatsForAgentCount.numAssigned) : null;
        const avgUndelivered = avgGenerated - avgDelivered;
        const deliveryCompletionRate = avgGenerated > 0 ? avgDelivered / avgGenerated : 0;

        const avgLaborCost = (aggregatedStatsForAgentCount.totalAgentActiveTime / aggregatedStatsForAgentCount.totalRuns / 60) * iterAgentCostPerHour;
        const avgTravelCost = (aggregatedStatsForAgentCount.totalAgentDistanceKm / aggregatedStatsForAgentCount.totalRuns) * iterCostPerKm;
        const avgFixedDelCosts = avgDelivered * iterFixedCostPerDelivery;
        const avgTotalOpCost = avgLaborCost + avgTravelCost + avgFixedDelCosts;
        const avgCostPerOrder = avgDelivered > 0 ? avgTotalOpCost / avgDelivered : null;
        
        const allDeliveryTimesForThisAgentCount = aggregatedStatsForAgentCount.deliveryTimes;
        const minDelTime = allDeliveryTimesForThisAgentCount.length > 0 ? Math.min(...allDeliveryTimesForThisAgentCount) : null;
        const maxDelTime = allDeliveryTimesForThisAgentCount.length > 0 ? Math.max(...allDeliveryTimesForThisAgentCount) : null;
        const stdDevDelTime = allDeliveryTimesForThisAgentCount.length > 1 && avgDelTime !== null ? calculateStdDev(allDeliveryTimesForThisAgentCount, avgDelTime) : null;


        allOptimizationIterationsData.push({
            agents: currentNumAgents,
            generatedOrders: avgGenerated, // Now average
            deliveredOrders: avgDelivered, // Now average
            avgDeliveryTime: avgDelTime, percentOrdersSLA: percentOrdersSLA,
            minDeliveryTime: minDelTime, maxDeliveryTime: maxDelTime, stdDevDeliveryTime: stdDevDelTime,
            avgAgentUtilization: avgUtil, avgOrderWaitTime: avgWait,
            undeliveredOrders: avgUndelivered, deliveryCompletionRate: deliveryCompletionRate,
            totalOpCost: avgTotalOpCost, avgCostPerOrder: avgCostPerOrder,
            // orderLocations can't be easily averaged, so we might skip for aggregated display or show last run's
            totalLaborCost: avgLaborCost, totalTravelCost: avgTravelCost, totalFixedDelCosts: avgFixedDelCosts,
        });
        logMessage(`  Avg for ${currentNumAgents} Agents: Gen: ${avgGenerated.toFixed(1)}, Del: ${avgDelivered.toFixed(1)}, AvgDelTime: ${avgDelTime?.toFixed(1) ?? 'N/A'}m, SLA Met: ${percentOrdersSLA?.toFixed(1) ?? 'N/A'}%, Util: ${avgUtil?.toFixed(1) ?? 'N/A'}%, Cost/Order: ₹${avgCostPerOrder?.toFixed(2) ?? 'N/A'}`, 'STATS', optimizationLogEl);
        await new Promise(resolve => setTimeout(resolve, 10));
    } // End of agent count loop

    // --- Refined Logic to Determine Best Iteration (using averaged data) ---
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
    if(optResultUndeliveredEl) optResultUndeliveredEl.textContent = bestResult.undeliveredOrders?.toFixed(0) ?? "N/A"; // Use avgUndelivered

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
        li.textContent = `${selectedDarkStore.name}: Avg. Dist. ${avgDist} km (${bestResult.orderLocations.length} delivered orders from one sample run)`;
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
        row.insertCell().textContent = iter.generatedOrders?.toFixed(1) ?? 'N/A'; // Displaying average
        row.insertCell().textContent = iter.deliveredOrders?.toFixed(1) ?? 'N/A'; // Displaying average
        row.insertCell().textContent = iter.avgDeliveryTime !== null ? iter.avgDeliveryTime.toFixed(1) : "N/A";
        row.insertCell().textContent = iter.percentOrdersSLA !== null ? iter.percentOrdersSLA.toFixed(1) + "%" : "N/A";
        row.insertCell().textContent = iter.minDeliveryTime !== null ? iter.minDeliveryTime.toFixed(1) : "N/A";
        row.insertCell().textContent = iter.maxDeliveryTime !== null ? iter.maxDeliveryTime.toFixed(1) : "N/A";
        row.insertCell().textContent = iter.stdDevDeliveryTime !== null ? iter.stdDevDeliveryTime.toFixed(1) : "N/A";
        row.insertCell().textContent = iter.avgAgentUtilization !== null ? iter.avgAgentUtilization.toFixed(1) + "%" : "N/A";
        row.insertCell().textContent = iter.avgOrderWaitTime !== null ? iter.avgOrderWaitTime.toFixed(1) : "N/A";
        row.insertCell().textContent = iter.undeliveredOrders?.toFixed(1) ?? 'N/A'; // Displaying average
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
    const totalDelivered = iterationData.map(iter => iter.deliveredOrders); // This is now an average
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

function exportWorkforceOptResultsToCSV() {
    if (allOptimizationIterationsData.length === 0) {
        alert("No optimization data to export. Please run an optimization first.");
        return;
    }

    let csvContent = "data:text/csv;charset=utf-8,";
    const headers = [
        "Agents", "Avg Generated Orders", "Avg Delivered Orders", "Avg Delivery Time (min)",
        "Avg % Orders within Target Time", "Avg Min Delivery Time (min)", "Avg Max Delivery Time (min)",
        "Avg Std Dev Delivery Time (min)", "Avg Agent Utilization (%)", "Avg Order Wait Time (min)",
        "Avg Undelivered Orders", "Avg Total Op Cost (₹)", "Avg Cost/Order (₹)"
    ];
    csvContent += headers.join(",") + "\r\n";

    allOptimizationIterationsData.forEach(iter => {
        const row = [
            iter.agents,
            iter.generatedOrders?.toFixed(1) ?? 'N/A', // Reflect that these are now averages
            iter.deliveredOrders?.toFixed(1) ?? 'N/A',
            iter.avgDeliveryTime !== null ? iter.avgDeliveryTime.toFixed(1) : "N/A",
            iter.percentOrdersSLA !== null ? iter.percentOrdersSLA.toFixed(1) : "N/A",
            iter.minDeliveryTime !== null ? iter.minDeliveryTime.toFixed(1) : "N/A",
            iter.maxDeliveryTime !== null ? iter.maxDeliveryTime.toFixed(1) : "N/A",
            iter.stdDevDeliveryTime !== null ? iter.stdDevDeliveryTime.toFixed(1) : "N/A",
            iter.avgAgentUtilization !== null ? iter.avgAgentUtilization.toFixed(1) : "N/A",
            iter.avgOrderWaitTime !== null ? iter.avgOrderWaitTime.toFixed(1) : "N/A",
            iter.undeliveredOrders?.toFixed(1) ?? 'N/A',
            iter.totalOpCost !== null ? iter.totalOpCost.toFixed(2) : "N/A",
            iter.avgCostPerOrder !== null ? iter.avgCostPerOrder.toFixed(2) : "N/A"
        ];
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
