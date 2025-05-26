// js/uiElements.js
import { chandigarhSectors } from './data/chandigarhData.js';
import {
    // updateSimParameters, // This was the problematic import, now removed
    getSimParameter,
    setSimParameter,
    orderGenerationProbabilities, // Assuming this is exported by simulation.js
    orderSpreadFactors // Assuming this is exported by simulation.js
} from './modules/simulation.js';

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

            const updateLinkedSliders = (currentValStr) => {
                // Ensure currentVal is parsed correctly based on slider type
                const currentVal = (config.type === 'directFloat' || config.id.includes('Km')) ? parseFloat(currentValStr) : parseInt(currentValStr);

                if (config.isMin) {
                    const maxSlider = document.getElementById(config.linkedMax);
                    if (maxSlider) {
                        const maxSliderVal = (slidersConfig.find(s => s.id === config.linkedMax)?.type === 'directFloat' || config.linkedMax.includes('Km')) ? parseFloat(maxSlider.value) : parseInt(maxSlider.value);
                        if (currentVal > maxSliderVal) {
                            maxSlider.value = currentValStr; // Keep as string for slider value
                            document.getElementById(config.linkedMaxValueEl).textContent = currentValStr;
                            setSimParameter(slidersConfig.find(s => s.id === config.linkedMax)?.paramKey, currentVal);
                        }
                    }
                } else if (config.isMax) {
                    const minSlider = document.getElementById(config.linkedMin);
                    if (minSlider) {
                         const minSliderVal = (slidersConfig.find(s => s.id === config.linkedMin)?.type === 'directFloat' || config.linkedMin.includes('Km')) ? parseFloat(minSlider.value) : parseInt(minSlider.value);
                        if (currentVal < minSliderVal) {
                            minSlider.value = currentValStr; // Keep as string for slider value
                            document.getElementById(config.linkedMinValueEl).textContent = currentValStr;
                            setSimParameter(slidersConfig.find(s => s.id === config.linkedMin)?.paramKey, currentVal);
                        }
                    }
                }
            };


            sliderEl.addEventListener('input', () => {
                const rawValue = sliderEl.value; // This is always a string
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
                        if (config.action) {
                            config.action(rawValue);
                        } else {
                            setSimParameter(config.paramKey, rawValue);
                        }
                        // For linked slider logic, we still need a numerical representation if applicable
                        // This part might need adjustment based on what 'rawValue' represents for 'map' type
                        processedValue = parseInt(rawValue); // Assuming rawValue for map is index-like
                        break;
                    default:
                        processedValue = rawValue; // Fallback
                }
                updateLinkedSliders(rawValue); // Pass raw string value, parsing happens inside updateLinkedSliders
            });

            // Set initial display and parameter value
            updateValueDisplay();
            let initialValueForParam;
            const currentSliderValue = sliderEl.value;

            if (config.type === 'direct') initialValueForParam = parseInt(currentSliderValue);
            else if (config.type === 'directFloat') initialValueForParam = parseFloat(currentSliderValue);
            else if (config.type === 'map' && config.action) {
                config.action(currentSliderValue); // Action sets the specific param
                initialValueForParam = null; // Action handles it
            }
            else initialValueForParam = currentSliderValue;

            if(config.paramKey && initialValueForParam !== null) { // Check if action already handled it
                setSimParameter(config.paramKey, initialValueForParam);
            }
            // Initial check for linked sliders
            if (config.isMin || config.isMax) {
                updateLinkedSliders(currentSliderValue);
            }
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
