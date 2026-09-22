# VYOMA production-readiness checklist

This package includes the implemented software foundation, but **100% accuracy or SIH compliance cannot be guaranteed by code alone**. The remaining items require measured field evidence.

## Implemented in this package

- 50x6 input validation for GRU inference.
- NaN/Infinity rejection before model inference.
- Median despiking, low-pass, adaptive vibration, and diagonal Kalman-style smoothing.
- GRU inference with saved scaler and model artifacts.
- Training resources for LSTM, Random Forest, and XGBoost.
- GNSS/DR fusion, route-constrained matching, non-holonomic constraint metadata, calibration, road-condition screening, and IoV auxiliary risk endpoint.
- Model status endpoint: `GET /model-status`.
- Filter diagnostics endpoint: `POST /filters/diagnostics`.

## Evidence still required before claiming full compliance

1. Collect synchronized GNSS ground truth + raw IMU from representative vehicles and roads.
2. Train and validate models on a navigation trajectory dataset, not only the auxiliary IoV collision dataset.
3. Measure drift at 50 m and 1 km, including confidence intervals and failure cases.
4. Benchmark latency, memory, battery usage, and sustained sampling rates on target phones.
5. Validate calibration, yaw alignment, map matching, GNSS outage recovery, and vibration conditions in field tests.
6. Review safety behavior and fail-safe UX before deployment.
