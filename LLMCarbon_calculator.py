class LLMEmissions:
    def __init__(self, **kwargs):
        """
        Initializes the LLMEmissions calculator with default and input parameters.
        """
        self.defaults = {
            'flop-count-factor': 6,  # Default for training (C_train ≈ 6PD)
            'thousands-per-unit': 0.001,
            'days-per-year': 365,
            'hours-per-day': 24,
            'seconds-per-hour': 3600,
            'expected-lifespan': 5,  # 5 years
        }
        self.params = {**self.defaults, **kwargs}

    def _calculate_total_compute(self):
        """
        Calculates total compute (C).
        C = flop_count_factor * P * D
        """
        p = self.params['modal/parameters-count']
        d = self.params['modal/tokens-count']
        flop_factor = self.params['flop-count-factor']
        return flop_factor * p * d

    def _calculate_compute_per_second(self):
        """
        Calculates compute per second.
        compute_per_second = n * FLOP_peak * eff
        """
        n = self.params['gpu/num']
        flop_peak = self.params['gpu/flop_peak']
        eff = self.params['hardware-efficiency']
        return n * flop_peak * eff

    def _estimate_time_second(self, total_compute, compute_per_second):
        """
        Estimates the time in seconds.
        T_estimated = C / (n * FLOP_peak * eff)
        """
        if compute_per_second == 0:
            return 0
        return total_compute / compute_per_second

    def _estimate_operation_hour(self, estimate_time_second):
        """
        Estimates the operation time in hours.
        """
        return estimate_time_second / self.params['seconds-per-hour']

    def _calculate_operation_carbon(self, estimate_operation_hour):
        """
        Calculates operational carbon emissions.
        CO2eq_oper = n * T_estimated * TDP * PUE * carb_inten
        Note: T_estimated here is estimate_operation_hour, TDP is already in kWh
        """
        n = self.params['gpu/num']
        tdp = self.params['gpu/tdp']
        pue = self.params['pue']
        carb_inten = self.params['carb_inten']
        return n * estimate_operation_hour * tdp * pue * carb_inten

    def _calculate_expected_lifespan_duration(self):
        """
        Calculates the expected lifespan duration in hours.
        """
        expected_lifespan_years = self.params['expected-lifespan']
        days_per_year = self.params['days-per-year']
        hours_per_day = self.params['hours-per-day']
        return expected_lifespan_years * days_per_year * hours_per_day

    def _calculate_expected_lifespan_rate(self, estimate_operation_hour, expected_lifespan_duration):
        """
        Calculates the rate of usage relative to the expected lifespan.
        """
        if expected_lifespan_duration == 0:
            return 0
        return estimate_operation_hour / expected_lifespan_duration

    def _calculate_embodied_carbon_i(self, cap_i, area_i, expected_lifespan_rate, num_units=1):
        """
        Calculates embodied carbon for a component (GPU, CPU, SSD, DRAM).
        CO2eq_emb_i = (t_i * area_i * CPA_i) / lifetime_i
        Simplified as: num_units * cap_i * area_i * expected_lifespan_rate
        Note: The original formula for CO2eq_emb_i seems to imply 't_i' is usage time,
        'lifetime_i' is total device lifespan. In the IF manifest, it's simplified
        using `expected-lifespan-rate` which already accounts for usage proportion.
        """
        return num_units * cap_i * area_i * expected_lifespan_rate

    def calculate_emissions(self, is_training=True):
        """
        Runs the full emissions calculation pipeline.
        """
        if is_training:
            self.params['flop-count-factor'] = 6
        else:
            self.params['flop-count-factor'] = 2 # C_inference ≈ 2P * D_inference

        # Step 1: Estimate Total Compute
        estimate_total_compute = self._calculate_total_compute()

        # Step 2: Estimate Compute Per Second
        estimate_compute_per_second = self._calculate_compute_per_second()

        # Step 3: Estimate Time in Seconds
        estimate_time_second = self._estimate_time_second(estimate_total_compute, estimate_compute_per_second)

        # Step 4: Estimate Operation Hour
        estimate_operation_hour = self._estimate_operation_hour(estimate_time_second)

        # Step 5: Calculate Operational Carbon
        operation_carbon = self._calculate_operation_carbon(estimate_operation_hour)

        # Step 6: Calculate Expected Lifespan Duration
        expected_lifespan_duration = self._calculate_expected_lifespan_duration()

        # Step 7: Calculate Expected Lifespan Rate
        expected_lifespan_rate = self._calculate_expected_lifespan_rate(estimate_operation_hour, expected_lifespan_duration)

        # Step 8-11: Calculate Embodied Carbon for each component
        gpu_carbon_embodied = self._calculate_embodied_carbon_i(
            self.params['gpu/cap'], self.params['gpu/area'], expected_lifespan_rate, self.params['gpu/num']
        )
        cpu_carbon_embodied = self._calculate_embodied_carbon_i(
            self.params['cpu/cap'], self.params['cpu/area'], expected_lifespan_rate, self.params['hardware-unit-num']
        )
        ssd_carbon_embodied = self._calculate_embodied_carbon_i(
            self.params['ssd/cap'], self.params['ssd/area'], expected_lifespan_rate, self.params['hardware-unit-num']
        )
        dram_carbon_embodied = self._calculate_embodied_carbon_i(
            self.params['dram/cap'], self.params['dram/area'], expected_lifespan_rate, self.params['hardware-unit-num']
        )

        # Step 12: Sum Embodied Carbon
        carbon_embodied = sum([gpu_carbon_embodied, cpu_carbon_embodied, ssd_carbon_embodied, dram_carbon_embodied])

        # Step 13: Total Carbon
        total_carbon = carbon_embodied + operation_carbon

        return {
            'estimate-total-compute': estimate_total_compute,
            'estimate-compute-per-second': estimate_compute_per_second,
            'estimate-time-second': estimate_time_second,
            'estimate-operation-hour': estimate_operation_hour,
            'operation-carbon': operation_carbon,
            'expected-lifespan-duration': expected_lifespan_duration,
            'expected-lifespan-rate': expected_lifespan_rate,
            'gpu-carbon-embodied': gpu_carbon_embodied,
            'cpu-carbon-embodied': cpu_carbon_embodied,
            'ssd-carbon-embodied': ssd_carbon_embodied,
            'dram-carbon-embodied': dram_carbon_embodied,
            'carbon-embodied': carbon_embodied,
            'total-carbon': total_carbon
        }

## Usage Example:

# Training parameters
training_params = {
    'gpu/num': 10000,
    'gpu/tdp': 0.3,
    'gpu/flop_peak': 125000000000000,
    'hardware-efficiency': 0.5,
    'modal/parameters-count': 175000000000,
    'modal/tokens-count': 300000000000, # This D is for training, so it means 6PD.
    'pue': 1.1,
    'carb_inten': 0.429,
    'gpu/cap': 1.2,
    'gpu/area': 8.15,
    'cpu/cap': 1,
    'cpu/area': 1.47,
    'ssd/cap': 0.024,
    'ssd/area': 32768,
    'dram/cap': 0.4,
    'dram/area': 256,
    'hardware-unit-num': 1250, # gpu_num / 8
}


training_emissions_calculator = LLMEmissions(**training_params)
training_results = training_emissions_calculator.calculate_emissions(is_training=True)

print("--- Training Emissions ---")
for k, v in training_results.items():
    print(f"{k}: {v}")
print("-" * 30)

# Inference parameters
inference_params = {
    'gpu/num': 16,
    'gpu/tdp': 0.4,
    'gpu/flop_peak': 312000000000000,
    'hardware-efficiency': 0.5, # parameter determining the efficiency of the employed hardware...
                                # depends on the number of devices selected, the chosen parallelism, etc.
                                
    'modal/parameters-count': 175000000000, #175B
    'modal/tokens-count': 32, # This D_inference is for inference, so it means 2P * D_inference
    'pue': 1.1,
    'carb_inten': 0.429,
    'gpu/cap': 1.2,
    'gpu/area': 8.15,
    'cpu/cap': 1,
    'cpu/area': 1.47,
    'ssd/cap': 0.024,
    'ssd/area': 32768,
    'dram/cap': 0.4,
    'dram/area': 256,
    'hardware-unit-num': 2, # gpu_num / 8
}

inference_emissions_calculator = LLMEmissions(**inference_params)
inference_results = inference_emissions_calculator.calculate_emissions(is_training=False)

print("\n--- Inference Emissions ---")
for k, v in inference_results.items():
    print(f"{k}: {v}")