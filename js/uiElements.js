// js/uiElements.js
import { chandigarhSectors } from './data/chandigarhData.js';
import {
    updateSimParameters,
    getSimParameter,
    setSimParameter,
    orderGenerationProbabilities,
    orderSpreadFactors
} from './modules/simulation.js'; // Assuming simulation.js exports these

/**
 * Initializes all range sliders in the application.
 * It reads initial values, sets up event listeners to update displayed values,
 * and calls a callback or updates global variables when slider values change.
 */
export function initializeSliders() {
    const slidersConfig = [
        // Simulation Sliders
        { id: 'numAgentsSlider', valueEl: 'numAgentsValue', paramKey: 'numAgents', type: 'direct' },
        { id: 'orderFrequencySlider', valueEl: 'orderFrequencyValue', paramKey: 'orderFrequency', type: 'map', map: {1: "Very Low", 2: "Low", 3: "Medium", 4: "High", 5: "Very High"}, action: (val) => setSimParameter('currentOrderGenerationProbability', orderGenerationProbabilities[val]) },
        { id: 'agentMinSpeedSlider', valueEl: 'agentMinSpeedValue', paramKey: 'agentMinSpeed', type: 'direct', linkedMax: 'agentMaxSpeedSlider', linkedMaxValueEl: 'agentMaxSpeedValue', isMin: true },
        { id: 'agentMaxSpeedSlider', valueEl: 'agentMaxSpeedValue', paramKey: 'agentMaxSpeed', type: 'direct', linkedMin: 'agentMinSpeedSlider', linkedMinValueEl: 'agentMinSpeedValue', isMax: true },
        { id: 'handlingTimeSlider', valueEl: 'handlingTimeValue', paramKey: 'handlingTime', type: 'direct' },
        { id: 'uniformOrderRadiusKmSlider', valueEl: 'uniformOrderRadiusKmValue', paramKey: 'uniformOrderRadiusKm', type: 'directFloat' },
        { id: 'defaultOrderFocusRadiusSlider', valueEl: 'defaultOrderFocusRadiusValue', paramKey: 'defaultFocusRadiusKm', type: 'directFloat' },
        // Old spread slider - kept for completeness but might be deprecated
        { id: 'orderSpreadSlider', valueEl: 'orderSpreadValue', paramKey: 'orderSpreadFactor', type: 'map', map: {1: "Very Close", 2: "Close", 3: "Medium", 4: "Wide", 5: "Very Wide"}, action: (val) => setSimParameter('orderLocationSpreadFactor', orderSpreadFactors[val]) },
    ];

    slidersConfig.forEach(config => {
        const sliderEl = document.getElementById(config.id);
        const valueEl = document.getElementById(config.valueEl);

        if (sliderEl && valueEl) {
            const updateValueDisplay = () => {
                const val = sliderEl.value;
                valueEl.textContent = config.map ? config.map[val] : val;
            };

            const updateLinkedSliders = (currentVal) => {
                if (config.isMin) {
                    const maxSlider = document.getElementById(config.linkedMax);
                    if (maxSlider && parseInt(currentVal) > parseInt(maxSlider.value)) {
                        maxSlider.value = currentVal;
                        document.getElementById(config.linkedMaxValueEl).textContent = currentVal;
                        setSimParameter(slidersConfig.find(s => s.id === config.linkedMax)?.paramKey, parseInt(currentVal));
                    }
                } else if (config.isMax) {
                    const minSlider = document.getElementById(config.linkedMin);
                    if (minSlider && parseInt(currentVal) < parseInt(minSlider.value)) {
                        minSlider.value = currentVal;
                        document.getElementById(config.linkedMinValueEl).textContent = currentVal;
                        setSimParameter(slidersConfig.find(s => s.id === config.linkedMin)?.paramKey, parseInt(currentVal));
                    }
                }
            };

            sliderEl.addEventListener('input', () => {
                const rawValue = sliderEl.value;
                let processedValue;

                updateValueDisplay();

                switch (config.type) {
                    case 'direct':
                        processedValue = parseInt(rawValue);
                        setSimParameter(config.paramKey, processedValue);
                        break;
                    case 'directFloat':
                        processedValue = parseFloat(rawValue);
                        setSimParameter(config.paramKey, processedValue);
                        break;
                    case 'map':
                        // For mapped values, the action usually updates a different parameter
                        if (config.action) {
                            config.action(rawValue); // Action might set a specific sim parameter
                        } else {
                            // If no specific action, store the mapped key or raw value if needed
                            setSimParameter(config.paramKey, rawValue); // Or config.map[rawValue] if the mapped text is the desired value
                        }
                        processedValue = rawValue; // Keep raw value for linked slider logic if any
                        break;
                }
                updateLinkedSliders(processedValue); // Use processed value for linked logic
            });

            // Set initial display and parameter value
            updateValueDisplay();
            let initialValue;
            if (config.type === 'direct') initialValue = parseInt(sliderEl.value);
            else if (config.type === 'directFloat') initialValue = parseFloat(sliderEl.value);
            else if (config.type === 'map' && config.action) config.action(sliderEl.value); // Trigger action for initial map value
            else initialValue = sliderEl.value; // Store raw value for map if no action

            if(config.paramKey && (config.type === 'direct' || config.type === 'directFloat')) {
                setSimParameter(config.paramKey, initialValue);
            }
            // Initial check for linked sliders
            if (config.isMin || config.isMax) {
                updateLinkedSliders(initialValue);
            }
        } else {
            // console.warn(`Slider or value element not found for config:`, config.id);
        }
    });

    // Initialize non-slider input parameters
    const agentCostEl = document.getElementById('agentCostPerHour');
    if (agentCostEl) {
        setSimParameter('agentCostPerHour', parseFloat(agentCostEl.value) || 150);
        agentCostEl.addEventListener('input', (e) => setSimParameter('agentCostPerHour', parseFloat(e.target.value) || 150));
    }
    const costPerKmEl = document.getElementById('costPerKmTraveled');
    if (costPerKmEl) {
        setSimParameter('costPerKmTraveled', parseFloat(costPerKmEl.value) || 5);
        costPerKmEl.addEventListener('input', (e) => setSimParameter('costPerKmTraveled', parseFloat(e.target.value) || 5));
    }
    const fixedCostEl = document.getElementById('fixedCostPerDelivery');
    if (fixedCostEl) {
        setSimParameter('fixedCostPerDelivery', parseFloat(fixedCostEl.value) || 10);
        fixedCostEl.addEventListener('input', (e) => setSimParameter('fixedCostPerDelivery', parseFloat(e.target.value) || 10));
    }
}


/**
 * Populates the list of Chandigarh sector coordinates in the footer.
 */
export function populateSectorCoordinatesList() {
    const sectorCoordsListEl = document.getElementById('sectorCoordinatesList');
    if (!sectorCoordsListEl) return;

    let sectorListHTML = "";
    chandigarhSectors.forEach(sector => {
        sectorListHTML += `${sector.name}: ${sector.lat.toFixed(4)}, ${sector.lng.toFixed(4)}\n`;
    });
    sectorCoordsListEl.textContent = sectorListHTML;
}

/**
 * Toggles the visibility of the sector coordinates container in the footer.
 */
export function toggleSectorCoordinates() {
    const container = document.getElementById('sectorCoordinatesContainer');
    container?.classList.toggle('hidden');
}

/**
 * Updates the display of the current traffic status.
 * @param {number} factor The current traffic factor (e.g., 1.0 for normal, 0.7 for heavy).
 */
export function updateTrafficStatusDisplay(factor) {
    const statusEl = document.getElementById('currentTrafficStatus');
    if (!statusEl) return;

    let condition = "Normal";
    if (factor < 0.9) condition = "Heavy";
    else if (factor > 1.1) condition = "Light";
    statusEl.textContent = `Traffic: ${condition} (${factor.toFixed(1)}x)`;
}

/**
 * Updates the simulation time display.
 * @param {number} time The current simulation time in minutes.
 */
export function updateSimTimeDisplay(time) {
    const displayEl = document.getElementById('simTimeDisplay');
    if (displayEl) {
        displayEl.textContent = time;
    }
}

/**
 * Disables or enables simulation configuration controls.
 * @param {boolean} disable True to disable controls, false to enable.
 */
export function toggleSimConfigLock(disable) {
    const controlIds = [
        'numAgentsSlider', 'orderFrequencySlider', 'agentMinSpeedSlider', 'agentMaxSpeedSlider',
        'handlingTimeSlider', 'orderSpreadSlider', 'uniformOrderRadiusKmSlider',
        'defaultOrderFocusRadiusSlider', 'routeWaypointsSelect', 'manualTrafficControl',
        'enableDynamicTraffic', 'orderGenerationProfileSelect', 'agentCostPerHour',
        'costPerKmTraveled', 'fixedCostPerDelivery'
    ];
    controlIds.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.disabled = disable;
        }
    });
}
