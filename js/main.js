// js/main.js (Simplified for Debugging)
import { setupNavigation } from './navigation.js';

document.addEventListener('DOMContentLoaded', () => {
    console.log("[Main] DOMContentLoaded - Attempting to set up navigation.");
    try {
        setupNavigation();
        console.log("[Main] Navigation setup initiated.");
    } catch (e) {
        console.error("[Main] Error during setupNavigation call:", e);
    }

    const currentYearEl = document.getElementById('currentYear');
    if (currentYearEl) {
        currentYearEl.textContent = new Date().getFullYear();
    }
});

