# SIH SOFTWARE COMPLETION REPORT

Software-side additions in this build:
- IMU processing and GRU pipeline
- GNSS/DR fusion endpoint
- GNSS recovery/re-fusion endpoint
- gravity-based pitch/roll and heading/yaw reference
- vibration/noise score
- non-holonomic road constraint
- Viterbi-style route candidate matching
- drift benchmark endpoint
- 10 Hz smartphone target and ~200 Hz edge target metadata
- SIH diagnostics UI

## Uploaded dataset
`Dataset_IoV.xlsx` contains Number of Lanes, Status of driver, Nature of environment, Velocity of vehicle, Distance between vehicles, Breaking capability, Collussion and is an IoV collision/classification dataset. It is **not** an IO-VNBD smartphone IMU trajectory dataset, so it must not be used to claim official IDR drift validation.

## What still requires real validation/hardware
Real vehicle data, official IO-VNBD evaluation, measured <10% drift, a real external FOG IMU at ~200 Hz, and truly offline OSM map tiles/data cannot be truthfully manufactured by software.
