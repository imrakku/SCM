// js/uiElements.js
import { setSimParameter, orderGenerationProbabilities, orderSpreadFactors } from './modules/simulation.js';
import { chandigarhSectors } from './data/chandigarhData.js';

/**
 * Sets up event listeners for all range sliders in the simulation config.
 * Updates the displayed value and the corresponding simulation parameter on input.
 */
export function initializeSliders() {
    const sliderConfigs = [
        { sliderId: 'numAgentsSlider', valueId: 'numAgentsValue', paramKey: 'numAgents', type: 'int' },
        { sliderId: 'agentMinSpeedSlider', valueId: 'agentMinSpeedValue', paramKey: 'agentMinSpeed', type: 'int' },
        { sliderId: 'agentMaxSpeedSlider', valueId: 'agentMaxSpeedValue', paramKey: 'agentMaxSpeed', type: 'int' },
        { sliderId: 'handlingTimeSlider', valueId: 'handlingTimeValue', paramKey: 'handlingTime', type: 'int' },
        { sliderId: 'defaultOrderFocusRadiusSlider', valueId: 'defaultOrderFocusRadiusValue', paramKey: 'defaultFocusRadiusKm', type: 'float' },
        {
            sliderId: 'orderFrequencySlider',
            valueId: 'orderFrequencyValue',
            paramKey: 'currentOrderGenerationProbability',
            type: 'map',
            valueMap: { 1: "V.Low", 2: "Low", 3: "Medium", 4: "High", 5: "V.High" },
            paramMap: orderGenerationProbabilities
        },
        {
            sliderId: 'orderSpreadSlider',
            valueId: 'orderSpreadValue',
            paramKey: 'orderLocationSpreadFactor',
            type: 'map',
            valueMap: { 1: "Tight", 2: "Close", 3: "Medium", 4: "Wide", 5: "V.Wide" },
            paramMap: orderSpreadFactors
        }
    ];

    sliderConfigs.forEach(config => {
        const slider = document.getElementById(config.sliderId);
        const valueDisplay = document.getElementById(config.valueId);

        if (slider && valueDisplay) {
            const updateFunction = () => {
                const value = slider.value;
                // Update display
                valueDisplay.textContent = config.valueMap ? config.valueMap[value] : value;
                
                // Update simulation parameter
                let paramValue;
                if (config.type === 'int') {
                    paramValue = parseInt(value, 10);
                } else if (config.type === 'float') {
                    paramValue = parseFloat(value);
                } else if (config.type === 'map' && config.paramMap) {
                    paramValue = config.paramMap[value];
                } else {
                    paramValue = value;
                }
                setSimParameter(config.paramKey, paramValue);
            };

            slider.addEventListener('input', updateFunction);
            // Initial call to set values on load
            updateFunction();
        }
    });
}


/**
 * Populates the pre-formatted list of Chandigarh sector coordinates in the footer.
 */
export function populateSectorCoordinatesList() {
    const listEl = document.getElementById('sectorCoordinatesList');
    if (listEl) {
        listEl.textContent = chandigarhSectors.map(s => `${s.name}: { lat: ${s.lat}, lng: ${s.lng} }`).join('\n');
    }
}

/**
 * Toggles the visibility of the sector coordinates container in the footer.
 */
export function toggleSectorCoordinates() {
    const container = document.getElementById('sectorCoordinatesContainer');
    container?.classList.toggle('hidden');
}


/**
 * Updates the traffic status display in the simulation UI.
 * @param {number} factor The current traffic factor.
 */
export function updateTrafficStatusDisplay(factor) {
    const statusEl = document.getElementById('currentTrafficStatus');
    if (!statusEl) return;

    let statusText = `Normal (x${factor.toFixed(1)})`;
    if (factor > 1.1) statusText = `Light (x${factor.toFixed(1)})`;
    if (factor < 0.9) statusText = `Heavy (x${factor.toFixed(1)})`;
    
    statusEl.textContent = `Traffic: ${statusText}`;
}

/**
 * Updates the main simulation time display.
 * @param {number} time The current simulation time in minutes.
 */
export function updateSimTimeDisplay(time) {
    const timeDisplay = document.getElementById('simTimeDisplay');
    if (timeDisplay) {
        timeDisplay.textContent = time;
    }
}

/**
 * Disables or enables simulation configuration controls.
 * @param {boolean} lock True to disable controls, false to enable.
 */
export function toggleSimConfigLock(lock) {
    const controls = document.querySelectorAll('.simulation-controls-grid input, .simulation-controls-grid select');
    controls.forEach(control => {
        control.disabled = lock;
    });
}
