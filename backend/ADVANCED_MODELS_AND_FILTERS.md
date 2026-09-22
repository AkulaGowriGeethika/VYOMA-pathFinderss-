# VYOMA advanced filtering and model bundle

This update adds:
- Median despiking filter
- Low-pass smoothing
- Adaptive vibration-aware filtering
- Lightweight EKF-style smoother
- `/filters/diagnostics` endpoint
- `/models` endpoint
- SIH2.0 training/data-loading/filter/model source under `backend/sih_models/`
- GRU and LSTM model artifacts plus RF/XGBoost baseline artifacts where supplied

Important:
- These filters are implemented and wired into the backend inference path.
- The EKF-style smoother is a lightweight diagonal state smoother, not a full production INS EKF/UKF.
- Model artifacts must be validated against the real IO-VNBD dataset before claiming SIH accuracy targets.
- The supplied IoV collision dataset is not proof of dead-reckoning accuracy.
