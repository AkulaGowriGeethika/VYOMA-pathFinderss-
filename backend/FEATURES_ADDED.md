# VYOMA Additional Features

Implemented feature endpoints:
- `POST /features/position-confidence`: transparent confidence score and estimated accuracy.
- `POST /features/route-deviation`: Haversine distance to the nearest route point and deviation threshold.
- `POST /features/driving-safety`: explainable screening for harsh movement, rotation, and high speed.
- `POST /features/model-comparison`: runs GRU and attempts LSTM inference on the same filtered 50x6 sequence.
- Frontend `features.js`: offline route storage and GNSS outage event storage using browser localStorage.
- Service worker cache upgraded to v2 and includes `features.js`.

These are prototype features. Thresholds and confidence formulas require calibration and validation with real vehicle data before production safety or accuracy claims.
