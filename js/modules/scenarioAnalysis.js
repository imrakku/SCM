// js/modules/scenarioAnalysis.js
import { logMessage } from '../logger.js';
import { getCurrentSimulationParameters, getCurrentSimulationStats } from './simulation.js';
import { calculateStdDev } from '../chartUtils.js'; // For stats calculation if needed here

const SCENARIO_STORAGE_KEY = 'chandigarhLogisticsScenarios';

// DOM Elements
let savedScenariosListContainerEl, compareSelectedScenariosBtnEl, clearAllScenariosBtnEl,
    scenarioComparisonResultsContainerEl, scenarioComparisonTableEl, scenarioComparisonPlaceholderEl,
    mainSimulationLogEl;

/**
 * Initializes the Scenario Analysis section.
 */
export function initializeScenarioAnalysisSection() {
    savedScenariosListContainerEl = document.getElementById('savedScenariosListContainer');
    compareSelectedScenariosBtnEl = document.getElementById('compareSelectedScenariosBtn');
    clearAllScenariosBtnEl = document.getElementById('clearAllScenariosBtn');
    scenarioComparisonResultsContainerEl = document.getElementById('scenarioComparisonResultsContainer');
    scenarioComparisonTableEl = document.getElementById('scenarioComparisonTable');
    scenarioComparisonPlaceholderEl = document.getElementById('scenarioComparisonPlaceholder');
    mainSimulationLogEl = document.getElementById('simulationLog'); // Use main sim log for scenario save/clear messages

    // Event Listeners for buttons within this section
    compareSelectedScenariosBtnEl?.addEventListener('click', displaySelectedScenarioComparisons);
    clearAllScenariosBtnEl?.addEventListener('click', clearAllSavedScenarios);

    // The listener for 'saveCurrentSimScenarioBtn' is now in simulation.js
    // as the button is part of the Simulation section's UI.

    loadSavedScenarios(); // Load and display any existing scenarios
}

/**
 * Saves the current state of the main simulation as a new scenario.
 * This function is EXPORTED to be called from simulation.js
 */
export function saveCurrentSimulationScenario() {
    const simParams = getCurrentSimulationParameters();
    const simStats = getCurrentSimulationStats();

    if (!simParams || !simStats) {
        alert("Could not retrieve current simulation data to save.");
        // Log to the main simulation log if available
        if(mainSimulationLogEl) logMessage("Failed to retrieve simulation data for saving scenario.", 'SYS_ERROR', mainSimulationLogEl, simStats?.currentSimTime);
        return;
    }

    const scenarioName = prompt("Enter a name for this scenario:", `Sim @ T+${simStats.currentSimTime} - ${simStats.totalOrdersDelivered} delivered`);
    if (!scenarioName) {
        if(mainSimulationLogEl) logMessage("Scenario saving cancelled by user.", 'SYSTEM', mainSimulationLogEl, simStats.currentSimTime);
        return;
    }

    const scenarioData = {
        name: scenarioName,
        timestamp: new Date().toISOString(),
        parameters: { ...simParams },
        results: {
            totalOrdersGenerated: simStats.totalOrdersGenerated,
            totalOrdersDelivered: simStats.totalOrdersDelivered,
            avgDeliveryTime: simStats.totalOrdersDelivered > 0 ? parseFloat((simStats.sumDeliveryTimes / simStats.totalOrdersDelivered).toFixed(1)) : null,
            minDeliveryTime: simStats.allDeliveryTimes.length > 0 ? parseFloat(Math.min(...simStats.allDeliveryTimes).toFixed(1)) : null,
            maxDeliveryTime: simStats.allDeliveryTimes.length > 0 ? parseFloat(Math.max(...simStats.allDeliveryTimes).toFixed(1)) : null,
            stdDevDeliveryTime: simStats.allDeliveryTimes.length > 1 && simStats.totalOrdersDelivered > 0 ? parseFloat(calculateStdDev(simStats.allDeliveryTimes, (simStats.sumDeliveryTimes / simStats.totalOrdersDelivered)).toFixed(1)) : null,
            avgOrderWaitTime: simStats.countAssignedOrders > 0 ? parseFloat((simStats.sumOrderWaitTimes / simStats.countAssignedOrders).toFixed(1)) : null,
            avgAgentUtilization: parseFloat(document.getElementById('statsAvgAgentUtilization')?.textContent) || null,
            totalSimTime: simStats.currentSimTime,
            totalAgentLaborCost: parseFloat(document.getElementById('statsTotalAgentLaborCost')?.textContent.replace('₹', '')) || 0,
            totalTravelCost: parseFloat(document.getElementById('statsTotalTravelCost')?.textContent.replace('₹', '')) || 0,
            totalFixedDeliveryCosts: parseFloat(document.getElementById('statsTotalFixedDeliveryCosts')?.textContent.replace('₹', '')) || 0,
            overallTotalOperationalCost: parseFloat(document.getElementById('statsOverallTotalOperationalCost')?.textContent.replace('₹', '')) || 0,
            averageCostPerOrder: parseFloat(document.getElementById('statsAverageCostPerOrder')?.textContent.replace('₹', '')) || null,
        }
    };

    const activeProfile = scenarioData.parameters.orderGenerationProfile;
    if (activeProfile !== 'default_uniform') {
        delete scenarioData.parameters.uniformOrderRadiusKm;
        delete scenarioData.parameters.orderLocationSpreadFactor;
    }
    if (activeProfile !== 'default_focused') {
        delete scenarioData.parameters.defaultFocusRadiusKm;
    }
    if (activeProfile && activeProfile.startsWith('custom_')) {
         delete scenarioData.parameters.uniformOrderRadiusKm;
         delete scenarioData.parameters.orderLocationSpreadFactor;
         delete scenarioData.parameters.defaultFocusRadiusKm;
    }

    let scenarios = getSavedScenarios();
    scenarios.push(scenarioData);
    try {
        localStorage.setItem(SCENARIO_STORAGE_KEY, JSON.stringify(scenarios));
        alert(`Scenario "${scenarioName}" saved!`);
        if(mainSimulationLogEl) logMessage(`Scenario "${scenarioName}" saved.`, 'SCENARIO_SAVE', mainSimulationLogEl, simStats.currentSimTime);
        if (document.getElementById('scenarioAnalysis')?.classList.contains('active')) {
            loadSavedScenarios();
        }
    } catch (e) {
        console.error("Error saving scenario to localStorage:", e);
        alert("Failed to save scenario. LocalStorage might be full or disabled.");
        if(mainSimulationLogEl) logMessage(`Error saving scenario: ${e.message}`, 'SYS_ERROR', mainSimulationLogEl, simStats.currentSimTime);
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

    if (!listUlEl) {
        console.error("UL element for saved scenarios not found inside the container.");
        return;
    }
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
        return;
    }

    const allScenarios = getSavedScenarios();
    const selectedScenarios = Array.from(selectedCheckboxes).map(cb => allScenarios[parseInt(cb.dataset.scenarioIndex)]);

    if (!scenarioComparisonResultsContainerEl || !scenarioComparisonTableEl || !scenarioComparisonPlaceholderEl) return;

    scenarioComparisonResultsContainerEl.classList.remove('hidden');
    scenarioComparisonPlaceholderEl.classList.add('hidden');

    const thead = scenarioComparisonTableEl.tHead;
    const tbody = scenarioComparisonTableEl.tBodies[0];
    if (thead) thead.innerHTML = "";
    if (tbody) tbody.innerHTML = "";

    const metrics = [
        { key: 'name', source: 'scenario', displayName: 'Scenario Name', isParam: true },
        { key: 'numAgents', source: 'parameters', displayName: 'Agents', isParam: true },
        { key: 'orderFrequency', source: 'parameters', displayName: 'Order Freq. Setting', isParam: true, map: {1: "V.Low", 2: "Low", 3: "Med", 4: "High", 5: "V.High"} },
        { key: 'currentOrderGenerationProbability', source: 'parameters', displayName: 'Order Gen. Prob.', isParam: true, format: (val) => val !== undefined ? val.toFixed(2) : 'N/A'},
        { key: 'agentMinSpeed', source: 'parameters', displayName: 'Min Speed', isParam: true, unit: 'km/h' },
        { key: 'agentMaxSpeed', source: 'parameters', displayName: 'Max Speed', isParam: true, unit: 'km/h' },
        { key: 'handlingTime', source: 'parameters', displayName: 'Handling Time', isParam: true, unit: 'min' },
        { key: 'orderGenerationProfile', source: 'parameters', displayName: 'Order Profile', isParam: true, format: (val) => typeof val === 'string' ? val.replace('custom_', 'C: ').replace('default_', 'D: ') : val },
        { key: 'uniformOrderRadiusKm', source: 'parameters', displayName: 'Uniform Radius (D)', isParam: true, unit: 'km' },
        { key: 'defaultFocusRadiusKm', source: 'parameters', displayName: 'Focus Radius (D)', isParam: true, unit: 'km' },
        { key: 'routeWaypoints', source: 'parameters', displayName: 'Route Waypoints', isParam: true },
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
    selectedScenarios.forEach((scenario, index) => {
        const th = document.createElement('th');
        th.textContent = `Scenario ${index + 1}`;
        headerRow.appendChild(th);
    });

    metrics.forEach(metricInfo => {
        const hasMetric = selectedScenarios.some(scen => {
            if (metricInfo.source === 'scenario') return scen[metricInfo.key] !== undefined;
            return scen[metricInfo.source] && scen[metricInfo.source][metricInfo.key] !== undefined;
        });

        if (metricInfo.key === 'name' || hasMetric) {
            const row = tbody.insertRow();
            const cellMetricName = row.insertCell();
            cellMetricName.textContent = metricInfo.displayName;
            cellMetricName.style.fontWeight = '500';
            if (metricInfo.isParam) cellMetricName.style.backgroundColor = '#f0f9ff';

            selectedScenarios.forEach(scenario => {
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
                    } else if (metricInfo.map && metricInfo.map.hasOwnProperty(value)) {
                        displayValue = metricInfo.map[value];
                    } else if (typeof value === 'number' && !Number.isInteger(value) && !metricInfo.displayName.toLowerCase().includes('prob')) {
                        if (metricInfo.unit === '₹') displayValue = value.toFixed(2);
                        else if (metricInfo.unit !== '%') displayValue = value.toFixed(1);
                        else displayValue = value.toFixed(1);
                    }
                    const unitAlreadyPresent = typeof displayValue === 'string' && metricInfo.unit && displayValue.endsWith(metricInfo.unit);
                    cell.textContent = displayValue + (metricInfo.unit && displayValue !== "N/A" && typeof displayValue !== 'boolean' && !unitAlreadyPresent ? ` ${metricInfo.unit}` : "");
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
            if(mainSimulationLogEl) logMessage("All scenarios cleared.", 'SCENARIO_CLEAR', mainSimulationLogEl);
            loadSavedScenarios();
            if(scenarioComparisonPlaceholderEl) scenarioComparisonPlaceholderEl.classList.remove('hidden');
            if(scenarioComparisonResultsContainerEl) scenarioComparisonResultsContainerEl.classList.add('hidden');
        } catch (e) {
            console.error("Error clearing scenarios from localStorage:", e);
            alert("Failed to clear scenarios.");
        }
    }
}
