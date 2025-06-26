(function(){
  const hardwareData = {
    gpus: [
      {
        id: 'V100',
        name: 'NVIDIA V100',
        area: 8.15,       // cm2
        cap: 1.2,         // kgCO2e/cm2
        tdp: 300,         // Watts
        flop_peak: 125e12 // FP16 TFLOPS
      },
      {
        id: 'H100',
        name: 'NVIDIA H100',
        area: 8.14,       // cm2
        cap: 1.8,         // kgCO2e/cm2
        tdp: 700,         // Watts
        flop_peak: 1979e12 // FP16 TFLOPS
      },
      {
        id: 'TPUv3',
        name: 'Google TPU v3',
        area: 7.00,       // cm2
        cap: 1.0,         // kgCO2e/cm2
        tdp: 450,         // Watts
        flop_peak: 123e12 // BF16 TFLOPS
      },
      {
        id: 'TPUv4',
        name: 'Google TPU v4',
        area: 4.00,       // cm2
        cap: 1.6,         // kgCO2e/cm2
        tdp: 275,         // Watts
        flop_peak: 275e12 // BF16 TFLOPS
      }
    ],
    components: {
      cpu: { area: 1.47, cap: 1.0 },
      dram: { area: 256, cap: 0.4 },
      ssd: { area: 32768, cap: 0.018 }
    }
  };
  window.hardwareData = hardwareData;
})();
