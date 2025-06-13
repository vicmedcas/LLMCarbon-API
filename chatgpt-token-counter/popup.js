// popup.js
// This script is the main controller for the extension's UI and logic.

// Import the necessary components from the WASM glue code.
import * as tiktoken_bg from './vendor/tiktoken_bg.js';

document.addEventListener('DOMContentLoaded', () => {
  const statusEl = document.getElementById('status');
  const refreshBtn = document.getElementById('refresh');
  const countsEl = document.getElementById('counts');

  let tokenizer = null;

  /**
   * Initializes the tiktoken tokenizer by manually loading and linking the WASM module.
   * This is a low-level workaround for the library's incompatibility with the
   * Chrome Extension Manifest V3 environment.
   */
  async function initializeTokenizer() {
    if (tokenizer) return;
    try {
      statusEl.textContent = 'Initializing tokenizer...';

      // 1. Fetch the WASM binary.
      const wasmUrl = chrome.runtime.getURL('vendor/tiktoken_bg.wasm');
      const wasmResponse = await fetch(wasmUrl);
      const wasmBinary = await wasmResponse.arrayBuffer();

      // 2. Create the import object with the functions the WASM module needs to call.
      const importObject = {
        './tiktoken_bg.js': tiktoken_bg,
      };

      // 3. Instantiate the WASM module, linking it with the JS glue code.
      const wasmModule = await WebAssembly.instantiate(wasmBinary, importObject);

      // 4. Provide the compiled WASM exports to the JS glue code.
      tiktoken_bg.__wbg_set_wasm(wasmModule.instance.exports);

      // 5. Fetch the encoder JSON data.
      const encoderUrl = chrome.runtime.getURL('vendor/cl100k_base.json');
      const encoderResponse = await fetch(encoderUrl);
      if (!encoderResponse.ok) {
        throw new Error(`Failed to fetch encoder: ${encoderResponse.statusText}`);
      }
      const encoder = await encoderResponse.json();

      // 6. Create the tokenizer instance using the constructor from the glue code.
      tokenizer = new tiktoken_bg.Tiktoken(
        encoder.bpe_ranks,
        encoder.special_tokens,
        encoder.pat_str
      );

      statusEl.textContent = 'Tokenizer ready.';
    } catch (error) {
      console.error('Tokenizer initialization failed:', error);
      statusEl.textContent = `Error: ${error.message}`;
      throw error; // Propagate error to stop the refresh process
    }
  }

  /**
   * Main function to refresh token counts.
   */
  async function refresh() {
    countsEl.innerHTML = '';
    statusEl.textContent = 'Requesting messages from page...';

    try {
      await initializeTokenizer();

      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

      if (!tab.url || !tab.url.startsWith('https://chatgpt.com/')) {
        statusEl.textContent = 'Not a ChatGPT page.';
        return;
      }

      const response = await chrome.tabs.sendMessage(tab.id, { type: 'getMessages' });

      if (chrome.runtime.lastError) {
        throw new Error(chrome.runtime.lastError.message);
      }

      const { messages } = response;
      if (!messages || messages.length === 0) {
        statusEl.textContent = 'No messages found on the page.';
        return;
      }

      statusEl.textContent = `Calculating tokens for ${messages.length} messages...`;
      
      let totalTokens = 0;
      messages.forEach((text, idx) => {
        const count = tokenizer.encode(text).length;
        totalTokens += count;
        const li = document.createElement('li');
        li.textContent = `Message ${idx + 1}: ${count} tokens`;
        countsEl.appendChild(li);
      });

      statusEl.textContent = `Total Tokens: ${totalTokens} (in ${messages.length} messages)`;

    } catch (error) {
      console.error('Refresh failed:', error);
      statusEl.textContent = `Error: ${error.message}`;
    }
  }

  refreshBtn.addEventListener('click', refresh);
  refresh(); // Automatically refresh when the popup is opened.
});




