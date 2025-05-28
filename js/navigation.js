// js/navigation.js
import { initializeClusteringSection, globalClusteredDarkStores } from './modules/clustering.js';
import { initializeDemandProfilesSection, getCustomDemandProfiles } from './modules/demandProfiles.js';
// Import the functions that will be called
import { initializeSimulationSection, populateOrderGenerationProfileSelectorSim } from './modules/simulation.js';
import { initializeWorkforceOptimizationSection, populateDarkStoreSelectorForOpt } from './modules/workforceOpt.js'; // Assuming populateDarkStoreSelectorForOpt is exported
import { initializeScenarioAnalysisSection, loadSavedScenarios } from './modules/scenarioAnalysis.js';
import { getMapInstance } from './mapUtils.js';

const sectionInitialized = {
    home: true,
    clustering: false,
    demandProfiles: false,
    simulation: false,
    workforceOptimization: false,
    scenarioAnalysis: false,
};

export function showSection(sectionId, clickedLink, navLinks, contentSections) {
    console.log(`[Nav] Attempting to show section: ${sectionId}`);

    contentSections.forEach(section => {
        section.classList.remove('active');
    });
    navLinks.forEach(link => {
        link.classList.remove('nav-active');
    });

    const targetSection = document.getElementById(sectionId);
    if (targetSection) {
        targetSection.classList.add('active');
    } else {
        console.error(`[Nav] Target section with ID "${sectionId}" not found. Defaulting to home.`);
        document.getElementById('home')?.classList.add('active');
        document.querySelector('.nav-link[href="#home"]')?.classList.add('nav-active');
        return;
    }

    let activeLink = clickedLink;
    if (!activeLink) {
        activeLink = document.querySelector(`.nav-link[href="#${sectionId}"]`);
    }
    if (activeLink) {
        activeLink.classList.add('nav-active');
    }

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
                } else {
                    // If navigating back, ensure simulation's profile selector is up-to-date
                    // and workforce opt's profile selector is also updated
                    if (typeof populateOrderGenerationProfileSelectorSim === 'function') {
                         populateOrderGenerationProfileSelectorSim(getCustomDemandProfiles());
                    }
                    // Dynamically import workforceOpt.js only when needed to update its selectors
                    import('./modules/workforceOpt.js').then(wfOptModule => {
                        if (typeof wfOptModule.populateDemandProfileSelectorForOpt === 'function') {
                            wfOptModule.populateDemandProfileSelectorForOpt(); // This function needs to exist in workforceOpt.js
                        }
                    }).catch(err => console.error("Error loading workforceOpt.js for demand profile update:", err));
                }
                getMapInstance('demandProfiles')?.invalidateSize();
                break;
            case 'simulation':
                if (!sectionInitialized.simulation) {
                    console.log("[Nav] Initializing Simulation Section...");
                    initializeSimulationSection(); // This should populate its own profile selector on init
                    sectionInitialized.simulation = true;
                } else {
                    // If navigating back, ensure its profile selector is up-to-date
                    if (typeof populateOrderGenerationProfileSelectorSim === 'function') {
                        populateOrderGenerationProfileSelectorSim(getCustomDemandProfiles());
                    }
                }
                getMapInstance('simulation')?.invalidateSize();
                break;
            case 'workforceOptimization':
                if (!sectionInitialized.workforceOptimization) {
                    console.log("[Nav] Initializing Workforce Optimization Section...");
                    initializeWorkforceOptimizationSection(); // This should populate its selectors
                    sectionInitialized.workforceOptimization = true;
                } else {
                    // If returning, re-populate selectors in case data changed
                    if (typeof populateDarkStoreSelectorForOpt === 'function') {
                        populateDarkStoreSelectorForOpt(globalClusteredDarkStores);
                    }
                    import('./modules/workforceOpt.js').then(wfOptModule => {
                        if (typeof wfOptModule.populateDemandProfileSelectorForOpt === 'function') {
                             wfOptModule.populateDemandProfileSelectorForOpt();
                        }
                    }).catch(err => console.error("Error loading workforceOpt.js for selector update:", err));
                }
                getMapInstance('workforceOptimization')?.invalidateSize();
                break;
            case 'scenarioAnalysis':
                if (!sectionInitialized.scenarioAnalysis) {
                    initializeScenarioAnalysisSection();
                    sectionInitialized.scenarioAnalysis = true;
                } else {
                    loadSavedScenarios();
                }
                break;
        }
    } catch (error) {
        console.error(`[Nav] Error during initialization or update of section "${sectionId}":`, error);
    }
    console.log(`[Nav] Finished processing showSection for: ${sectionId}.`);
}

export function setupNavigation() {
    console.log("[NavSetup] Setting up navigation listeners...");
    const navLinks = document.querySelectorAll('.nav-link');
    const contentSections = document.querySelectorAll('.content-section');

    if (navLinks.length === 0 || contentSections.length === 0) {
        console.error("[NavSetup] Critical Error: Navigation links or content sections not found.");
        return;
    }
    console.log(`[NavSetup] Found ${navLinks.length} nav links and ${contentSections.length} content sections.`);

    navLinks.forEach(link => {
        link.addEventListener('click', function(event) {
            const sectionId = event.currentTarget.getAttribute('href').substring(1);
            showSection(sectionId, event.currentTarget, navLinks, contentSections);
        });
    });

    const initialHash = window.location.hash.substring(1);
    let initialSectionId = 'home';
    if (initialHash && document.getElementById(initialHash)) {
        initialSectionId = initialHash;
    }
    const initialActiveLink = document.querySelector(`.nav-link[href="#${initialSectionId}"]`);
    showSection(initialSectionId, initialActiveLink, navLinks, contentSections);
}
