// calculator.js

/**
 * A simplified port of the LLMCarbon_calculator.py logic to JavaScript.
 * This class will handle the CO2 emissions calculations for the extension.
 */
export class LLMEmissionsCalculator {
  constructor(settings) {
    this.defaults = {
      // These are hardcoded for now, but could be made configurable
      'hardware-efficiency': 0.35, // Average hardware efficiency
      'gpu_flop_peak': 1.246e14, // A100 PCIe 80GB Peak FP16/BF16 TFLOPS
      'gpu_tdp': 400, // A100 PCIe 80GB TDP in Watts
      'expected-lifespan': 5, // years
      'days-per-year': 365,
      'hours-per-day': 24,
      'seconds-per-hour': 3600,
    };
    this.updateSettings(settings);
  }

  /**
   * Updates the calculator's settings with new values from the UI.
   * @param {object} settings - An object containing the calculation parameters.
   */
  updateSettings(settings) {
    this.params = { ...this.defaults, ...settings };
  }

  /**
   * Calculates both operational and embodied CO2 emissions.
   * @param {number} totalTokens - The total number of tokens for the operation.
   * @returns {object} An object containing operational, embodied, and total emissions in grams.
   */
  calculateEmissions(totalTokens) {
    // --- Operational Carbon Calculation ---
    const modelParams = this.params['param-count'] * 1e9;
    const totalFlops = 2 * modelParams * totalTokens;
    const flopsPerSecond = this.params['gpu_flop_peak'] * this.params['hardware-efficiency'];
    const computeTimeSeconds = totalFlops / flopsPerSecond;
    const powerWatts = this.params['gpu_tdp'];
    const energyJoules = computeTimeSeconds * powerWatts;
    const energyKWh = energyJoules / (3.6e6); // Convert Joules to kWh
    const operational = energyKWh * this.params['carbon-intensity'] * this.params['pue'];

    // --- Embodied Carbon Calculation ---
    const estimateOperationHour = computeTimeSeconds / this.defaults['seconds-per-hour'];
    const expectedLifespanDuration = this.defaults['expected-lifespan'] * this.defaults['days-per-year'] * this.defaults['hours-per-day'];
    const expectedLifespanRate = expectedLifespanDuration > 0 ? estimateOperationHour / expectedLifespanDuration : 0;

    const calculateEmbodied = (cap, area, numUnits) => {
      return numUnits * cap * area * expectedLifespanRate;
    };

    const gpuEmbodied = calculateEmbodied(this.params['gpu_cap'], this.params['gpu_area'], this.params['gpu_num']);
    const cpuEmbodied = calculateEmbodied(this.params['cpu_cap'], this.params['cpu_area'], this.params['hardware-unit-num']);
    const ssdEmbodied = calculateEmbodied(this.params['ssd_cap'], this.params['ssd_area'], this.params['hardware-unit-num']);
    const dramEmbodied = calculateEmbodied(this.params['dram_cap'], this.params['dram_area'], this.params['hardware-unit-num']);

    const embodied = gpuEmbodied + cpuEmbodied + ssdEmbodied + dramEmbodied;

    return {
      operational: operational || 0,
      embodied: embodied || 0,
      total: (operational || 0) + (embodied || 0),
    };
  }
}
