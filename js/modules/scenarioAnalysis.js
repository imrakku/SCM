// js/modules/scenarioAnalysis.js
import { logMessage } from '../logger.js';
import { getCurrentSimulationParameters, getCurrentSimulationStats } from './simulation.js';
import { calculateStdDev } from '../chartUtils.js';

const SCENARIO_STORAGE_KEY = 'chandigarhLogisticsScenarios';

// DOM Elements
let savedScenariosListContainerEl, compareSelectedScenariosBtnEl, clearAllScenariosBtnEl,
    scenarioComparisonResultsContainerEl, scenarioComparisonTableEl, scenarioComparisonPlaceholderEl,
    mainSimulationLogEl, analyzeScenarioComparisonAIBtnEl, scenarioAiAnalysisContainerEl,
    scenarioAiAnalysisLoadingEl, scenarioAiAnalysisContentEl;
    
let currentlyComparedScenarios = [];

export function initializeScenarioAnalysisSection() {
    savedScenariosListContainerEl = document.getElementById('savedScenariosListContainer');
    compareSelectedScenariosBtnEl = document.getElementById('compareSelectedScenariosBtn');
    clearAllScenariosBtnEl = document.getElementById('clearAllScenariosBtn');
    scenarioComparisonResultsContainerEl = document.getElementById('scenarioComparisonResultsContainer');
    scenarioComparisonTableEl = document.getElementById('scenarioComparisonTable');
    scenarioComparisonPlaceholderEl = document.getElementById('scenarioComparisonPlaceholder');
    mainSimulationLogEl = document.getElementById('simulationLog');
    
    analyzeScenarioComparisonAIBtnEl = document.getElementById('analyzeScenarioComparisonAI');
    scenarioAiAnalysisContainerEl = document.getElementById('scenarioAiAnalysisContainer');
    scenarioAiAnalysisLoadingEl = document.getElementById('scenarioAiAnalysisLoading');
    scenarioAiAnalysisContentEl = document.getElementById('scenarioAiAnalysisContent');

    compareSelectedScenariosBtnEl?.addEventListener('click', displaySelectedScenarioComparisons);
    clearAllScenariosBtnEl?.addEventListener('click', clearAllSavedScenarios);
    analyzeScenarioComparisonAIBtnEl?.addEventListener('click', handleScenarioAiAnalysisRequest);

    if (analyzeScenarioComparisonAIBtnEl) analyzeScenarioComparisonAIBtnEl.disabled = true;
    loadSavedScenarios();
}

export function saveCurrentSimulationScenario() {
    const simParams = getCurrentSimulationParameters();
    const simStats = getCurrentSimulationStats();

    if (!simParams || !simStats) {
        alert("Could not retrieve current simulation data to save.");
        return;
    }

    const scenarioName = prompt("Enter a name for this scenario:", `Sim @ T+${simStats.currentSimTime} - ${simStats.totalOrdersDelivered} delivered`);
    if (!scenarioName) {
        if(mainSimulationLogEl) logMessage("Scenario saving cancelled by user.", 'SYSTEM', mainSimulationLogEl, simStats.currentSimTime);
        return;
    }

    const avgDeliveryTime = simStats.totalOrdersDelivered > 0 ? (simStats.sumDeliveryTimes / simStats.totalOrdersDelivered) : null;
    const scenarioData = {
        name: scenarioName,
        timestamp: new Date().toISOString(),
        parameters: { ...simParams },
        results: {
            totalOrdersGenerated: simStats.totalOrdersGenerated,
            totalOrdersDelivered: simStats.totalOrdersDelivered,
            avgDeliveryTime: avgDeliveryTime,
            minDeliveryTime: simStats.allDeliveryTimes.length > 0 ? Math.min(...simStats.allDeliveryTimes) : null,
            maxDeliveryTime: simStats.allDeliveryTimes.length > 0 ? Math.max(...simStats.allDeliveryTimes) : null,
            stdDevDeliveryTime: simStats.allDeliveryTimes.length > 1 && avgDeliveryTime ? calculateStdDev(simStats.allDeliveryTimes, avgDeliveryTime) : null,
            avgOrderWaitTime: simStats.countAssignedOrders > 0 ? (simStats.sumOrderWaitTimes / simStats.countAssignedOrders) : null,
            avgAgentUtilization: parseFloat(document.getElementById('statsAvgAgentUtilization')?.textContent) || null,
            totalSimTime: simStats.currentSimTime,
            totalAgentLaborCost: parseFloat(document.getElementById('statsTotalAgentLaborCost')?.textContent.replace('₹', '')),
            totalTravelCost: parseFloat(document.getElementById('statsTotalTravelCost')?.textContent.replace('₹', '')),
            totalFixedDeliveryCosts: parseFloat(document.getElementById('statsTotalFixedDeliveryCosts')?.textContent.replace('₹', '')),
            overallTotalOperationalCost: parseFloat(document.getElementById('statsOverallTotalOperationalCost')?.textContent.replace('₹', '')),
            averageCostPerOrder: parseFloat(document.getElementById('statsAverageCostPerOrder')?.textContent.replace('₹', '')) || null,
        }
    };

    let scenarios = getSavedScenarios();
    scenarios.push(scenarioData);
    try {
        localStorage.setItem(SCENARIO_STORAGE_KEY, JSON.stringify(scenarios));
        alert(`Scenario "${scenarioName}" saved!`);
        if (document.getElementById('scenarioAnalysis')?.classList.contains('active')) {
            loadSavedScenarios();
        }
    } catch (e) {
        console.error("Error saving scenario to localStorage:", e);
        alert("Failed to save scenario. LocalStorage might be full or disabled.");
    }
}

function getSavedScenarios() {
    try {
        const scenariosJSON = localStorage.getItem(SCENARIO_STORAGE_KEY);
        return scenariosJSON ? JSON.parse(scenariosJSON) : [];
    } catch (e) {
        console.error("Error reading scenarios from localStorage:", e);
        localStorage.removeItem(SCENARIO_STORAGE_KEY);
        return [];
    }
}

export function loadSavedScenarios() {
    if (!savedScenariosListContainerEl) return;
    const scenarios = getSavedScenarios();
    const listUlEl = savedScenariosListContainerEl.querySelector('ul#savedScenariosList');

    if (!listUlEl) return;
    listUlEl.innerHTML = '';
    if (scenarios.length === 0) {
        listUlEl.innerHTML = '<li class="italic text-slate-500">No scenarios saved yet. Click "Save Current Scenario Results" on the Simulation page.</li>';
        return;
    }
    scenarios.forEach((scenario, index) => {
        const li = document.createElement('li');
        li.innerHTML = `
            <label class="flex items-center w-full cursor-pointer p-2 hover:bg-slate-100 rounded-md">
                <input type="checkbox" class="mr-3 scenario-checkbox accent-blue-600" data-scenario-index="${index}">
                <span class="font-medium text-slate-700 flex-grow">${scenario.name}</span>
                <span class="ml-auto text-xs text-slate-500">${new Date(scenario.timestamp).toLocaleString()}</span>
            </label>
        `;
        listUlEl.appendChild(li);
    });
}

function displaySelectedScenarioComparisons() {
    const listUlEl = savedScenariosListContainerEl?.querySelector('ul#savedScenariosList');
    if (!listUlEl) return;

    const selectedCheckboxes = listUlEl.querySelectorAll('.scenario-checkbox:checked');
    if (selectedCheckboxes.length === 0) {
        alert("Please select at least one scenario to compare.");
        if(scenarioComparisonPlaceholderEl) scenarioComparisonPlaceholderEl.classList.remove('hidden');
        if(scenarioComparisonResultsContainerEl) scenarioComparisonResultsContainerEl.classList.add('hidden');
        if(analyzeScenarioComparisonAIBtnEl) analyzeScenarioComparisonAIBtnEl.disabled = true;
        if(scenarioAiAnalysisContainerEl) scenarioAiAnalysisContainerEl.classList.add('hidden');
        currentlyComparedScenarios = [];
        return;
    }

    const allScenarios = getSavedScenarios();
    currentlyComparedScenarios = Array.from(selectedCheckboxes).map(cb => allScenarios[parseInt(cb.dataset.scenarioIndex)]);

    if (!scenarioComparisonResultsContainerEl || !scenarioComparisonTableEl || !scenarioComparisonPlaceholderEl) return;
    scenarioComparisonResultsContainerEl.classList.remove('hidden');
    scenarioComparisonPlaceholderEl.classList.add('hidden');
    if(analyzeScenarioComparisonAIBtnEl) analyzeScenarioComparisonAIBtnEl.disabled = false;
    if(scenarioAiAnalysisContainerEl) scenarioAiAnalysisContainerEl.classList.add('hidden');

    const thead = scenarioComparisonTableEl.tHead;
    const tbody = scenarioComparisonTableEl.tBodies[0];
    if (thead) thead.innerHTML = "";
    if (tbody) tbody.innerHTML = "";

    const metrics = [
        { key: 'name', source: 'scenario', displayName: 'Scenario Name', isParam: true },
        { key: 'numAgents', source: 'parameters', displayName: 'Agents', isParam: true },
        { key: 'currentOrderGenerationProbability', source: 'parameters', displayName: 'Order Gen. Prob.', isParam: true, format: (val) => val !== undefined ? val.toFixed(2) : 'N/A'},
        { key: 'agentMinSpeed', source: 'parameters', displayName: 'Min Speed', isParam: true, unit: 'km/h' },
        { key: 'agentMaxSpeed', source: 'parameters', displayName: 'Max Speed', isParam: true, unit: 'km/h' },
        { key: 'handlingTime', source: 'parameters', displayName: 'Handling Time', isParam: true, unit: 'min' },
        { key: 'orderGenerationProfile', source: 'parameters', displayName: 'Order Profile', isParam: true, format: (val) => typeof val === 'string' ? val.replace('custom_', 'C: ').replace('default_', 'D: ') : val },
        { key: 'baseTrafficFactor', source: 'parameters', displayName: 'Traffic Factor', isParam: true, format: (val) => val !== undefined && val !== null ? val.toFixed(1) + 'x' : 'N/A' },
        { key: 'enableDynamicTraffic', source: 'parameters', displayName: 'Dyn. Traffic', isParam: true, format: (val) => val ? 'Yes' : 'No' },
        { key: 'agentCostPerHour', source: 'parameters', displayName: 'Agent Cost/hr', isParam: true, unit: '₹' },
        { key: 'costPerKmTraveled', source: 'parameters', displayName: 'Cost/km', isParam: true, unit: '₹' },
        { key: 'fixedCostPerDelivery', source: 'parameters', displayName: 'Fixed Cost/Del.', isParam: true, unit: '₹' },
        { key: 'totalSimTime', source: 'results', displayName: 'Sim Runtime', unit: 'min' },
        { key: 'totalOrdersGenerated', source: 'results', displayName: 'Generated Orders' },
        { key: 'totalOrdersDelivered', source: 'results', displayName: 'Delivered Orders' },
        { key: 'avgDeliveryTime', source: 'results', displayName: 'Avg. Del. Time', unit: 'min' },
        { key: 'minDeliveryTime', source: 'results', displayName: 'Min Del. Time', unit: 'min' },
        { key: 'maxDeliveryTime', source: 'results', displayName: 'Max Del. Time', unit: 'min' },
        { key: 'stdDevDeliveryTime', source: 'results', displayName: 'StdDev Del. Time', unit: 'min' },
        { key: 'avgOrderWaitTime', source: 'results', displayName: 'Avg. Wait Time', unit: 'min' },
        { key: 'avgAgentUtilization', source: 'results', displayName: 'Avg. Utilization', unit: '%' },
        { key: 'totalAgentLaborCost', source: 'results', displayName: 'Total Labor Cost', unit: '₹' },
        { key: 'totalTravelCost', source: 'results', displayName: 'Total Travel Cost', unit: '₹' },
        { key: 'totalFixedDeliveryCosts', source: 'results', displayName: 'Total Fixed Costs', unit: '₹' },
        { key: 'overallTotalOperationalCost', source: 'results', displayName: 'Total Op. Cost', unit: '₹' },
        { key: 'averageCostPerOrder', source: 'results', displayName: 'Avg. Cost/Order', unit: '₹' },
    ];

    const headerRow = thead.insertRow();
    const thMetric = document.createElement('th');
    thMetric.textContent = "Metric";
    headerRow.appendChild(thMetric);
    currentlyComparedScenarios.forEach((scenario, index) => {
        const th = document.createElement('th');
        th.textContent = `Scenario ${index + 1}`;
        headerRow.appendChild(th);
    });

    metrics.forEach(metricInfo => {
        const hasMetric = currentlyComparedScenarios.some(scen => {
            if (metricInfo.source === 'scenario') return scen[metricInfo.key] !== undefined && scen[metricInfo.key] !== null;
            return scen[metricInfo.source] && scen[metricInfo.source][metricInfo.key] !== undefined && scen[metricInfo.source][metricInfo.key] !== null;
        });

        if (hasMetric) {
            const row = tbody.insertRow();
            const cellMetricName = row.insertCell();
            cellMetricName.textContent = metricInfo.displayName;
            cellMetricName.style.fontWeight = '500';
            if (metricInfo.isParam) cellMetricName.style.backgroundColor = '#f0f9ff';

            currentlyComparedScenarios.forEach(scenario => {
                const cell = row.insertCell();
                let value;
                if (metricInfo.source === 'scenario') {
                    value = scenario[metricInfo.key];
                } else {
                    value = scenario[metricInfo.source] ? scenario[metricInfo.source][metricInfo.key] : undefined;
                }

                if (value === undefined || value === null) {
                    cell.textContent = "N/A";
                } else {
                    let displayValue = value;
                    if (metricInfo.format) {
                        displayValue = metricInfo.format(value);
                    } else if (typeof value === 'number' && !Number.isInteger(value)) {
                        displayValue = value.toFixed(1);
                    }
                     if (metricInfo.unit && !String(displayValue).includes(metricInfo.unit)) {
                        cell.textContent = `${displayValue} ${metricInfo.unit}`;
                    } else {
                        cell.textContent = displayValue;
                    }
                }
            });
        }
    });
}

function clearAllSavedScenarios() {
    if (confirm("Are you sure you want to delete ALL saved scenarios? This action cannot be undone.")) {
        try {
            localStorage.removeItem(SCENARIO_STORAGE_KEY);
            alert("All scenarios cleared.");
            loadSavedScenarios();
            if(scenarioComparisonPlaceholderEl) scenarioComparisonPlaceholderEl.classList.remove('hidden');
            if(scenarioComparisonResultsContainerEl) scenarioComparisonResultsContainerEl.classList.add('hidden');
            if(analyzeScenarioComparisonAIBtnEl) analyzeScenarioComparisonAIBtnEl.disabled = true;
            if(scenarioAiAnalysisContainerEl) scenarioAiAnalysisContainerEl.classList.add('hidden');
        } catch (e) {
            console.error("Error clearing scenarios from localStorage:", e);
            alert("Failed to clear scenarios.");
        }
    }
}

function prepareComparisonDataForAI(scenarios) {
    if (!scenarios || scenarios.length === 0) return "No scenarios selected for comparison.";
    let dataString = "Comparing the following simulation scenarios:\n\n";
    scenarios.forEach((scenario, index) => {
        dataString += `--- Scenario ${index + 1}: "${scenario.name}" ---\n`;
        dataString += `Agents: ${scenario.parameters.numAgents}\n`;
        dataString += `Order Profile: ${scenario.parameters.orderGenerationProfile.replace('custom_', 'C: ').replace('default_', 'D: ')}\n`;
        dataString += `Avg. Delivery Time: ${scenario.results.avgDeliveryTime?.toFixed(1) ?? 'N/A'} min\n`;
        dataString += `Avg. Cost per Order: ₹${scenario.results.averageCostPerOrder?.toFixed(2) ?? 'N/A'}\n`;
        dataString += `Total Orders Delivered: ${scenario.results.totalOrdersDelivered}\n\n`;
    });
    return dataString;
}

async function handleScenarioAiAnalysisRequest() {
    if (!scenarioAiAnalysisContainerEl || !scenarioAiAnalysisLoadingEl || !scenarioAiAnalysisContentEl) return;
    if (currentlyComparedScenarios.length === 0) {
        scenarioAiAnalysisContentEl.textContent = "Please select and compare at least one scenario first.";
        scenarioAiAnalysisContainerEl.classList.remove('hidden');
        return;
    }
    scenarioAiAnalysisLoadingEl.classList.remove('hidden');
    scenarioAiAnalysisContentEl.textContent = 'Generating AI analysis of scenario comparison...';
    scenarioAiAnalysisContainerEl.classList.remove('hidden');

    const comparisonDataSummary = prepareComparisonDataForAI(currentlyComparedScenarios);
    const prompt = `
        You are a logistics operations analyst. Based on the following summary of different simulation scenarios, provide a concise comparison.
        Your analysis should:
        1.  **Identify the Best Performing Scenario:** Based on a balance of low delivery time and low cost per order, which scenario is the best and why?
        2.  **Analyze Key Trade-offs:** Compare the scenarios. For example, how did adding more agents in Scenario 2 versus Scenario 1 affect costs and delivery times?
        3.  **Provide an Actionable Recommendation:** Conclude with a clear recommendation on which set of parameters (which scenario) the business should adopt and why.
        Keep the analysis professional and directly reference the scenarios by their name or number.

        Scenario Comparison Data:
        ${comparisonDataSummary}
    `;

    try {
        const payload = { contents: [{ role: "user", parts: [{ text: prompt }] }] };
        const apiKey = "AIzaSyDwjlcdDvgre9mLWR7abRx2qta_NFLISuI";
        const modelName = "gemini-2.0-flash";
        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;
        
        const response = await fetch(apiUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        if (!response.ok) {
            throw new Error(`API request failed: ${response.status} ${response.statusText}`);
        }
        const result = await response.json();
        if (result.candidates && result.candidates[0]?.content?.parts[0]?.text) {
            scenarioAiAnalysisContentEl.textContent = result.candidates[0].content.parts[0].text;
        } else {
            scenarioAiAnalysisContentEl.textContent = "Could not retrieve analysis due to an unexpected API response.";
        }
    } catch (error) {
        console.error("Error fetching AI analysis for scenarios:", error);
        scenarioAiAnalysisContentEl.textContent = `Error: ${error.message}.`;
    } finally {
        scenarioAiAnalysisLoadingEl.classList.add('hidden');
    }
}
