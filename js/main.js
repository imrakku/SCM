// js/main.js
import { setupNavigation } from './navigation.js';
import { initializeSliders, populateSectorCoordinatesList, toggleSectorCoordinates } from './uiElements.js';
// No theme switcher import

document.addEventListener('DOMContentLoaded', () => {
    // Initialize sliders and other static UI elements first
    initializeSliders(); 
    populateSectorCoordinatesList();
    const toggleBtn = document.getElementById('toggleSectorCoordsBtn');
    if (toggleBtn) {
        toggleBtn.addEventListener('click', toggleSectorCoordinates);
    }

    const currentYearEl = document.getElementById('currentYear');
    if (currentYearEl) currentYearEl.textContent = new Date().getFullYear();

    // Setup navigation. This will handle showing the initial section
    // and triggering its specific JS initialization (which includes module-specific setup).
    setupNavigation(); 
    
    console.log("Chandigarh Logistics Sim Initialized");
});
