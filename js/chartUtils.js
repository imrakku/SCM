// js/chartUtils.js

// Store chart instances here
let chartInstances = {
    pendingOrders: null,
    activeAgents: null,
    deliveryTimeOptimization: null,
    utilizationOptimization: null,
    totalDeliveredOrdersOptimization: null,
    avgOrderWaitTimeOptimization: null,
};

/**
 * Initializes or re-initializes a Chart.js chart.
 * @param {string} chartId The ID of the canvas element.
 * @param {string} chartKey A key to store the chart instance (e.g., 'pendingOrders').
 * @param {object} chartConfig The Chart.js configuration object.
 * @returns {Chart} The Chart.js instance.
 */
export function initializeChart(chartId, chartKey, chartConfig) {
    const ctx = document.getElementById(chartId)?.getContext('2d');
    if (!ctx) {
        console.error(`Canvas element with ID "${chartId}" not found for chart "${chartKey}".`);
        return null;
    }

    if (chartInstances[chartKey]) {
        chartInstances[chartKey].destroy();
    }
    chartInstances[chartKey] = new Chart(ctx, chartConfig);
    return chartInstances[chartKey];
}

export function getChartInstance(chartKey) {
    return chartInstances[chartKey];
}

/**
 * Updates the data for a given Chart.js instance.
 * @param {string} chartKey The key of the chart instance to update.
 * @param {Array<string|number>} labels New labels for the x-axis.
 * @param {Array<Array<number>>} datasetsData Array of new data arrays, one for each dataset.
 */
export function updateChartData(chartKey, labels, datasetsData) {
    const chart = chartInstances[chartKey];
    if (chart) {
        chart.data.labels = labels;
        datasetsData.forEach((data, index) => {
            if (chart.data.datasets[index]) {
                chart.data.datasets[index].data = data;
            }
        });
        chart.update();
    } else {
        console.warn(`Chart with key "${chartKey}" not found for updating data.`);
    }
}

/**
 * Calculates the standard deviation of an array of numbers.
 * @param {number[]} arr The array of numbers.
 * @param {number} [mean] Optional pre-calculated mean.
 * @returns {number} The standard deviation, or NaN if input is invalid.
 */
export function calculateStdDev(arr, mean) {
    if (!arr || arr.length < 2) return NaN;
    const n = arr.length;
    const currentMean = (mean === undefined || isNaN(mean)) ? arr.reduce((a, b) => a + b, 0) / n : mean;
    if (isNaN(currentMean)) return NaN;

    const variance = arr.map(x => Math.pow(x - currentMean, 2)).reduce((a, b) => a + b, 0) / (n -1) ; // Sample standard deviation
    return Math.sqrt(variance);
}
