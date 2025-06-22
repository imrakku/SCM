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
let bestIterationResultGlobal = null;

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
    analyzeWorkforceAIButtonEl, workforceAiAnalysisContainerEl, 
    workforceAiAnalysisLoadingEl, workforceAiAnalysisContentEl;

// ... (other variables)

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

    // AI Analysis Elements
    analyzeWorkforceAIButtonEl = document.getElementById('analyzeWorkforceAI');
    workforceAiAnalysisContainerEl = document.getElementById('workforceAiAnalysisContainer');
    workforceAiAnalysisLoadingEl = document.getElementById('workforceAiAnalysisLoading');
    workforceAiAnalysisContentEl = document.getElementById('workforceAiAnalysisContent');

    // Result display elements
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
    // Reset state
    allOptimizationIterationsData = [];
    bestIterationResultGlobal = null;
    if(optimizationComparisonContainerEl) optimizationComparisonContainerEl.classList.add('hidden');
    if(optimizationChartsContainerEl) optimizationChartsContainerEl.classList.add('hidden');
    if(optimizationResultsContainerEl) optimizationResultsContainerEl.classList.add('hidden');
    if(optimizationRecommendationTextEl) optimizationRecommendationTextEl.innerHTML = '<p class="text-center p-4">Crunching numbers... Please wait.</p>';
    if(exportWorkforceOptResultsBtnEl) exportWorkforceOptResultsBtnEl.disabled = true;
    if(analyzeWorkforceAIButtonEl) analyzeWorkforceAIButtonEl.disabled = true;
    if(workforceAiAnalysisContainerEl) workforceAiAnalysisContainerEl.classList.add('hidden');

    // Get parameters...
    const selectedDarkStoreId = parseInt(optSelectDarkStoreEl.value);
    const selectedDarkStore = globalClusteredDarkStores.find(ds => ds.id === selectedDarkStoreId);
    if (isNaN(selectedDarkStoreId) || !selectedDarkStore) {
        logMessage("Error: Please select a valid dark store.", 'ERROR', optimizationLogEl);
        return;
    }
    
    const targetOrdersPerIterationDefault = parseInt(optTargetOrdersPerIterationInputEl.value);
    const minAgentsToTest = parseInt(optMinAgentsInputEl.value);
    const maxAgentsToTest = parseInt(optMaxAgentsInputEl.value);
    const numRunsPerAgentCount = parseInt(optNumRunsPerAgentCountInputEl.value);
    const targetAvgDeliveryTime = parseInt(optTargetDeliveryTimeInputEl.value);
    const maxSimTimePerIteration = parseInt(optMaxSimTimePerIterationInputEl.value);
    const orderRadiusKm = parseFloat(optOrderGenerationRadiusInputEl.value);

    runOptimizationBtnEl.disabled = true;
    runOptimizationBtnEl.textContent = "Optimizing...";
    if (optimizationLogEl) optimizationLogEl.innerHTML = "";
    logMessage(`Starting workforce optimization for Dark Store: ${selectedDarkStore.name}`, 'SYSTEM', optimizationLogEl);
    
    // ... other parameter logging

    const baseHandlingTime = getMainSimParameter('handlingTime');
    const baseTrafficFactor = getMainSimParameter('baseTrafficFactor');
    const iterAgentCostPerHour = getMainSimParameter('agentCostPerHour');
    const iterCostPerKm = getMainSimParameter('costPerKmTraveled');
    const iterFixedCostPerDelivery = getMainSimParameter('fixedCostPerDelivery');

    // Main loop for iterating through different agent counts
    for (let currentNumAgents = minAgentsToTest; currentNumAgents <= maxAgentsToTest; currentNumAgents++) {
        logMessage(`Testing with ${currentNumAgents} agent(s) across ${numRunsPerAgentCount} runs...`, 'ITERATION', optimizationLogEl);
        
        let aggregatedStats = { totalDelivered: 0, sumDeliveryTimes: 0, deliveryTimes: [], ordersWithinSLA: 0, sumWaitTimes: 0, numAssigned: 0, totalAgentActiveTime: 0, totalAgentDistanceKm: 0, totalGenerated:0, totalRuns:0 };

        for (let run = 0; run < numRunsPerAgentCount; run++) {
            // ... log run start
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
                    let orderLocation;
                    let attempts = 0;
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
                        bestAgent.status = 'to_store'; bestAgent.routePath = [{...bestAgent.location}, {...selectedDarkStore}, {...order.location}]; bestAgent.legProgress = 0; bestAgent.timeSpentAtStore = 0;
                    }
                });

                iterAgents.forEach(agent => {
                    if (agent.status === 'available') return;
                    currentRunStats.totalAgentActiveTime++;

                    if (agent.status === 'to_store') {
                        const startPoint = agent.routePath[0];
                        const endPoint = agent.routePath[1];
                        const legDist = getDistanceKm(startPoint, endPoint);
                        if (legDist < 0.01) { agent.legProgress = 1; }
                        else {
                            const distCovered = (agent.speedKmph * baseTrafficFactor) / 60;
                            currentRunStats.totalAgentDistanceKm += distCovered;
                            agent.legProgress += (distCovered / legDist);
                        }
                        if (agent.legProgress >= 1) {
                            agent.location = { ...endPoint };
                            agent.status = 'at_store';
                            agent.legProgress = 0;
                        }
                    } else if (agent.status === 'at_store') {
                        agent.timeSpentAtStore++;
                        if (agent.timeSpentAtStore >= baseHandlingTime) {
                            agent.status = 'to_customer';
                        }
                    } else if (agent.status === 'to_customer') {
                        const startPoint = agent.routePath[1];
                        const endPoint = agent.routePath[2];
                        const legDist = getDistanceKm(startPoint, endPoint);
                         if (legDist < 0.01) { agent.legProgress = 1; }
                         else {
                            const distCovered = (agent.speedKmph * baseTrafficFactor) / 60;
                            currentRunStats.totalAgentDistanceKm += distCovered;
                            agent.legProgress += (distCovered / legDist);
                        }
                        if (agent.legProgress >= 1) {
                            const deliveredOrder = iterOrders.find(o => o.id === agent.assignedOrderId);
                            if (deliveredOrder) {
                                deliveredOrder.status = 'delivered';
                                currentRunStats.totalDelivered++;
                                const deliveryDuration = iterSimTime - deliveredOrder.timePlaced;
                                currentRunStats.sumDeliveryTimes += deliveryDuration;
                                currentRunStats.deliveryTimes.push(deliveryDuration);
                                if (deliveryDuration <= targetAvgDeliveryTime) currentRunStats.ordersWithinSLA++;
                            }
                            agent.location = { ...endPoint };
                            agent.status = 'available';
                            agent.assignedOrderId = null;
                        }
                    }
                });
                if (currentRunStats.totalGenerated > 0 && currentRunStats.totalGenerated === currentRunStats.totalDelivered) {
                    break;
                }
            } // end of while loop for one run
            
            // Aggregate stats
            aggregatedStats.totalGenerated += currentRunStats.totalGenerated;
            aggregatedStats.totalDelivered += currentRunStats.totalDelivered;
            aggregatedStats.sumDeliveryTimes += currentRunStats.sumDeliveryTimes;
            aggregatedStats.deliveryTimes.push(...currentRunStats.deliveryTimes);
            // ... aggregate other stats
            aggregatedStats.totalRuns++;
        } // end of for loop for runs

        // Calculate and store average results for the agent count
        const avgGenerated = aggregatedStats.totalGenerated / aggregatedStats.totalRuns;
        const avgDelivered = aggregatedStats.totalDelivered / aggregatedStats.totalRuns;
        // ... calculate other averages
        
        allOptimizationIterationsData.push({
            agents: currentNumAgents,
            generatedOrders: avgGenerated,
            deliveredOrders: avgDelivered,
            // ... other averaged data
        });
        // ... log stats
    } // end of main for loop

    // Find best iteration...
    bestIterationResultGlobal = allOptimizationIterationsData.sort((a,b) => (a.avgCostPerOrder ?? Infinity) - (b.avgCostPerOrder ?? Infinity))[0];

    // Display results...
    displayOptimizationResults(bestIterationResultGlobal, targetAvgDeliveryTime);
    populateOptimizationComparisonTable(allOptimizationIterationsData);
    renderOptimizationChartsLocal(allOptimizationIterationsData, targetAvgDeliveryTime);
    if(analyzeWorkforceAIButtonEl) analyzeWorkforceAIButtonEl.disabled = false;
    runOptimizationBtnEl.disabled = false;
    runOptimizationBtnEl.textContent = "Run Workforce Optimization";
}

// ... (Other functions like displayOptimizationResults, etc.)

function prepareWorkforceDataForAI() {
    if (!bestIterationResultGlobal || allOptimizationIterationsData.length === 0) {
        return "No optimization data available to analyze.";
    }

    let dataString = "Workforce Optimization Input Parameters:\n";
    dataString += `Target Average Delivery Time: ${optTargetDeliveryTimeInputEl.value} min\n`;
    const selectedStoreText = optSelectDarkStoreEl.options[optSelectDarkStoreEl.selectedIndex]?.text || 'N/A';
    dataString += `Dark Store: ${selectedStoreText}\n`;
    dataString += `Agent Count Range Tested: ${optMinAgentsInputEl.value} to ${optMaxAgentsInputEl.value}\n\n`;

    dataString += "Recommended Workforce Configuration:\n";
    const best = bestIterationResultGlobal;
    dataString += `Recommended Agents: ${best.agents}\n`;
    dataString += `Achieved Avg Delivery Time: ${best.avgDeliveryTime?.toFixed(1) ?? 'N/A'} min\n`;
    dataString += `Avg Agent Utilization: ${best.avgAgentUtilization?.toFixed(1) ?? 'N/A'}%\n`;
    dataString += `Avg Cost Per Order: ₹${best.avgCostPerOrder?.toFixed(2) ?? 'N/A'}\n\n`;

    dataString += "Performance Summary Across Different Workforce Sizes:\n";
    dataString += "Agents | Avg Delivery Time (min) | % Orders in Target Time | Avg Utilization (%) | Avg Cost/Order (₹)\n";
    dataString += "---|---|---|---|---\n";
    allOptimizationIterationsData.forEach(iter => {
        dataString += `${iter.agents} | ${iter.avgDeliveryTime?.toFixed(1) ?? 'N/A'} | ${iter.percentOrdersSLA?.toFixed(1) ?? 'N/A'}% | ${iter.avgAgentUtilization?.toFixed(1) ?? 'N/A'}% | ₹${iter.avgCostPerOrder?.toFixed(2) ?? 'N/A'}\n`;
    });

    return dataString;
}

async function handleWorkforceAiAnalysisRequest() {
    if (!workforceAiAnalysisContainerEl || !workforceAiAnalysisLoadingEl || !workforceAiAnalysisContentEl) return;
    if (!bestIterationResultGlobal) {
        workforceAiAnalysisContentEl.textContent = "Please run a workforce optimization analysis first.";
        workforceAiAnalysisContainerEl.classList.remove('hidden');
        return;
    }

    workforceAiAnalysisLoadingEl.classList.remove('hidden');
    workforceAiAnalysisContentEl.textContent = 'Generating AI analysis of optimization results...';
    workforceAiAnalysisContainerEl.classList.remove('hidden');

    const workforceDataSummary = prepareWorkforceDataForAI();
    const prompt = `
        You are a senior logistics operations consultant. Based on the following summary of a workforce optimization simulation, provide a concise executive summary.
        The goal is to find the optimal number of delivery agents. The simulation tested different numbers of agents and measured performance and cost.
        Your analysis should cover:
        1.  **Interpretation of the Recommendation:** Briefly explain why the recommended number of agents is likely the best choice based on the data.
        2.  **Service Level vs. Cost Trade-off:** Analyze how increasing the number of agents impacts key metrics like delivery time, agent utilization, and cost per order. What is the point of diminishing returns?
        3.  **Key Insights & Bottlenecks:** What does the data reveal about the operation? For example, if utilization is always low, it might indicate overstaffing.
        4.  **Final Strategic Recommendation:** Conclude with a clear, actionable recommendation for the business.
        Keep the analysis professional, data-driven, and to the point.

        Workforce Optimization Data:
        ${workforceDataSummary}
    `;

    try {
        const payload = { contents: [{ role: "user", parts: [{ text: prompt }] }] };
        const apiKey = "AIzaSyDwjlcdDvgre9mLWR7abRx2qta_NFLISuI"; // Use the same key
        const modelName = "gemini-2.0-flash";
        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;
        
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            throw new Error(`API request failed: ${response.status} ${response.statusText}`);
        }

        const result = await response.json();
        if (result.candidates && result.candidates[0]?.content?.parts[0]?.text) {
            workforceAiAnalysisContentEl.textContent = result.candidates[0].content.parts[0].text;
        } else {
            workforceAiAnalysisContentEl.textContent = "Could not retrieve analysis due to an unexpected API response.";
        }
    } catch (error) {
        console.error("Error fetching AI analysis:", error);
        workforceAiAnalysisContentEl.textContent = `Error: ${error.message}.`;
    } finally {
        workforceAiAnalysisLoadingEl.classList.add('hidden');
    }
}
