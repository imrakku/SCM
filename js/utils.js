// js/utils.js

export function calculateStdDev(arr, mean) {
    if (!arr || arr.length < 2 || isNaN(mean)) return NaN; // Handle NaN mean
    const n = arr.length;
    const variance = arr.map(x => Math.pow(x - mean, 2)).reduce((a, b) => a + b) / (n -1) ; // Corrected to n-1 for sample std dev
    return Math.sqrt(variance);
}

// Generic log function - you might want to make this more specific or pass the element
function logMessageToElement(message, type = 'INFO', logElementId, currentTime = null) {
    const logEl = document.getElementById(logElementId);
    if (!logEl) return;

    const logEntry = document.createElement('p');
    logEntry.classList.add('log-message');
    let typeClass = 'log-info';
    let prefix = `[${type.toUpperCase()}]`;
    if (currentTime !== null) {
        prefix += ` [T:${currentTime}]`;
    }


    switch(type.toUpperCase()) {
        case 'AGENT': case 'AGENT_ASSIGN': case 'AGENT_MOVE': case 'AGENT_HANDLE': case 'AGENT_DEPART': case 'AGENT_ARRIVE_STORE': case 'AGENT_AVAIL': typeClass = 'log-agent'; break;
        case 'ORDER': case 'ORDER_GEN': case 'ORDER_DELIVER': typeClass = 'log-order'; break;
        case 'SYSTEM': case 'SYS_WARN': case 'PROFILE_SAVE': case 'PROFILE_DELETE': case 'SCENARIO_SAVE': case 'SCENARIO_CLEAR': typeClass = 'log-system'; break;
        case 'SYS_ERROR': case 'ERROR': typeClass = 'log-error'; break;
        case 'TRAFFIC': case 'TRAFFIC_UPDATE': typeClass = 'log-traffic'; break;
        case 'COST': typeClass = 'log-cost'; break;
        case 'ITERATION': typeClass = 'log-info'; break;
        case 'STATS': typeClass = 'log-order'; prefix = `[STATS]${currentTime !== null ? ` [T:${currentTime}]` : ''}`; break;
        case 'SYSTEM_BOLD': typeClass = 'log-system-bold'; prefix = `[SYS_SUMMARY]${currentTime !== null ? ` [T:${currentTime}]` : ''}`; break;
        case 'WARNING': typeClass = 'log-system'; break;
        case 'ORDER_OPT': typeClass = 'log-order'; prefix = `[ORDER_ITER]${currentTime !== null ? ` [T:${currentTime}]` : ''}`; break;
        case 'ORDER_GEN_OPT': typeClass = 'log-order'; prefix = `[ORDER_GEN_ITER]${currentTime !== null ? ` [T:${currentTime}]` : ''}`; break;
        case 'AGENT_OPT': typeClass = 'log-agent'; prefix = `[AGENT_ITER]${currentTime !== null ? ` [T:${currentTime}]` : ''}`; break;
    }
    logEntry.classList.add(typeClass);
    logEntry.innerHTML = `<em class="font-semibold">${prefix}</em> ${message}`;
    logEl.appendChild(logEntry);
    logEl.scrollTop = logEl.scrollHeight;
}


export function logMessageSim(message, type = 'INFO', currentTime = null) {
    // Assuming simulationLog element exists and 'currentTime' is passed from simulation state
    // For direct use, you might need to get currentTime from simulation.js or pass it.
    // This is a simplified version. For full modularity, the simulation module would call this
    // and provide its own 'simulationTime'.
    const simLogElement = document.getElementById('simulationLog');
     if (simLogElement) {
        logMessageToElement(message, type, 'simulationLog', currentTime);
    }
}

export function logMessageOpt(message, type = 'INFO', logElementId = 'optimizationLog') {
    // currentTime is not typically used in opt log in the original code, so omitting
    const optLogElement = document.getElementById(logElementId);
    if (optLogElement) {
        logMessageToElement(message, type, logElementId, null);
    }
}
