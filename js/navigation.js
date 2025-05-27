// js/navigation.js
import { initializeClusteringSection, globalClusteredDarkStores } from './modules/clustering.js';
import { initializeDemandProfilesSection, getCustomDemandProfiles } from './modules/demandProfiles.js';
import { initializeSimulationSection, populateOrderGenerationProfileSelectorSim } from './modules/simulation.js';
import { initializeWorkforceOptimizationSection, populateDarkStoreSelectorForOpt } from './modules/workforceOpt.js';
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
    contentSections.forEach(section => section.classList.remove('active'));
    navLinks.forEach(link => link.classList.remove('nav-active'));

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
                    initializeClusteringSection();
                    sectionInitialized.clustering = true;
                }
                getMapInstance('clustering')?.invalidateSize();
                break;
            case 'demandProfiles':
                if (!sectionInitialized.demandProfiles) {
                    initializeDemandProfilesSection();
                    sectionInitialized.demandProfiles = true;
                } else { // Always update sim selector if demand profiles might have changed
                    if (typeof populateOrderGenerationProfileSelectorSim === 'function') {
                         populateOrderGenerationProfileSelectorSim(getCustomDemandProfiles());
                    }
                }
                getMapInstance('demandProfiles')?.invalidateSize();
                break;
            case 'simulation':
                if (!sectionInitialized.simulation) {
                    initializeSimulationSection();
                    sectionInitialized.simulation = true;
                } else {
                    if (typeof populateOrderGenerationProfileSelectorSim === 'function') {
                        populateOrderGenerationProfileSelectorSim(getCustomDemandProfiles());
                    }
                }
                getMapInstance('simulation')?.invalidateSize();
                break;
            case 'workforceOptimization':
                if (!sectionInitialized.workforceOptimization) {
                    initializeWorkforceOptimizationSection();
                    sectionInitialized.workforceOptimization = true;
                } else {
                    // If Workforce Opt depends on clustering or demand profiles, update its selectors here
                    if (typeof populateDarkStoreSelectorForOpt === 'function') {
                        populateDarkStoreSelectorForOpt(globalClusteredDarkStores);
                    }
                    // Assuming workforceOpt.js also has a function to update its demand profile selector
                    const wfOptModule = await import('./modules/workforceOpt.js'); // Dynamic import if needed
                    if (typeof wfOptModule.populateDemandProfileSelectorForOpt === 'function') {
                        wfOptModule.populateDemandProfileSelectorForOpt();
                    }
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
}

export function setupNavigation() {
    const navLinks = document.querySelectorAll('.nav-link');
    const contentSections = document.querySelectorAll('.content-section');

    if (navLinks.length === 0 || contentSections.length === 0) {
        console.error("[NavSetup] Critical Error: Navigation links or content sections not found.");
        return;
    }

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
