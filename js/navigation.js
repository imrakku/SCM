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
    console.log(`[Nav] Attempting to show section: ${sectionId}`);

    // Remove active class from all sections and nav links
    contentSections.forEach(section => {
        section.classList.remove('active');
        // console.log(`[Nav] Removed 'active' from section: ${section.id}`);
    });
    navLinks.forEach(link => {
        link.classList.remove('nav-active');
        // console.log(`[Nav] Removed 'nav-active' from link: ${link.getAttribute('href')}`);
    });

    const targetSection = document.getElementById(sectionId);
    if (targetSection) {
        targetSection.classList.add('active');
        console.log(`[Nav] Added 'active' to target section: ${sectionId}. Visible: ${window.getComputedStyle(targetSection).display}`);
    } else {
        console.error(`[Nav] Target section with ID "${sectionId}" not found. Defaulting to home.`);
        const homeSection = document.getElementById('home');
        if (homeSection) homeSection.classList.add('active');
        const homeLink = document.querySelector('.nav-link[href="#home"]');
        if (homeLink) homeLink.classList.add('nav-active');
        return;
    }

    let activeLink = clickedLink;
    if (!activeLink) { // If called directly (e.g., on page load from hash)
        activeLink = document.querySelector(`.nav-link[href="#${sectionId}"]`);
    }
    if (activeLink) {
        activeLink.classList.add('nav-active');
        console.log(`[Nav] Added 'nav-active' to link: ${activeLink.getAttribute('href')}`);
    } else {
        console.warn(`[Nav] Active link for section ${sectionId} not found.`);
    }
    // Lazy initialize section-specific JavaScript or update if already initialized
    try {
        switch (sectionId) {
            case 'clustering':
                if (!sectionInitialized.clustering) {
                    console.log("[Nav] Initializing Clustering Section...");
                    initializeClusteringSection();
                    sectionInitialized.clustering = true;
                }
                getMapInstance('clustering')?.invalidateSize();
                break;
            case 'demandProfiles':
                if (!sectionInitialized.demandProfiles) {
                    console.log("[Nav] Initializing Demand Profiles Section...");
                    initializeDemandProfilesSection();
                    sectionInitialized.demandProfiles = true;
                }
                getMapInstance('demandProfiles')?.invalidateSize();
                break;
            case 'simulation':
                if (!sectionInitialized.simulation) {
                    console.log("[Nav] Initializing Simulation Section...");
                    initializeSimulationSection();
                    sectionInitialized.simulation = true;
                } else {
                    console.log("[Nav] Updating Simulation Section (Profile Selector)...");
                    const currentCustomProfiles = getCustomDemandProfiles();
                    populateOrderGenerationProfileSelectorSim(currentCustomProfiles);
                }
                getMapInstance('simulation')?.invalidateSize();
                break;
            case 'workforceOptimization':
                if (!sectionInitialized.workforceOptimization) {
                    console.log("[Nav] Initializing Workforce Optimization Section...");
                    initializeWorkforceOptimizationSection();
                    sectionInitialized.workforceOptimization = true;
                } else {
                    console.log("[Nav] Updating Workforce Optimization Section (Dark Store Selector)...");
                    populateDarkStoreSelectorForOpt(globalClusteredDarkStores);
                }
                getMapInstance('workforceOptimization')?.invalidateSize();
                break;
            case 'scenarioAnalysis':
                if (!sectionInitialized.scenarioAnalysis) {
                    console.log("[Nav] Initializing Scenario Analysis Section...");
                    initializeScenarioAnalysisSection();
                    sectionInitialized.scenarioAnalysis = true;
                } else {
                    console.log("[Nav] Updating Scenario Analysis Section (Reloading Scenarios)...");
                    loadSavedScenarios();
                }
                break;
            case 'home':
            default:
                // No complex JS initialization typically needed for the home section
                console.log(`[Nav] Switched to simple section: ${sectionId}`);
                break;
        }
    } catch (error) {
        console.error(`[Nav] Error during initialization or update of section "${sectionId}":`, error);
    }
    console.log(`[Nav] Finished showing section: ${sectionId}. Initialized state:`, JSON.parse(JSON.stringify(sectionInitialized)));
}

/**
 * Sets up the main navigation listeners.
 */
export function setupNavigation() {
    const navLinks = document.querySelectorAll('.nav-link');
    const contentSections = document.querySelectorAll('.content-section');

    if (navLinks.length === 0 || contentSections.length === 0) {
        console.error("[NavSetup] Critical Error: Navigation links or content sections not found. Navigation will not work.");
        return;
    }
    console.log(`[NavSetup] Found ${navLinks.length} nav links and ${contentSections.length} content sections.`);

    navLinks.forEach(link => {
        link.addEventListener('click', function(event) {
            // Using event.currentTarget to ensure we get the element the listener was attached to.
            const sectionId = event.currentTarget.getAttribute('href').substring(1);
            console.log(`[NavClick] Link clicked for section: ${sectionId}`);
            showSection(sectionId, event.currentTarget, navLinks, contentSections);
            // The URL hash will be updated by default browser behavior for anchor tags.
            // If you were to use event.preventDefault(), you'd need to set it manually:
            // window.location.hash = sectionId;
        });
    });

    // Handle initial section display based on URL hash or default to 'home'
    const initialHash = window.location.hash.substring(1);
    let initialSectionId = 'home'; // Default to home
    if (initialHash && document.getElementById(initialHash)) {
        initialSectionId = initialHash;
        console.log(`[NavSetup] Initial section from hash: ${initialSectionId}`);
    } else if (initialHash) {
        console.warn(`[NavSetup] Hash "${initialHash}" does not correspond to a valid section ID. Defaulting to home.`);
    } else {
        console.log(`[NavSetup] No hash found. Defaulting to home section.`);
    }

    const initialActiveLink = document.querySelector(`.nav-link[href="#${initialSectionId}"]`);
    showSection(initialSectionId, initialActiveLink, navLinks, contentSections);
}
