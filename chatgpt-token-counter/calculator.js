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
      'gpu/flop_peak': 1.246e14, // A100 PCIe 80GB Peak FP16/BF16 TFLOPS
      'gpu/tdp': 400, // A100 PCIe 80GB TDP in Watts
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
   * Calculates the total inference cost in grams of CO2 equivalent.
   * This is a simplified model for demonstration.
   *
   * @param {number} totalTokens - The total number of tokens in the conversation.
   * @returns {number} The calculated CO2 emissions in grams.
   */
  calculateInferenceCost(totalTokens) {
    // Convert model parameters from billions to actual number
    const modelParams = this.params['param-count'] * 1e9;
    
    // Simplified calculation: Total FLOPs for inference (2 * params * tokens)
    const totalFlops = 2 * modelParams * totalTokens;

    // Time to compute (Total FLOPs / FLOPs per second)
    const flopsPerSecond = this.params['gpu/flop_peak'] * this.params['hardware-efficiency'];
    const computeTimeSeconds = totalFlops / flopsPerSecond;

    // Energy consumed (Time * Power)
    const powerWatts = this.params['gpu/tdp'];
    const energyJoules = computeTimeSeconds * powerWatts;
    const energyKWh = energyJoules / (3.6e6); // Convert Joules to kWh

    // CO2 Emissions (Energy * Carbon Intensity * PUE)
    const carbonIntensity = this.params['carbon-intensity']; // gCO2e/kWh
    const pue = this.params['pue'];
    const co2Grams = energyKWh * carbonIntensity * pue;

    return co2Grams;
  }
}
