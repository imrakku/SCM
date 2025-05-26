// js/navigation.js
import { initializeClusteringSection } from './modules/clustering.js';
import { initializeDemandProfilesSection } from './modules/demandProfiles.js';
import { initializeSimulationSection, getSimParameter } from './modules/simulation.js';
import { initializeWorkforceOptimizationSection } from './modules/workforceOpt.js';
import { initializeScenarioAnalysisSection } from './modules/scenarioAnalysis.js';
import { getMapInstance } from './mapUtils.js'; // To check if maps are initialized

// Keep track of which sections have had their specific JS initialized
const sectionInitialized = {
    clustering: false,
    demandProfiles: false,
    simulation: false,
    workforceOptimization: false,
    scenarioAnalysis: false,
};

/**
 * Shows a specific content section and hides others.
 * Also handles lazy initialization of section-specific JavaScript.
 * @param {string} sectionId The ID of the section to show.
 * @param {HTMLElement} [clickedLink] The navigation link that was clicked.
 * @param {NodeListOf<HTMLElement>} navLinks All navigation links.
 * @param {NodeListOf<HTMLElement>} contentSections All content sections.
 */
export function showSection(sectionId, clickedLink, navLinks, contentSections) {
    contentSections.forEach(section => section.classList.remove('active'));
    navLinks.forEach(link => link.classList.remove('nav-active'));

    const targetSection = document.getElementById(sectionId);
    if (targetSection) {
        targetSection.classList.add('active');
    }

    let activeLink = clickedLink;
    if (!activeLink) {
        activeLink = document.querySelector(`.nav-link[href="#${sectionId}"]`);
    }
    if (activeLink) {
        activeLink.classList.add('nav-active');
    }

    // Lazy initialize section-specific JavaScript if not already done
    switch (sectionId) {
        case 'clustering':
            if (!sectionInitialized.clustering) {
                initializeClusteringSection();
                sectionInitialized.clustering = true;
            }
            // Ensure map is visible and sized correctly if already initialized
            getMapInstance('clustering')?.invalidateSize();
            break;
        case 'demandProfiles':
            if (!sectionInitialized.demandProfiles) {
                initializeDemandProfilesSection();
                sectionInitialized.demandProfiles = true;
            }
            getMapInstance('demandProfiles')?.invalidateSize();
            break;
        case 'simulation':
            if (!sectionInitialized.simulation) {
                initializeSimulationSection();
                sectionInitialized.simulation = true;
            } else {
                // If coming back to the sim, ensure profile selector is up-to-date
                const simModule = await import('./modules/simulation.js');
                simModule.populateOrderGenerationProfileSelectorSim(); // Ensure this function exists and is exported
            }
            getMapInstance('simulation')?.invalidateSize();
            break;
        case 'workforceOptimization':
            if (!sectionInitialized.workforceOptimization) {
                initializeWorkforceOptimizationSection();
                sectionInitialized.workforceOptimization = true;
            } else {
                 // If coming back, ensure dark store selector is up-to-date
                const wfModule = await import('./modules/workforceOpt.js');
                wfModule.populateDarkStoreSelectorForOpt(); // Ensure this function exists and is exported
            }
            getMapInstance('workforceOptimization')?.invalidateSize();
            break;
        case 'scenarioAnalysis':
            if (!sectionInitialized.scenarioAnalysis) {
                initializeScenarioAnalysisSection();
                sectionInitialized.scenarioAnalysis = true;
            } else {
                // If coming back, reload scenarios as they might have changed
                const saModule = await import('./modules/scenarioAnalysis.js');
                saModule.loadSavedScenarios();
            }
            break;
        case 'home':
        default:
            // No specific JS initialization for home, or handle default case
            break;
    }
}

/**
 * Sets up the main navigation listeners.
 */
export function setupNavigation() {
    const navLinks = document.querySelectorAll('.nav-link');
    const contentSections = document.querySelectorAll('.content-section');

    navLinks.forEach(link => {
        link.addEventListener('click', function(event) {
            // event.preventDefault(); // Prevent default anchor behavior if it causes unwanted scrolling before section switch
            const sectionId = this.getAttribute('href').substring(1);
            showSection(sectionId, this, navLinks, contentSections);
            window.location.hash = sectionId; // Update URL hash manually for bookmarking/history
        });
    });

    // Handle initial section display based on URL hash or default to 'home'
    const initialHash = window.location.hash.substring(1);
    const validInitialSection = initialHash && document.getElementById(initialHash);
    const initialSectionId = validInitialSection ? initialHash : 'home';
    const initialActiveLink = validInitialSection ? document.querySelector(`.nav-link[href="#${initialHash}"]`) : document.querySelector('.nav-link[href="#home"]');

    showSection(initialSectionId, initialActiveLink, navLinks, contentSections);
}
