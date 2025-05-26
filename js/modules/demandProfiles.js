// js/modules/demandProfiles.js
import { chandigarhSectors, chandigarhCenter } from '../data/chandigarhData.js';
import { initializeMap, getMapInstance } from '../mapUtils.js';
import { logMessage } from '../logger.js';
// Import a function from simulation.js to update its profile selector
// We'll need to ensure simulation.js exports this: populateOrderGenerationProfileSelectorSim
import { populateOrderGenerationProfileSelectorSim } from './simulation.js';


// Module-specific state
let demandProfilesMap; // Leaflet map instance for this section
let customDemandProfiles = []; // Array to store saved profiles
let zoneCounter = 0; // For uniquely identifying zones in the form
let currentEditingZoneId = null; // Tracks which zone's hotspot/route is being edited on the map
let tempProfileZoneMarkers = []; // Markers for hotspot centers or route points during creation
let currentRoutePoints = []; // For drawing a route segment interactively
let currentRoutePolylineLayer = null; // Leaflet layer for the current route being drawn

// DOM Elements
let profileNameInputEl, profileZonesContainerEl, addZoneToProfileBtnEl;
let saveProfileBtnEl, clearProfileFormBtnEl, savedProfilesListEl;
let profileCreationMapContainerEl, finishCurrentRouteBtnEl;
let simulationLogEl; // For logging profile actions if no dedicated log area

/**
 * Initializes the Demand Profiles section.
 */
export function initializeDemandProfilesSection() {
    // Cache DOM elements
    profileNameInputEl = document.getElementById('profileNameInput');
    profileZonesContainerEl = document.getElementById('profileZonesContainer');
    addZoneToProfileBtnEl = document.getElementById('addZoneToProfileBtn');
    saveProfileBtnEl = document.getElementById('saveProfileBtn');
    clearProfileFormBtnEl = document.getElementById('clearProfileFormBtn');
    savedProfilesListEl = document.getElementById('savedProfilesList');
    profileCreationMapContainerEl = document.getElementById('profileCreationMapContainer');
    finishCurrentRouteBtnEl = document.getElementById('finishCurrentRouteBtn'); // Assuming this button exists for finishing routes

    // Use the main simulation log if a dedicated one isn't present for this section
    simulationLogEl = document.getElementById('simulationLog');


    // Initialize map for profile creation
    demandProfilesMap = initializeMap('profileCreationMap', chandigarhCenter, 12, 'demandProfiles');
    demandProfilesMap.on('click', handleProfileMapClick);

    // Event Listeners
    addZoneToProfileBtnEl?.addEventListener('click', addZoneToProfileForm);
    saveProfileBtnEl?.addEventListener('click', saveCustomDemandProfile);
    clearProfileFormBtnEl?.addEventListener('click', clearProfileForm);
    finishCurrentRouteBtnEl?.addEventListener('click', finishCurrentRouteSegment);


    // Load existing profiles from session storage and display them
    loadProfilesFromSessionStorage();
    updateSavedProfilesListUI();
    // Also update the simulation's profile selector
    populateOrderGenerationProfileSelectorSim(customDemandProfiles);
}

/**
 * Handles clicks on the profile creation map to set hotspot centers or route points.
 * @param {L.LeafletMouseEvent} e The Leaflet map click event.
 */
function handleProfileMapClick(e) {
    if (currentEditingZoneId) {
        const zoneDiv = document.querySelector(`.profile-zone[data-zone-id="${currentEditingZoneId}"]`);
        if (!zoneDiv) return;

        const zoneTypeSelect = zoneDiv.querySelector('.zone-type-select');
        if (!zoneTypeSelect) return;

        if (zoneTypeSelect.value === 'hotspot') {
            const latInput = zoneDiv.querySelector('.hotspot-lat-input');
            const lngInput = zoneDiv.querySelector('.hotspot-lng-input');
            if (latInput && lngInput) {
                latInput.value = e.latlng.lat.toFixed(5);
                lngInput.value = e.latlng.lng.toFixed(5);
                updateProfileMapVisuals();
            }
        } else if (zoneTypeSelect.value === 'route') {
            const routePointsInput = zoneDiv.querySelector('textarea[id^="zoneRoutePoints"]');
            currentRoutePoints.push([e.latlng.lat, e.latlng.lng]);
            if (routePointsInput) routePointsInput.value = JSON.stringify(currentRoutePoints);
            updateProfileMapVisuals();
            if (finishCurrentRouteBtnEl) finishCurrentRouteBtnEl.classList.remove('hidden');
        }
    }
}

/**
 * Adds a new zone configuration form to the profile creation UI.
 */
function addZoneToProfileForm() {
    zoneCounter++;
    const currentZoneId = zoneCounter;
    if (profileCreationMapContainerEl) profileCreationMapContainerEl.classList.remove('hidden');

    const zoneDiv = document.createElement('div');
    zoneDiv.className = 'profile-zone'; // Tailwind classes are in main CSS
    zoneDiv.setAttribute('data-zone-id', currentZoneId);
    zoneDiv.innerHTML = `
        <div class="flex justify-between items-center mb-2">
            <h5 class="font-semibold text-md text-slate-700">Zone ${currentZoneId}</h5>
            <button type="button" class="btn btn-danger btn-sm remove-zone-btn" data-zone-id="${currentZoneId}">&times; Remove</button>
        </div>
        <div class="input-group">
            <label for="zoneType${currentZoneId}">Zone Type:</label>
            <select id="zoneType${currentZoneId}" class="zone-type-select w-full">
                <option value="uniform">Uniform City-Wide</option>
                <option value="hotspot" selected>Hotspot (Gaussian)</option>
                <option value="sector">Sector-Based</option>
                <option value="route">Route-Based</option>
            </select>
        </div>
        <div class="grid grid-cols-2 gap-x-4">
            <div class="input-group">
                <label for="zoneMinOrders${currentZoneId}">Min Orders/Interval:</label>
                <input type="number" id="zoneMinOrders${currentZoneId}" value="10" min="0" class="w-full">
            </div>
            <div class="input-group">
                <label for="zoneMaxOrders${currentZoneId}">Max Orders/Interval:</label>
                <input type="number" id="zoneMaxOrders${currentZoneId}" value="50" min="1" class="w-full">
            </div>
        </div>
        <div class="grid grid-cols-2 gap-x-4">
            <div class="input-group">
                <label for="zoneStartTime${currentZoneId}">Start Time (sim min):</label>
                <input type="number" id="zoneStartTime${currentZoneId}" value="0" min="0" class="w-full">
            </div>
            <div class="input-group">
                <label for="zoneEndTime${currentZoneId}">End Time (sim min):</label>
                <input type="number" id="zoneEndTime${currentZoneId}" value="1440" min="0" class="w-full">
            </div>
        </div>
        <div class="hotspot-fields">
            <div class="input-group">
                <label for="zoneLat${currentZoneId}">Hotspot Center Latitude:</label>
                <input type="number" id="zoneLat${currentZoneId}" step="0.00001" placeholder="Click map or enter" class="w-full hotspot-lat-input">
            </div>
            <div class="input-group">
                <label for="zoneLng${currentZoneId}">Hotspot Center Longitude:</label>
                <input type="number" id="zoneLng${currentZoneId}" step="0.00001" placeholder="Click map or enter" class="w-full hotspot-lng-input">
            </div>
            <div class="input-group">
                <label for="zoneSpread${currentZoneId}">Hotspot Spread/Radius (km):</label>
                <input type="number" id="zoneSpread${currentZoneId}" value="1" min="0.1" step="0.1" class="w-full">
            </div>
        </div>
        <div class="sector-fields hidden">
            <div class="input-group">
                <label>Select Sectors (Ctrl/Cmd + Click for multiple):</label>
                <div class="sector-select-container">
                    ${chandigarhSectors.map(sector => `
                        <label class="block"><input type="checkbox" name="zoneSectors${currentZoneId}" value="${sector.name}"> ${sector.name}</label>
                    `).join('')}
                </div>
            </div>
        </div>
        <div class="route-fields hidden">
             <div class="input-group">
                <label for="zoneRoutePoints${currentZoneId}">Route Points (Lat,Lng pairs):</label>
                <textarea id="zoneRoutePoints${currentZoneId}" rows="2" class="w-full bg-slate-100" readonly placeholder="Click 'Start Route' then map..."></textarea>
                <button type="button" class="btn btn-secondary btn-sm mt-1 start-add-route-btn" data-zone-id="${currentZoneId}">Start/Edit Route</button>
                <button type="button" class="btn btn-danger btn-sm mt-1 clear-route-btn" data-zone-id="${currentZoneId}">Clear This Route</button>
            </div>
            <div class="input-group">
                <label for="zoneRouteSpread${currentZoneId}">Spread around Route (km):</label>
                <input type="number" id="zoneRouteSpread${currentZoneId}" value="0.5" min="0.1" step="0.1" class="w-full">
            </div>
        </div>
    `;
    profileZonesContainerEl?.appendChild(zoneDiv);

    const zoneTypeSelect = zoneDiv.querySelector('.zone-type-select');
    const hotspotFieldsDiv = zoneDiv.querySelector('.hotspot-fields');
    const sectorFieldsDiv = zoneDiv.querySelector('.sector-fields');
    const routeFieldsDiv = zoneDiv.querySelector('.route-fields');

    function toggleZoneFieldsUI() {
        hotspotFieldsDiv.classList.toggle('hidden', zoneTypeSelect.value !== 'hotspot');
        sectorFieldsDiv.classList.toggle('hidden', zoneTypeSelect.value !== 'sector');
        routeFieldsDiv.classList.toggle('hidden', zoneTypeSelect.value !== 'route');
        currentEditingZoneId = (zoneTypeSelect.value === 'hotspot' || zoneTypeSelect.value === 'route') ? currentZoneId.toString() : null;
        if (zoneTypeSelect.value !== 'route') {
            currentRoutePoints = []; // Clear route points if not a route type
            if (finishCurrentRouteBtnEl) finishCurrentRouteBtnEl.classList.add('hidden');
        }
        updateProfileMapVisuals();
    }
    zoneTypeSelect.addEventListener('change', toggleZoneFieldsUI);
    toggleZoneFieldsUI(); // Initial call

    zoneDiv.querySelector('.remove-zone-btn').addEventListener('click', function() {
        zoneDiv.remove();
        updateProfileMapVisuals();
        if (profileZonesContainerEl && profileZonesContainerEl.children.length === 0 && profileCreationMapContainerEl) {
            profileCreationMapContainerEl.classList.add('hidden');
        }
    });

    zoneDiv.querySelectorAll('.hotspot-lat-input, .hotspot-lng-input, input[id^="zoneSpread"]').forEach(input => {
        input.addEventListener('input', () => { currentEditingZoneId = currentZoneId.toString(); updateProfileMapVisuals(); });
        input.addEventListener('focus', () => { currentEditingZoneId = currentZoneId.toString(); }); // Set current zone for map click
    });

    zoneDiv.querySelector('.start-add-route-btn').addEventListener('click', function() {
         currentEditingZoneId = this.dataset.zoneId;
         currentRoutePoints = []; // Reset for new route definition for this zone
         const routePointsInput = document.getElementById(`zoneRoutePoints${currentEditingZoneId}`);
         if(routePointsInput) routePointsInput.value = '';
         logMessage(`Started defining route for Zone ${currentEditingZoneId}. Click on the map.`, 'SYSTEM', simulationLogEl);
         updateProfileMapVisuals();
         if (finishCurrentRouteBtnEl) finishCurrentRouteBtnEl.classList.remove('hidden');
    });
    zoneDiv.querySelector('.clear-route-btn').addEventListener('click', function() {
        const zoneIdToClear = this.dataset.zoneId;
        if (currentEditingZoneId === zoneIdToClear) {
            currentRoutePoints = [];
        }
        const routePointsInput = document.getElementById(`zoneRoutePoints${zoneIdToClear}`);
        if(routePointsInput) routePointsInput.value = '';
        updateProfileMapVisuals(); // This will clear visuals if currentEditingZoneId matches
    });

    updateProfileMapVisuals();
}

/**
 * Updates markers and polylines on the profile creation map based on current form inputs.
 */
function updateProfileMapVisuals() {
    if (!demandProfilesMap) return;

    // Clear previous temporary markers/layers
    tempProfileZoneMarkers.forEach(marker => marker.remove());
    tempProfileZoneMarkers = [];
    if (currentRoutePolylineLayer) {
        demandProfilesMap.removeLayer(currentRoutePolylineLayer);
        currentRoutePolylineLayer = null;
    }

    const zoneDivs = profileZonesContainerEl?.querySelectorAll('.profile-zone');
    zoneDivs?.forEach(zoneDiv => {
        const type = zoneDiv.querySelector('.zone-type-select').value;
        const zoneId = zoneDiv.dataset.zoneId;

        if (type === 'hotspot') {
            const lat = parseFloat(zoneDiv.querySelector('.hotspot-lat-input').value);
            const lng = parseFloat(zoneDiv.querySelector('.hotspot-lng-input').value);
            const spreadKm = parseFloat(zoneDiv.querySelector('input[id^="zoneSpread"]').value);

            if (!isNaN(lat) && !isNaN(lng) && !isNaN(spreadKm) && spreadKm > 0) {
                const marker = L.marker([lat, lng]).addTo(demandProfilesMap)
                    .bindPopup(`Hotspot Center (Zone ${zoneId})<br>Spread: ${spreadKm} km`);
                if (zoneId === currentEditingZoneId) marker.openPopup();
                const circle = L.circle([lat, lng], {
                    radius: spreadKm * 1000, // meters
                    color: 'red', fillColor: '#f03', fillOpacity: 0.2, interactive: false
                }).addTo(demandProfilesMap);
                tempProfileZoneMarkers.push(marker, circle);
            }
        } else if (type === 'route' && zoneId === currentEditingZoneId && currentRoutePoints.length > 0) {
             currentRoutePoints.forEach((p, index) => {
                const pointMarker = L.circleMarker(p, {radius: 5, color: 'blue', fillColor: 'blue', fillOpacity: 0.7})
                                    .bindPopup(`Route Point ${index+1} (Zone ${zoneId})`)
                                    .addTo(demandProfilesMap);
                tempProfileZoneMarkers.push(pointMarker);
             });
            if (currentRoutePoints.length > 1) {
                currentRoutePolylineLayer = L.polyline(currentRoutePoints, {color: 'blue', weight: 3}).addTo(demandProfilesMap);
            }
        }
    });
    demandProfilesMap.invalidateSize();
}

/**
 * Finalizes the current route segment being drawn.
 * (Currently, this might just hide the button or could be used for more complex route logic)
 */
function finishCurrentRouteSegment() {
    logMessage(`Route segment for Zone ${currentEditingZoneId} finalized with ${currentRoutePoints.length} points.`, 'SYSTEM', simulationLogEl);
    // currentEditingZoneId = null; // Or keep it for further edits until another zone is selected
    if (finishCurrentRouteBtnEl) finishCurrentRouteBtnEl.classList.add('hidden');
    // The route points are already in the textarea.
}


/**
 * Saves the currently defined custom demand profile to session storage and updates UI lists.
 */
function saveCustomDemandProfile() {
    const profileName = profileNameInputEl?.value.trim();
    if (!profileName) {
        alert("Please enter a name for the profile.");
        return;
    }

    const existingProfileIndex = customDemandProfiles.findIndex(p => p.name === profileName);
    if (existingProfileIndex !== -1) {
        if (!confirm(`A profile named "${profileName}" already exists. Overwrite it?`)) {
             return;
         }
        customDemandProfiles.splice(existingProfileIndex, 1); // Remove old to overwrite
    }

    const zones = [];
    const zoneDivs = profileZonesContainerEl?.querySelectorAll('.profile-zone');
    if (!zoneDivs || zoneDivs.length === 0) {
        alert("Please add at least one zone to the profile.");
        return;
    }

    let profileIsValid = true;
    zoneDivs.forEach(zoneDiv => {
        if (!profileIsValid) return;
        const type = zoneDiv.querySelector('.zone-type-select').value;
        const minOrders = parseInt(zoneDiv.querySelector('input[id^="zoneMinOrders"]').value) || 0;
        const maxOrders = parseInt(zoneDiv.querySelector('input[id^="zoneMaxOrders"]').value) || 0;
        const startTime = parseInt(zoneDiv.querySelector('input[id^="zoneStartTime"]').value) || 0;
        const endTimeInput = zoneDiv.querySelector('input[id^="zoneEndTime"]').value;
        const endTime = endTimeInput === '' || isNaN(parseInt(endTimeInput)) ? Infinity : parseInt(endTimeInput);


        if (minOrders > maxOrders && maxOrders !== 0) { // Allow maxOrders = 0 if minOrders is also 0 (effectively disabled)
            alert(`Min Orders (${minOrders}) cannot be greater than Max Orders (${maxOrders}) for a zone in profile "${profileName}".`);
            profileIsValid = false; return;
        }
        if (startTime > endTime) {
             alert(`Start Time (${startTime}) cannot be greater than End Time (${endTime}) for a zone in profile "${profileName}".`);
            profileIsValid = false; return;
        }

        let zoneData = { type, minOrders, maxOrders, startTime, endTime };

        if (type === 'hotspot') {
            const centerLat = parseFloat(zoneDiv.querySelector('.hotspot-lat-input').value);
            const centerLng = parseFloat(zoneDiv.querySelector('.hotspot-lng-input').value);
            const spreadKm = parseFloat(zoneDiv.querySelector('input[id^="zoneSpread"]').value) || 1;
            if (isNaN(centerLat) || isNaN(centerLng)) {
                alert(`Invalid latitude or longitude for a hotspot zone in profile "${profileName}". Please click on the map or enter valid coordinates.`);
                profileIsValid = false; return;
            }
            zoneData = { ...zoneData, centerLat, centerLng, spreadKm };
        } else if (type === 'sector') {
            const selectedSectorCheckboxes = zoneDiv.querySelectorAll('input[name^="zoneSectors"]:checked');
            const selectedSectors = Array.from(selectedSectorCheckboxes).map(cb => cb.value);
            if (selectedSectors.length === 0) {
                alert(`Please select at least one sector for the sector-based zone in profile "${profileName}".`);
                profileIsValid = false; return;
            }
            zoneData = { ...zoneData, selectedSectors };
        } else if (type === 'route') {
            const routePointsText = zoneDiv.querySelector('textarea[id^="zoneRoutePoints"]').value;
            let routePoints = [];
            try {
                routePoints = JSON.parse(routePointsText || "[]");
                if (!Array.isArray(routePoints) || !routePoints.every(p => Array.isArray(p) && p.length === 2 && typeof p[0] === 'number' && typeof p[1] === 'number')) {
                    throw new Error("Invalid route points format.");
                }
            } catch (e) {
                 alert(`Invalid route points for a route-based zone in profile "${profileName}". Ensure the route is defined correctly.`);
                 profileIsValid = false; return;
            }
            if (routePoints.length < 2) {
                 alert(`A route-based zone requires at least 2 points. Profile: "${profileName}".`);
                 profileIsValid = false; return;
            }
            const routeSpreadKm = parseFloat(zoneDiv.querySelector('input[id^="zoneRouteSpread"]').value) || 0.5;
            zoneData = { ...zoneData, routePoints, routeSpreadKm };
        }
        // 'uniform' type needs no extra data beyond common fields
        zones.push(zoneData);
    });

    if (!profileIsValid) return;

    customDemandProfiles.push({ name: profileName, zones: zones });
    logMessage(`Custom demand profile "${profileName}" saved with ${zones.length} zone(s).`, 'PROFILE_SAVE', simulationLogEl);
    saveProfilesToSessionStorage();
    updateSavedProfilesListUI();
    populateOrderGenerationProfileSelectorSim(customDemandProfiles); // Update simulation selector
    clearProfileForm();
}


/**
 * Clears the demand profile creation form.
 */
function clearProfileForm() {
    if (profileNameInputEl) profileNameInputEl.value = '';
    if (profileZonesContainerEl) profileZonesContainerEl.innerHTML = '';
    zoneCounter = 0;
    currentEditingZoneId = null;
    currentRoutePoints = [];
    if (demandProfilesMap) {
         tempProfileZoneMarkers.forEach(marker => marker.remove());
         tempProfileZoneMarkers = [];
         if(currentRoutePolylineLayer) {
            demandProfilesMap.removeLayer(currentRoutePolylineLayer);
            currentRoutePolylineLayer = null;
         }
    }
    if (profileCreationMapContainerEl) profileCreationMapContainerEl.classList.add('hidden');
    if (finishCurrentRouteBtnEl) finishCurrentRouteBtnEl.classList.add('hidden');
}

/**
 * Updates the list of saved profiles in the UI.
 */
function updateSavedProfilesListUI() {
    if (!savedProfilesListEl) return;
    savedProfilesListEl.innerHTML = '';
    if (customDemandProfiles.length === 0) {
        savedProfilesListEl.innerHTML = '<li class="italic text-slate-500">No custom profiles saved yet.</li>';
        return;
    }
    customDemandProfiles.forEach((profile) => {
        const li = document.createElement('li');
        // Tailwind classes are in main CSS
        li.innerHTML = `
            <span class="font-medium text-slate-700 hover:text-blue-600 flex-grow">${profile.name} (${profile.zones.length} zones)</span>
            <button type="button" class="btn btn-secondary btn-sm text-xs load-profile-btn ml-2">Load</button>
            <button type="button" class="btn btn-danger btn-sm text-xs delete-profile-btn ml-2">Delete</button>
        `;
        li.querySelector('.load-profile-btn').addEventListener('click', (e) => {
            e.stopPropagation(); // Prevent li click if any
            loadProfileForEditing(profile.name);
        });
        li.querySelector('.delete-profile-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            deleteCustomProfile(profile.name);
        });
        savedProfilesListEl.appendChild(li);
    });
}

/**
 * Loads a saved profile into the form for editing.
 * @param {string} profileName The name of the profile to load.
 */
function loadProfileForEditing(profileName) {
    const profile = customDemandProfiles.find(p => p.name === profileName);
    if (!profile) return;

    clearProfileForm();
    if (profileNameInputEl) profileNameInputEl.value = profile.name;

    profile.zones.forEach(zoneData => {
        addZoneToProfileForm(); // This increments zoneCounter and creates a new zone form
        const newZoneDiv = profileZonesContainerEl?.lastElementChild; // Get the newly added zone div
        if (newZoneDiv) {
            const currentZoneId = newZoneDiv.dataset.zoneId; // Get the ID of the new zone
            newZoneDiv.querySelector('.zone-type-select').value = zoneData.type;

            // Trigger change to show/hide correct fields
            newZoneDiv.querySelector('.zone-type-select').dispatchEvent(new Event('change'));

            newZoneDiv.querySelector(`input[id^="zoneMinOrders"]`).value = zoneData.minOrders;
            newZoneDiv.querySelector(`input[id^="zoneMaxOrders"]`).value = zoneData.maxOrders;
            newZoneDiv.querySelector(`input[id^="zoneStartTime"]`).value = zoneData.startTime;
            const endTimeVal = zoneData.endTime === Infinity ? '' : zoneData.endTime; // Handle Infinity for input
            newZoneDiv.querySelector(`input[id^="zoneEndTime"]`).value = endTimeVal;


            if (zoneData.type === 'hotspot') {
                newZoneDiv.querySelector('.hotspot-lat-input').value = zoneData.centerLat;
                newZoneDiv.querySelector('.hotspot-lng-input').value = zoneData.centerLng;
                newZoneDiv.querySelector('input[id^="zoneSpread"]').value = zoneData.spreadKm;
            } else if (zoneData.type === 'sector') {
                zoneData.selectedSectors?.forEach(sectorName => {
                    const checkbox = newZoneDiv.querySelector(`input[name="zoneSectors${currentZoneId}"][value="${sectorName}"]`);
                    if (checkbox) checkbox.checked = true;
                });
            } else if (zoneData.type === 'route') {
                const routePointsInput = newZoneDiv.querySelector('textarea[id^="zoneRoutePoints"]');
                if (routePointsInput) routePointsInput.value = JSON.stringify(zoneData.routePoints || []);
                newZoneDiv.querySelector('input[id^="zoneRouteSpread"]').value = zoneData.routeSpreadKm || 0.5;
                // Set currentRoutePoints if this is the zone being actively edited on map (might need more logic here)
                // For now, just populating the textarea is enough for saving. Map interaction would re-init currentRoutePoints.
            }
        }
    });
    if (profileCreationMapContainerEl) profileCreationMapContainerEl.classList.remove('hidden');
    updateProfileMapVisuals(); // Update map based on loaded data
}

/**
 * Deletes a custom demand profile.
 * @param {string} profileName The name of the profile to delete.
 */
function deleteCustomProfile(profileName) {
    if (confirm(`Are you sure you want to delete the profile "${profileName}"?`)) {
        customDemandProfiles = customDemandProfiles.filter(p => p.name !== profileName);
        saveProfilesToSessionStorage();
        updateSavedProfilesListUI();
        populateOrderGenerationProfileSelectorSim(customDemandProfiles); // Update simulation selector
        logMessage(`Custom demand profile "${profileName}" deleted.`, 'PROFILE_DELETE', simulationLogEl);
    }
}

/**
 * Saves the current list of customDemandProfiles to session storage.
 */
function saveProfilesToSessionStorage() {
    try {
        sessionStorage.setItem('customDemandProfiles', JSON.stringify(customDemandProfiles));
    } catch (e) {
        console.error("Error saving profiles to session storage:", e);
        alert("Could not save profiles to session storage. They might be lost on page refresh if storage is full or disabled.");
    }
}

/**
 * Loads profiles from session storage into the `customDemandProfiles` array.
 */
function loadProfilesFromSessionStorage() {
    try {
        const storedProfiles = sessionStorage.getItem('customDemandProfiles');
        if (storedProfiles) {
            customDemandProfiles = JSON.parse(storedProfiles);
        }
    } catch (e) {
        console.error("Error loading profiles from session storage:", e);
        customDemandProfiles = []; // Reset to empty if storage is corrupted
        sessionStorage.removeItem('customDemandProfiles');
    }
}

// Export any functions needed by other modules, e.g., if simulation needs to get profile data directly
export function getCustomDemandProfiles() {
    return [...customDemandProfiles]; // Return a copy
}
