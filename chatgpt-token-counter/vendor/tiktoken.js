import * as wasm from './tiktoken_bg.js';

// The default export is an async function that initializes the WASM module.
export default async function init(wasmUrl) {
  const wasmResponse = await fetch(wasmUrl);
  const wasmBinary = await wasmResponse.arrayBuffer();
  const wasmModule = await WebAssembly.instantiate(wasmBinary, {
    './tiktoken_bg.js': wasm
  });
  wasm.__wbg_set_wasm(wasmModule.instance.exports);
}

// Re-export everything from the wasm-bindgen generated file.
export * from './tiktoken_bg.js';