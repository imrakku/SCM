// js/main.js
import { setupNavigation } from './navigation.js';
import { initializeSliders, populateSectorCoordinatesList, toggleSectorCoordinates } from './uiElements.js';
// Note: Section-specific initializations are now called by showSection in navigation.js

document.addEventListener('DOMContentLoaded', () => {
    // Initialize general UI elements that are always present
    initializeSliders(); // This will set up all sliders and their initial param values
    populateSectorCoordinatesList();
    document.getElementById('toggleSectorCoordsBtn')?.addEventListener('click', toggleSectorCoordinates);

    const currentYearEl = document.getElementById('currentYear');
    if (currentYearEl) currentYearEl.textContent = new Date().getFullYear();

    // Setup navigation, which will also handle initial section display and
    // trigger section-specific initializations (like maps) as needed.
    setupNavigation();

    // Any other global setup can go here.
    console.log("Chandigarh Logistics Sim Initialized");
});
