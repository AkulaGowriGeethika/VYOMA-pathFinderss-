# VYOMA — SIH Intelligent Dead Reckoning Capability Map

This release makes the major SIH requirements visible in the prototype UI while clearly distinguishing
implemented prototype functions from validation targets or planned enhancements.

## Demonstrated in the prototype
- Smartphone accelerometer + gyroscope input
- 50 x 6 sequential IMU window
- GRU displacement estimation
- Dead-reckoning mode during simulated GNSS loss
- GNSS restoration/recovery state
- Pitch/roll gravity-based alignment prototype
- Heading/yaw reference
- Lightweight sensor smoothing/filtering
- Route-constrained map matching
- Road/non-holonomic constraint concept
- GNSS + INS fusion endpoint prototype
- Navigation telemetry

## Targets / validation still required
- IO-VNBD dataset training/validation
- Measured <10% drift compliance
- Measured <5 m per 50 m and <100 m per 1 km benchmarks
- 10 Hz end-to-end smartphone performance measurement
- ~200 Hz external FOG/edge IMU performance measurement
- Full UKF/HMM-grade map matching
- Dedicated learned vibration/pothole filtering
- Production-grade vehicle pitch/roll/yaw calibration
- Fully offline OSM tile/data packaging
- Production external-IMU edge deployment

The UI labels these honestly as TARGET, PROTOTYPE, ARCHITECTURE READY, ENHANCEMENT, or REQUIRED.
