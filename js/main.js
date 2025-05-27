// js/main.js
import { setupNavigation } from './navigation.js';
import { initializeSliders, populateSectorCoordinatesList, toggleSectorCoordinates } from './uiElements.js';
import { initializeThemeSwitcher } from './themeSwitcher.js'; // <-- ADD THIS IMPORT

document.addEventListener('DOMContentLoaded', () => {
    initializeThemeSwitcher(); // <-- CALL THIS FIRST to set theme before other initializations
    
    initializeSliders(); 
    populateSectorCoordinatesList();
    const toggleBtn = document.getElementById('toggleSectorCoordsBtn');
    if (toggleBtn) {
        toggleBtn.addEventListener('click', toggleSectorCoordinates);
    }

    const currentYearEl = document.getElementById('currentYear');
    if (currentYearEl) currentYearEl.textContent = new Date().getFullYear();

    setupNavigation();
    console.log("Chandigarh Logistics Sim Initialized (with Theme Switcher)");
});
