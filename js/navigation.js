// js/navigation.js (Simplified for Debugging)

// We are not importing other modules here for now to isolate the issue.
// We will add them back once basic navigation works.

const sectionInitialized = { // Keep track, though we won't initialize yet
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
        console.log(`[Nav] Section ${sectionId} classList:`, targetSection.classList);
        console.log(`[Nav] Section ${sectionId} computed display: ${window.getComputedStyle(targetSection).display}`);
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

    // Log what would be initialized, but don't actually call the functions yet
    console.log(`[Nav] Would initialize/update section: ${sectionId}`);
    switch (sectionId) {
        case 'clustering':
            console.log("[Nav] Placeholder for initializeClusteringSection()");
            // if (!sectionInitialized.clustering) sectionInitialized.clustering = true;
            break;
        case 'demandProfiles':
            console.log("[Nav] Placeholder for initializeDemandProfilesSection()");
            // if (!sectionInitialized.demandProfiles) sectionInitialized.demandProfiles = true;
            break;
        case 'simulation':
            console.log("[Nav] Placeholder for initializeSimulationSection()");
            // if (!sectionInitialized.simulation) sectionInitialized.simulation = true;
            break;
        // Add other cases similarly if needed for logging
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
            console.log(`[NavClick] Link clicked for section: ${sectionId}`);
            showSection(sectionId, event.currentTarget, navLinks, contentSections);
        });
    });

    const initialHash = window.location.hash.substring(1);
    let initialSectionId = 'home';
    if (initialHash && document.getElementById(initialHash)) {
        initialSectionId = initialHash;
    }
    console.log(`[NavSetup] Initial section to show: ${initialSectionId}`);
    const initialActiveLink = document.querySelector(`.nav-link[href="#${initialSectionId}"]`);
    showSection(initialSectionId, initialActiveLink, navLinks, contentSections);
}
