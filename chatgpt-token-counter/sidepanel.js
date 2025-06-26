// sidepanel.js
// This script is the main controller for the extension's UI and logic.

import init, { Tiktoken } from './vendor/tiktoken.js';
import { LLMEmissionsCalculator } from './calculator.js';

document.addEventListener('DOMContentLoaded', () => {
  // UI Elements
  const statusEl = document.getElementById('status');
  const refreshBtn = document.getElementById('refresh');
  const countsEl = document.getElementById('counts');
  const co2LinearEl    = document.getElementById('co2-linear');
  const co2QuadraticEl = document.getElementById('co2-quadratic');
  const co2OperationalEl = document.getElementById('co2-operational');
  const co2EmbodiedEl = document.getElementById('co2-embodied');
  const impactSelect   = document.getElementById('impact-select');
  const impactNoteEl   = document.getElementById('impact-note');

  let latestLinearCo2 = 0;
  let latestQuadraticCo2 = 0;

  function updatePromptListDisplay() {
    const isLinear = impactSelect.value === 'linear';
    Array.from(countsEl.children).forEach((li, idx) => {
      const tokens = li.dataset.tokens;
      const emission = isLinear ? li.dataset.linear : li.dataset.quadratic;
      li.textContent = `Prompt ${idx + 1}: ${tokens} tokens — ${parseFloat(emission).toFixed(4)} gCO2e`;
    });
  }

  function updateImpactView() {
    const isLinear = impactSelect.value === 'linear';
    impactNoteEl.textContent = isLinear
      ? 'Linear: optimistic lower-bound estimate with optimizations.'
      : 'Quadratic: conservative upper-bound without optimizations.';
    impactNoteEl.style.color = isLinear ? '#a3e635' : '#eab308';
    co2LinearEl.style.display    = isLinear ? 'block' : 'none';
    co2QuadraticEl.style.display = isLinear ? 'none'  : 'block';
    // Set colors
    co2LinearEl.style.color    = '#a3e635';
    co2QuadraticEl.style.color = '#eab308';
    updateCO2Comparison(isLinear ? latestLinearCo2 : latestQuadraticCo2, currentSettings['carbon-intensity']);
    updatePromptListDisplay();
  }

  impactSelect.addEventListener('change', updateImpactView);

  /* ---------- Region & PUE ---------- */
  const regionSelect = document.getElementById('region');
  const pueInput     = document.getElementById('pue');
  const hardwareSelect = document.getElementById('hardware-select');

  function populateRegions() {
    if (!window.regionData) return;
    regionSelect.querySelectorAll('option[data-region]').forEach(opt => opt.remove());
    window.regionData.forEach(r => {
      const opt = document.createElement('option');
      opt.value = r.region;
      opt.textContent = `${r.location} (${r.region}) — ${r.intensity} gCO₂/kWh`;
      opt.dataset.pue = r.pue;
      opt.dataset.intensity = r.intensity;
      opt.dataset.region = '1';
      regionSelect.appendChild(opt);
    });
  }

  function populateHardware() {
    if (!window.hardwareData) return;
    window.hardwareData.gpus.forEach(gpu => {
      const opt = document.createElement('option');
      opt.value = gpu.id;
      opt.textContent = gpu.name;
      hardwareSelect.appendChild(opt);
    });
  }

  regionSelect.addEventListener('change', () => {
    const sel = regionSelect.selectedOptions[0];
    if (sel && sel.dataset.pue) {
      pueInput.value = sel.dataset.pue;
    }
  });

  hardwareSelect.addEventListener('change', handleSettingsChange);

  populateRegions();
  populateHardware();

  let currentSettings = {};
  const co2ComparisonEl = document.getElementById('co2-comparison');
  const settingsForm = document.getElementById('settings-form');
  const carbonIntensityInput = document.getElementById('carbon-intensity');

  let tokenizer = null;
  let calculator = null;
  let lastTextTokenCount = 0; // Only store text tokens here

  /**
   * Initializes the tiktoken tokenizer by manually loading and linking the WASM module.
   */
  async function initializeTokenizer() {
    if (tokenizer) return;
    try {
      statusEl.textContent = 'Initializing tokenizer...';
      const wasmUrl = chrome.runtime.getURL('vendor/tiktoken_bg.wasm');
      await init(wasmUrl);
      const encoderUrl = chrome.runtime.getURL('vendor/cl100k_base.json');
      const encoderResponse = await fetch(encoderUrl);
      if (!encoderResponse.ok) {
        throw new Error(`Failed to fetch encoder: ${encoderResponse.statusText}`);
      }
      const encoder = await encoderResponse.json();
      tokenizer = new Tiktoken(
        encoder.bpe_ranks,
        encoder.special_tokens,
        encoder.pat_str
      );
      statusEl.textContent = 'Tokenizer ready.';
      initializeCalculator();
    } catch (error) {
      console.error('Tokenizer initialization failed:', error);
      statusEl.textContent = `Error: ${error.message}`;
      throw error;
    }
  }

  /**
   * Initializes the CO2 emissions calculator and sets up listeners for settings changes.
   */
  function initializeCalculator() {
    const settings = getSettingsFromForm();
    calculator = new LLMEmissionsCalculator(settings);
    settingsForm.addEventListener('input', handleSettingsChange);
    regionSelect.addEventListener('change', handleRegionChange);
    hardwareSelect.addEventListener('change', handleSettingsChange);
  }

  /**
   * Reads the current values from the advanced settings form.
   */
  function getSettingsFromForm() {
    return {
      'param-count': parseFloat(document.getElementById('param-count').value),
      'carbon-intensity': parseFloat(carbonIntensityInput.value),
      'pue': parseFloat(document.getElementById('pue').value),
      'system-instructions': 0,
      'image-count': 0,
      'file-size': 0,
      'region': regionSelect.value,
      'gpu_num': parseInt(document.getElementById('gpu-count').value, 10),
      'hardware-efficiency': parseFloat(document.getElementById('hardware-efficiency').value),
    };
  }

  function getHardwareSettings() {
    if (!window.hardwareData) return {};
    const selectedGpuId = hardwareSelect.value;
    const selectedGpu = window.hardwareData.gpus.find(g => g.id === selectedGpuId);
    const components = window.hardwareData.components;
    const gpuNum = parseInt(document.getElementById('gpu-count').value, 10);

    if (!selectedGpu) return {};

    return {
      'gpu_flop_peak': selectedGpu.flop_peak,
      'gpu_tdp': selectedGpu.tdp,
      'gpu_cap': selectedGpu.cap,
      'gpu_area': selectedGpu.area,
      'cpu_cap': components.cpu.cap,
      'cpu_area': components.cpu.area,
      'dram_cap': components.dram.cap,
      'dram_area': components.dram.area,
      'ssd_cap': components.ssd.cap,
      'ssd_area': components.ssd.area,
      'hardware-unit-num': gpuNum / 8, // Assuming 8 GPUs per node
    };
  }

  function getHardwareSettings() {
    if (!window.hardwareData) return {};
    const selectedGpuId = hardwareSelect.value;
    const selectedGpu = window.hardwareData.gpus.find(g => g.id === selectedGpuId);
    const components = window.hardwareData.components;
    const gpuNum = parseInt(document.getElementById('gpu-count').value, 10);

    if (!selectedGpu) return {};

    return {
      'gpu_flop_peak': selectedGpu.flop_peak,
      'gpu_tdp': selectedGpu.tdp,
      'gpu_cap': selectedGpu.cap,
      'gpu_area': selectedGpu.area,
      'cpu_cap': components.cpu.cap,
      'cpu_area': components.cpu.area,
      'dram_cap': components.dram.cap,
      'dram_area': components.dram.area,
      'ssd_cap': components.ssd.cap,
      'ssd_area': components.ssd.area,
      'hardware-unit-num': gpuNum / 8, // Assuming 8 GPUs per node
    };
  }

  /**
   * Handles changes in the settings form by updating the calculator and recalculating.
   */
  function handleSettingsChange() {
    if (!calculator) return;
    const formSettings = getSettingsFromForm();
    const hardwareSettings = getHardwareSettings();
    const allSettings = { ...formSettings, ...hardwareSettings };
    calculator.updateSettings(allSettings);
    
    const imageTokens = allSettings['image-count'] * 255; // rough heuristics
    const fileTokens = allSettings['file-size'] * 250;
    const totalTokens = lastTextTokenCount + imageTokens + fileTokens + allSettings['system-instructions'];

    statusEl.textContent = `Total Tokens: ${Math.round(totalTokens)} (Text: ${lastTextTokenCount})`;

    currentSettings = allSettings;
    const linearEmissions = calculator.calculateEmissions(totalTokens);

    // Quadratic approximation: sum of cumulative token counts for each prompt
    let cumulativeToks = 0;
    let quadraticToks  = 0;
    const promptLis = countsEl.children;
    for (let i = 0; i < promptLis.length; i++) {
      const t = parseInt(promptLis[i].dataset.tokens);
      cumulativeToks += t;
      quadraticToks  += cumulativeToks;
    }
    const quadraticEmissions = calculator.calculateEmissions(quadraticToks + imageTokens + fileTokens + allSettings['system-instructions'] * promptLis.length);

    latestLinearCo2 = linearEmissions.total;
    latestQuadraticCo2 = quadraticEmissions.total;

    co2LinearEl.textContent    = `Total Emissions ≈ ${linearEmissions.total.toFixed(4)} gCO2e`;
    co2QuadraticEl.textContent = `Total Emissions ≈ ${quadraticEmissions.total.toFixed(4)} gCO2e`;

    const isLinear = impactSelect.value === 'linear';
    const displayedEmissions = isLinear ? linearEmissions : quadraticEmissions;
    co2OperationalEl.textContent = `Operational: ${displayedEmissions.operational.toFixed(4)} gCO2e`;
    co2EmbodiedEl.textContent = `Embodied: ${displayedEmissions.embodied.toFixed(4)} gCO2e`;

    updateImpactView();
  }

  /**
   * Handles region changes by updating the carbon intensity from the local data source.
   */
  function handleRegionChange() {
    const region = regionSelect.value;
    if (region && window.regionData) {
      const selectedRegion = window.regionData.find(r => r.region === region);
      if (selectedRegion) {
        carbonIntensityInput.value = selectedRegion.intensity;
        pueInput.value = selectedRegion.pue;
        statusEl.textContent = `Carbon intensity for ${selectedRegion.location} updated.`;
        handleSettingsChange();
      }
    } else {
      carbonIntensityInput.value = "450";
      pueInput.value = "1.10";
      statusEl.textContent = 'Using world average carbon intensity.';
      handleSettingsChange();
    }
  }

  /**
   * Calculates and displays illustrative examples of CO2 emissions.
   */
  function updateCO2Comparison(co2Grams, carbonIntensity) {
    if (co2Grams <= 0) {
      co2ComparisonEl.innerHTML = '';
      return;
    }

    const carEmissionPerKm = 107;
    const ledBulbWatts = 10;
    const smartphoneChargeWh = 5;

    const kmDriven = co2Grams / carEmissionPerKm;
    const bulbHours = co2Grams / (ledBulbWatts * carbonIntensity / 1000);
    const phoneCharges = co2Grams / (smartphoneChargeWh * carbonIntensity / 1000);

    const carDistanceText = `${kmDriven.toFixed(3)} km`;
    const bulbTimeText = bulbHours < 1 ? `${(bulbHours * 60).toFixed(0)} minutes` : `${bulbHours.toFixed(1)} hours`;

    co2ComparisonEl.innerHTML = `
      <h3>Equivalent to:</h3>
      <ul>
        <li>🚗 Driving a car for ${carDistanceText}</li>
        <li>💡 Powering a 10W LED bulb for ${bulbTimeText}</li>
        <li>📱 Charging a smartphone ${phoneCharges.toFixed(1)} times</li>
      </ul>
    `;
  }

  /**
   * Main function to refresh token counts.
   */
  async function refresh() {
    lastTextTokenCount = 0; // reset
    try {
      statusEl.textContent = 'Refreshing...';
      co2LinearEl.textContent    = '';
      co2QuadraticEl.textContent = '';
      // reset display defaults to linear
      impactSelect.value = 'linear';
      updateImpactView();
      co2ComparisonEl.innerHTML = '';
      countsEl.innerHTML = '';

      if (!tokenizer) {
        await initializeTokenizer();
      }

      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

      if (!tab || !tab.url || !tab.url.startsWith('https://chatgpt.com')) {
        statusEl.textContent = 'Only works on chatgpt.com';
        return;
      }

      const response = await chrome.tabs.sendMessage(tab.id, { type: 'getMessages' });
      
      if (chrome.runtime.lastError) {
          console.error(chrome.runtime.lastError.message);
          statusEl.textContent = 'Error: Could not connect to the content script. Please reload the ChatGPT page.';
          return;
      }

      if (!response || !response.messages) {
        statusEl.textContent = 'Could not retrieve messages from the page.';
        return;
      }

      const messages = response.messages;

      // Group messages into user+assistant pairs (prompt-response)
      const pairs = [];
      for (let i = 0; i < messages.length; i += 2) {
        const pairText = (messages[i] || '') + '\n' + (messages[i + 1] || '');
        pairs.push(pairText.trim());
      }

      statusEl.textContent = `Calculating tokens for ${pairs.length} prompts...`;
      
      let conversationTextTokens = 0;
      let cumulativeToksPerPrompt = 0;
      pairs.forEach((text, idx) => {
        const tokenCount = tokenizer.encode(text).length;
        conversationTextTokens += tokenCount;
        cumulativeToksPerPrompt += tokenCount;

        const imageTokens = currentSettings['image-count'] * 255;
        const fileTokens = currentSettings['file-size'] * 250;

        const linearTokensPrompt = tokenCount + imageTokens + fileTokens + currentSettings['system-instructions'];
        const quadraticTokensPrompt = cumulativeToksPerPrompt + imageTokens + fileTokens + currentSettings['system-instructions'];

        const linearEm = calculator.calculateEmissions(linearTokensPrompt).total;
        const quadEm  = calculator.calculateEmissions(quadraticTokensPrompt).total;

        const li = document.createElement('li');
        li.dataset.tokens    = tokenCount;
        li.dataset.linear    = linearEm.toFixed(4);
        li.dataset.quadratic = quadEm.toFixed(4);
        countsEl.appendChild(li);
      });

      lastTextTokenCount = conversationTextTokens;
      handleSettingsChange();

    } catch (error) {
      console.error('Refresh failed:', error);
      const errorMessage = error.message && error.message.includes('Could not establish connection')
        ? 'Please reload the ChatGPT page and try again.'
        : (error.message || 'An unknown error occurred.');
      statusEl.textContent = `Error: ${errorMessage}`;
    }
  }

  // Initial load
  (async () => {
    try {
      await initializeTokenizer();
      initializeCalculator();
      populateRegions();
      populateHardware();
      refresh();
      // Event Listeners
      refreshBtn.addEventListener('click', refresh);
    } catch (err) {
      statusEl.textContent = 'Error: Could not load tokenizer. Please refresh the extension.';
      console.error('Initialization failed:', err);
    }
  })();
});
