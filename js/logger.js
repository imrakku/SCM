// js/logger.js

/**
 * Logs a message to a specified DOM element, typically a div acting as a log container.
 * @param {string} message The message to log.
 * @param {string} type The type of message (e.g., 'INFO', 'AGENT', 'ORDER', 'SYSTEM', 'ERROR', 'TRAFFIC', 'COST').
 * @param {HTMLElement} logElement The DOM element to append the log message to.
 * @param {number} [simulationTime=null] Optional current simulation time to include in the log.
 */
export function logMessage(message, type = 'INFO', logElement, simulationTime = null) {
    if (!logElement) {
        console.warn("Log element not provided for message:", message);
        return;
    }

    const logEntry = document.createElement('p');
    logEntry.classList.add('log-message');
    let typeClass = 'log-info'; // Default
    let prefix = `[${type.toUpperCase()}]`;
    const timePrefix = simulationTime !== null ? `[T:${simulationTime}]` : '';

    switch (type.toUpperCase()) {
        case 'AGENT': case 'AGENT_ASSIGN': case 'AGENT_MOVE': case 'AGENT_HANDLE': case 'AGENT_DEPART': case 'AGENT_ARRIVE_STORE': case 'AGENT_AVAIL':
        case 'AGENT_OPT': // For optimization logs related to agents
            typeClass = 'log-agent';
            break;
        case 'ORDER': case 'ORDER_GEN': case 'ORDER_DELIVER':
        case 'ORDER_OPT': case 'ORDER_GEN_OPT': // For optimization logs related to orders
            typeClass = 'log-order';
            break;
        case 'SYSTEM': case 'SYS_WARN': case 'PROFILE_SAVE': case 'PROFILE_DELETE': case 'SCENARIO_SAVE': case 'SCENARIO_CLEAR':
        case 'ITERATION': // For optimization iteration logs
        case 'WARNING':
            typeClass = 'log-system';
            break;
        case 'SYSTEM_BOLD': // For prominent system messages
            typeClass = 'log-system-bold';
            prefix = `[SYS_SUMMARY]`;
            break;
        case 'ERROR': case 'SYS_ERROR':
            typeClass = 'log-error';
            break;
        case 'TRAFFIC': case 'TRAFFIC_UPDATE':
            typeClass = 'log-traffic';
            break;
        case 'COST':
            typeClass = 'log-cost';
            break;
        case 'STATS': // For optimization stats logs
             typeClass = 'log-order'; // Re-using a color, can be customized
             prefix = '[STATS]';
            break;
        // Add more cases as needed
    }
    logEntry.classList.add(typeClass);
    logEntry.innerHTML = `<em class="font-semibold">${prefix} ${timePrefix}</em> ${message}`;
    logElement.appendChild(logEntry);
    logElement.scrollTop = logElement.scrollHeight; // Auto-scroll to the bottom
}
