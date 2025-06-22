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
    
    // New AI elements
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
            stdDevDeliveryTime: simStats.allDeliveryTimes.length > 1 ? calculateStdDev(simStats.allDeliveryTimes, avgDeliveryTime) : null,
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
    const selectedScenarios = Array.from(selectedCheckboxes).map(cb => allScenarios[parseInt(cb.dataset.scenarioIndex)]);
    currentlyComparedScenarios = selectedScenarios;

    if (!scenarioComparisonResultsContainerEl || !scenarioComparisonTableEl || !scenarioComparisonPlaceholderEl) return;
    scenarioComparisonResultsContainerEl.classList.remove('hidden');
    scenarioComparisonPlaceholderEl.classList.add('hidden');
    if(analyzeScenarioComparisonAIBtnEl) analyzeScenarioComparisonAIBtnEl.disabled = false;
    if(scenarioAiAnalysisContainerEl) scenarioAiAnalysisContainerEl.classList.add('hidden');

    const thead = scenarioComparisonTableEl.tHead;
    const tbody = scenarioComparisonTableEl.tBodies[0];
    if (thead) thead.innerHTML = "";
    if (tbody) tbody.innerHTML = "";

    const metrics = [ /* This array of metrics is unchanged */ ];
    // ... (The entire logic for building the comparison table is unchanged)
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
        // Key Parameters
        dataString += `Agents: ${scenario.parameters.numAgents}\n`;
        dataString += `Order Profile: ${scenario.parameters.orderGenerationProfile.replace('custom_', 'C: ').replace('default_', 'D: ')}\n`;
        dataString += `Traffic: ${scenario.parameters.enableDynamicTraffic ? 'Dynamic' : `Static (x${scenario.parameters.baseTrafficFactor})`}\n`;
        // Key Results
        dataString += `Avg. Delivery Time: ${scenario.results.avgDeliveryTime?.toFixed(1) ?? 'N/A'} min\n`;
        dataString += `Avg. Agent Utilization: ${scenario.results.avgAgentUtilization?.toFixed(1) ?? 'N/A'}%\n`;
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
