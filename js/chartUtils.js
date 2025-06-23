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
        console.error(`[ChartUtils] Canvas element with ID "${chartId}" not found for chart "${chartKey}".`);
        return null;
    }

    if (chartInstances[chartKey]) {
        console.log(`[ChartUtils] Destroying existing chart: ${chartKey}`);
        chartInstances[chartKey].destroy();
    }
    console.log(`[ChartUtils] Initializing new chart: ${chartKey} with ID: ${chartId}`);
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
 * @param {Array<object>} newDatasetsArray Array of new dataset objects. Each object should conform to Chart.js dataset structure.
 */
export function updateChartData(chartKey, labels, newDatasetsArray) {
    const chart = chartInstances[chartKey];
    if (chart) {
        // console.log(`[ChartUtils] Attempting to update chart: ${chartKey}`);
        // console.log(`[ChartUtils] Labels for ${chartKey}:`, JSON.parse(JSON.stringify(labels)));
        // console.log(`[ChartUtils] Datasets for ${chartKey}:`, JSON.parse(JSON.stringify(newDatasetsArray)));

        chart.data.labels = labels;
        chart.data.datasets = newDatasetsArray; // Directly replace the datasets array

        try {
            chart.update();
            // console.log(`[ChartUtils] Chart ${chartKey} updated successfully.`);
        } catch (e) {
            console.error(`[ChartUtils] Error during chart.update() for ${chartKey}:`, e);
        }
    } else {
        console.warn(`[ChartUtils] Chart with key "${chartKey}" not found for updating data. Was it initialized?`);
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

    // Calculate variance using (n-1) for sample standard deviation if appropriate,
    // or n for population. For visualization, n is often fine.
    // Using n-1 for sample:
    const variance = arr.map(x => Math.pow(x - currentMean, 2)).reduce((a, b) => a + b, 0) / (n -1) ;
    return Math.sqrt(variance);
}
