// js/uiElements.js
import { setSimParameter } from './modules/simulation.js'; // Used for setting sim params from sliders
import { orderGenerationProbabilities, orderSpreadFactors } from './modules/simulation.js'; // Import constants
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
    // The orderFrequencySlider is removed as it's replaced by a direct number input.
    // The orderSpreadSlider was also removed as it was part of a less direct order generation approach.
];

export function initializeSliders() {
    sliderConfig.forEach(config => {
        const slider = document.getElementById(config.sliderId);
        const display = document.getElementById(config.displayId);
        if (slider && display) {
            // Set initial display value
            updateSliderValueDisplay(slider, display, config.paramKey, config.isFloat);
            
            // Add event listener
            slider.addEventListener('input', () => {
                updateSliderValueDisplay(slider, display, config.paramKey, config.isFloat);
                if (typeof setSimParameter === 'function') { // Ensure setSimParameter is available
                    const value = config.isFloat ? parseFloat(slider.value) : parseInt(slider.value);
                    setSimParameter(config.paramKey, value);
                }
            });
        } else {
            // console.warn(`Slider or display element not found for config:`, config);
        }
    });

    // Event listener for the new ordersPerMinuteInput
    const ordersPerMinuteInputEl = document.getElementById('ordersPerMinuteInput');
    if (ordersPerMinuteInputEl) {
        ordersPerMinuteInputEl.addEventListener('change', () => {
            let value = parseFloat(ordersPerMinuteInputEl.value);
            if (isNaN(value) || value <= 0) {
                value = 0.1; // Default to a small positive if invalid
                ordersPerMinuteInputEl.value = value;
            }
            if (typeof setSimParameter === 'function') {
                setSimParameter('ordersPerMinute', value);
            }
        });
        // Set initial simParam from this input
        if (typeof setSimParameter === 'function') {
             let initialValue = parseFloat(ordersPerMinuteInputEl.value);
             if (isNaN(initialValue) || initialValue <= 0) initialValue = 0.5;
             setSimParameter('ordersPerMinute', initialValue);
        }
    }
}

function updateSliderValueDisplay(slider, displayElement, paramKey, isFloat = false) {
    let value = isFloat ? parseFloat(slider.value).toFixed(1) : slider.value;
    
    // Specific formatting for certain sliders can be handled here if needed in the future
    // For now, direct value display is fine for most.
    // The orderFrequencySlider and orderSpreadSlider logic is removed.

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
    if (configLockOverlay && configLockMessage) {
        if (lock) {
            configLockOverlay.classList.remove('hidden');
            configLockMessage.classList.remove('hidden');
        } else {
            configLockOverlay.classList.add('hidden');
            configLockMessage.classList.add('hidden');
        }
    }
    // Disable/enable all relevant input controls
    const inputsToToggle = [
        ...sliderConfig.map(c => c.sliderId),
        'orderGenerationProfileSelect', 'routeWaypointsSelect', 
        'manualTrafficControl', 'enableDynamicTraffic',
        'agentCostPerHour', 'costPerKmTraveled', 'fixedCostPerDelivery',
        'ordersPerMinuteInput' // Add the new input here
    ];

    inputsToToggle.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.disabled = lock;
        }
    });
}
