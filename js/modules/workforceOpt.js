// js/modules/workforceOpt.js
import { chandigarhGeoJsonPolygon, chandigarhCenter, chandigarhSectors } from '../data/chandigarhData.js';
import { initializeMap, getMapInstance, getDistanceKm, isPointInPolygon, darkStoreIcon as commonDarkStoreIcon, generateWaypoints } from '../mapUtils.js';
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
let bestIterationResult = null; 

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

const MIN_DELIVERY_COMPLETION_RATE = 0.90; 
const TARGET_SLA_PERCENTAGE = 0.80;      
const IDEAL_AGENT_UTILIZATION_MIN = 50;  
const IDEAL_AGENT_UTILIZATION_MAX = 90;  
const COST_PER_ORDER_TOLERANCE = 0.05; 
const OPT_SIM_STEP_MINUTES = 1;

export function initializeWorkforceOptimizationSection() {
    // Cache all DOM Elements as in project_workforce_opt_logic_fixes_v9
    // ... (ensure all opt...InputEl, opt...SelectEl, etc. are cached)
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
    analyzeWorkforceOptAIButtonEl?.addEventListener('click', handleWorkforceOptAiAnalysisRequest);

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

export function populateDarkStoreSelectorForOpt(clusteredStores) { /* ... as before ... */ }
function populateDemandProfileSelectorForOpt() { /* ... as before ... */ }
function resetOptimizationVisuals() { /* ... as before, ensures bestIterationResult = null; ... */ }

async function runWorkforceOptimization() {
    allOptimizationIterationsData = [];
    resetOptimizationVisuals(); 
    let recommendationReason = ""; 

    // ... (Parameter parsing and validation as before, ensuring all opt... variables are read) ...
    const selectedDarkStoreId = parseInt(optSelectDarkStoreEl.value);
    const selectedDarkStore = globalClusteredDarkStores.find(ds => ds.id === selectedDarkStoreId);
    // ... (rest of parameter validation) ...

    runOptimizationBtnEl.disabled = true;
    runOptimizationBtnEl.textContent = "Optimizing...";
    if (optimizationLogEl) optimizationLogEl.innerHTML = "";
    logMessage(`Starting workforce optimization for Dark Store: ${selectedDarkStore.name}`, 'SYSTEM', optimizationLogEl);
    // ... (other initial log messages) ...

    // Use parameters from Workforce Optimization UI for the internal simulation
    const iterAgentMinSpeed = parseFloat(optAgentMinSpeedInputEl.value);
    const iterAgentMaxSpeed = parseFloat(optAgentMaxSpeedInputEl.value);
    const iterHandlingTime = parseFloat(optHandlingTimeInputEl.value);
    // const iterRouteWaypoints = parseInt(optRouteWaypointsSelectEl.value); // Not directly used in simplified pathing for opt
    const iterBaseTrafficFactor = parseFloat(optBaseTrafficFactorSelectEl.value);
    // const iterDynamicTrafficEnabled = optEnableDynamicTrafficCheckboxEl.checked; // Not used in simplified sim
    const iterOrdersPerMinuteForDefault = parseFloat(optOrdersPerMinuteInputEl.value);


    const iterAgentCostPerHour = getMainSimParameter('agentCostPerHour');
    const iterCostPerKm = getMainSimParameter('costPerKmTraveled');
    const iterFixedCostPerDelivery = getMainSimParameter('fixedCostPerDelivery');
    const targetAvgDeliveryTime = parseInt(optTargetDeliveryTimeInputEl.value);
    const numRunsPerAgentCount = parseInt(optNumRunsPerAgentCountInputEl.value);
    const maxSimTimePerIteration = parseInt(optMaxSimTimePerIterationInputEl.value);
    const minAgentsToTest = parseInt(optMinAgentsInputEl.value);
    const maxAgentsToTest = parseInt(optMaxAgentsInputEl.value);
    const selectedDemandProfileId = optDemandProfileSelectEl.value;
    const orderRadiusKm = parseFloat(optOrderGenerationRadiusInputEl.value); 
    let targetOrdersForDefaultProfileRun = parseInt(optTargetOrdersPerIterationInputEl.value); 

    if (selectedDemandProfileId.startsWith('default_opt_')) {
        if (isNaN(targetOrdersForDefaultProfileRun) || targetOrdersForDefaultProfileRun <= 0) {
            if (!isNaN(iterOrdersPerMinuteForDefault) && iterOrdersPerMinuteForDefault > 0) {
                targetOrdersForDefaultProfileRun = Math.max(1, Math.ceil(iterOrdersPerMinuteForDefault * maxSimTimePerIteration)); 
                logMessage(`Default profile: Target orders derived as ${targetOrdersForDefaultProfileRun} from Orders/Min (${iterOrdersPerMinuteForDefault}) and Max Sim Time.`, 'INFO', optimizationLogEl);
            } else {
                 logMessage("Error: For default optimization profiles, either 'Target Orders per Iteration' or a valid 'Orders/Min' must be set.", 'ERROR', optimizationLogEl);
                 if (runOptimizationBtnEl) { runOptimizationBtnEl.disabled = false; runOptimizationBtnEl.textContent = "Run Workforce Optimization"; }
                 return;
            }
        }
    }

    // ... (map initialization as before) ...
    bestIterationResult = null; 

    for (let currentNumAgents = minAgentsToTest; currentNumAgents <= maxAgentsToTest; currentNumAgents++) {
        logMessage(`Testing with ${currentNumAgents} agent(s) across ${numRunsPerAgentCount} runs...`, 'ITERATION', optimizationLogEl);
        
        let aggregatedStatsForAgentCount = {
            totalGenerated: 0, totalDelivered: 0, sumDeliveryTimes: 0, deliveryTimes: [],
            ordersWithinSLA: 0, sumWaitTimes: 0, numAssigned: 0, 
            totalAgentBusyTimeAcrossRuns: 0, 
            totalAgentActualSimTimeAcrossRuns: 0, 
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
            let currentRunStats = {
                totalGeneratedThisRun: 0, 
                totalDeliveredThisRun: 0, 
                sumDeliveryTimesThisRun: 0, 
                deliveryTimesThisRun: [],
                ordersWithinSLAThisRun: 0, 
                sumWaitTimesThisRun: 0, 
                numAssignedThisRun: 0,
                totalAgentDistanceKmThisRun: 0
            };
            let orderGenerationBufferOpt = 0;
            
            for (let i = 0; i < currentNumAgents; i++) {
                const speedRange = iterAgentMaxSpeed - iterAgentMinSpeed;
                iterAgents.push({
                    id: i, 
                    location: { ...selectedDarkStore }, 
                    speedKmph: iterAgentMinSpeed + Math.random() * speedRange,
                    status: 'available', 
                    assignedOrderId: null, 
                    routePath: [], 
                    currentLegIndex: 0,
                    legProgress: 0, 
                    timeSpentAtStore: 0, 
                    busyTimeThisRun: 0,
                    timeBecameAvailableAt: 0,
                });
            }
            
            if (selectedDemandProfileId.startsWith('default_opt_')) {
                for (let i = 0; i < targetOrdersForDefaultProfileRun; i++) {
                    // ... (generate order location as before) ...
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

                // 1. Order Generation (for Custom Profiles)
                if (selectedDemandProfileId.startsWith('custom_')) {
                    const profileName = selectedDemandProfileId.substring('custom_'.length);
                    const customProfile = customProfiles.find(p => p.name === profileName);
                    if (customProfile && customProfile.zones) {
                        customProfile.zones.forEach(zone => {
                            if (iterSimTime >= zone.startTime && iterSimTime <= (zone.endTime || Infinity)) {
                                const ordersPerHour = (zone.minOrders + zone.maxOrders) / 2;
                                const probPerStep = (ordersPerHour / 60) * OPT_SIM_STEP_MINUTES;
                                orderGenerationBufferOpt += probPerStep;
                                while(orderGenerationBufferOpt >= 1.0) {
                                    let orderLocation; // Generate location based on zone.type
                                    if (zone.type === 'uniform') { /* ... */ } // Simplified for brevity
                                    else { orderLocation = { ...selectedDarkStore }; } // Fallback
                                    
                                    if (orderLocation) {
                                        iterOrders.push({ id: iterOrderIdCounter++, location: orderLocation, status: 'pending', timePlaced: iterSimTime, assignedAgentId: null, assignmentTime: null, deliveryTime: null });
                                        currentRunStats.totalGeneratedThisRun++;
                                    }
                                    orderGenerationBufferOpt -= 1.0;
                                }
                            }
                        });
                    }
                }
                
                // 2. Assign Orders to Available Agents
                for (const order of iterOrders) {
                    if (order.status === 'pending') {
                        let bestAgent = null; let shortestETA = Infinity;
                        for (const agent of iterAgents) {
                            if (agent.status === 'available') {
                                let timeToStore = 0;
                                if(JSON.stringify(agent.location) !== JSON.stringify(selectedDarkStore)) {
                                    timeToStore = (getDistanceKm(agent.location, selectedDarkStore) / (agent.speedKmph * iterBaseTrafficFactor)) * 60;
                                }
                                const timeToCustomer = (getDistanceKm(selectedDarkStore, order.location) / (agent.speedKmph * iterBaseTrafficFactor)) * 60;
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
                            // logMessage(`  Run ${run+1}, Agent ${bestAgent.id} assigned Order ${order.id}`, 'SYSTEM_DEBUG', optimizationLogEl);
                        }
                    }
                }

                // 3. Update Agent Movements and Statuses
                for (const agent of iterAgents) {
                    if (agent.status !== 'available') {
                        agent.busyTimeThisRun += OPT_SIM_STEP_MINUTES;
                    }

                    switch (agent.status) {
                        case 'to_store':
                            const distToStore = getDistanceKm(agent.location, selectedDarkStore);
                            const travelToStorePerStep = (agent.speedKmph * iterBaseTrafficFactor / 60) * OPT_SIM_STEP_MINUTES;
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
                            const travelToCustomerPerStep = (agent.speedKmph * iterBaseTrafficFactor / 60) * OPT_SIM_STEP_MINUTES;
                            agent.distanceTraveledThisRun += Math.min(travelToCustomerPerStep, distToCustomer);

                            if (distToCustomer <= travelToCustomerPerStep || distToCustomer < 0.01 || agent.legProgress >= 0.999) { // Adjusted for floating point
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
                                agent.routePath = []; agent.currentLegIndex = 0; agent.legProgress = 0;
                            } else {
                                agent.location.lat += (customerLocation.lat - agent.location.lat) * (travelToCustomerPerStep / distToCustomer);
                                agent.location.lng += (customerLocation.lng - agent.location.lng) * (travelToCustomerPerStep / distToCustomer);
                                agent.legProgress += (travelToCustomerPerStep / distToCustomer);
                            }
                            break;
                    }
                } 
                
                // Check for run completion
                const undeliveredOrdersInRun = iterOrders.filter(o => o.status !== 'delivered').length;
                if (currentRunStats.totalGeneratedThisRun > 0 && undeliveredOrdersInRun === 0) {
                    logMessage(`  Run ${run+1}: All ${currentRunStats.totalGeneratedThisRun} generated orders delivered at T+${iterSimTime}.`, 'SYSTEM_DEBUG', optimizationLogEl);
                    break; 
                }
            } // End of single run's while loop (iterSimTime)
            
            currentRunStats.totalAgentActiveTimeThisRun = iterAgents.reduce((sum, agent) => sum + agent.busyTimeThisRun, 0);
            currentRunStats.totalAgentDistanceKmThisRun = iterAgents.reduce((sum, agent) => sum + agent.distanceTraveledThisRun, 0);


            aggregatedStatsForAgentCount.totalGenerated += currentRunStats.totalGeneratedThisRun;
            aggregatedStatsForAgentCount.totalDelivered += currentRunStats.totalDeliveredThisRun;
            aggregatedStatsForAgentCount.sumDeliveryTimes += currentRunStats.sumDeliveryTimesThisRun;
            aggregatedStatsForAgentCount.deliveryTimes.push(...currentRunStats.deliveryTimesThisRun);
            aggregatedStatsForAgentCount.ordersWithinSLA += currentRunStats.ordersWithinSLAThisRun;
            aggregatedStatsForAgentCount.sumWaitTimes += currentRunStats.sumWaitTimesThisRun;
            aggregatedStatsForAgentCount.numAssigned += currentRunStats.numAssignedThisRun;
            aggregatedStatsForAgentCount.totalAgentActiveTime += currentRunStats.totalAgentActiveTimeThisRun;
            aggregatedStatsForAgentCount.totalAgentDistanceKm += currentRunStats.totalAgentDistanceKmThisRun;
            aggregatedStatsForAgentCount.totalRuns++;
            aggregatedStatsForAgentCount.totalSimTimeAcrossRuns += iterSimTime; // Actual duration of this run
        } 

        const avgGenerated = aggregatedStatsForAgentCount.totalRuns > 0 ? aggregatedStatsForAgentCount.totalGenerated / aggregatedStatsForAgentCount.totalRuns : 0;
        const avgDelivered = aggregatedStatsForAgentCount.totalRuns > 0 ? aggregatedStatsForAgentCount.totalDelivered / aggregatedStatsForAgentCount.totalRuns : 0;
        const avgDelTime = aggregatedStatsForAgentCount.totalDelivered > 0 ? (aggregatedStatsForAgentCount.sumDeliveryTimes / aggregatedStatsForAgentCount.totalDelivered) : null;
        const percentOrdersSLA = aggregatedStatsForAgentCount.totalDelivered > 0 ? (aggregatedStatsForAgentCount.ordersWithinSLA / aggregatedStatsForAgentCount.totalDelivered) * 100 : 0;
        
        // Total agent-minutes available across all runs for this agent count, using actual run times
        const totalAgentPotentialWorkTime = currentNumAgents * aggregatedStatsForAgentCount.totalSimTimeAcrossRuns;
        const avgUtil = totalAgentPotentialWorkTime > 0 ? 
                        (aggregatedStatsForAgentCount.totalAgentActiveTime / totalAgentPotentialWorkTime) * 100 
                        : 0;
        
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

    // --- Recommendation Logic (AI will be primary, this is for UI display if needed) ---
    bestIterationResult = null; 
    recommendationReason = ""; 

    let candidates = allOptimizationIterationsData.filter(
        iter => iter.deliveryCompletionRate >= MIN_DELIVERY_COMPLETION_RATE && 
                iter.percentOrdersSLA >= TARGET_SLA_PERCENTAGE &&
                (iter.avgAgentUtilization ?? 0) <= IDEAL_AGENT_UTILIZATION_MAX // Prefer not to over-utilize
    );
    if (candidates.length > 0) {
        recommendationReason = `Initial candidates meet >=${(MIN_DELIVERY_COMPLETION_RATE*100).toFixed(0)}% completion, >=${TARGET_SLA_PERCENTAGE}% SLA, and <${IDEAL_AGENT_UTILIZATION_MAX}% utilization.`;
    } else {
        candidates = allOptimizationIterationsData.filter(iter => iter.deliveryCompletionRate >= MIN_DELIVERY_COMPLETION_RATE);
        if (candidates.length > 0) {
            recommendationReason = `Target SLA not fully met by any configuration. Considering options meeting >=${(MIN_DELIVERY_COMPLETION_RATE*100).toFixed(0)}% completion.`;
        } else {
            candidates = [...allOptimizationIterationsData];
            recommendationReason = "Warning: No iterations met minimum completion targets. Recommendation based on best effort from all data, results may be unreliable.";
        }
        logMessage(`Warning: ${recommendationReason}`, 'WARNING', optimizationLogEl);
    }

    if (candidates.length > 0) {
        let idealUtilCandidates = candidates.filter(iter => 
            (iter.avgAgentUtilization ?? 0) >= IDEAL_AGENT_UTILIZATION_MIN &&
            (iter.avgAgentUtilization ?? 0) <= IDEAL_AGENT_UTILIZATION_MAX
        );

        if (idealUtilCandidates.length > 0) {
            idealUtilCandidates.sort((a, b) => (a.avgCostPerOrder ?? Infinity) - (b.avgCostPerOrder ?? Infinity));
            bestIterationResult = idealUtilCandidates[0];
            recommendationReason += ` Selected best cost option within ideal utilization range (${IDEAL_AGENT_UTILIZATION_MIN}-${IDEAL_AGENT_UTILIZATION_MAX}%).`;
        } else {
            candidates.sort((a, b) => (a.avgCostPerOrder ?? Infinity) - (b.avgCostPerOrder ?? Infinity));
            if (candidates.length > 0) {
                bestIterationResult = candidates[0];
                if (bestIterationResult) { 
                    if ((bestIterationResult.avgAgentUtilization ?? 0) < IDEAL_AGENT_UTILIZATION_MIN) {
                        recommendationReason += ` Selected lowest cost option meeting service criteria. Note: Agent utilization (${bestIterationResult.avgAgentUtilization?.toFixed(1) ?? 'N/A'}%) is below ideal.`;
                    } else if ((bestIterationResult.avgAgentUtilization ?? 0) > IDEAL_AGENT_UTILIZATION_MAX) {
                        recommendationReason += ` Selected lowest cost option meeting service criteria. Note: Agent utilization (${bestIterationResult.avgAgentUtilization?.toFixed(1) ?? 'N/A'}%) is above ideal (potentially overworked).`;
                    } else {
                         recommendationReason += ` Selected lowest cost option meeting service criteria. Utilization is acceptable.`;
                    }
                }
            }
        }
    }

    // Display results and then call AI analysis
    displayOptimizationResults(bestIterationResult, targetAvgDeliveryTime);
    populateOptimizationComparisonTable(allOptimizationIterationsData);
    renderOptimizationChartsLocal(allOptimizationIterationsData, targetAvgDeliveryTime);
    if(optimizationResultsContainerEl) optimizationResultsContainerEl.classList.remove('hidden');
    if(optimizationComparisonContainerEl) optimizationComparisonContainerEl.classList.remove('hidden');
    if(optimizationChartsContainerEl) optimizationChartsContainerEl.classList.remove('hidden');
    if(exportWorkforceOptResultsBtnEl) exportWorkforceOptResultsBtnEl.disabled = false;
    
    if (runOptimizationBtnEl) { runOptimizationBtnEl.disabled = false; runOptimizationBtnEl.textContent = "Run Workforce Optimization"; }

    // AI Analysis: If data exists, enable button and prepare for AI recommendation
    if (allOptimizationIterationsData.length > 0) {
        if (analyzeWorkforceOptAIButtonEl) analyzeWorkforceOptAIButtonEl.disabled = false;
        // The user wants AI to provide the primary recommendation.
        // So, we will now call handleWorkforceOptAiAnalysisRequest directly.
        // The recommendation text will be updated by the AI's response.
        logMessage("Optimization data generated. Requesting AI analysis for best agent recommendation...", 'SYSTEM_BOLD', optimizationLogEl);
        await handleWorkforceOptAiAnalysisRequest(recommendationReason); // Pass the heuristic reason for context if needed
    } else {
        if(optimizationRecommendationTextEl) optimizationRecommendationTextEl.innerHTML = "<p>No optimization data was generated to make a recommendation or for AI analysis.</p>";
        logMessage("Optimization complete. No data generated for recommendation.", 'SYSTEM_BOLD', optimizationLogEl);
    }
}

function displayOptimizationResults(resultToDisplay, targetTime) {
    // This function now primarily displays the data for a *given* result (e.g., one chosen by AI or a default)
    // The main textual recommendation will come from AI.
    if (!resultToDisplay) { // if AI hasn't picked one, or heuristic failed.
        if(optResultAgentsEl) optResultAgentsEl.textContent = "N/A";
        // ... clear other optResult... fields ...
        return;
    }
    if(optResultAgentsEl) optResultAgentsEl.textContent = resultToDisplay.agents;
    if(optResultAvgTimeEl) optResultAvgTimeEl.textContent = resultToDisplay.avgDeliveryTime !== null ? resultToDisplay.avgDeliveryTime.toFixed(1) + " min" : "N/A";
    if(optResultTargetTimeEl) optResultTargetTimeEl.textContent = targetTime + " min";
    if(optResultSlaMetEl) optResultSlaMetEl.textContent = resultToDisplay.percentOrdersSLA !== null ? resultToDisplay.percentOrdersSLA.toFixed(1) + "%" : "N/A";
    // ... fill other optResult... fields from resultToDisplay ...
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

    // Map display can be for the selectedDarkStore, actual order pins are less relevant here.
    if (optimizationMap && optOrderMarkersLayer) {
        optOrderMarkersLayer.clearLayers();
    }
}

function populateOptimizationComparisonTable(iterationData) { /* ... as before ... */ }
function initializeOptimizationChartsLocal() { /* ... as before ... */ }
function renderOptimizationChartsLocal(iterationData, targetTime) { /* ... as before ... */ }
function exportWorkforceOptResultsToCSV() { /* ... as before ... */ }

function prepareWorkforceOptDataForAI(heuristicReason) { // Accept heuristic reason for context
    if (allOptimizationIterationsData.length === 0) { 
        return "No optimization data available to analyze. Please run an optimization first.";
    }

    let dataString = "Workforce Optimization Input Parameters:\n";
    // ... (gather input parameters as before) ...
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


    dataString += "\nSummary of Averaged Iteration Results (Agents, Avg Delivered, Avg Del Time, Avg %SLA, Avg Util, Avg Cost/Order):\n";
    allOptimizationIterationsData.forEach(iter => {
        dataString += `${iter.agents}, ${iter.deliveredOrders?.toFixed(1) ?? 'N/A'}, ${iter.avgDeliveryTime?.toFixed(1) ?? 'N/A'}, ${iter.percentOrdersSLA?.toFixed(1) ?? 'N/A'}%, ${iter.avgAgentUtilization?.toFixed(1) ?? 'N/A'}%, ${iter.avgCostPerOrder?.toFixed(2) ?? 'N/A'}\n`;
    });

    // Add the heuristic reason if provided
    if (heuristicReason) {
        dataString += `\nInitial Heuristic Finding: ${heuristicReason}\n`;
    }
    
    return dataString;
}

async function handleWorkforceOptAiAnalysisRequest(heuristicReasonForContext = "") { // Optional parameter
    if (!workforceOptAiAnalysisContainerEl || !workforceOptAiAnalysisLoadingEl || !workforceOptAiAnalysisContentEl) {
        console.error("Workforce Opt AI Analysis UI elements not found.");
        alert("AI Analysis UI components for Workforce Optimization are missing.");
        return;
    }

    if (allOptimizationIterationsData.length === 0) { 
        workforceOptAiAnalysisContentEl.textContent = "Please run a workforce optimization first to generate data for analysis.";
        workforceOptAiAnalysisContainerEl.classList.remove('hidden');
        analyzeWorkforceOptAIButtonEl.disabled = true;
        return;
    }

    workforceOptAiAnalysisLoadingEl.classList.remove('hidden');
    workforceOptAiAnalysisContentEl.textContent = 'Generating AI analysis for optimization results... Please wait.';
    workforceOptAiAnalysisContainerEl.classList.remove('hidden');
    analyzeWorkforceOptAIButtonEl.disabled = true;


    const optimizationDataSummary = prepareWorkforceOptDataForAI(heuristicReasonForContext);
    if (optimizationDataSummary.startsWith("No optimization data available")) {
        workforceOptAiAnalysisContentEl.textContent = optimizationDataSummary;
        workforceOptAiAnalysisLoadingEl.classList.add('hidden');
        analyzeWorkforceOptAIButtonEl.disabled = false; // Re-enable if no data
        return;
    }

    const prompt = `
        You are a logistics operations analyst tasked with recommending the optimal number of agents.
        Analyze the following Workforce Optimization simulation results for a quick commerce delivery operation.
        The primary goal is to achieve the Target Average Delivery Time of ${optTargetDeliveryTimeInputEl.value} minutes with at least ${TARGET_SLA_PERCENTAGE*100}% of orders delivered within this target, while also considering agent utilization (ideally between ${IDEAL_AGENT_UTILIZATION_MIN}% and ${IDEAL_AGENT_UTILIZATION_MAX}%) and minimizing Cost Per Order.

        Based on all the provided iteration data:
        1.  What is the recommended number of agents?
        2.  Provide a detailed rationale for your recommendation, explicitly discussing the trade-offs for nearby agent counts (e.g., +/- 1 or 2 agents from your recommendation) regarding Average Delivery Time, % Orders within Target SLA, Agent Utilization, and Cost Per Order.
        3.  Identify any agent counts where the system appears significantly under-resourced (poor service) or over-resourced (low utilization, potentially higher cost than necessary for the service achieved).
        4.  Highlight any particularly insightful trends or surprising findings from the data.
        5.  Conclude with 1-2 strategic considerations or further questions the user might investigate based on these results.

        Be comprehensive, data-driven, and structure your response clearly.

        Workforce Optimization Data:
        ${optimizationDataSummary}
    `;

    try {
        let chatHistory = [{ role: "user", parts: [{ text: prompt }] }];
        const payload = { contents: chatHistory };
        const apiKey = "AIzaSyDwjlcdDvgre9mLWR7abRx2qta_NFLISuI"; 
        
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
            console.error("Gemini API Error Details (Workforce Opt):", detailedErrorMessage);
            throw new Error(detailedErrorMessage);
        }

        const result = await response.json();
        
        if (result.candidates && result.candidates.length > 0 &&
            result.candidates[0].content && result.candidates[0].content.parts &&
            result.candidates[0].content.parts.length > 0) {
            const analysisText = result.candidates[0].content.parts[0].text;
            workforceOptAiAnalysisContentEl.textContent = analysisText;
            // Update the main recommendation text area with AI's output
            if(optimizationRecommendationTextEl) optimizationRecommendationTextEl.innerHTML = `<p>${analysisText.replace(/\n/g, '<br>')}</p>`;
            // Attempt to parse recommended agents from AI text (this is fragile)
            const match = analysisText.match(/recommended number of agents is (\d+)/i) || analysisText.match(/recommend (\d+) agents/i) ;
            if (match && match[1]) {
                const aiRecommendedAgents = parseInt(match[1]);
                const recommendedData = allOptimizationIterationsData.find(iter => iter.agents === aiRecommendedAgents);
                if (recommendedData) {
                    displayOptimizationResults(recommendedData, parseInt(optTargetDeliveryTimeInputEl.value)); // Update numerical displays
                } else {
                     displayOptimizationResults(bestIterationResult, parseInt(optTargetDeliveryTimeInputEl.value)); // Fallback to heuristic if AI number not found
                }
            } else {
                 displayOptimizationResults(bestIterationResult, parseInt(optTargetDeliveryTimeInputEl.value)); // Fallback if AI doesn't give a clear number
            }


        } else if (result.candidates && result.candidates.length > 0 && result.candidates[0].finishReason) {
            workforceOptAiAnalysisContentEl.textContent = `AI model finished with reason: ${result.candidates[0].finishReason}. No content generated. Check prompt or model settings. Safety Ratings: ${JSON.stringify(result.candidates[0].safetyRatings || {})}`;
            if(optimizationRecommendationTextEl) optimizationRecommendationTextEl.innerHTML = `<p>AI analysis could not provide a recommendation. Reason: ${result.candidates[0].finishReason}</p>`;
        } else {
            console.error("Unexpected API response structure (Workforce Opt):", result);
            workforceOptAiAnalysisContentEl.textContent = "Could not retrieve analysis. The API response structure was unexpected.";
            if(optimizationRecommendationTextEl) optimizationRecommendationTextEl.innerHTML = `<p>Could not retrieve AI analysis due to unexpected API response.</p>`;
        }
    } catch (error) {
        console.error("Error fetching AI analysis for Workforce Opt:", error);
        workforceOptAiAnalysisContentEl.textContent = `Error fetching AI analysis: ${error.message}. Please check the console for more details.`;
        if(optimizationRecommendationTextEl) optimizationRecommendationTextEl.innerHTML = `<p>Error fetching AI analysis: ${error.message}</p>`;
    } finally {
        workforceOptAiAnalysisLoadingEl.classList.add('hidden');
        if (analyzeWorkforceOptAIButtonEl) analyzeWorkforceOptAIButtonEl.disabled = false;
    }
}
