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

  function populateRegions() {
    if (!window.regionData) return;
    // Remove previously injected options (marked with data-region) to avoid duplicates
    regionSelect.querySelectorAll('option[data-region]').forEach(opt => opt.remove());

    window.regionData.forEach(r => {
      const opt = document.createElement('option');
      opt.value = r.region;
      opt.textContent = `${r.location} (${r.region}) — ${r.intensity} gCO₂/kWh`;
      opt.dataset.pue       = r.pue;
      opt.dataset.intensity = r.intensity;
      opt.dataset.region    = '1'; // flag as dynamic
      regionSelect.appendChild(opt);
    });
  }

  regionSelect.addEventListener('change', () => {
    const sel = regionSelect.selectedOptions[0];
    if (sel && sel.dataset.pue) {
      pueInput.value = sel.dataset.pue;
    }
  });

  populateRegions();

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
    document.getElementById('multimedia-form').addEventListener('input', handleSettingsChange);
    regionSelect.addEventListener('change', handleRegionChange);
  }

  /**
   * Reads the current values from the advanced settings form.
   */
  function getSettingsFromForm() {
    return {
      'param-count': parseFloat(document.getElementById('param-count').value),
      'carbon-intensity': parseFloat(carbonIntensityInput.value),
      'pue': parseFloat(document.getElementById('pue').value),
      'system-instructions': parseInt(document.getElementById('system-instructions').value, 10),
      'image-count': parseInt(document.getElementById('image-count-input').value, 10) || 0,
      'file-size': parseInt(document.getElementById('file-size-input').value, 10) || 0,
      'region': regionSelect.value,
    };
  }

  /**
   * Handles changes in the settings form by updating the calculator and recalculating.
   */
  function handleSettingsChange() {
    if (!calculator) return;
    const settings = getSettingsFromForm();
    calculator.updateSettings(settings);
    
    const imageTokens = settings['image-count'] * 255; // rough heuristics
    const fileTokens = settings['file-size'] * 250;
    const totalTokens = lastTextTokenCount + imageTokens + fileTokens + settings['system-instructions'];

    statusEl.textContent = `Total Tokens: ${Math.round(totalTokens)} (Text: ${lastTextTokenCount})`;

    currentSettings = settings;
    const linearCo2 = calculator.calculateInferenceCost(totalTokens); // linear cost

    // Quadratic approximation: sum of cumulative token counts for each prompt
    let cumulativeToks = 0;
    let quadraticToks  = 0;
    const promptLis = countsEl.children;
    for (let i = 0; i < promptLis.length; i++) {
      const t = parseInt(promptLis[i].dataset.tokens);
      cumulativeToks += t;
      quadraticToks  += cumulativeToks;
    }
    const quadraticCo2 = calculator.calculateInferenceCost(quadraticToks + imageTokens + fileTokens + settings['system-instructions'] * promptLis.length);

    latestLinearCo2 = linearCo2;
    latestQuadraticCo2 = quadraticCo2;

    co2LinearEl.textContent    = `Total Emissions ≈ ${linearCo2.toFixed(4)} gCO2e`;
    co2QuadraticEl.textContent = `Total Emissions ≈ ${quadraticCo2.toFixed(4)} gCO2e`;

    updateImpactView();

    // Recalculate per-prompt token & CO2
    const prompts = countsEl.children;
    for (let i = 0; i < prompts.length; i++) {
      const prompt = prompts[i];
      const tokenCount = parseInt(prompt.dataset.tokens);
      const totalTokensPrompt = tokenCount + imageTokens + fileTokens + settings['system-instructions'];
      const co2GramsPrompt = calculator.calculateInferenceCost(totalTokensPrompt);
      prompt.textContent = `Prompt ${i + 1}: ${tokenCount} tokens — ${co2GramsPrompt.toFixed(4)} gCO2e`;
    }
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

    const carEmissionPerKm = 140;
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

      // Read current settings once for prompt calculations
      const settings = getSettingsFromForm();

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

        const imageTokens = settings['image-count'] * 255;
        const fileTokens = settings['file-size'] * 250;

        const linearTokensPrompt = tokenCount + imageTokens + fileTokens + settings['system-instructions'];
        const quadraticTokensPrompt = cumulativeToksPerPrompt + imageTokens + fileTokens + settings['system-instructions'];

        const linearEm = calculator.calculateInferenceCost(linearTokensPrompt);
        const quadEm  = calculator.calculateInferenceCost(quadraticTokensPrompt);

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
  populateRegions();
  refresh();

  // Event Listeners
  refreshBtn.addEventListener('click', refresh);
});
