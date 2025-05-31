// js/modules/workforceOpt.js
import { chandigarhGeoJsonPolygon, chandigarhCenter, chandigarhSectors } from '../data/chandigarhData.js';
import { initializeMap, getMapInstance, getDistanceKm, isPointInPolygon, darkStoreIcon as commonDarkStoreIcon, generateWaypoints } from '../mapUtils.js';
import { initializeChart, updateChartData, calculateStdDev, getChartInstance } from '../chartUtils.js';
import { logMessage } from '../logger.js';
import { globalClusteredDarkStores } from './clustering.js';
// Removed direct import of getSimParameter from simulation.js to avoid circular dependencies if not strictly needed here.
// We will get main sim cost params differently if needed, or use dedicated inputs for workforce opt.
import { getCustomDemandProfiles } from './demandProfiles.js';

// Module-specific state
let optimizationMap;
let optDarkStoreMarkersLayer;
let optOrderMarkersLayer;
let allOptimizationIterationsData = []; 
let bestIterationResultFromHeuristic = null; // Store heuristic result as a fallback

// Chart Instances
let optDeliveryTimeChartInstance;
let optUtilizationChartInstance;
let optTotalDeliveredOrdersChartInstance;
let optAvgOrderWaitTimeChartInstance;
let optOrdersWithinSlaChartInstance;

// DOM Elements
let optTargetDeliveryTimeInputEl, optSelectDarkStoreEl, 
    optDemandProfileSelectEl, optOrderGenerationRadiusInputEl,
    optTargetOrdersPerIterationInputEl,
    optMinAgentsInputEl, optMaxAgentsInputEl,
    optMaxSimTimePerIterationInputEl, runOptimizationBtnEl, optimizationLogEl,
    optNumRunsPerAgentCountInputEl,
    optimizationMapContainerEl, optimizationComparisonContainerEl, optimizationChartsContainerEl,
    optimizationResultsContainerEl, optimizationComparisonTableBodyEl,
    optimizationRecommendationTextEl, exportWorkforceOptResultsBtnEl,
    optOrderRadiusContainerEl, optTargetOrdersContainerEl,
    optAgentMinSpeedInputEl, optAgentMaxSpeedInputEl, optHandlingTimeInputEl,
    optRouteWaypointsSelectEl, optBaseTrafficFactorSelectEl, optEnableDynamicTrafficCheckboxEl,
    optOrdersPerMinuteInputEl;


let analyzeWorkforceOptAIButtonEl, workforceOptAiAnalysisContainerEl,
    workforceOptAiAnalysisLoadingEl, workforceOptAiAnalysisContentEl;

let optResultAgentsEl, optResultAvgTimeEl, optResultTargetTimeEl, optResultMinDelTimeEl,
    optResultMaxDelTimeEl, optResultStdDevDelTimeEl, optResultAvgUtilizationEl,
    optResultAvgWaitTimeEl, optResultUndeliveredEl, optDarkStoreDistancesEl, optOverallAvgDistanceEl,
    optResultTotalAgentLaborCostEl, optResultTotalTravelCostEl, optResultTotalFixedDeliveryCostsEl,
    optResultOverallTotalOperationalCostEl, optResultAverageCostPerOrderEl,
    optResultSlaMetEl;

// Constants for recommendation logic (can be adjusted)
const MIN_DELIVERY_COMPLETION_RATE_OPT = 0.90; // Higher expectation for optimization runs
const TARGET_SLA_PERCENTAGE_OPT = 0.85;      
const IDEAL_AGENT_UTILIZATION_MIN_OPT = 50;  
const IDEAL_AGENT_UTILIZATION_MAX_OPT = 90;  
const COST_PER_ORDER_TOLERANCE_OPT = 0.10; 
const OPT_SIM_STEP_MINUTES = 1;

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

    analyzeWorkforceOptAIButtonEl = document.getElementById('analyzeWorkforceOptAI');
    workforceOptAiAnalysisContainerEl = document.getElementById('workforceOptAiAnalysisContainer');
    workforceOptAiAnalysisLoadingEl = document.getElementById('workforceOptAiAnalysisLoading');
    workforceOptAiAnalysisContentEl = document.getElementById('workforceOptAiAnalysisContent');

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
    
    optAgentMinSpeedInputEl = document.getElementById('optAgentMinSpeed');
    optAgentMaxSpeedInputEl = document.getElementById('optAgentMaxSpeed');
    optHandlingTimeInputEl = document.getElementById('optHandlingTime');
    optRouteWaypointsSelectEl = document.getElementById('optRouteWaypoints');
    optBaseTrafficFactorSelectEl = document.getElementById('optBaseTrafficFactor');
    optEnableDynamicTrafficCheckboxEl = document.getElementById('optEnableDynamicTraffic');
    optOrdersPerMinuteInputEl = document.getElementById('optOrdersPerMinute');

    runOptimizationBtnEl?.addEventListener('click', runWorkforceOptimization);
    exportWorkforceOptResultsBtnEl?.addEventListener('click', exportWorkforceOptResultsToCSV);
    optDemandProfileSelectEl?.addEventListener('change', toggleOptProfileSpecificInputs);
    analyzeWorkforceOptAIButtonEl?.addEventListener('click', () => handleWorkforceOptAiAnalysisRequest()); // No need to pass reason here

    populateDarkStoreSelectorForOpt();
    populateDemandProfileSelectorForOpt();
    initializeOptimizationChartsLocal();
    toggleOptProfileSpecificInputs();
    if (analyzeWorkforceOptAIButtonEl) analyzeWorkforceOptAIButtonEl.disabled = true; 
}

function toggleOptProfileSpecificInputs() {
    if (!optDemandProfileSelectEl || !optOrderRadiusContainerEl || !optTargetOrdersContainerEl || !optOrdersPerMinuteInputEl) return;
    const selectedProfile = optDemandProfileSelectEl.value;
    const showDefaultInputs = selectedProfile.startsWith('default_opt_');
    
    optOrderRadiusContainerEl.classList.toggle('hidden', !showDefaultInputs);
    optTargetOrdersContainerEl.classList.toggle('hidden', !showDefaultInputs);
    const optOrdersPerMinuteParentElement = document.getElementById('optOrdersPerMinute')?.parentElement;
    if (optOrdersPerMinuteParentElement) {
        optOrdersPerMinuteParentElement.classList.toggle('hidden', !showDefaultInputs);
    }
}

export function populateDarkStoreSelectorForOpt(clusteredStores) {
    const storesToUse = clusteredStores || globalClusteredDarkStores || []; // Ensure it's an array
    if (!optSelectDarkStoreEl) return;
    
    const currentVal = optSelectDarkStoreEl.value;
    optSelectDarkStoreEl.innerHTML = '';

    if (storesToUse.length > 0) {
        storesToUse.forEach(store => {
            const option = document.createElement('option');
            option.value = store.id;
            option.textContent = `${store.name} (ID: ${store.id} - Lat: ${store.lat?.toFixed(3)}, Lng: ${store.lng?.toFixed(3)})`;
            if (store.id?.toString() === currentVal) option.selected = true;
            optSelectDarkStoreEl.appendChild(option);
        });
        optSelectDarkStoreEl.disabled = false;
        if(runOptimizationBtnEl) runOptimizationBtnEl.disabled = false;
    } else {
        // If no stores from clustering, add the default simulation store as an option
        const defaultStoreOption = document.createElement('option');
        defaultStoreOption.value = "sim_default"; // Special value
        defaultStoreOption.textContent = `Default Sim Store (Lat: ${defaultDarkStoreLocationSim.lat.toFixed(3)}, Lng: ${defaultDarkStoreLocationSim.lng.toFixed(3)})`;
        optSelectDarkStoreEl.appendChild(defaultStoreOption);
        logMessage("No clustered dark stores found. Using default simulation store for optimization.", "INFO", optimizationLogEl);
        optSelectDarkStoreEl.disabled = false; // Enable as there's a default
        if(runOptimizationBtnEl) runOptimizationBtnEl.disabled = false;

        // If clustering hasn't run, also add a placeholder to prompt the user
        const placeholderOption = document.createElement('option');
        placeholderOption.value = "";
        placeholderOption.textContent = "-- Run Clustering for More Options --";
        optSelectDarkStoreEl.insertBefore(placeholderOption, defaultStoreOption); // Add before default
        if(!currentVal) optSelectDarkStoreEl.value = ""; // Select placeholder if no prior value
    }
}

function populateDemandProfileSelectorForOpt() { /* ... as before ... */ }
function resetOptimizationVisuals() { /* ... as before, ensures bestIterationResult = null; ... */ }

async function runWorkforceOptimization() {
    allOptimizationIterationsData = [];
    resetOptimizationVisuals(); 
    let localRecommendationReason = ""; // Local scope for heuristic reason

    // --- Parameter Parsing and Validation ---
    const selectedDarkStoreIdString = optSelectDarkStoreEl.value;
    let selectedDarkStore;
    if (selectedDarkStoreIdString === "sim_default") {
        selectedDarkStore = { ...defaultDarkStoreLocationSim, id: "sim_default", name: "Default Sim Store" };
    } else {
        const selectedDarkStoreId = parseInt(selectedDarkStoreIdString);
        selectedDarkStore = globalClusteredDarkStores.find(ds => ds.id === selectedDarkStoreId);
    }

    if (!selectedDarkStore) {
        logMessage("Error: Please select a valid dark store for optimization.", 'ERROR', optimizationLogEl);
        if (runOptimizationBtnEl) { runOptimizationBtnEl.disabled = false; runOptimizationBtnEl.textContent = "Run Workforce Optimization"; }
        return;
    }
    
    const iterAgentMinSpeed = parseFloat(optAgentMinSpeedInputEl.value);
    const iterAgentMaxSpeed = parseFloat(optAgentMaxSpeedInputEl.value);
    const iterHandlingTime = parseFloat(optHandlingTimeInputEl.value);
    const iterRouteWaypoints = parseInt(optRouteWaypointsSelectEl.value);
    const iterBaseTrafficFactor = parseFloat(optBaseTrafficFactorSelectEl.value);
    const iterEnableDynamicTraffic = optEnableDynamicTrafficCheckboxEl.checked; // Will be used if dynamic traffic is added to inner sim
    const iterOrdersPerMinuteForDefault = parseFloat(optOrdersPerMinuteInputEl.value);

    const iterAgentCostPerHour = parseFloat(document.getElementById('agentCostPerHour').value) || 150; // Get from main sim for consistency
    const iterCostPerKm = parseFloat(document.getElementById('costPerKmTraveled').value) || 5;
    const iterFixedCostPerDelivery = parseFloat(document.getElementById('fixedCostPerDelivery').value) || 10;

    const targetAvgDeliveryTime = parseInt(optTargetDeliveryTimeInputEl.value);
    const numRunsPerAgentCount = parseInt(optNumRunsPerAgentCountInputEl.value);
    const maxSimTimePerIteration = parseInt(optMaxSimTimePerIterationInputEl.value);
    const minAgentsToTest = parseInt(optMinAgentsInputEl.value);
    const maxAgentsToTest = parseInt(optMaxAgentsInputEl.value);
    const selectedDemandProfileId = optDemandProfileSelectEl.value;
    const orderRadiusKm = parseFloat(optOrderGenerationRadiusInputEl.value); 
    let targetOrdersForDefaultProfileRun = parseInt(optTargetOrdersPerIterationInputEl.value); 

    // ... (rest of parameter validation as before) ...
    if (selectedDemandProfileId.startsWith('default_opt_')) {
        if ((isNaN(targetOrdersForDefaultProfileRun) || targetOrdersForDefaultProfileRun <= 0) && 
            (isNaN(iterOrdersPerMinuteForDefault) || iterOrdersPerMinuteForDefault <= 0)) {
            logMessage("Error: For default optimization profiles, either 'Target Orders per Iteration' or a valid 'Orders/Min' must be set.", 'ERROR', optimizationLogEl);
            if (runOptimizationBtnEl) { runOptimizationBtnEl.disabled = false; runOptimizationBtnEl.textContent = "Run Workforce Optimization"; }
            return;
        }
        if (isNaN(targetOrdersForDefaultProfileRun) || targetOrdersForDefaultProfileRun <= 0) {
             targetOrdersForDefaultProfileRun = Math.max(1, Math.ceil(iterOrdersPerMinuteForDefault * maxSimTimePerIteration)); 
        }
    }


    runOptimizationBtnEl.disabled = true;
    runOptimizationBtnEl.textContent = "Optimizing...";
    if (optimizationLogEl) optimizationLogEl.innerHTML = "";
    logMessage(`Starting workforce optimization for Dark Store: ${selectedDarkStore.name}`, 'SYSTEM', optimizationLogEl);
    logMessage(`Target Avg Delivery Time: ${targetAvgDeliveryTime} min. Demand Profile: ${selectedDemandProfileId}. Runs per agent count: ${numRunsPerAgentCount}.`, 'SYSTEM', optimizationLogEl);
    logMessage(`Testing agents from ${minAgentsToTest} to ${maxAgentsToTest}. Max sim time per iter: ${maxSimTimePerIteration} min.`, 'SYSTEM', optimizationLogEl);


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

    const customProfiles = getCustomDemandProfiles();
    bestIterationResultFromHeuristic = null; 

    for (let currentNumAgents = minAgentsToTest; currentNumAgents <= maxAgentsToTest; currentNumAgents++) {
        logMessage(`Testing with ${currentNumAgents} agent(s) across ${numRunsPerAgentCount} runs...`, 'ITERATION', optimizationLogEl);
        
        let aggregatedStatsForAgentCount = {
            totalGenerated: 0, totalDelivered: 0, sumDeliveryTimes: 0, deliveryTimes: [],
            ordersWithinSLA: 0, sumWaitTimes: 0, numAssigned: 0, 
            totalAgentBusyTimeAcrossRuns: 0, 
            totalAgentSimTimeAcrossRuns: 0, 
            totalAgentDistanceKm: 0,
            totalOpCost: 0, totalRuns: 0
        };

        for (let run = 0; run < numRunsPerAgentCount; run++) {
            logMessage(`  Run ${run + 1}/${numRunsPerAgentCount} for ${currentNumAgents} agents...`, 'SYSTEM', optimizationLogEl);
            if (optimizationLogEl) optimizationLogEl.scrollTop = optimizationLogEl.scrollHeight;

            let iterSimTime = 0;
            let iterOrders = []; 
            let iterAgents = [];
            let iterOrderIdCounter = 0;
            let currentRunStats = { // Stats for THIS specific run
                totalGeneratedThisRun: 0, 
                totalDeliveredThisRun: 0, 
                sumDeliveryTimesThisRun: 0, 
                deliveryTimesThisRun: [],
                ordersWithinSLAThisRun: 0, 
                sumWaitTimesThisRun: 0, 
                numAssignedThisRun: 0, 
                totalAgentActiveTimeThisRunForRunStat: 0,
                totalAgentDistanceKmThisRun: 0
            };
            let orderGenerationBufferOpt = 0;
            
            for (let i = 0; i < currentNumAgents; i++) {
                const speedRange = iterAgentMaxSpeed - iterAgentMinSpeed;
                iterAgents.push({
                    id: i, 
                    location: { ...selectedDarkStore }, 
                    baseSpeedKmph: iterAgentMinSpeed + Math.random() * speedRange, // Use opt params
                    currentFatigueFactor: 1.0, // Fatigue can be simplified or omitted for opt runs if too slow
                    consecutiveDeliveriesSinceRest: 0,
                    timeContinuouslyActive: 0,
                    timeBecameAvailableAt: 0,
                    status: 'available', 
                    assignedOrderId: null, 
                    routePath: [], 
                    currentLegIndex: 0,
                    legProgress: 0, 
                    timeSpentAtStore: 0, 
                    busyTimeThisRun: 0,
                });
            }
            
            if (selectedDemandProfileId.startsWith('default_opt_')) {
                for (let i = 0; i < targetOrdersForDefaultProfileRun; i++) {
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
                        id: orderId, location: orderLocation, status: 'pending', 
                        timePlaced: 0, assignedAgentId: null, assignmentTime: null, deliveryTime: null
                    });
                }
                currentRunStats.totalGeneratedThisRun = iterOrders.length;
                logMessage(`  Default profile: Initialized ${currentRunStats.totalGeneratedThisRun} target orders for run ${run + 1}.`, 'SYSTEM_DEBUG', optimizationLogEl);
            }

            // Main simulation loop for this individual run
            while (iterSimTime < maxSimTimePerIteration) {
                iterSimTime += OPT_SIM_STEP_MINUTES;

                if (selectedDemandProfileId.startsWith('custom_')) {
                    // ... (Custom profile order generation logic as before) ...
                }
                
                // Assign orders
                for (const order of iterOrders) {
                    if (order.status === 'pending') {
                        let bestAgent = null; let shortestETA = Infinity;
                        for (const agent of iterAgents) {
                            if (agent.status === 'available') {
                                let timeToStore = 0;
                                if(JSON.stringify(agent.location) !== JSON.stringify(selectedDarkStore)) {
                                    timeToStore = (getDistanceKm(agent.location, selectedDarkStore) / (agent.baseSpeedKmph * iterBaseTrafficFactor)) * 60;
                                }
                                const timeToCustomer = (getDistanceKm(selectedDarkStore, order.location) / (agent.baseSpeedKmph * iterBaseTrafficFactor)) * 60;
                                const eta = timeToStore + iterHandlingTime + timeToCustomer;
                                if (eta < shortestETA) { shortestETA = eta; bestAgent = agent; }
                            }
                        }
                        if (bestAgent) {
                            order.status = 'assigned'; order.assignedAgentId = bestAgent.id;
                            order.assignmentTime = iterSimTime;
                            currentRunStats.sumWaitTimesThisRun += (order.assignmentTime - order.timePlaced);
                            currentRunStats.numAssignedThisRun++;
                            
                            bestAgent.assignedOrderId = order.id; 
                            bestAgent.status = (JSON.stringify(bestAgent.location) === JSON.stringify(selectedDarkStore)) ? 'at_store' : 'to_store';
                            bestAgent.routePath = [bestAgent.location, selectedDarkStore, order.location];
                            bestAgent.currentLegIndex = 0; bestAgent.legProgress = 0; bestAgent.timeSpentAtStore = 0;
                        }
                    }
                }

                // Update agents
                for (const agent of iterAgents) {
                    if (agent.status !== 'available') {
                        agent.busyTimeThisRun += OPT_SIM_STEP_MINUTES;
                    }

                    switch (agent.status) {
                        case 'to_store':
                            const distToStore = getDistanceKm(agent.location, selectedDarkStore);
                            const travelToStorePerStep = (agent.baseSpeedKmph * iterBaseTrafficFactor / 60) * OPT_SIM_STEP_MINUTES;
                            agent.distanceTraveledThisRun += Math.min(travelToStorePerStep, distToStore);
                            if (distToStore <= travelToStorePerStep || distToStore < 0.01) {
                                agent.location = { ...selectedDarkStore };
                                agent.status = 'at_store';
                                agent.timeSpentAtStore = 0;
                            } else {
                                agent.location.lat += (selectedDarkStore.lat - agent.location.lat) * (travelToStorePerStep / distToStore);
                                agent.location.lng += (selectedDarkStore.lng - agent.location.lng) * (travelToStorePerStep / distToStore);
                            }
                            break;
                        case 'at_store':
                            agent.timeSpentAtStore += OPT_SIM_STEP_MINUTES;
                            if (agent.timeSpentAtStore >= iterHandlingTime) {
                                const currentOrder = iterOrders.find(o=>o.id === agent.assignedOrderId);
                                if (currentOrder) {
                                    agent.status = 'to_customer';
                                    agent.routePath = [selectedDarkStore, currentOrder.location];
                                    agent.currentLegIndex = 0; agent.legProgress = 0;
                                } else {
                                    agent.status = 'available'; agent.assignedOrderId = null;
                                }
                                agent.timeSpentAtStore = 0;
                            }
                            break;
                        case 'to_customer':
                            if (!agent.routePath || agent.routePath.length < 2) { agent.status = 'available'; agent.assignedOrderId = null; break; }
                            const customerLocation = agent.routePath[1]; 
                            const distToCustomer = getDistanceKm(agent.location, customerLocation);
                            const travelToCustomerPerStep = (agent.baseSpeedKmph * iterBaseTrafficFactor / 60) * OPT_SIM_STEP_MINUTES;
                            agent.distanceTraveledThisRun += Math.min(travelToCustomerPerStep, distToCustomer);

                            if (distToCustomer <= travelToCustomerPerStep || distToCustomer < 0.01 || agent.legProgress >= 0.999) {
                                agent.location = {...customerLocation};
                                const deliveredOrder = iterOrders.find(o => o.id === agent.assignedOrderId);
                                if (deliveredOrder && deliveredOrder.status !== 'delivered') { 
                                    deliveredOrder.status = 'delivered'; 
                                    deliveredOrder.deliveryTime = iterSimTime;
                                    currentRunStats.totalDeliveredThisRun++;
                                    const deliveryDuration = iterSimTime - deliveredOrder.timePlaced;
                                    currentRunStats.sumDeliveryTimesThisRun += deliveryDuration; 
                                    currentRunStats.deliveryTimesThisRun.push(deliveryDuration);
                                    if (deliveryDuration <= targetAvgDeliveryTime) {
                                        currentRunStats.ordersWithinSLAThisRun++;
                                    }
                                }
                                agent.status = 'available'; 
                                agent.assignedOrderId = null; 
                                agent.routePath = []; 
                                agent.currentLegIndex = 0; 
                                agent.legProgress = 0;
                            } else {
                                agent.location.lat += (customerLocation.lat - agent.location.lat) * (travelToCustomerPerStep / distToCustomer);
                                agent.location.lng += (customerLocation.lng - agent.location.lng) * (travelToCustomerPerStep / distToCustomer);
                                agent.legProgress += (travelToCustomerPerStep / distToCustomer); 
                            }
                            break;
                    }
                } 
                
                const undeliveredOrdersInRun = iterOrders.filter(o => o.status !== 'delivered').length;
                if (undeliveredOrdersInRun === 0 && currentRunStats.totalGeneratedThisRun > 0) {
                    if (selectedDemandProfileId.startsWith('default_opt_') && currentRunStats.totalDeliveredThisRun >= targetOrdersForDefaultProfileRun) {
                        logMessage(`  Run ${run+1}: All ${currentRunStats.totalGeneratedThisRun} target orders delivered at T+${iterSimTime}.`, 'SYSTEM_DEBUG', optimizationLogEl);
                        break; 
                    } else if (selectedDemandProfileId.startsWith('custom_')) {
                        // For custom profiles, if all *currently generated* orders are delivered,
                        // we might break if no more are expected soon.
                        // This condition might need to be smarter, e.g., if no new orders for X steps.
                        // For now, primarily rely on maxSimTimePerIteration for custom profiles.
                    }
                }
            } // End of single run's while loop (iterSimTime)

            // Accumulate stats for this run
            currentRunStats.totalAgentActiveTimeThisRun = iterAgents.reduce((sum, agent) => sum + agent.busyTimeThisRun, 0);

            aggregatedStatsForAgentCount.totalGenerated += currentRunStats.totalGeneratedThisRun;
            aggregatedStatsForAgentCount.totalDelivered += currentRunStats.totalDeliveredThisRun;
            aggregatedStatsForAgentCount.sumDeliveryTimes += currentRunStats.sumDeliveryTimesThisRun;
            aggregatedStatsForAgentCount.deliveryTimes.push(...currentRunStats.deliveryTimesThisRun);
            aggregatedStatsForAgentCount.ordersWithinSLA += currentRunStats.ordersWithinSLAThisRun;
            aggregatedStatsForAgentCount.sumWaitTimes += currentRunStats.sumWaitTimesThisRun;
            aggregatedStatsForAgentCount.numAssigned += currentRunStats.numAssignedThisRun;
            aggregatedStatsForAgentCount.totalAgentBusyTimeAcrossRuns += currentRunStats.totalAgentActiveTimeThisRun; // Use the sum of busy times
            aggregatedStatsForAgentCount.totalAgentDistanceKm += currentRunStats.totalAgentDistanceKmThisRun;
            aggregatedStatsForAgentCount.totalRuns++;
            aggregatedStatsForAgentCount.totalAgentSimTimeAcrossRuns += (currentNumAgents * iterSimTime); // Total agent-minutes for this run
        } 

        const avgGenerated = aggregatedStatsForAgentCount.totalRuns > 0 ? aggregatedStatsForAgentCount.totalGenerated / aggregatedStatsForAgentCount.totalRuns : 0;
        const avgDelivered = aggregatedStatsForAgentCount.totalRuns > 0 ? aggregatedStatsForAgentCount.totalDelivered / aggregatedStatsForAgentCount.totalRuns : 0;
        const avgDelTime = aggregatedStatsForAgentCount.totalDelivered > 0 ? (aggregatedStatsForAgentCount.sumDeliveryTimes / aggregatedStatsForAgentCount.totalDelivered) : null;
        const percentOrdersSLA = aggregatedStatsForAgentCount.totalDelivered > 0 ? (aggregatedStatsForAgentCount.ordersWithinSLA / aggregatedStatsForAgentCount.totalDelivered) * 100 : 0;
        
        const avgUtil = aggregatedStatsForAgentCount.totalAgentSimTimeAcrossRuns > 0 ? 
                        (aggregatedStatsForAgentCount.totalAgentBusyTimeAcrossRuns / aggregatedStatsForAgentCount.totalAgentSimTimeAcrossRuns) * 100 
                        : 0;
        
        const avgWait = aggregatedStatsForAgentCount.numAssigned > 0 ? (aggregatedStatsForAgentCount.sumWaitTimes / aggregatedStatsForAgentCount.numAssigned) : null;
        const avgUndelivered = avgGenerated - avgDelivered;
        const deliveryCompletionRate = avgGenerated > 0 ? avgDelivered / avgGenerated : 0;

        const avgLaborCost = (aggregatedStatsForAgentCount.totalAgentBusyTimeAcrossRuns / aggregatedStatsForAgentCount.totalRuns / 60) * iterAgentCostPerHour;
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
            generatedOrders: avgGenerated, deliveredOrders: avgDelivered,
            avgDeliveryTime: avgDelTime, percentOrdersSLA: percentOrdersSLA,
            minDeliveryTime: minDelTime, maxDeliveryTime: maxDelTime, stdDevDeliveryTime: stdDevDelTime,
            avgAgentUtilization: avgUtil, avgOrderWaitTime: avgWait,
            undeliveredOrders: avgUndelivered, deliveryCompletionRate: deliveryCompletionRate,
            totalOpCost: avgTotalOpCost, avgCostPerOrder: avgCostPerOrder,
            totalLaborCost: avgLaborCost, totalTravelCost: avgTravelCost, totalFixedDelCosts: avgFixedDelCosts,
        });
        logMessage(`  Avg for ${currentNumAgents} Agents: Gen: ${avgGenerated.toFixed(1)}, Del: ${avgDelivered.toFixed(1)}, AvgDelTime: ${avgDelTime?.toFixed(1) ?? 'N/A'}m, SLA Met: ${percentOrdersSLA?.toFixed(1) ?? 'N/A'}%, Util: ${avgUtil?.toFixed(1) ?? 'N/A'}%, Cost/Order: ₹${avgCostPerOrder?.toFixed(2) ?? 'N/A'}`, 'STATS', optimizationLogEl);
        await new Promise(resolve => setTimeout(resolve, 10));
    } 

    // --- AI Will Determine Recommendation ---
    // The old heuristic logic for bestIterationResult is removed.
    // We will rely on the AI to analyze allOptimizationIterationsData.
    bestIterationResultFromHeuristic = null; // Clear any old heuristic result

    displayOptimizationResults(null, targetAvgDeliveryTime); // Display placeholder initially
    populateOptimizationComparisonTable(allOptimizationIterationsData);
    renderOptimizationChartsLocal(allOptimizationIterationsData, targetAvgDeliveryTime);
    if(optimizationResultsContainerEl) optimizationResultsContainerEl.classList.remove('hidden');
    if(optimizationComparisonContainerEl) optimizationComparisonContainerEl.classList.remove('hidden');
    if(optimizationChartsContainerEl) optimizationChartsContainerEl.classList.remove('hidden');
    if(exportWorkforceOptResultsBtnEl) exportWorkforceOptResultsBtnEl.disabled = false;
    
    if (runOptimizationBtnEl) { runOptimizationBtnEl.disabled = false; runOptimizationBtnEl.textContent = "Run Workforce Optimization"; }

    if (allOptimizationIterationsData.length > 0) {
        if (analyzeWorkforceOptAIButtonEl) analyzeWorkforceOptAIButtonEl.disabled = false;
        logMessage("Optimization data generated. Requesting AI analysis for best agent recommendation...", 'SYSTEM_BOLD', optimizationLogEl);
        await handleWorkforceOptAiAnalysisRequest(); 
    } else {
        if(optimizationRecommendationTextEl) optimizationRecommendationTextEl.innerHTML = "<p>No optimization data was generated to make a recommendation or for AI analysis.</p>";
        logMessage("Optimization complete. No data generated for recommendation.", 'SYSTEM_BOLD', optimizationLogEl);
    }
}

function displayOptimizationResults(resultToDisplay, targetTime) {
    // This function now primarily displays the data for a *given* result (e.g., one chosen by AI or a default)
    // The main textual recommendation will come from AI.
    if (!resultToDisplay) { 
        if(optResultAgentsEl) optResultAgentsEl.textContent = "N/A (Pending AI)";
        if(optResultAvgTimeEl) optResultAvgTimeEl.textContent = "N/A";
        if(optResultSlaMetEl) optResultSlaMetEl.textContent = "N/A";
        // ... clear other optResult... fields ...
        return;
    }
    if(optResultAgentsEl) optResultAgentsEl.textContent = resultToDisplay.agents;
    if(optResultAvgTimeEl) optResultAvgTimeEl.textContent = resultToDisplay.avgDeliveryTime !== null ? resultToDisplay.avgDeliveryTime.toFixed(1) + " min" : "N/A";
    if(optResultTargetTimeEl) optResultTargetTimeEl.textContent = targetTime + " min";
    if(optResultSlaMetEl) optResultSlaMetEl.textContent = resultToDisplay.percentOrdersSLA !== null ? resultToDisplay.percentOrdersSLA.toFixed(1) + "%" : "N/A";
    if(optResultMinDelTimeEl) optResultMinDelTimeEl.textContent = resultToDisplay.minDeliveryTime !== null ? resultToDisplay.minDeliveryTime.toFixed(1) + " min" : "N/A";
    if(optResultMaxDelTimeEl) optResultMaxDelTimeEl.textContent = resultToDisplay.maxDeliveryTime !== null ? resultToDisplay.maxDeliveryTime.toFixed(1) + " min" : "N/A";
    if(optResultStdDevDelTimeEl) optResultStdDevDelTimeEl.textContent = resultToDisplay.stdDevDeliveryTime !== null ? resultToDisplay.stdDevDeliveryTime.toFixed(1) + " min" : "N/A";
    if(optResultAvgUtilizationEl) optResultAvgUtilizationEl.textContent = resultToDisplay.avgAgentUtilization !== null ? resultToDisplay.avgAgentUtilization.toFixed(1) + "%" : "N/A";
    if(optResultAvgWaitTimeEl) optResultAvgWaitTimeEl.textContent = resultToDisplay.avgOrderWaitTime !== null ? resultToDisplay.avgOrderWaitTime.toFixed(1) + " min" : "N/A";
    if(optResultUndeliveredEl) optResultUndeliveredEl.textContent = resultToDisplay.undeliveredOrders?.toFixed(0) ?? "N/A";

    if(optResultTotalAgentLaborCostEl) optResultTotalAgentLaborCostEl.textContent = `₹${(resultToDisplay.totalLaborCost || 0).toFixed(2)}`;
    if(optResultTotalTravelCostEl) optResultTotalTravelCostEl.textContent = `₹${(resultToDisplay.totalTravelCost || 0).toFixed(2)}`;
    if(optResultTotalFixedDeliveryCostsEl) optResultTotalFixedDeliveryCostsEl.textContent = `₹${(resultToDisplay.totalFixedDelCosts || 0).toFixed(2)}`;
    if(optResultOverallTotalOperationalCostEl) optResultOverallTotalOperationalCostEl.textContent = `₹${(resultToDisplay.totalOpCost || 0).toFixed(2)}`;
    if(optResultAverageCostPerOrderEl) optResultAverageCostPerOrderEl.textContent = resultToDisplay.avgCostPerOrder === null || isNaN(resultToDisplay.avgCostPerOrder) ? "N/A" : `₹${resultToDisplay.avgCostPerOrder.toFixed(2)}`;

    // Map display and dark store distances can be updated if relevant for the AI-chosen scenario
    if (optimizationMap && optOrderMarkersLayer) {
        optOrderMarkersLayer.clearLayers();
    }
}

function populateOptimizationComparisonTable(iterationData) { /* ... as before ... */ }
function initializeOptimizationChartsLocal() { /* ... as before ... */ }
function renderOptimizationChartsLocal(iterationData, targetTime) { /* ... as before ... */ }
function exportWorkforceOptResultsToCSV() { /* ... as before ... */ }

function prepareWorkforceOptDataForAI() { // Removed heuristicReasonForContext
    if (allOptimizationIterationsData.length === 0) { 
        return "No optimization data available to analyze. Please run an optimization first.";
    }

    let dataString = "Workforce Optimization Input Parameters:\n";
    dataString += `Target Average Delivery Time: ${optTargetDeliveryTimeInputEl.value} min\n`;
    dataString += `Selected Dark Store: ${optSelectDarkStoreEl.options[optSelectDarkStoreEl.selectedIndex]?.text || 'N/A'}\n`;
    dataString += `Demand Profile for Optimization: ${optDemandProfileSelectEl.value}\n`;
    if (optDemandProfileSelectEl.value.startsWith('default_opt_')) {
        dataString += `Order Generation Radius (for default): ${optOrderGenerationRadiusInputEl.value} km\n`;
        dataString += `Target Orders per Iteration (for default): ${optTargetOrdersPerIterationInputEl.value}\n`;
        dataString += `Orders Per Minute (for default opt. profile, if used): ${optOrdersPerMinuteInputEl.value}\n`;
    }
    dataString += `Agents Tested: ${optMinAgentsInputEl.value} to ${optMaxAgentsInputEl.value}\n`;
    dataString += `Simulation Runs per Agent Count: ${optNumRunsPerAgentCountInputEl.value}\n`;
    dataString += `Max Simulation Time per Iteration: ${optMaxSimTimePerIterationInputEl.value} min\n`;
    dataString += `Agent Min Speed: ${optAgentMinSpeedInputEl.value} km/h, Max Speed: ${optAgentMaxSpeedInputEl.value} km/h\n`;
    dataString += `Store Handling Time: ${optHandlingTimeInputEl.value} min\n`;
    dataString += `Base Traffic Factor: ${optBaseTrafficFactorSelectEl.value}\n`;

    dataString += "\nSummary of Averaged Iteration Results (Agents, Avg Generated, Avg Delivered, Avg Del Time, Avg %SLA, Avg Util, Avg Cost/Order):\n";
    allOptimizationIterationsData.forEach(iter => {
        dataString += `${iter.agents}, ${iter.generatedOrders?.toFixed(1) ?? 'N/A'}, ${iter.deliveredOrders?.toFixed(1) ?? 'N/A'}, ${iter.avgDeliveryTime?.toFixed(1) ?? 'N/A'}, ${iter.percentOrdersSLA?.toFixed(1) ?? 'N/A'}%, ${iter.avgAgentUtilization?.toFixed(1) ?? 'N/A'}%, ${iter.avgCostPerOrder?.toFixed(2) ?? 'N/A'}\n`;
    });
    
    // No heuristic recommendation to pass to AI anymore
    return dataString;
}

async function handleWorkforceOptAiAnalysisRequest() {
    if (!workforceOptAiAnalysisContainerEl || !workforceOptAiAnalysisLoadingEl || !workforceOptAiAnalysisContentEl) {
        console.error("Workforce Opt AI Analysis UI elements not found."); return;
    }
    if (allOptimizationIterationsData.length === 0) { 
        workforceOptAiAnalysisContentEl.textContent = "Please run a workforce optimization first to generate data for analysis.";
        workforceOptAiAnalysisContainerEl.classList.remove('hidden');
        analyzeWorkforceOptAIButtonEl.disabled = true; // Ensure it's disabled if no data
        return;
    }

    workforceOptAiAnalysisLoadingEl.classList.remove('hidden');
    workforceOptAiAnalysisContentEl.textContent = 'Generating AI analysis for optimization results... Please wait.';
    workforceOptAiAnalysisContainerEl.classList.remove('hidden');
    analyzeWorkforceOptAIButtonEl.disabled = true;

    const optimizationDataSummary = prepareWorkforceOptDataForAI();
    if (optimizationDataSummary.startsWith("No optimization data available")) {
        workforceOptAiAnalysisContentEl.textContent = optimizationDataSummary;
        workforceOptAiAnalysisLoadingEl.classList.add('hidden');
        analyzeWorkforceOptAIButtonEl.disabled = false; 
        return;
    }

    const prompt = `
        You are a logistics operations analyst. Your task is to analyze the provided Workforce Optimization simulation results and recommend the optimal number of agents.

        Input Data Provided:
        1.  User-defined target average delivery time.
        2.  Selected Dark Store and Demand Profile used for the optimization runs.
        3.  Range of agents tested, number of simulation runs per agent count, and max simulation time per iteration.
        4.  Agent operational parameters used within these optimization runs (speed, handling time, traffic).
        5.  A table summarizing averaged iteration results for each agent count, including:
            - Agents
            - Avg. Generated Orders
            - Avg. Delivered Orders
            - Avg. Delivery Time (min)
            - Avg. % Orders within Target SLA (based on the user's target average delivery time)
            - Avg. Agent Utilization (%)
            - Avg. Cost/Order (₹)

        Your Analysis and Recommendation should include:
        1.  **Recommended Number of Agents:** Clearly state the number of agents you recommend.
        2.  **Detailed Rationale for Recommendation:**
            * Explain *why* this number is optimal by analyzing its performance across key metrics: Average Delivery Time, % Orders within Target SLA, Agent Utilization, and Cost Per Order.
            * Compare it explicitly with scenarios having slightly fewer agents (e.g., N-1, N-2) and slightly more agents (e.g., N+1, N+2). Discuss the trade-offs.
            * Refer to the ideal utilization range (${IDEAL_AGENT_UTILIZATION_MIN}-${IDEAL_AGENT_UTILIZATION_MAX}%) and the target SLA (${TARGET_SLA_PERCENTAGE*100}% for orders within ${optTargetDeliveryTimeInputEl.value} min).
        3.  **Overall Trend Summary:** Briefly describe how the key metrics generally changed as the number of agents varied across the tested range.
        4.  **Identification of Inefficient Zones:**
            * Point out agent counts where the system was clearly under-resourced (e.g., very poor SLA, extremely high utilization but low throughput).
            * Point out agent counts where the system appeared over-resourced (e.g., excellent service but very low utilization and potentially increasing cost per order or no significant service improvement).
        5.  **Strategic Insights & Further Questions (2-3 points):**
            * Based on the data, what strategic insights can be offered?
            * What further questions might the user investigate using the simulator (e.g., testing different demand profiles with the recommended agent count, adjusting agent speed or handling time)?
            * If the data shows unexpected patterns (e.g., delivery time not improving with more agents, or utilization always at 100% even with many agents and few deliveries), highlight this as a potential area for the user to re-check their input parameters for the optimization runs or the demand profile's intensity.

        Structure your response clearly with headings for each part. Be data-driven in your analysis.

        Workforce Optimization Data:
        ${optimizationDataSummary}
    `;

    try {
        let chatHistory = [{ role: "user", parts: [{ text: prompt }] }];
        const payload = { contents: chatHistory };
        const apiKey = "AIzaSyDwjlcdDvgre9mLWR7abRx2qta_NFLISuI"; 
        
        if (!apiKey) { throw new Error("API Key is missing."); }

        const modelName = "gemini-2.0-flash"; 
        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;
        
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) { /* ... (error handling as before) ... */ }

        const result = await response.json();
        
        if (result.candidates && result.candidates.length > 0 &&
            result.candidates[0].content && result.candidates[0].content.parts &&
            result.candidates[0].content.parts.length > 0) {
            const analysisText = result.candidates[0].content.parts[0].text;
            workforceOptAiAnalysisContentEl.textContent = analysisText;
            if(optimizationRecommendationTextEl) optimizationRecommendationTextEl.innerHTML = `<p>${analysisText.replace(/\n/g, '<br>')}</p>`;
            
            // Try to parse the AI's recommended agent number to update the numeric display
            const recommendedAgentsMatch = analysisText.match(/Recommended Number of Agents: (\d+)/i) || analysisText.match(/recommend (\d+) agents/i);
            if (recommendedAgentsMatch && recommendedAgentsMatch[1]) {
                const aiRecommendedAgentCount = parseInt(recommendedAgentsMatch[1]);
                const recommendedData = allOptimizationIterationsData.find(iter => iter.agents === aiRecommendedAgentCount);
                if (recommendedData) {
                    displayOptimizationResults(recommendedData, parseInt(optTargetDeliveryTimeInputEl.value));
                } else {
                    // If AI recommends a number not in the table (e.g. due to interpolation/extrapolation it might do),
                    // we might just display the closest available or stick to a heuristic fallback if needed.
                    // For now, if AI gives a number, we try to find it. If not, the UI won't update numerically from AI.
                    logMessage("AI recommended an agent count not directly in iteration data. Displaying based on heuristic if available, or AI text only.", "INFO", optimizationLogEl);
                    if(bestIterationResultFromHeuristic) displayOptimizationResults(bestIterationResultFromHeuristic, parseInt(optTargetDeliveryTimeInputEl.value));
                }
            } else {
                 logMessage("Could not parse a specific agent count from AI recommendation. Displaying based on heuristic if available.", "INFO", optimizationLogEl);
                 if(bestIterationResultFromHeuristic) displayOptimizationResults(bestIterationResultFromHeuristic, parseInt(optTargetDeliveryTimeInputEl.value));
            }

        } else if (result.candidates && result.candidates.length > 0 && result.candidates[0].finishReason) {
            // ... (handle finish reason as before) ...
        } else {
            // ... (handle unexpected structure as before) ...
        }
    } catch (error) {
        // ... (handle fetch error as before) ...
    } finally {
        workforceOptAiAnalysisLoadingEl.classList.add('hidden');
        if (analyzeWorkforceOptAIButtonEl) analyzeWorkforceOptAIButtonEl.disabled = false;
    }
}
