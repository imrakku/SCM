// js/navigation.js
import { initializeClusteringSection, globalClusteredDarkStores } from './modules/clustering.js';
import { initializeDemandProfilesSection, getCustomDemandProfiles } from './modules/demandProfiles.js';
// For simulation, we need its init function and the function to update its profile selector
import { initializeSimulationSection, populateOrderGenerationProfileSelectorSim } from './modules/simulation.js';
// For workforce opt, its init and the function to update its dark store selector
import { initializeWorkforceOptimizationSection, populateDarkStoreSelectorForOpt } from './modules/workforceOpt.js';
// For scenario analysis, its init and the function to reload scenarios
import { initializeScenarioAnalysisSection, loadSavedScenarios } from './modules/scenarioAnalysis.js';
import { getMapInstance } from './mapUtils.js';

// Keep track of which sections have had their specific JS initialized
const sectionInitialized = {
    home: true, // Home usually doesn't have complex JS init
    clustering: false,
    demandProfiles: false,
    simulation: false,
    workforceOptimization: false,
    scenarioAnalysis: false,
};

/**
 * Shows a specific content section and hides others.
 * Also handles lazy initialization of section-specific JavaScript and updates if already initialized.
 * @param {string} sectionId The ID of the section to show.
 * @param {HTMLElement} [clickedLink] The navigation link that was clicked.
 * @param {NodeListOf<HTMLElement>} navLinks All navigation links.
 * @param {NodeListOf<HTMLElement>} contentSections All content sections.
 */
export function showSection(sectionId, clickedLink, navLinks, contentSections) {
    // console.log(`Attempting to show section: ${sectionId}`);

    contentSections.forEach(section => section.classList.remove('active'));
    navLinks.forEach(link => link.classList.remove('nav-active'));

    const targetSection = document.getElementById(sectionId);
    if (targetSection) {
        targetSection.classList.add('active');
        // console.log(`Section ${sectionId} activated.`);
    } else {
        console.error(`Target section with ID "${sectionId}" not found.`);
        // Fallback to home if target section doesn't exist
        document.getElementById('home')?.classList.add('active');
        document.querySelector('.nav-link[href="#home"]')?.classList.add('nav-active');
        return;
    }

    let activeLink = clickedLink;
    if (!activeLink) { // If called directly (e.g., on page load from hash)
        activeLink = document.querySelector(`.nav-link[href="#${sectionId}"]`);
    }
    if (activeLink) {
        activeLink.classList.add('nav-active');
    } else {
        // console.warn(`Active link for section ${sectionId} not found.`);
    }

    // Lazy initialize section-specific JavaScript or update if already initialized
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
                initializeDemandProfilesSection(); // This loads profiles and updates its own UI
                sectionInitialized.demandProfiles = true;
            }
            // When navigating to demand profiles, ensure its map is sized
            getMapInstance('demandProfiles')?.invalidateSize();
            break;
        case 'simulation':
            if (!sectionInitialized.simulation) {
                initializeSimulationSection(); // This will init the sim and its profile selector
                sectionInitialized.simulation = true;
            } else {
                // If already initialized, ensure its profile selector is up-to-date
                // with any changes from the demandProfiles module.
                const currentCustomProfiles = getCustomDemandProfiles(); // Get latest profiles
                populateOrderGenerationProfileSelectorSim(currentCustomProfiles);
            }
            getMapInstance('simulation')?.invalidateSize();
            break;
        case 'workforceOptimization':
            if (!sectionInitialized.workforceOptimization) {
                initializeWorkforceOptimizationSection(); // This will init and populate its dark store selector
                sectionInitialized.workforceOptimization = true;
            } else {
                // If already initialized, ensure its dark store selector is up-to-date
                // with any changes from the clustering module.
                populateDarkStoreSelectorForOpt(globalClusteredDarkStores); // globalClusteredDarkStores should be latest
            }
            getMapInstance('workforceOptimization')?.invalidateSize();
            break;
        case 'scenarioAnalysis':
            if (!sectionInitialized.scenarioAnalysis) {
                initializeScenarioAnalysisSection(); // This will load scenarios initially
                sectionInitialized.scenarioAnalysis = true;
            } else {
                // If returning to this tab, reload scenarios in case new ones were saved
                loadSavedScenarios();
            }
            break;
        case 'home':
        default:
            // No complex JS initialization typically needed for the home section
            break;
    }
    // console.log(`Finished showing section: ${sectionId}. Initialized state:`, sectionInitialized);
}

/**
 * Sets up the main navigation listeners.
 */
export function setupNavigation() {
    const navLinks = document.querySelectorAll('.nav-link');
    const contentSections = document.querySelectorAll('.content-section');

    if (navLinks.length === 0 || contentSections.length === 0) {
        console.error("Navigation links or content sections not found. Navigation will not work.");
        return;
    }
    // console.log(`SetupNavigation: Found ${navLinks.length} nav links and ${contentSections.length} content sections.`);


    navLinks.forEach(link => {
        link.addEventListener('click', function(event) {
            // event.preventDefault(); // Uncomment if you need to stop default anchor behavior for any reason
            const sectionId = event.currentTarget.getAttribute('href').substring(1);
            showSection(sectionId, event.currentTarget, navLinks, contentSections);
            // The hash will be updated by default browser behavior for anchor tags.
            // If preventDefault is used, update manually: window.location.hash = sectionId;
        });
    });

    // Handle initial section display based on URL hash or default to 'home'
    const initialHash = window.location.hash.substring(1);
    let initialSectionId = 'home'; // Default to home
    if (initialHash && document.getElementById(initialHash)) {
        initialSectionId = initialHash;
    }

    const initialActiveLink = document.querySelector(`.nav-link[href="#${initialSectionId}"]`);
    // console.log(`Initial section to show: ${initialSectionId}`);
    showSection(initialSectionId, initialActiveLink, navLinks, contentSections);
}
