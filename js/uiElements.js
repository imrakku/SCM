// js/uiElements.js
import { setSimParameter } from './modules/simulation.js'; // This import is fine and needed
// REMOVED: import { orderGenerationProbabilities, orderSpreadFactors } from './modules/simulation.js'; // This line was causing the error
import { chandigarhSectors } from './data/chandigarhData.js';

// Cache DOM elements that are relatively static
const simTimeDisplaySpan = document.getElementById('simTimeDisplay');
const currentTrafficStatusSpan = document.getElementById('currentTrafficStatus');
const configLockOverlay = document.getElementById('configLockOverlay'); 
const configLockMessage = document.getElementById('configLockMessage'); 

const sliderConfig = [
    { sliderId: 'numAgentsSlider', displayId: 'numAgentsValue', paramKey: 'numAgents' },
    { sliderId: 'agentMinSpeedSlider', displayId: 'agentMinSpeedValue', paramKey: 'agentMinSpeed' },
    { sliderId: 'agentMaxSpeedSlider', displayId: 'agentMaxSpeedValue', paramKey: 'agentMaxSpeed' },
    { sliderId: 'handlingTimeSlider', displayId: 'handlingTimeValue', paramKey: 'handlingTime' },
    { sliderId: 'uniformOrderRadiusKmSlider', displayId: 'uniformOrderRadiusKmValue', paramKey: 'uniformOrderRadiusKm', isFloat: true },
    { sliderId: 'defaultOrderFocusRadiusSlider', displayId: 'defaultOrderFocusRadiusValue', paramKey: 'defaultFocusRadiusKm', isFloat: true },
];

export function initializeSliders() {
    sliderConfig.forEach(config => {
        const slider = document.getElementById(config.sliderId);
        const display = document.getElementById(config.displayId);
        if (slider && display) {
            updateSliderValueDisplay(slider, display, config.isFloat); // Removed paramKey as it's not used for display mapping now
            
            slider.addEventListener('input', () => {
                updateSliderValueDisplay(slider, display, config.isFloat);
                if (typeof setSimParameter === 'function') { 
                    const value = config.isFloat ? parseFloat(slider.value) : parseInt(slider.value);
                    setSimParameter(config.paramKey, value);
                }
            });
        } else {
            // console.warn(`Slider or display element not found for config:`, config.sliderId, config.displayId);
        }
    });

    const ordersPerMinuteInputEl = document.getElementById('ordersPerMinuteInput');
    if (ordersPerMinuteInputEl) {
        // Set initial simParam from this input's default value
        if (typeof setSimParameter === 'function') {
             let initialValue = parseFloat(ordersPerMinuteInputEl.value);
             if (isNaN(initialValue) || initialValue <= 0) {
                initialValue = 0.5; // Default if HTML value is bad
                ordersPerMinuteInputEl.value = initialValue;
             }
             setSimParameter('ordersPerMinute', initialValue);
        }
        // Add event listener for changes
        ordersPerMinuteInputEl.addEventListener('change', () => {
            let value = parseFloat(ordersPerMinuteInputEl.value);
            if (isNaN(value) || value <= 0) {
                value = 0.1; 
                ordersPerMinuteInputEl.value = value;
            }
            if (typeof setSimParameter === 'function') {
                setSimParameter('ordersPerMinute', value);
            }
        });
    }
}

// paramKey is no longer needed here as we are not doing specific text mapping for sliders like "Low/Medium/High"
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
