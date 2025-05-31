// js/uiElements.js
import { setSimParameter } from './modules/simulation.js'; // This import is correct and needed
// REMOVED: import { orderGenerationProbabilities, orderSpreadFactors } from './modules/simulation.js'; // THIS LINE WAS THE ERROR
import { chandigarhSectors } from '../data/chandigarhData.js';

// Cache DOM elements that are relatively static
const simTimeDisplaySpan = document.getElementById('simTimeDisplay');
const currentTrafficStatusSpan = document.getElementById('currentTrafficStatus');

const sliderConfig = [
    { sliderId: 'numAgentsSlider', displayId: 'numAgentsValue', paramKey: 'numAgents', defaultVal: 10 },
    { sliderId: 'agentMinSpeedSlider', displayId: 'agentMinSpeedValue', paramKey: 'agentMinSpeed', defaultVal: 20 },
    { sliderId: 'agentMaxSpeedSlider', displayId: 'agentMaxSpeedValue', paramKey: 'agentMaxSpeed', defaultVal: 30 },
    { sliderId: 'handlingTimeSlider', displayId: 'handlingTimeValue', paramKey: 'handlingTime', defaultVal: 5 },
    { sliderId: 'uniformOrderRadiusKmSlider', displayId: 'uniformOrderRadiusKmValue', paramKey: 'uniformOrderRadiusKm', isFloat: true, defaultVal: 5 },
    { sliderId: 'defaultOrderFocusRadiusSlider', displayId: 'defaultOrderFocusRadiusValue', paramKey: 'defaultFocusRadiusKm', isFloat: true, defaultVal: 3 },
];

export function initializeSliders() {
    console.log("[UI] Initializing sliders...");
    sliderConfig.forEach(config => {
        const slider = document.getElementById(config.sliderId);
        const display = document.getElementById(config.displayId);
        if (slider && display) {
            // Set slider to default if not already matching simParams (which should be set by now)
            // This is more for visual consistency if HTML defaults differ from JS defaults.
            // The actual simParam is set in simulation.js's resetSimulationState.
            slider.value = config.defaultVal; 
            updateSliderValueDisplay(slider, display, config.isFloat);
            
            slider.addEventListener('input', () => {
                updateSliderValueDisplay(slider, display, config.isFloat);
                if (typeof setSimParameter === 'function') { 
                    const value = config.isFloat ? parseFloat(slider.value) : parseInt(slider.value);
                    setSimParameter(config.paramKey, value);
                } else {
                    console.error("[UI] setSimParameter function not found in simulation.js");
                }
            });
        } else {
            console.warn(`[UI] Slider or display element not found for config:`, config.sliderId, config.displayId);
        }
    });

    const ordersPerMinuteInputEl = document.getElementById('ordersPerMinuteInput');
    if (ordersPerMinuteInputEl) {
        // Initial value for ordersPerMinute is set in simulation.js's simParams and resetSimulationState
        // This listener just updates it on change.
        ordersPerMinuteInputEl.addEventListener('change', () => {
            let value = parseFloat(ordersPerMinuteInputEl.value);
            if (isNaN(value) || value <= 0) {
                value = 0.5; // Default to a small positive if invalid input
                ordersPerMinuteInputEl.value = value.toString();
            }
            if (typeof setSimParameter === 'function') {
                setSimParameter('ordersPerMinute', value);
            }
        });
    } else {
        console.warn("[UI] ordersPerMinuteInput element not found.");
    }
}

function updateSliderValueDisplay(slider, displayElement, isFloat = false) {
    let value = isFloat ? parseFloat(slider.value).toFixed(1) : slider.value;
    displayElement.textContent = value;
}


export function populateSectorCoordinatesList() {
    const listElement = document.getElementById('sectorCoordinatesList');
    if (listElement) {
        listElement.innerHTML = chandigarhSectors.map(sector => 
            `Sector ${sector.name}: Lat ${sector.lat.toFixed(4)}, Lng ${sector.lng.toFixed(4)}`
        ).join('\n');
    }
}

export function toggleSectorCoordinates() {
    const container = document.getElementById('sectorCoordinatesContainer');
    if (container) {
        container.classList.toggle('hidden');
    }
}

export function updateTrafficStatusDisplay(factor) {
    if (currentTrafficStatusSpan) {
        let statusText = "Normal";
        if (factor < 0.85) statusText = "Heavy";
        else if (factor > 1.15) statusText = "Light";
        currentTrafficStatusSpan.textContent = `Traffic: ${statusText} (${factor.toFixed(1)}x)`;
    }
}

export function updateSimTimeDisplay(time) {
    if (simTimeDisplaySpan) {
        simTimeDisplaySpan.textContent = time;
    }
}

export function toggleSimConfigLock(lock) {
    const inputsToToggle = [
        ...sliderConfig.map(c => c.sliderId), 
        'orderGenerationProfileSelect', 'routeWaypointsSelect', 
        'manualTrafficControl', 'enableDynamicTraffic',
        'agentCostPerHour', 'costPerKmTraveled', 'fixedCostPerDelivery',
        'ordersPerMinuteInput', 

        'optTargetDeliveryTime', 'optSelectDarkStore', 'optDemandProfileSelect',
        'optOrderGenerationRadius', 'optTargetOrdersPerIteration',
        'optMinAgents', 'optMaxAgents', 'optNumRunsPerAgentCount', 'optMaxSimTimePerIteration',
        'optAgentMinSpeed', 'optAgentMaxSpeed', 'optHandlingTime', 
        'optRouteWaypoints', 'optBaseTrafficFactor', 'optEnableDynamicTraffic',
        'optOrdersPerMinute'
    ];

    inputsToToggle.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.disabled = lock;
        }
    });

    const clusteringBtn = document.getElementById('regenerateClusteringBtn');
    const demandProfileSaveBtn = document.getElementById('saveProfileBtn');
    const workforceOptRunBtn = document.getElementById('runOptimizationBtn');

    if(clusteringBtn) clusteringBtn.disabled = lock;
    if(demandProfileSaveBtn) demandProfileSaveBtn.disabled = lock;
    if(workforceOptRunBtn) workforceOptRunBtn.disabled = lock;
}
